# Scope, Anomaly Log, and Schema

## Import Policy

The importer never silently fixes data. Every non-trivial correction is written to `import_anomalies` and shown in the import report. Rows are either imported, imported with a warning, stored as inactive duplicates, converted to settlements, or skipped when the app cannot safely decide.

## Anomalies Detected

| Problem | Example | Action |
| --- | --- | --- |
| Exact duplicate expense | Two Marina Bites dinner rows on 08-02-2026 | First row stays active. Later row is stored as `inactive_duplicate` for approval. |
| Possible duplicate with conflict | Thalassa dinner logged by Aisha and Rohan with different amounts | Both stay active and are flagged because choosing one would be a silent guess. |
| Comma in amount | `1,200` | Comma is removed before parsing and the action is reported. |
| More than two decimals | Cylinder refill `899.995` | Rounded to two decimals. |
| Lowercase payer name | `priya`, `rohan` | Normalized to `Priya` and `Rohan`. |
| Alias name | `Priya S` | Mapped to `Priya`. |
| Missing payer | House cleaning supplies | Row is skipped until a payer is selected. |
| Settlement recorded like expense | Rohan paid Aisha back | Stored as settlement, not expense. |
| USD expenses | Goa villa, beach lunch, parasailing | Converted to INR at 1 USD = ₹83 and reported. |
| Negative amount | Parasailing refund `-30 USD` | Treated as refund/credit and allocated across listed people. |
| Short date | `Mar-14` | Assumed 2026 and normalized to `2026-03-14`. |
| Missing currency | Groceries DMart on 15-03-2026 | Assumed INR because household expenses around it are INR. |
| Zero amount | Dinner order Swiggy | Skipped because it does not affect balances. |
| Member included after leaving | Meera appears in April groceries | Removed from that split because Meera left on 2026-03-31. |
| Member join date issue | Sam should not pay March expenses | Membership date prevents Sam from being charged before 2026-04-08. |
| Non-member participant | Dev's friend Kabir | Included only for that trip expense and flagged. |
| Ambiguous date note | Deep cleaning service says April 5 or May 4 | Kept DD-MM-YYYY interpretation and flagged for approval. |
| Split details conflict | Furniture says equal but also has shares | Used `split_type` as source of truth and flagged extra details. |
| Percentages not totaling 100 | Pizza Friday totals 110% | Normalized proportionally and reported. |

## Split Types Supported

- `equal`: amount is divided equally among listed active participants.
- `unequal`: `split_details` contains rupee amounts per person.
- `percentage`: `split_details` contains percentages per person.
- `share`: `split_details` contains weight units per person.

## Database Schema

The app uses a relational SQLite database.

### `users`

Stores login users.

- `id`
- `name`
- `email`
- `password_hash`
- `created_at`

### `groups`

Stores expense groups.

- `id`
- `name`
- `base_currency`
- `created_by`
- `created_at`

### `people`

Stores canonical people names across groups.

- `id`
- `name`
- `canonical_name`

### `group_memberships`

Stores membership periods.

- `id`
- `group_id`
- `person_id`
- `joined_on`
- `left_on`

### `imports`

Stores each CSV import event.

- `id`
- `group_id`
- `filename`
- `status`
- `created_at`

### `import_anomalies`

Stores every detected data problem and action taken.

- `id`
- `import_id`
- `row_number`
- `code`
- `severity`
- `message`
- `action`
- `original_row`

### `expenses`

Stores imported and manually created expenses.

- `id`
- `group_id`
- `import_id`
- `source_row`
- `description`
- `paid_by_person_id`
- `amount_in_original_currency`
- `currency`
- `exchange_rate_to_inr`
- `amount_in_inr`
- `split_type`
- `expense_date`
- `notes`
- `status`
- `duplicate_of_expense_id`
- `created_at`

### `expense_splits`

Stores each person's calculated share for an expense.

- `id`
- `expense_id`
- `person_id`
- `share_amount_in_inr`
- `basis`
- `basis_value`

### `settlements`

Stores repayments separately from expenses.

- `id`
- `group_id`
- `import_id`
- `source_row`
- `paid_by_person_id`
- `paid_to_person_id`
- `amount_in_inr`
- `settlement_date`
- `notes`
