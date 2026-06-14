# Shared Expenses App

This repository contains my submission for the Spreetail Software Developer assignment. The application is a full-stack shared expenses platform designed to manage group expenses, settlements, changing group memberships, and the import of imperfect real-world expense data.

## Overview

The application was built to address the requirements described in the assignment scenario involving Aisha, Rohan, Priya, Meera, Sam, and Dev. The focus of the project is not only expense tracking but also transparent handling of data anomalies during CSV import.

## Features

### Authentication

* Secure login using JWT-based authentication
* Password hashing with bcrypt

### Group Management

* Create and manage expense groups
* Add, remove, and manage members
* Track membership periods using join and leave dates

### Expense Management

* Create, edit, and delete expenses
* Support multiple split methods:

  * Equal splits
  * Exact amount splits
  * Percentage-based splits
  * Share-based splits
* Record settlements and repayments separately from expenses

### Balance Calculation

* Group-level balance summaries
* Individual balance breakdowns
* Transparent expense tracing for auditability
* Simplified settlement recommendations showing who should pay whom

### CSV Import

* Import the provided `expenses_export.csv` without manual modification
* Detect and report data anomalies
* Generate an import report describing every anomaly and action taken
* Preserve traceability of imported records

### Currency Handling

* Support expenses recorded in multiple currencies
* Convert USD expenses to INR using a documented fixed conversion rate to ensure reproducible calculations

## Technology Stack

### Frontend

* React.js
* Vite

### Backend

* Node.js
* Express.js

### Database

* SQLite (relational database)
* better-sqlite3

### Authentication

* JWT
* bcrypt

### Data Processing

* csv-parse

## Local Setup

### Prerequisites

* Node.js 20 or later
* npm

### Installation

```bash
npm run install:all
```

### Start Development Environment

```bash
npm run dev
```

### Access the Application

Frontend:

```text
http://localhost:5173
```

### Demo Credentials

```text
Email: student@example.com
Password: password123
```

### Importing Data

After logging in:

1. Create or select a group.
2. Upload the provided `expenses_export.csv`.
3. Review the generated import report.
4. Inspect detected anomalies and actions taken.

## Deployment

Suggested deployment configuration:

### Frontend

* Vercel
* Netlify

### Backend

* Render
* Railway
* Fly.io

### Database

SQLite is used for this assignment submission. For a production-scale deployment, PostgreSQL would be the preferred relational database while preserving the same data model and business rules.

### Environment Variables

```text
JWT_SECRET=<strong-secret>
VITE_API_URL=<backend-url>/api
```

## AI Usage

AI tools were used for planning, implementation assistance, debugging, and code review. All business rules, anomaly-handling policies, database design decisions, and final implementation choices were reviewed and validated manually.

Additional details are documented in `AI_USAGE.md`.

## Project Documentation

### README.md

Project overview and setup instructions.

### SCOPE.md

* Database schema
* Import policies
* Complete anomaly log

### DECISIONS.md

* Product decisions
* Engineering trade-offs
* Design rationale

### AI_USAGE.md

* AI tools used
* Key prompts
* Corrections made to AI-generated suggestions

## Key Source Files

* `backend/src/importer.js` — CSV import pipeline and anomaly handling
* `backend/src/balances.js` — Balance and settlement calculations
* `backend/src/db.js` — Relational database schema
* `frontend/src/App.jsx` — Main application interface
