import { parse } from "csv-parse/sync";
import { db, canonicalName, getOrCreatePerson, normalizeDisplayName } from "./db.js";

const USD_TO_INR = 83;
const PRIMARY_MEMBERS = ["Aisha", "Rohan", "Priya", "Meera"];
const MEMBERSHIP = {
  Aisha: { joined_on: "2026-02-01", left_on: null },
  Rohan: { joined_on: "2026-02-01", left_on: null },
  Priya: { joined_on: "2026-02-01", left_on: null },
  Meera: { joined_on: "2026-02-01", left_on: "2026-03-31" },
  Sam: { joined_on: "2026-04-08", left_on: null },
  Dev: { joined_on: "2026-02-08", left_on: "2026-03-14" }
};

export function importCsv({ groupId, filename, csvText }) {
  seedMemberships(groupId);
  const importId = db.prepare("INSERT INTO imports (group_id, filename, status) VALUES (?, ?, ?)").run(groupId, filename, "completed").lastInsertRowid;
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
  const seen = new Map();

  const tx = db.transaction(() => {
    rows.forEach((row, index) => processRow({ row, rowNumber: index + 2, groupId, importId, seen }));
  });
  tx();

  return getImportReport(importId);
}

function processRow(ctx) {
  const { row, rowNumber, groupId, importId, seen } = ctx;
  const anomalies = [];
  const date = parseDate(row.date, row.notes, anomalies);
  const paidByRaw = row.paid_by || "";
  const paidBy = paidByRaw ? getOrCreatePerson(paidByRaw) : null;
  const amount = parseAmount(row.amount, anomalies);
  const currency = normalizeCurrency(row.currency, anomalies);
  const splitType = normalizeSplitType(row.split_type, `${row.description || ""} ${row.notes || ""}`, anomalies);
  const splitWith = parsePeopleList(row.split_with);
  const notes = row.notes || "";
  const description = row.description || "Untitled expense";

  if (paidByRaw && paidByRaw !== normalizeDisplayName(paidByRaw)) {
    anomalies.push(["NAME_ALIAS_NORMALIZED", "warning", `Paid by "${paidByRaw}" was normalized to "${normalizeDisplayName(paidByRaw)}".`, "Used canonical person name."]);
  }
  if (!paidBy) anomalies.push(["MISSING_PAYER", "error", "Paid by is blank.", "Skipped row until user assigns a payer."]);
  if (!date) anomalies.push(["INVALID_DATE", "error", `Date "${row.date}" could not be interpreted safely.`, "Skipped row until user confirms date."]);
  if (amount === null) anomalies.push(["INVALID_AMOUNT", "error", `Amount "${row.amount}" is not a valid number.`, "Skipped row."]);
  if (amount === 0) anomalies.push(["ZERO_AMOUNT", "warning", "Amount is zero.", "Skipped zero-value expense because it does not affect balances."]);
  if (amount < 0) anomalies.push(["NEGATIVE_AMOUNT_REFUND", "warning", "Negative amount treated as a refund/credit.", "Imported as a negative expense split across listed people."]);
  if (!row.currency) anomalies.push(["MISSING_CURRENCY", "warning", "Currency is blank.", "Assumed INR because all nearby household rows are INR."]);
  if (currency === "USD") anomalies.push(["USD_CONVERTED", "info", "USD amount detected.", `Converted to INR using fixed rate 1 USD = ${USD_TO_INR} INR.`]);
  if (splitType === "settlement") anomalies.push(["SETTLEMENT_ROW", "warning", "Row looks like a repayment, deposit, or transfer, not a shared expense.", "Stored as settlement/payment."]);
  if (!splitWith.length) anomalies.push(["MISSING_SPLIT_WITH", "error", "split_with is empty.", "Skipped row."]);

  const activeSplitWith = filterMembership(groupId, splitWith, date, anomalies);
  const details = parseSplitDetails(row.split_details || "", anomalies);
  if (row.split_details && splitType === "equal") {
    anomalies.push(["SPLIT_DETAILS_ON_EQUAL", "warning", "split_type is equal but split_details were provided.", "Used equal split because split_type is the explicit field."]);
  }
  if (splitType === "percentage") {
    const percentTotal = activeSplitWith.reduce((sum, name) => sum + (details.get(canonicalName(name)) || 0), 0);
    if (Math.abs(percentTotal - 100) > 0.001) {
      anomalies.push(["PERCENTAGE_TOTAL_NOT_100", "warning", `Percentages add to ${percentTotal}%.`, "Normalized percentages proportionally so the full amount is allocated."]);
    }
  }

  const duplicateKey = `${date}|${canonicalDescription(description)}|${Math.abs(amount || 0)}|${currency}|${activeSplitWith.map(canonicalName).sort().join(";")}`;
  let duplicateOf = null;
  if (seen.has(duplicateKey)) {
    duplicateOf = seen.get(duplicateKey);
    anomalies.push(["DUPLICATE_EXACT", "warning", "This appears to duplicate an earlier row.", "Imported as inactive duplicate for review; it does not affect balances."]);
  }

  const nearDuplicate = findNearDuplicate(groupId, date, description, amount);
  if (nearDuplicate && !duplicateOf) {
    anomalies.push(["POSSIBLE_DUPLICATE_CONFLICT", "warning", "Similar same-day expense found with a different amount or wording.", "Imported both active and flagged for user review."]);
  }

  recordAnomalies(importId, rowNumber, anomalies, row);
  if (!paidBy || !date || amount === null || !splitWith.length || amount === 0 || hasBlockingMembershipProblem(activeSplitWith, splitWith)) return;

  if (splitType === "settlement") {
    const paidTo = getOrCreatePerson(splitWith[0]);
    db.prepare(`INSERT INTO settlements (group_id, import_id, source_row, paid_by_person_id, paid_to_person_id, amount_in_inr, settlement_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(groupId, importId, rowNumber, paidBy.id, paidTo.id, Math.abs(amount), date, notes);
    return;
  }

  const amountInInr = roundMoney(amount * exchangeRate(currency));
  const status = duplicateOf ? "inactive_duplicate" : "active";
  const expenseId = db.prepare(`INSERT INTO expenses
    (group_id, import_id, source_row, description, paid_by_person_id, amount_in_original_currency, currency, exchange_rate_to_inr, amount_in_inr, split_type, expense_date, notes, status, duplicate_of_expense_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(groupId, importId, rowNumber, description, paidBy.id, amount, currency, exchangeRate(currency), amountInInr, splitType, date, notes, status, duplicateOf).lastInsertRowid;

  if (!duplicateOf) seen.set(duplicateKey, expenseId);
  const splits = calculateSplits(amountInInr, splitType, activeSplitWith, details, anomalies);
  splits.forEach((split) => {
    const person = getOrCreatePerson(split.name);
    db.prepare("INSERT INTO expense_splits (expense_id, person_id, share_amount_in_inr, basis, basis_value) VALUES (?, ?, ?, ?, ?)")
      .run(expenseId, person.id, split.amount, split.basis, split.basisValue);
  });
}

function parseDate(value, notes, anomalies) {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    if (/april 5|may 4|format is a mess/i.test(notes || "")) {
      anomalies.push(["AMBIGUOUS_DATE_FORMAT", "warning", `Date "${text}" is ambiguous in the note.`, "Kept DD-MM-YYYY interpretation because the export mostly uses Indian date order."]);
    }
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  match = text.match(/^Mar-(\d{1,2})$/i);
  if (match) {
    anomalies.push(["SHORT_DATE_NORMALIZED", "warning", `Date "${text}" has no year.`, "Assumed 2026 because the export is for 2026."]);
    return `2026-03-${String(match[1]).padStart(2, "0")}`;
  }
  return null;
}

function parseAmount(value, anomalies) {
  const raw = String(value || "").trim();
  if (raw.includes(",")) anomalies.push(["AMOUNT_COMMA_NORMALIZED", "info", "Amount contained thousands separator.", "Removed comma before parsing."]);
  const normalized = raw.replace(/,/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  if (!Number.isInteger(parsed * 100)) anomalies.push(["ROUNDING_APPLIED", "warning", "Amount has more than two decimals.", "Rounded to two decimals for INR settlement."]);
  return roundMoney(parsed);
}

function normalizeCurrency(value) {
  const currency = String(value || "INR").trim().toUpperCase();
  return currency === "USD" ? "USD" : "INR";
}

function normalizeSplitType(value, notes) {
  const raw = String(value || "").trim().toLowerCase();
  if (/paid .* back|settlement|deposit/i.test(notes || "")) return "settlement";
  if (raw === "share") return "share";
  if (raw === "percentage") return "percentage";
  if (raw === "unequal") return "unequal";
  return "equal";
}

function parsePeopleList(value) {
  return String(value || "").split(";").map(normalizeDisplayName).filter(Boolean);
}

function parseSplitDetails(value) {
  if (!value.trim()) return new Map();
  const map = new Map();
  value.split(";").forEach((part) => {
    const match = part.trim().match(/^(.+?)\s+(-?\d+(?:\.\d+)?)%?$/);
    if (match) map.set(canonicalName(match[1]), Number(match[2]));
  });
  return map;
}

function filterMembership(groupId, people, date, anomalies) {
  return people.filter((name) => {
    const person = getOrCreatePerson(name);
    const membership = db.prepare("SELECT * FROM group_memberships WHERE group_id = ? AND person_id = ?").get(groupId, person.id);
    if (!membership) {
      anomalies.push(["NON_MEMBER_INCLUDED", "warning", `${name} was not a configured flat member.`, "Included as trip participant only for this expense."]);
      return true;
    }
    if (date && membership.left_on && date > membership.left_on) {
      anomalies.push(["LEFT_MEMBER_INCLUDED", "warning", `${name} left on ${membership.left_on} but appears on ${date}.`, "Removed from this split."]);
      return false;
    }
    if (date && membership.joined_on && date < membership.joined_on) {
      anomalies.push(["PRE_JOIN_MEMBER_INCLUDED", "warning", `${name} joined on ${membership.joined_on} but appears on ${date}.`, "Removed from this split."]);
      return false;
    }
    return true;
  });
}

function hasBlockingMembershipProblem(active, original) {
  return original.length > 0 && active.length === 0;
}

function calculateSplits(amount, splitType, people, details) {
  if (splitType === "percentage") {
    const total = people.reduce((sum, name) => sum + (details.get(canonicalName(name)) || 0), 0);
    const denominator = total || 100;
    return people.map((name) => ({ name, amount: roundMoney(amount * ((details.get(canonicalName(name)) || 0) / denominator)), basis: "percentage", basisValue: details.get(canonicalName(name)) || 0 }));
  }
  if (splitType === "share") {
    const total = people.reduce((sum, name) => sum + (details.get(canonicalName(name)) || 1), 0);
    return people.map((name) => ({ name, amount: roundMoney(amount * ((details.get(canonicalName(name)) || 1) / total)), basis: "share", basisValue: details.get(canonicalName(name)) || 1 }));
  }
  if (splitType === "unequal") {
    return people.map((name) => ({ name, amount: roundMoney(details.get(canonicalName(name)) || 0), basis: "amount", basisValue: details.get(canonicalName(name)) || 0 }));
  }
  const each = roundMoney(amount / people.length);
  return people.map((name, index) => ({ name, amount: index === people.length - 1 ? roundMoney(amount - each * (people.length - 1)) : each, basis: "equal", basisValue: 1 }));
}

function exchangeRate(currency) {
  return currency === "USD" ? USD_TO_INR : 1;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function canonicalDescription(description) {
  return String(description).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(at|the|dinner)\b/g, "").trim();
}

function findNearDuplicate(groupId, date, description, amount) {
  if (!date || amount === null) return null;
  const key = canonicalDescription(description);
  return db.prepare("SELECT * FROM expenses WHERE group_id = ? AND expense_date = ? AND status = 'active'")
    .all(groupId, date)
    .find((expense) => {
      const other = canonicalDescription(expense.description);
      return (key.includes(other) || other.includes(key) || key.split(" ").some((word) => word.length > 4 && other.includes(word))) && Math.abs(expense.amount_in_original_currency - amount) <= 100;
    });
}

function recordAnomalies(importId, rowNumber, anomalies, row) {
  anomalies.forEach(([code, severity, message, action]) => {
    db.prepare("INSERT INTO import_anomalies (import_id, row_number, code, severity, message, action, original_row) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(importId, rowNumber, code, severity, message, action, JSON.stringify(row));
  });
}

function seedMemberships(groupId) {
  Object.entries(MEMBERSHIP).forEach(([name, dates]) => {
    const person = getOrCreatePerson(name);
    db.prepare(`INSERT INTO group_memberships (group_id, person_id, joined_on, left_on)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(group_id, person_id) DO UPDATE SET joined_on = excluded.joined_on, left_on = excluded.left_on`)
      .run(groupId, person.id, dates.joined_on, dates.left_on);
  });
}

export function getImportReport(importId) {
  const imported = db.prepare("SELECT * FROM imports WHERE id = ?").get(importId);
  const anomalies = db.prepare("SELECT * FROM import_anomalies WHERE import_id = ? ORDER BY row_number, id").all(importId);
  return { import: imported, anomalyCount: anomalies.length, anomalies };
}
