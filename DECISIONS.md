# Decision Log

## 1. Relational Database

Options considered: SQLite, PostgreSQL, MongoDB.

I chose SQLite because the assignment explicitly asks for a relational database and the app must be easy to run locally during evaluation. The schema can move to PostgreSQL later without changing the main data model.

## 2. Membership Dates

Options considered: store only current members, store full membership history.

I chose full membership history because Sam joined mid-April and Meera left at the end of March. Balance calculation must use the expense date, not only the current group list.

## 3. Import Anomalies Are Persisted

Options considered: show import warnings only in the browser, store warnings in the database.

I store anomalies in `import_anomalies` so a reviewer can inspect exactly what happened after the import. This also supports Meera's request to approve duplicate cleanups.

## 4. Duplicate Handling

Options considered: delete duplicates automatically, keep all duplicates active, mark duplicates inactive.

I mark exact duplicates as inactive while keeping them in the database. This prevents double charging but still gives the user a review trail. Possible duplicates with conflicting values stay active and are flagged, because the app cannot know which person is correct.

## 5. USD Conversion

Options considered: live exchange API, fixed exchange rate, ask user during import.

I chose a fixed documented rate of 1 USD = ₹83 for assignment repeatability. A live API would make test results change over time.

## 6. Settlement Rows

Options considered: treat repayments as expenses, ignore them, store them separately.

I store repayments in `settlements`. This keeps expense totals honest and still updates balances.

## 7. Negative Amounts

Options considered: reject all negative amounts, treat as refund, ask user.

I treat negative amounts as refunds because the CSV has a clear "Parasailing refund" row. The import report still flags it.

## 8. Ambiguous Dates

Options considered: reject ambiguous dates, use US date order, use Indian date order.

I use DD-MM-YYYY because most rows follow that format and the context is an Indian placement assignment. Ambiguous rows are flagged for approval.

## 9. Split Type Source of Truth

Options considered: prefer `split_details`, prefer `split_type`.

I prefer `split_type` because it is the explicit structured field. If details conflict, the row is still flagged.

## 10. Balance Explanation

Options considered: show only final settlement numbers, show traceable expenses per person.

I included both. Aisha gets the simple "who pays whom" summary, and Rohan gets the trace view showing which expense shares make up a balance.
