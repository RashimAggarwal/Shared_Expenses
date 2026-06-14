# Shared Expenses App

This is my placement assignment submission for the Spreetail Software Developer role. I built it as a full-stack shared expenses app for Aisha, Rohan, Priya, Meera, Sam, and Dev using React.js, Node.js, Express, and SQLite.

## Features

- Login module with JWT authentication
- Create and manage groups
- Track members with join and leave dates
- Import the provided `expenses_export.csv` without editing it first
- Detect and report messy data problems during import
- Support equal, unequal, percentage, and share-based splits
- Convert USD expenses to INR using a documented fixed rate
- Record settlements/payments separately from expenses
- Show group balances, individual trace, and simplified "who pays whom" settlements

## Tech Stack

- Frontend: React.js with Vite
- Backend: Node.js and Express
- Database: SQLite relational database using `better-sqlite3`
- Authentication: JWT and bcrypt
- CSV parsing: `csv-parse`

## Local Setup

1. Install Node.js 20 or newer.
2. Install dependencies:

```bash
npm run install:all
```

3. Start the app:

```bash
npm run dev
```

4. Open the frontend:

```text
http://localhost:5173
```

5. Login with:

```text
Email: student@example.com
Password: password123
```

6. Create a group and upload `expenses_export.csv` from the project root.

## Deployment

Recommended deployment:

- Backend: Render, Railway, or Fly.io
- Frontend: Vercel or Netlify
- Database: SQLite is acceptable for this assignment demo. For production, I would move to PostgreSQL while keeping the same relational schema.

Set these environment variables during deployment:

```text
JWT_SECRET=<strong-secret>
VITE_API_URL=<deployed-backend-url>/api
```

## AI Used

I used an AI coding assistant as a development collaborator for scaffolding, debugging, and reviewing edge cases. I remained responsible for the product decisions, data policies, schema, and final code.

## Important Files

- `backend/src/importer.js`: CSV import and anomaly handling
- `backend/src/balances.js`: balance and settlement calculation
- `backend/src/db.js`: relational schema
- `frontend/src/App.jsx`: main user interface
- `SCOPE.md`: anomaly log and database schema
- `DECISIONS.md`: product and engineering decisions
- `AI_USAGE.md`: AI usage notes
