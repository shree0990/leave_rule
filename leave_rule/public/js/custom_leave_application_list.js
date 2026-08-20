let dialog_available_leave_types = [];


frappe.listview_settings["Leave Application"] = {
    onload(listview) {
        listview.page.clear_primary_action();

        $(listview.page.wrapper)
            .find(".btn-primary")
            .hide();

        listview.page.add_inner_button(
            __("Add Leave"),
            () => {
                open_add_leave_dialog();
            },
            null,
            "primary"
        );
    },
};


function open_add_leave_dialog() {
    const dialog = new frappe.ui.Dialog({
        title: __("Add Leave"),
        size: "large",

        fields: [
    {
        fieldname: "section_break_leave_information",
        fieldtype: "Section Break",
        label: __("Leave Information"),
    },

    {
        fieldname: "balance_html",
        fieldtype: "HTML",
    },

    {
        fieldname: "section_break_distribution",
        fieldtype: "Section Break",
        label: __("Leave Distribution"),
    },

    {
        fieldname: "distribution_html",
        fieldtype: "HTML",
    },

    {
        fieldname: "section_break_application",
        fieldtype: "Section Break",
        label: __("Leave Application"),
    },

    {
        fieldname: "employee",
        label: __("Employee"),
        fieldtype: "Link",
        options: "Employee",
        reqd: 1,
        onchange: function () {
            update_leave_balance(dialog);
            set_employee_leave_approver(dialog);
        },
    },

    {
        fieldname: "leave_approver",
        label: __("Leave Approver"),
        fieldtype: "Link",
        options: "User",
        read_only: 1,
    },

    {
        fieldname: "leave_type",
        label: __("Leave Type"),
        fieldtype: "Link",
        options: "Leave Type",
        reqd: 1,
        get_query: function () {
            return {
                filters: [
                    [
                        "Leave Type",
                        "name",
                        "in",
                        dialog_available_leave_types,
                    ],
                ],
            };
        },
        onchange: function () {
            update_selected_leave_balance(dialog);
            refresh_leave_distribution(dialog);
        },
    },

    {
        fieldname: "leave_balance",
        label: __("Selected Leave Balance"),
        fieldtype: "Float",
        read_only: 1,
    },

    {
        fieldname: "column_break_leave_type",
        fieldtype: "Column Break",
    },

    {
        fieldname: "from_date",
        label: __("From Date"),
        fieldtype: "Date",
        reqd: 1,
        onchange: function () {
            calculate_total_days(dialog);
            refresh_leave_distribution(dialog);
        },
    },

    {
        fieldname: "to_date",
        label: __("To Date"),
        fieldtype: "Date",
        reqd: 1,
        onchange: function () {
            calculate_total_days(dialog);
            refresh_leave_distribution(dialog);
        },
    },

    {
        fieldname: "half_day",
        label: __("Half Day"),
        fieldtype: "Check",
        onchange: function () {
            toggle_half_day_date(dialog);
            calculate_total_days(dialog);
            refresh_leave_distribution(dialog);
        },
    },


    {
        fieldname: "half_day_date",
        label: __("Half Day Date"),
        fieldtype: "Date",
        depends_on: "eval:doc.half_day",
        onchange: function () {
            calculate_total_days(dialog);
            refresh_leave_distribution(dialog);
        },
    },
    {
        fieldname: "total_days",
        label: __("Total Days"),
        fieldtype: "Float",
        read_only: 1,
    },

    {
        fieldname: "section_break_reason",
        fieldtype: "Section Break",
    },

    {
        fieldname: "reason",
        label: __("Reason"),
        fieldtype: "Small Text",
        reqd: 1,
    },
],



        primary_action_label: __("Submit"),

        primary_action(values) {
            submit_leave_request(dialog, values);
        },
    });

    render_leave_balances(dialog, {});
    render_distribution(dialog, []);

    dialog.show();

    toggle_half_day_date(dialog);
}


function update_leave_balance(dialog) {
    const employee =
        dialog.get_value("employee");

    dialog_available_leave_types = [];

    dialog.set_value("leave_type", "");
    dialog.set_value("leave_balance", 0);

    render_leave_balances(dialog, {});
    render_distribution(dialog, []);

    if (!employee) {
        return;
    }

    render_balance_loading(dialog);

    frappe.call({
        method:
            "hrms.hr.doctype.leave_application.leave_application.get_leave_details",

        args: {
            employee: employee,
            date: frappe.datetime.get_today(),
        },

        callback(r) {
            const leave_allocation =
                r.message?.leave_allocation || {};

            frappe.call({
                method: "frappe.client.get_list",

                args: {
                    doctype: "Leave Type",

                    fields: [
                        "name",
                        "is_lwp",
                    ],

                    limit_page_length: 0,
                },

                callback(type_response) {
                    const leave_types =
                        type_response.message || [];

                    dialog_available_leave_types =
                        leave_types
                            .filter(leave_type_doc => {
                                const details =
                                    leave_allocation[
                                        leave_type_doc.name
                                    ] || {};

                                const remaining =
                                    flt(
                                        details.remaining_leaves
                                    );

                                const is_lwp =
                                    cint(
                                        leave_type_doc.is_lwp
                                    ) === 1;

                                return (
                                    remaining > 0 ||
                                    is_lwp
                                );
                            })
                            .map(
                                leave_type_doc =>
                                    leave_type_doc.name
                            );

                    render_leave_balances(
                        dialog,
                        leave_allocation
                    );

                    const leave_type_field =
                        dialog.fields_dict.leave_type;

                    leave_type_field.get_query =
                        function () {
                            return {
                                filters: [
                                    [
                                        "Leave Type",
                                        "name",
                                        "in",
                                        dialog_available_leave_types,
                                    ],
                                ],
                            };
                        };

                    dialog.set_value(
                        "leave_type",
                        ""
                    );

                    dialog.set_value(
                        "leave_balance",
                        0
                    );

                    if (
                        !dialog_available_leave_types.length
                    ) {
                        frappe.msgprint({
                            title: __("No Leave Available"),

                            message: __(
                                "This employee does not have any available paid leave or Leave Without Pay."
                            ),

                            indicator: "orange",
                        });
                    }
                },
            });
        },

        error() {
            dialog_available_leave_types = [];

            render_leave_balances(dialog, {});

            frappe.msgprint({
                title: __("Error"),

                message: __(
                    "Unable to fetch leave balances."
                ),

                indicator: "red",
            });
        },
    });
}


function render_balance_loading(dialog) {
    const wrapper =
        dialog.fields_dict
            .balance_html
            .$wrapper;

    wrapper.html(`
        <div
            class="text-muted"
            style="padding:10px 0;"
        >
            ${__("Loading leave balances...")}
        </div>
    `);
}


function render_leave_balances(
    dialog,
    leave_allocation
) {
    const wrapper =
        dialog.fields_dict
            .balance_html
            .$wrapper;

    if (
        !leave_allocation ||
        !Object.keys(leave_allocation).length
    ) {
        wrapper.html(`
            <div
                class="text-muted"
                style="
                    padding:12px;
                    border:1px solid var(--border-color);
                    border-radius:6px;
                "
            >
                ${__(
                    "No leave balance found for this employee."
                )}
            </div>
        `);

        return;
    }

    let html = `
        <div
            class="leave-balance-preview"
            style="overflow-x:auto;"
        >
            <table
                class="table table-bordered"
                style="margin-bottom:15px;"
            >
                <thead>
                    <tr>
                        <th>${__("Leave Type")}</th>
                        <th>${__("Total")}</th>
                        <th>${__("Expired")}</th>
                        <th>${__("Taken")}</th>
                        <th>${__("Pending")}</th>
                        <th>${__("Remaining")}</th>
                    </tr>
                </thead>

                <tbody>
    `;

    Object.entries(
        leave_allocation
    ).forEach(([leave_type, details]) => {
        const remaining =
            flt(
                details.remaining_leaves
            );

        const remaining_color =
            remaining > 0
                ? "var(--green-600)"
                : "var(--red-600)";

        html += `
            <tr>
                <td>
                    <strong>
                        ${frappe.utils.escape_html(
                            leave_type
                        )}
                    </strong>
                </td>

                <td>
                    ${details.total_leaves || 0}
                </td>

                <td>
                    ${details.expired_leaves || 0}
                </td>

                <td>
                    ${details.leaves_taken || 0}
                </td>

                <td>
                    ${
                        details.leaves_pending_approval || 0
                    }
                </td>

                <td>
                    <strong
                        style="
                            color:${remaining_color};
                        "
                    >
                        ${remaining}
                    </strong>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    wrapper.html(html);
}


function update_selected_leave_balance(dialog) {
    const employee =
        dialog.get_value("employee");

    const leave_type =
        dialog.get_value("leave_type");

    if (!employee || !leave_type) {
        dialog.set_value(
            "leave_balance",
            0
        );

        return;
    }

    frappe.call({
        method:
            "hrms.hr.doctype.leave_application.leave_application.get_leave_details",

        args: {
            employee: employee,
            date: frappe.datetime.get_today(),
        },

        callback(r) {
            const allocations =
                r.message?.leave_allocation || {};

            const details =
                allocations[leave_type];

            const balance =
                details
                    ? flt(
                        details.remaining_leaves
                    )
                    : 0;

            dialog.set_value(
                "leave_balance",
                balance
            );
        },
    });
}


function toggle_half_day_date(dialog) {
    const half_day =
        dialog.get_value("half_day");

    const field =
        dialog.fields_dict.half_day_date;

    if (half_day) {
        field.df.reqd = 1;
        field.$wrapper.show();
    } else {
        field.df.reqd = 0;
        field.$wrapper.hide();

        dialog.set_value(
            "half_day_date",
            ""
        );
    }
}


function calculate_total_days(dialog) {
    const from_date =
        dialog.get_value("from_date");

    const to_date =
        dialog.get_value("to_date");

    if (!from_date || !to_date) {
        dialog.set_value(
            "total_days",
            0
        );

        return;
    }

    const difference =
        frappe.datetime.get_diff(
            to_date,
            from_date
        );

    if (difference < 0) {
        dialog.set_value(
            "total_days",
            0
        );

        frappe.msgprint({
            title: __("Invalid Date"),

            message: __(
                "To Date cannot be before From Date."
            ),

            indicator: "red",
        });

        return;
    }

    let total_days =
        difference + 1;

    const half_day =
        dialog.get_value("half_day");

    const half_day_date =
        dialog.get_value("half_day_date");

    if (
        half_day &&
        half_day_date
    ) {
        total_days -= 0.5;
    }

    dialog.set_value(
        "total_days",
        total_days
    );
}


function refresh_leave_distribution(dialog) {
    const employee =
        dialog.get_value("employee");

    const leave_type =
        dialog.get_value("leave_type");

    const from_date =
        dialog.get_value("from_date");

    const to_date =
        dialog.get_value("to_date");

    const half_day =
        dialog.get_value("half_day");

    const half_day_date =
        dialog.get_value("half_day_date");

    if (
        !employee ||
        !leave_type ||
        !from_date ||
        !to_date
    ) {
        render_distribution(
            dialog,
            []
        );

        return;
    }

    if (
        half_day &&
        !half_day_date
    ) {
        render_distribution(
            dialog,
            []
        );

        return;
    }

    render_distribution_loading(dialog);

    frappe.call({
        method:
            "leave_rule.api.leave_distribution.get_leave_distribution",

        args: {
            employee: employee,
            leave_type: leave_type,
            from_date: from_date,
            to_date: to_date,
            half_day: half_day ? 1 : 0,
            half_day_date:
                half_day_date || null,
        },

        callback(r) {
            if (!r.message) {
                render_distribution(
                    dialog,
                    []
                );

                return;
            }

            render_distribution(
                dialog,
                r.message.distribution || []
            );

            dialog.set_value(
                "total_days",
                r.message.total_days || 0
            );
        },

        error() {
            render_distribution(
                dialog,
                []
            );
        },
    });
}


function render_distribution_loading(dialog) {
    const wrapper =
        dialog.fields_dict
            .distribution_html
            .$wrapper;

    wrapper.html(`
        <div
            class="text-muted"
            style="padding:10px 0;"
        >
            ${__(
                "Calculating leave distribution..."
            )}
        </div>
    `);
}


function render_distribution(
    dialog,
    distribution
) {
    const wrapper =
        dialog.fields_dict
            .distribution_html
            .$wrapper;

    if (
        !distribution ||
        !distribution.length
    ) {
        wrapper.html(`
            <div
                class="text-muted"
                style="
                    padding:10px;
                    border:1px solid var(--border-color);
                    border-radius:6px;
                "
            >
                ${__(
                    "Select Employee, Leave Type and dates to calculate leave distribution."
                )}
            </div>
        `);

        return;
    }

    let html = `
        <div
            class="leave-distribution-preview"
            style="overflow-x:auto;"
        >
            <table
                class="table table-bordered"
                style="margin-bottom:0;"
            >
                <thead>
                    <tr>
                        <th>${__("From Date")}</th>
                        <th>${__("To Date")}</th>
                        <th>${__("Leave Type")}</th>
                        <th style="width:100px;">
                            ${__("Days")}
                        </th>
                        <th style="width:100px;">
                            ${__("Type")}
                        </th>
                    </tr>
                </thead>

                <tbody>
    `;

    distribution.forEach(row => {
        const type =
            row.is_paid
                ? __("Paid")
                : __("Unpaid");

        const color =
            row.is_paid
                ? "var(--green-600)"
                : "var(--red-600)";

        html += `
            <tr>
                <td>
                    ${format_date(
                        row.from_date
                    )}
                </td>

                <td>
                    ${format_date(
                        row.to_date
                    )}
                </td>

                <td>
                    ${frappe.utils.escape_html(
                        row.leave_type || ""
                    )}
                </td>

                <td>
                    ${row.days || 0}
                </td>

                <td>
                    <strong
                        style="color:${color};"
                    >
                        ${type}
                    </strong>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    wrapper.html(html);
}


function format_date(date) {
    if (!date) {
        return "";
    }

    return frappe.datetime.str_to_user(
        date
    );
}


function submit_leave_request(
    dialog,
    values
) {
    if (!values.employee) {
        frappe.throw(
            __("Please select an Employee.")
        );
    }

    if (!values.leave_type) {
        frappe.throw(
            __("Please select a Leave Type.")
        );
    }

    if (
        !values.from_date ||
        !values.to_date
    ) {
        frappe.throw(
            __("Please select From Date and To Date.")
        );
    }

    if (
        values.half_day &&
        !values.half_day_date
    ) {
        frappe.throw(
            __("Please select Half Day Date.")
        );
    }

    if (
        !values.reason ||
        !values.reason.trim()
    ) {
        frappe.throw(
            __("Please enter Reason.")
        );
    }

    if (
        !values.total_days ||
        values.total_days <= 0
    ) {
        frappe.throw(
            __("Total Days must be greater than zero.")
        );
    }

    if (
        !dialog_available_leave_types.includes(
            values.leave_type
        )
    ) {
        frappe.throw(
            __(
                "Selected Leave Type is not available for this employee."
            )
        );
    }

    frappe.call({
        method:
            "leave_rule.api.leave_distribution.create_leave_applications",

        args: {
            employee:
                values.employee,

            leave_type:
                values.leave_type,

            from_date:
                values.from_date,

            to_date:
                values.to_date,

            half_day:
                values.half_day ? 1 : 0,

            half_day_date:
                values.half_day_date || null,

            reason:
                values.reason,

            leave_approver:
                values.leave_approver || null,
        },

        freeze: true,

        freeze_message:
            __("Creating Leave Applications..."),

        callback(r) {
            if (!r.message) {
                return;
            }

            dialog.hide();

            frappe.show_alert({
                message: __(
                    "{0} draft Leave Applications created successfully.",
                    [
                        r.message.created
                            ? r.message.created.length
                            : 0,
                    ]
                ),

                indicator: "green",
            });

            frappe.set_route(
                "List",
                "Leave Application"
            );
        },
    });
}

function set_employee_leave_approver(dialog) {
    const employee =
        dialog.get_value("employee");

    dialog.set_value(
        "leave_approver",
        ""
    );

    if (!employee) {
        return;
    }

    frappe.db.get_value(
        "Employee",
        employee,
        "leave_approver"
    ).then(r => {
        if (
            r &&
            r.message &&
            r.message.leave_approver
        ) {
            dialog.set_value(
                "leave_approver",
                r.message.leave_approver
            );
        }
    });
}
