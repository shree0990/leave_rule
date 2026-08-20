# Leave Rule for Frappe HRMS

A custom Frappe/HRMS application that adds configurable leave deduction, balance-aware distribution, half-day support, and automatic draft leave application creation.

---

## Features

* **Configurable Deduction Rules:** Set cascading priorities for how a leave type consumes balances from other leave types (e.g., Casual Leave $\rightarrow$ Annual Leave $\rightarrow$ Leave Without Pay).
* **Date-Wise Distribution:** Automatically breaks down multi-day requests across specific dates and leave types.
* **Smart Balance Validation:** Prevents selecting paid leave types with zero balance while allowing LWP (Leave Without Pay) fallback.
* **Half-Day Support:** Accurate $0.5$-day deductions with customizable half-day dates within the range.
* **Draft Automation:** Automatically generates standard HRMS **Leave Application** documents in **Draft** status based on the calculated distribution.
* **Core Compatible:** Falls back seamlessly to standard HRMS behavior if no custom deduction rule is configured.

---

## Installation

Execute these commands in your Frappe Bench directory:

```bash
bench get-app leave_rule
bench --site your-site install-app leave_rule
bench --site your-site migrate
bench --site your-site clear-cache
bench restart

```

---

## Configuration

1. Go to **Leave Type** in your ERPNext/HRMS desk.
2. Enable **Custom Enable Deduction Rule**.
3. Define your cascading sequence in the **Leave Deduction Priority** table:
* **Sequence 1** must always start with the current leave type.
* Subsequent sequences define the fallback leave types (ending with an LWP type if needed).


---

## License

MIT