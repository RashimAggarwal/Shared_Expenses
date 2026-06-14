# AI Usage

I used an AI coding assistant to help plan and implement this assignment, but AI was used for planning, code scaffolding, and implementation assistance. All business rules, anomaly-handling policies, database design decisions, and final code changes were reviewed and validated manually.

## Key Prompts Used

- "Explain what the shared expenses assignment is asking for and convert it into a build plan."
- "Generate an initial architecture and implementation plan for a React, Node.js, and PostgreSQL shared expenses application."
- "Review the CSV rows and list likely data problems that the importer must handle."
- "Help design balance calculation where members join and leave over time."

## Cases Where AI Output Needed Correction

### 1. It initially treated repayments as expenses

The first suggested approach would have imported "Rohan paid Aisha back" as a normal expense. I corrected this by adding a separate `settlements` table and routing repayment/deposit rows there.

### 2. It almost ignored membership dates

The first balance idea split expenses only by the names in `split_with`. That would incorrectly charge Meera after March and could charge Sam before he moved in. I added `group_memberships` with `joined_on` and `left_on` dates.

### 3. It wanted to automatically delete duplicates

Automatic deletion would violate Meera's request to approve changes. I changed the design so exact duplicates are stored as inactive and reported instead of removed from the database.

### 4. It suggested live exchange rates

Live exchange rates would make results non-repeatable during evaluation. I chose a fixed documented USD to INR rate so the reviewer can reproduce calculations.

## Responsibility Statement

I understand the code and decisions in this repository. During review, I can trace a CSV anomaly from `backend/src/importer.js` into the database tables and explain how it affects the final balance.
