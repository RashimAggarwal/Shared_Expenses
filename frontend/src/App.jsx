import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, ArrowRight, FileUp, IndianRupee, LogIn, LogOut, Plus, ReceiptText, Sparkles, UserPlus, Users, X } from "lucide-react";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function request(path, options = {}) {
  const token = localStorage.getItem("token");
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("userName");
    }
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  });
}

function App() {
  const [user, setUser] = useState(() => localStorage.getItem("token") ? { name: localStorage.getItem("userName") || "Student Developer" } : null);
  if (!user) return <AuthScreen onAuth={setUser} />;
  return <Dashboard onLogout={() => setUser(null)} />;
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("student@example.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/signup";
      const data = await request(path, { method: "POST", body: JSON.stringify({ name, email, password }) });
      localStorage.setItem("token", data.token);
      localStorage.setItem("userName", data.user.name);
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <main className="loginShell">
      <section className="loginPanel">
        <div className="brandMark"><ReceiptText size={28} /></div>
        <h1>Shared Expenses</h1>
        <p>Track flat expenses, approvals, repayments, and clear settlements from one warm dashboard.</p>
        <div className="authTabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }} type="button"><LogIn size={16} /> Login</button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); }} type="button"><UserPlus size={16} /> Sign up</button>
        </div>
        <form onSubmit={submit} className="formStack">
          {mode === "signup" && <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label>}
          <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" /></label>
          {error && <div className="error">{error}</div>}
          <button className="primary">{mode === "login" ? <LogIn size={18} /> : <UserPlus size={18} />} {mode === "login" ? "Login" : "Create account"}</button>
        </form>
        <small className="demoHint">Demo login still works: student@example.com / password123</small>
      </section>
    </main>
  );
}

function Dashboard({ onLogout }) {
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [balances, setBalances] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [members, setMembers] = useState([]);
  const [report, setReport] = useState(null);
  const [trace, setTrace] = useState([]);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState("");

  useEffect(() => { loadGroups(); }, []);
  useEffect(() => {
    if (activeGroup) refreshGroup(activeGroup.id);
  }, [activeGroup]);

  async function loadGroups() {
    try {
      const data = await request("/groups");
      setGroups(data);
      if (data[0]) setActiveGroup(data[0]);
    } catch (err) {
      setAuthError("Your session expired. Please refresh and login again.");
    }
  }
  async function createGroup(e) {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) {
      setError("Please enter a group name");
      return;
    }
    const group = await request("/groups", { method: "POST", body: JSON.stringify({ name }) });
    setGroups([group, ...groups]);
    setActiveGroup(group);
    setNewGroupName("");
    setShowGroupForm(false);
    setError("");
  }
  async function refreshGroup(groupId) {
    const [b, e, m] = await Promise.all([
      request(`/groups/${groupId}/balances`),
      request(`/groups/${groupId}/expenses`),
      request(`/groups/${groupId}/members`)
    ]);
    setBalances(b);
    setExpenses(e);
    setMembers(m);
  }
  async function importFile(file) {
    const body = new FormData();
    body.append("file", file);
    const data = await request(`/groups/${activeGroup.id}/import`, { method: "POST", body });
    setReport(data);
    refreshGroup(activeGroup.id);
  }
  async function showTrace(personId) {
    const data = await request(`/groups/${activeGroup.id}/people/${personId}/trace`);
    setTrace(data);
  }
  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userName");
    onLogout();
  }

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="sideTitle"><Users size={20} /> Groups</div>
        <button className="createButton" onClick={() => setShowGroupForm(true)}><Plus size={16} /> New group</button>
        {showGroupForm && (
          <form className="groupForm" onSubmit={createGroup}>
            <div className="groupFormTop">
              <strong>Group name</strong>
              <button type="button" className="iconButton" onClick={() => setShowGroupForm(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Example: Goa flatmates" autoFocus />
            {error && <small className="sideError">{error}</small>}
            <button className="saveGroup"><Sparkles size={16} /> Create</button>
          </form>
        )}
        {groups.map((group) => (
          <button key={group.id} className={`groupButton ${activeGroup?.id === group.id ? "selected" : ""}`} onClick={() => setActiveGroup(group)}>
            {group.name}
          </button>
        ))}
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{activeGroup?.name || "Create a group"}</h1>
            <p>{activeGroup ? "Import the CSV, review anomalies, and settle balances." : "Create your first group to begin."}</p>
            {authError && <div className="error">{authError}</div>}
          </div>
          <div className="topActions">
            {activeGroup && <label className="uploadButton"><FileUp size={18} /> Import CSV<input type="file" accept=".csv" onChange={(e) => e.target.files[0] && importFile(e.target.files[0])} /></label>}
            <button className="ghostButton" onClick={logout}><LogOut size={18} /> Logout</button>
          </div>
        </header>

        {activeGroup && (
          <>
            <section className="settlementStrip">
              <h2><IndianRupee size={20} /> Who pays whom</h2>
              <div className="settlementGrid">
                {balances?.settlements?.map((s, idx) => <div className="settlement" key={idx}><span>{s.from}</span><ArrowRight size={16} /><span>{s.to}</span><strong>₹{money(s.amount)}</strong></div>)}
                {!balances?.settlements?.length && <p>No balances yet. Import the CSV to calculate settlements.</p>}
              </div>
            </section>

            <section className="gridTwo">
              <Panel title="Balance Summary">
                <table>
                  <thead><tr><th>Person</th><th>Paid</th><th>Share</th><th>Net</th><th></th></tr></thead>
                  <tbody>{balances?.balances?.map((b) => <tr key={b.id}><td>{b.name}</td><td>₹{money(b.paid)}</td><td>₹{money(b.owed)}</td><td className={b.balance >= 0 ? "positive" : "negative"}>₹{money(b.balance)}</td><td><button className="linkButton" onClick={() => showTrace(b.id)}>trace</button></td></tr>)}</tbody>
                </table>
              </Panel>
              <Panel title="Members Over Time">
                <table>
                  <thead><tr><th>Name</th><th>Joined</th><th>Left</th></tr></thead>
                  <tbody>{members.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.joined_on || "-"}</td><td>{m.left_on || "-"}</td></tr>)}</tbody>
                </table>
              </Panel>
            </section>

            {report && <ImportReport report={report} />}
            {!!trace.length && <Trace trace={trace} />}

            <Panel title="Imported Expenses">
              <table>
                <thead><tr><th>Date</th><th>Description</th><th>Paid by</th><th>Amount</th><th>Split</th><th>Status</th></tr></thead>
                <tbody>{expenses.map((e) => <tr key={e.id}><td>{e.expense_date}</td><td>{e.description}</td><td>{e.paid_by}</td><td>₹{money(e.amount_in_inr)}</td><td>{e.split_type}</td><td>{e.status}</td></tr>)}</tbody>
              </table>
            </Panel>
          </>
        )}
      </section>
    </main>
  );
}

function Panel({ title, children }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}

function ImportReport({ report }) {
  const grouped = useMemo(() => report.anomalies || [], [report]);
  return (
    <Panel title={`Import Report: ${report.anomalyCount} anomalies`}>
      <div className="reportList">
        {grouped.map((a) => <article className="anomaly" key={a.id}><AlertTriangle size={18} /><div><strong>Row {a.row_number}: {a.code}</strong><p>{a.message}</p><small>{a.action}</small></div></article>)}
      </div>
    </Panel>
  );
}

function Trace({ trace }) {
  return (
    <Panel title="Expense Trace">
      <table>
        <thead><tr><th>Date</th><th>Expense</th><th>Paid by</th><th>Total</th><th>This person owes</th><th>Basis</th></tr></thead>
        <tbody>{trace.map((t) => <tr key={t.id}><td>{t.expense_date}</td><td>{t.description}</td><td>{t.paid_by}</td><td>₹{money(t.amount_in_inr)}</td><td>₹{money(t.share_amount_in_inr)}</td><td>{t.basis}</td></tr>)}</tbody>
      </table>
    </Panel>
  );
}

function money(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

createRoot(document.getElementById("root")).render(<App />);
