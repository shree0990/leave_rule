frappe.ui.form.on("Leave Type", {
    refresh(frm) {
        frm.fields_dict.custom_leave_deduction_priority.grid
            .update_docfield_property(
                "is_unpaid",
                "read_only",
                1
            );
    }
});

frappe.ui.form.on("Leave Deduction Priority", {
    deduct_from_leave_type(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        if (!row.deduct_from_leave_type) {
            frappe.model.set_value(cdt, cdn, "is_unpaid", 0);
            return;
        }

        frappe.db.get_value(
            "Leave Type",
            row.deduct_from_leave_type,
            "is_lwp"
        ).then((r) => {
            if (r.message) {
                frappe.model.set_value(
                    cdt,
                    cdn,
                    "is_unpaid",
                    r.message.is_lwp ? 1 : 0
                );
            }
        });
    }
});
