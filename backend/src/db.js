import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const db = new Database(join(__dirname, "..", "data.sqlite"));
db.pragma("foreign_keys = ON");

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      base_currency TEXT NOT NULL DEFAULT 'INR',
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      canonical_name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS group_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      person_id INTEGER NOT NULL,
      joined_on TEXT,
      left_on TEXT,
      FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY(person_id) REFERENCES people(id),
      UNIQUE(group_id, person_id)
    );

    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS import_anomalies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL,
      row_number INTEGER NOT NULL,
      code TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      action TEXT NOT NULL,
      original_row TEXT NOT NULL,
      FOREIGN KEY(import_id) REFERENCES imports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      import_id INTEGER,
      source_row INTEGER,
      description TEXT NOT NULL,
      paid_by_person_id INTEGER NOT NULL,
      amount_in_original_currency REAL NOT NULL,
      currency TEXT NOT NULL,
      exchange_rate_to_inr REAL NOT NULL,
      amount_in_inr REAL NOT NULL,
      split_type TEXT NOT NULL,
      expense_date TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      duplicate_of_expense_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY(import_id) REFERENCES imports(id),
      FOREIGN KEY(paid_by_person_id) REFERENCES people(id)
    );

    CREATE TABLE IF NOT EXISTS expense_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      person_id INTEGER NOT NULL,
      share_amount_in_inr REAL NOT NULL,
      basis TEXT NOT NULL,
      basis_value REAL,
      FOREIGN KEY(expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY(person_id) REFERENCES people(id)
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      import_id INTEGER,
      source_row INTEGER,
      paid_by_person_id INTEGER NOT NULL,
      paid_to_person_id INTEGER NOT NULL,
      amount_in_inr REAL NOT NULL,
      settlement_date TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
    );
  `);

  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("student@example.com");
  if (!admin) {
    db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)").run(
      "Student Developer",
      "student@example.com",
      bcrypt.hashSync("password123", 10)
    );
  }
}

export function getOrCreatePerson(name) {
  const display = normalizeDisplayName(name);
  const canonical = canonicalName(display);
  const found = db.prepare("SELECT * FROM people WHERE canonical_name = ?").get(canonical);
  if (found) return found;
  const result = db.prepare("INSERT INTO people (name, canonical_name) VALUES (?, ?)").run(display, canonical);
  return db.prepare("SELECT * FROM people WHERE id = ?").get(result.lastInsertRowid);
}

export function canonicalName(name = "") {
  const lower = String(name).trim().toLowerCase();
  if (lower === "priya s") return "priya";
  return lower;
}

export function normalizeDisplayName(name = "") {
  const trimmed = String(name).trim();
  const aliases = { priya: "Priya", "priya s": "Priya", rohan: "Rohan", aisha: "Aisha", meera: "Meera", dev: "Dev", sam: "Sam" };
  return aliases[trimmed.toLowerCase()] || trimmed;
}
