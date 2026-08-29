import { useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../components/Toast.jsx";
import { Field } from "../components/Ui.jsx";
import { MONTHS, formatDuration, formatMoney, todayISO } from "../lib/format.js";
import { useAuth } from "../auth.jsx";

export default function Salary() {
  const now = todayISO().split("-");
  const [year, setYear] = useState(now[0]);
  const [month, setMonth] = useState(String(Number(now[1])));
  const [officerId, setOfficerId] = useState("");
  const [officers, setOfficers] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [history, setHistory] = useState([]);
  const [histForm, setHistForm] = useState({ amount: "", salary_type: "monthly", effective_date: todayISO(), notes: "" });
  const toast = useToast();
  const { isAdmin } = useAuth();

  useEffect(() => {
    api.officers().then(setOfficers);
  }, []);

  async function loadPayments() {
    const params = new URLSearchParams({ year, month });
    if (officerId) params.set("officer_id", officerId);
    setPayments(await api.payments(`?${params}`));
  }

  useEffect(() => {
    loadPayments().catch((e) => toast(e.message, "error"));
  }, [year, month, officerId]);

  useEffect(() => {
    if (!officerId) {
      setHistory([]);
      return;
    }
    api.salaryHistory(officerId).then(setHistory).catch((e) => toast(e.message, "error"));
  }, [officerId]);

  async function generate() {
    try {
      if (officerId) {
        const draft = await api.calculate({ officer_id: officerId, year, month });
        setDrafts([draft]);
      } else {
        setDrafts(await api.calculateAll({ year, month }));
      }
      toast("Salary calculated from attendance. Review deductions and bonuses before saving.");
    } catch (e) {
      toast(e.message, "error");
    }
  }

  function editDraft(index, field, value) {
    setDrafts((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, [field]: value };
        next.net_salary = Number(next.basic_salary || 0) - Number(next.deductions || 0) + Number(next.bonuses || 0);
        return next;
      })
    );
  }

  async function saveDraft(row) {
    try {
      await api.savePayment(row);
      toast("Salary record saved.");
      await loadPayments();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function markPaid(row) {
    try {
      await api.savePayment({
        ...row,
        paid: 1,
        payment_date: row.payment_date || todayISO(),
        payment_method: row.payment_method || "Bank",
      });
      toast("Marked as paid.");
      await loadPayments();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function addHistory(e) {
    e.preventDefault();
    if (!officerId) return toast("Select an officer first.", "error");
    try {
      await api.addSalaryHistory({ officer_id: officerId, ...histForm, amount: Number(histForm.amount) });
      toast("Salary history added. Previous amounts were kept.");
      setHistory(await api.salaryHistory(officerId));
    } catch (err) {
      toast(err.message, "error");
    }
  }

  const officerName = (id) => officers.find((o) => o.id === id)?.name || id;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Salary</h2>
          <p>{isAdmin ? "Calculate from attendance, edit deductions and bonuses, then record payment. Old salary amounts are never overwritten." : "View saved salary records. Processing and salary changes are admin-only."}</p>
        </div>
        {isAdmin ? <button className="btn btn-primary" onClick={generate}>Calculate salary</button> : null}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="filters">
          <Field label="Month">
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
            </select>
          </Field>
          <Field label="Year">
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </Field>
          <Field label="Officer">
            <select value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
              <option value="">All active officers</option>
              {officers.map((o) => <option key={o.id} value={o.id}>{o.officer_code} — {o.name}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {isAdmin && drafts.length > 0 && (
        <div className="card table-wrap" style={{ marginBottom: 16 }}>
          <div className="card-pad"><strong>Calculated salary — deductions and bonuses are editable</strong></div>
          <table>
            <thead>
              <tr>
                <th>Officer</th><th>Basic</th><th>Present</th><th>Absent</th><th>Leave</th><th>Half</th>
                <th>OT hrs</th><th>Deductions</th><th>Bonuses</th><th>Net</th><th></th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((row, index) => (
                <tr key={row.officer_id}>
                  <td>{officerName(row.officer_id)}</td>
                  <td>{formatMoney(row.basic_salary)}</td>
                  <td>{row.present_days}</td>
                  <td>{row.absent_days}</td>
                  <td>{row.leave_days}</td>
                  <td>{row.half_days}</td>
                  <td>{formatDuration(row.overtime_hours)}</td>
                  <td>
                    <input type="number" value={row.deductions} onChange={(e) => editDraft(index, "deductions", e.target.value)} />
                  </td>
                  <td>
                    <input type="number" value={row.bonuses} onChange={(e) => editDraft(index, "bonuses", e.target.value)} />
                  </td>
                  <td><strong>{formatMoney(row.net_salary)}</strong></td>
                  <td className="row-actions">
                    <button className="btn btn-ghost" onClick={() => saveDraft(row)}>Save</button>
                    <button className="btn btn-primary" onClick={() => markPaid({ ...row, paid: 1 })}>Mark paid</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card table-wrap" style={{ marginBottom: 16 }}>
        <div className="card-pad"><strong>Saved salary records</strong></div>
        <table>
          <thead>
            <tr>
              <th>Officer</th><th>Period</th><th>Basic</th><th>Deductions</th><th>Bonuses</th>
              <th>Net</th><th>Status</th><th>Payment date</th><th>Method</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr><td colSpan="9">No salary records for this period yet.</td></tr>
            ) : payments.map((row) => (
              <tr key={row.id}>
                <td>{row.officer_name}</td>
                <td>{row.month}/{row.year}</td>
                <td>{formatMoney(row.basic_salary)}</td>
                <td>{formatMoney(row.deductions)}</td>
                <td>{formatMoney(row.bonuses)}</td>
                <td>{formatMoney(row.net_salary)}</td>
                <td>{row.paid ? "Paid" : "Pending"}</td>
                <td>{row.payment_date || "—"}</td>
                <td>{row.payment_method || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin ? (
      <div className="card card-pad">
        <h3>Add salary change</h3>
        <p style={{ color: "#5c6b80" }}>This keeps the previous salary. Select an officer, then record the new amount and effective date.</p>
        <form className="filters" onSubmit={addHistory} style={{ marginTop: 12 }}>
          <Field label="Amount">
            <input type="number" min="0" required value={histForm.amount} onChange={(e) => setHistForm((f) => ({ ...f, amount: e.target.value }))} />
          </Field>
          <Field label="Type">
            <select value={histForm.salary_type} onChange={(e) => setHistForm((f) => ({ ...f, salary_type: e.target.value }))}>
              <option value="monthly">Monthly</option>
              <option value="daily">Daily</option>
            </select>
          </Field>
          <Field label="Effective date">
            <input type="date" value={histForm.effective_date} onChange={(e) => setHistForm((f) => ({ ...f, effective_date: e.target.value }))} />
          </Field>
          <Field label="Notes">
            <input value={histForm.notes} onChange={(e) => setHistForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
          <button className="btn btn-primary" type="submit">Add to history</button>
        </form>
        {history.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead><tr><th>Effective</th><th>Amount</th><th>Type</th><th>Notes</th></tr></thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{row.effective_date}</td>
                    <td>{formatMoney(row.amount)}</td>
                    <td>{row.salary_type}</td>
                    <td>{row.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      ) : null}
    </>
  );
}
