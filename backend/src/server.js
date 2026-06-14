import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, migrate, getOrCreatePerson } from "./db.js";
import { importCsv, getImportReport } from "./importer.js";
import { getGroupBalances, getPersonTrace } from "./balances.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const JWT_SECRET = process.env.JWT_SECRET || "development-secret";

migrate();
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  }
}));
app.use(express.json());

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ sub: user.id, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.post("/api/auth/signup", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: "Name, email, and password are required" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const id = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
    .run(name, email, bcrypt.hashSync(password, 10)).lastInsertRowid;
  const token = jwt.sign({ sub: id, name }, JWT_SECRET, { expiresIn: "7d" });
  res.status(201).json({ token, user: { id, name, email } });
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/auth")) return next();
  const header = req.headers.authorization || "";
  const token = header.replace("Bearer ", "");
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
});

app.get("/api/groups", (req, res) => {
  res.json(db.prepare("SELECT * FROM groups ORDER BY created_at DESC").all());
});

app.post("/api/groups", (req, res) => {
  const name = req.body.name || "Flat expenses";
  const id = db.prepare("INSERT INTO groups (name, created_by) VALUES (?, ?)").run(name, req.user.sub).lastInsertRowid;
  res.status(201).json(db.prepare("SELECT * FROM groups WHERE id = ?").get(id));
});

app.get("/api/groups/:groupId/members", (req, res) => {
  res.json(db.prepare(`
    SELECT gm.*, p.name FROM group_memberships gm JOIN people p ON p.id = gm.person_id
    WHERE gm.group_id = ? ORDER BY gm.joined_on, p.name
  `).all(req.params.groupId));
});

app.post("/api/groups/:groupId/members", (req, res) => {
  const person = getOrCreatePerson(req.body.name);
  db.prepare("INSERT INTO group_memberships (group_id, person_id, joined_on, left_on) VALUES (?, ?, ?, ?) ON CONFLICT(group_id, person_id) DO UPDATE SET joined_on = excluded.joined_on, left_on = excluded.left_on")
    .run(req.params.groupId, person.id, req.body.joined_on || null, req.body.left_on || null);
  res.status(201).json({ ok: true });
});

app.get("/api/groups/:groupId/expenses", (req, res) => {
  res.json(db.prepare(`
    SELECT e.*, p.name AS paid_by FROM expenses e JOIN people p ON p.id = e.paid_by_person_id
    WHERE e.group_id = ? ORDER BY e.expense_date, e.id
  `).all(req.params.groupId));
});

app.post("/api/groups/:groupId/expenses", (req, res) => {
  const payer = getOrCreatePerson(req.body.paid_by);
  const id = db.prepare(`INSERT INTO expenses
    (group_id, description, paid_by_person_id, amount_in_original_currency, currency, exchange_rate_to_inr, amount_in_inr, split_type, expense_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.groupId, req.body.description, payer.id, req.body.amount, req.body.currency || "INR", 1, req.body.amount, req.body.split_type || "equal", req.body.expense_date, req.body.notes || "").lastInsertRowid;
  const people = (req.body.split_with || "").split(";").map((x) => x.trim()).filter(Boolean);
  const each = Math.round((Number(req.body.amount) / people.length) * 100) / 100;
  people.forEach((name, index) => {
    const person = getOrCreatePerson(name);
    const share = index === people.length - 1 ? Number(req.body.amount) - each * (people.length - 1) : each;
    db.prepare("INSERT INTO expense_splits (expense_id, person_id, share_amount_in_inr, basis, basis_value) VALUES (?, ?, ?, 'equal', 1)")
      .run(id, person.id, share);
  });
  res.status(201).json({ id });
});

app.post("/api/groups/:groupId/settlements", (req, res) => {
  const from = getOrCreatePerson(req.body.from);
  const to = getOrCreatePerson(req.body.to);
  const id = db.prepare("INSERT INTO settlements (group_id, paid_by_person_id, paid_to_person_id, amount_in_inr, settlement_date, notes) VALUES (?, ?, ?, ?, ?, ?)")
    .run(req.params.groupId, from.id, to.id, req.body.amount, req.body.settlement_date, req.body.notes || "").lastInsertRowid;
  res.status(201).json({ id });
});

app.post("/api/groups/:groupId/import", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "CSV file is required" });
  const report = importCsv({ groupId: Number(req.params.groupId), filename: req.file.originalname, csvText: req.file.buffer.toString("utf8") });
  res.status(201).json(report);
});

app.get("/api/imports/:importId/report", (req, res) => {
  res.json(getImportReport(Number(req.params.importId)));
});

app.get("/api/groups/:groupId/balances", (req, res) => {
  res.json(getGroupBalances(Number(req.params.groupId)));
});

app.get("/api/groups/:groupId/people/:personId/trace", (req, res) => {
  res.json(getPersonTrace(Number(req.params.groupId), Number(req.params.personId)));
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Shared expenses API running on ${port}`));
