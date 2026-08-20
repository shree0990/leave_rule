import frappe


def validate_leave_type(doc, method=None):
    """Run custom validations for Leave Type."""
    validate_deduction_sequence(doc)


def validate_deduction_sequence(doc):
    """Validate deduction priority configuration."""

    # Skip validation if deduction rule is disabled
    if not doc.custom_enable_deduction_rule:
        return

    rows = doc.custom_leave_deduction_priority or []

    if not rows:
        frappe.throw(
            frappe._(
                "Please add at least one Deduction Priority row "
                "when Deduction Rule is enabled."
            )
        )

    sequences = set()
    leave_types = set()

    for row in rows:
        sequence = row.sequence
        deduct_from_leave_type = row.deduct_from_leave_type

        # Validate sequence
        if sequence is None:
            frappe.throw(
                frappe._(
                    "Row {0}: Sequence is required."
                ).format(row.idx)
            )

        if sequence < 1:
            frappe.throw(
                frappe._(
                    "Row {0}: Sequence must be greater than or equal to 1."
                ).format(row.idx)
            )

        # Check duplicate sequence
        if sequence in sequences:
            frappe.throw(
                frappe._(
                    "Duplicate Sequence {0} found in row {1}. "
                    "Each deduction priority must have a unique sequence."
                ).format(sequence, row.idx)
            )

        sequences.add(sequence)

        # Validate leave type
        if not deduct_from_leave_type:
            frappe.throw(
                frappe._(
                    "Row {0}: Deduct From Leave Type is required."
                ).format(row.idx)
            )

        # Check duplicate leave type
        if deduct_from_leave_type in leave_types:
            frappe.throw(
                frappe._(
                    "Row {0}: Leave Type '{1}' is already configured "
                    "in the deduction priority."
                ).format(
                    row.idx,
                    deduct_from_leave_type,
                )
            )

        leave_types.add(deduct_from_leave_type)

        # Validate unpaid status
        leave_type = frappe.get_cached_doc(
            "Leave Type",
            deduct_from_leave_type,
        )

        expected_is_unpaid = 1 if leave_type.is_lwp else 0

        if row.is_unpaid != expected_is_unpaid:
            frappe.throw(
                frappe._(
                    "Row {0}: Is Unpaid does not match the selected "
                    "Leave Type '{1}'."
                ).format(
                    row.idx,
                    deduct_from_leave_type,
                )
            )

    # Check sequence is continuous
    sorted_sequences = sorted(sequences)
    expected_sequences = list(range(1, len(sorted_sequences) + 1))

    if sorted_sequences != expected_sequences:
        frappe.throw(
            frappe._(
                "Deduction Priority sequence must start from 1 "
                "and be continuous. Expected: {0}."
            ).format(
                ", ".join(map(str, expected_sequences))
            )
        )

    # Current leave type should have the first priority
    first_row = next(
        row for row in rows if row.sequence == 1
    )

    if first_row.deduct_from_leave_type != doc.name:
        frappe.throw(
            frappe._(
                "Row with Sequence 1 must use the current Leave Type "
                "'{0}' as the first deduction priority."
            ).format(doc.name)
        )

    # Unpaid leave should be the last priority
    last_sequence = max(sequences)

    for row in rows:
        if row.is_unpaid and row.sequence != last_sequence:
            frappe.throw(
                frappe._(
                    "Row {0}: Unpaid Leave must be the final "
                    "deduction priority."
                ).format(row.idx)
            )
