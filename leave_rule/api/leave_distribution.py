import frappe
from frappe.utils import getdate, add_days


def get_priority_rows(leave_type):
    return frappe.get_all(
        "Leave Deduction Priority",
        filters={
            "parent": leave_type,
            "parenttype": "Leave Type",
            "parentfield": "custom_leave_deduction_priority",
        },
        fields=[
            "sequence",
            "deduct_from_leave_type",
            "is_unpaid",
        ],
        order_by="sequence asc",
    )


def get_core_leave_details(
    employee,
    date,
):
    get_leave_details = frappe.get_attr(
        "hrms.hr.doctype.leave_application.leave_application.get_leave_details"
    )

    return get_leave_details(
        employee=employee,
        date=date,
    )


def get_leave_type_is_lwp(leave_type):
    return bool(
        frappe.db.get_value(
            "Leave Type",
            leave_type,
            "is_lwp",
        )
    )


def validate_employee_leave_balance(
    employee,
    leave_type,
    date,
):
    is_lwp = get_leave_type_is_lwp(
        leave_type
    )

    if is_lwp:
        return 0

    details = get_core_leave_details(
        employee=employee,
        date=date,
    )

    allocations = (
        details.get(
            "leave_allocation"
        )
        or {}
    )

    leave_details = allocations.get(
        leave_type
    )

    if not leave_details:
        frappe.throw(
            f"{leave_type} has no leave balance for this employee."
        )

    remaining = float(
        leave_details.get(
            "remaining_leaves",
            0,
        )
        or 0
    )

    if remaining <= 0:
        frappe.throw(
            f"{leave_type} has no available leave balance."
        )

    return remaining


def build_request_dates(
    from_date,
    to_date,
    half_day=False,
    half_day_date=None,
):
    request_dates = []

    current_date = from_date

    while current_date <= to_date:
        days = 1.0

        if (
            half_day
            and current_date == half_day_date
        ):
            days = 0.5

        request_dates.append({
            "date": current_date,
            "days": days,
        })

        current_date = add_days(
            current_date,
            1,
        )

    return request_dates


def group_distribution(
    raw_distribution
):
    distribution = []

    for row in raw_distribution:
        if not distribution:
            distribution.append({
                "from_date": row["date"],
                "to_date": row["date"],
                "leave_type":
                    row["leave_type"],
                "days":
                    row["days"],
                "is_paid":
                    row["is_paid"],
            })

            continue

        previous = distribution[-1]

        if (
            previous["leave_type"]
            == row["leave_type"]
            and previous["is_paid"]
            == row["is_paid"]
            and add_days(
                previous["to_date"],
                1,
            ) == row["date"]
        ):
            previous["to_date"] = row["date"]
            previous["days"] += row["days"]

        else:
            distribution.append({
                "from_date": row["date"],
                "to_date": row["date"],
                "leave_type":
                    row["leave_type"],
                "days":
                    row["days"],
                "is_paid":
                    row["is_paid"],
            })

    for row in distribution:
        row["from_date"] = (
            row["from_date"].strftime(
                "%Y-%m-%d"
            )
        )

        row["to_date"] = (
            row["to_date"].strftime(
                "%Y-%m-%d"
            )
        )

    return distribution


@frappe.whitelist()
def get_leave_distribution(
    employee,
    leave_type,
    from_date,
    to_date,
    half_day=0,
    half_day_date=None,
):
    if not employee:
        frappe.throw(
            "Employee is required."
        )

    if not leave_type:
        frappe.throw(
            "Leave Type is required."
        )

    if not from_date:
        frappe.throw(
            "From Date is required."
        )

    if not to_date:
        frappe.throw(
            "To Date is required."
        )

    from_date = getdate(from_date)
    to_date = getdate(to_date)

    if to_date < from_date:
        frappe.throw(
            "To Date cannot be before From Date."
        )

    half_day = frappe.utils.cint(
        half_day
    )

    if half_day:
        if not half_day_date:
            frappe.throw(
                "Half Day Date is required."
            )

        half_day_date = getdate(
            half_day_date
        )

        if not (
            from_date
            <= half_day_date
            <= to_date
        ):
            frappe.throw(
                "Half Day Date must be between From Date and To Date."
            )
    else:
        half_day_date = None

    validate_employee_leave_balance(
        employee=employee,
        leave_type=leave_type,
        date=to_date,
    )

    priority_rows = get_priority_rows(
        leave_type
    )

    request_dates = build_request_dates(
        from_date=from_date,
        to_date=to_date,
        half_day=half_day,
        half_day_date=half_day_date,
    )

    if not priority_rows:
        is_lwp = get_leave_type_is_lwp(
            leave_type
        )

        raw_distribution = []

        for request in request_dates:
            raw_distribution.append({
                "date":
                    request["date"],

                "leave_type":
                    leave_type,

                "days":
                    request["days"],

                "is_paid":
                    not is_lwp,
            })

        distribution = group_distribution(
            raw_distribution
        )

        return {
            "custom_rule": False,
            "distribution":
                distribution,
            "total_days":
                sum(
                    row["days"]
                    for row in raw_distribution
                ),
        }

    if (
        priority_rows[0]
        .deduct_from_leave_type
        != leave_type
    ):
        frappe.throw(
            f"Sequence 1 must be {leave_type}."
        )

    leave_details = get_core_leave_details(
        employee=employee,
        date=to_date,
    )

    leave_allocation = (
        leave_details.get(
            "leave_allocation"
        )
        or {}
    )

    balances = {}

    for row in priority_rows:
        deduction_type = (
            row.deduct_from_leave_type
        )

        details = leave_allocation.get(
            deduction_type,
            {},
        )

        is_unpaid = bool(
            row.is_unpaid
        )

        if is_unpaid:
            balance = 0
        else:
            balance = max(
                0,
                float(
                    details.get(
                        "remaining_leaves",
                        0,
                    )
                    or 0
                ),
            )

        balances[
            deduction_type
        ] = {
            "balance": balance,
            "is_unpaid": is_unpaid,
        }

    raw_distribution = []

    for request in request_dates:
        remaining = request["days"]

        for priority in priority_rows:
            deduction_type = (
                priority.deduct_from_leave_type
            )

            is_unpaid = bool(
                priority.is_unpaid
            )

            if is_unpaid:
                available = remaining
            else:
                available = balances[
                    deduction_type
                ]["balance"]

            if available <= 0:
                continue

            deducted = min(
                available,
                remaining,
            )

            if deducted <= 0:
                continue

            raw_distribution.append({
                "date":
                    request["date"],

                "leave_type":
                    deduction_type,

                "days":
                    deducted,

                "is_paid":
                    not is_unpaid,
            })

            if not is_unpaid:
                balances[
                    deduction_type
                ]["balance"] -= deducted

            remaining -= deducted

            if remaining <= 0:
                break

        if remaining > 0:
            frappe.throw(
                "Insufficient leave balance for "
                f"{request['date'].strftime('%d-%m-%Y')}."
            )

    distribution = group_distribution(
        raw_distribution
    )

    return {
        "custom_rule": True,

        "distribution":
            distribution,

        "total_days":
            sum(
                row["days"]
                for row in raw_distribution
            ),

        "balances": {
            key:
                value["balance"]
            for key, value
            in balances.items()
        },
    }


@frappe.whitelist()
def create_leave_applications(
    employee,
    leave_type,
    from_date,
    to_date,
    half_day=0,
    half_day_date=None,
    reason=None,
    leave_approver=None,
):
    if not reason or not reason.strip():
        frappe.throw(
            "Reason is required."
        )

    validate_employee_leave_balance(
        employee=employee,
        leave_type=leave_type,
        date=to_date,
    )

    result = get_leave_distribution(
        employee=employee,
        leave_type=leave_type,
        from_date=from_date,
        to_date=to_date,
        half_day=half_day,
        half_day_date=half_day_date,
    )

    distribution = result.get(
        "distribution",
        [],
    )

    if not distribution:
        frappe.throw(
            "No leave distribution found."
        )

    created = []

    for row in distribution:
        application = frappe.new_doc(
            "Leave Application"
        )

        application.employee = employee

        application.leave_type = (
            row["leave_type"]
        )

        application.from_date = (
            row["from_date"]
        )

        application.to_date = (
            row["to_date"]
        )

        application.total_leave_days = (
            row["days"]
        )

        application.reason = (
            reason.strip()
        )

        if leave_approver:
            application.leave_approver = (
                leave_approver
            )

        if float(row["days"]) == 0.5:
            application.half_day = 1
            application.half_day_date = (
                row["from_date"]
            )
        else:
            application.half_day = 0

        application.docstatus = 0

        application.insert(
            ignore_permissions=True
        )

        created.append({
            "name":
                application.name,

            "leave_type":
                application.leave_type,

            "from_date":
                application.from_date,

            "to_date":
                application.to_date,

            "total_leave_days":
                application.total_leave_days,

            "reason":
                application.reason,

            "leave_approver":
                application.leave_approver,
        })

    return {
        "custom_rule":
            result.get(
                "custom_rule",
                False,
            ),

        "created":
            created,

        "distribution":
            distribution,
    }
