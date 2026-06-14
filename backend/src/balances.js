import { db } from "./db.js";

export function getGroupBalances(groupId) {
  const rows = db.prepare(`
    SELECT p.id, p.name,
      COALESCE(paid.total_paid, 0) - COALESCE(owed.total_owed, 0) - COALESCE(sent.total_sent, 0) + COALESCE(received.total_received, 0) AS balance,
      COALESCE(paid.total_paid, 0) AS paid,
      COALESCE(owed.total_owed, 0) AS owed,
      COALESCE(sent.total_sent, 0) AS settlement_sent,
      COALESCE(received.total_received, 0) AS settlement_received
    FROM people p
    LEFT JOIN (
      SELECT paid_by_person_id AS person_id, SUM(amount_in_inr) AS total_paid FROM expenses WHERE group_id = ? AND status = 'active' GROUP BY paid_by_person_id
    ) paid ON paid.person_id = p.id
    LEFT JOIN (
      SELECT es.person_id, SUM(es.share_amount_in_inr) AS total_owed
      FROM expense_splits es JOIN expenses e ON e.id = es.expense_id
      WHERE e.group_id = ? AND e.status = 'active' GROUP BY es.person_id
    ) owed ON owed.person_id = p.id
    LEFT JOIN (
      SELECT paid_by_person_id AS person_id, SUM(amount_in_inr) AS total_sent FROM settlements WHERE group_id = ? GROUP BY paid_by_person_id
    ) sent ON sent.person_id = p.id
    LEFT JOIN (
      SELECT paid_to_person_id AS person_id, SUM(amount_in_inr) AS total_received FROM settlements WHERE group_id = ? GROUP BY paid_to_person_id
    ) received ON received.person_id = p.id
    WHERE p.id IN (
      SELECT person_id FROM group_memberships WHERE group_id = ?
      UNION SELECT paid_by_person_id FROM expenses WHERE group_id = ?
      UNION SELECT person_id FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE e.group_id = ?
    )
    ORDER BY p.name
  `).all(groupId, groupId, groupId, groupId, groupId, groupId, groupId);

  const rounded = rows.map((row) => ({ ...row, balance: round(row.balance), paid: round(row.paid), owed: round(row.owed) }));
  return { balances: rounded, settlements: simplifySettlements(rounded) };
}

export function getPersonTrace(groupId, personId) {
  return db.prepare(`
    SELECT e.id, e.expense_date, e.description, payer.name AS paid_by, e.amount_in_inr, e.currency, e.exchange_rate_to_inr,
      es.share_amount_in_inr, es.basis, es.basis_value
    FROM expense_splits es
    JOIN expenses e ON e.id = es.expense_id
    JOIN people payer ON payer.id = e.paid_by_person_id
    WHERE e.group_id = ? AND es.person_id = ? AND e.status = 'active'
    ORDER BY e.expense_date, e.id
  `).all(groupId, personId);
}

function simplifySettlements(balances) {
  const creditors = balances.filter((b) => b.balance > 0.009).map((b) => ({ ...b }));
  const debtors = balances.filter((b) => b.balance < -0.009).map((b) => ({ ...b, balance: Math.abs(b.balance) }));
  const result = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = round(Math.min(debtors[i].balance, creditors[j].balance));
    if (amount > 0) result.push({ from: debtors[i].name, to: creditors[j].name, amount });
    debtors[i].balance = round(debtors[i].balance - amount);
    creditors[j].balance = round(creditors[j].balance - amount);
    if (debtors[i].balance <= 0.009) i += 1;
    if (creditors[j].balance <= 0.009) j += 1;
  }
  return result;
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
