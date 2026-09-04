import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, officerLabel } from "../api";
import { useToast } from "../components/Toast.jsx";
import { Avatar, Badge, EmptyState, Field, Modal } from "../components/Ui.jsx";
import { ATTENDANCE_STATUSES, DOCUMENT_TYPES, EMPLOYMENT_STATUSES } from "../lib/constants.js";
import {
  formatPaymentAccount,
  paymentMethodLabel,
  validatePaymentAccountForm,
} from "../lib/paymentAccount.js";
import { PaymentAccountSection } from "../components/PaymentAccountFields.jsx";
import { formatDate, formatDateTime, formatDuration, formatMoney, lateLabel, statusLabel, weekday, MONTHS, todayISO } from "../lib/format.js";
import { previewAttendance } from "../lib/attendanceMetrics.js";
import { useAuth } from "../auth.jsx";

const TABS = [
  ["overview", "Overview"],
  ["personal", "Personal Details"],
  ["employment", "Employment"],
  ["payment", "Payment Account Details"],
  ["attendance", "Attendance"],
  ["salary", "Salary"],
  ["documents", "Documents"],
  ["activity", "Activity / History"],
];

export default function OfficerProfile() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(
    location.hash === "#payment" || new URLSearchParams(location.search).get("tab") === "payment"
      ? "payment"
      : "overview"
  );
  const [lookups, setLookups] = useState({ shifts: [], banks: [] });
  const now = todayISO().split("-");
  const [attFilters, setAttFilters] = useState({ month: String(Number(now[1])), year: now[0], status: "" });
  const [editRow, setEditRow] = useState(null);
  const [docType, setDocType] = useState("other");
  const [uploading, setUploading] = useState(false);
  const [payForm, setPayForm] = useState({
    payment_method: "",
    account_name: "",
    bank_name: "",
    account_number: "",
    iban: "",
    payment_mobile: "",
    nayapay_account_name: "",
    nayapay_number: "",
    nayapay_iban: "",
    easypaisa_iban: "",
  });
  const [payErrors, setPayErrors] = useState({});
  const [savingPay, setSavingPay] = useState(false);
  const [payReady, setPayReady] = useState(false);

  async function load(filters = attFilters) {
    const params = new URLSearchParams();
    if (filters.year) params.set("year", filters.year);
    if (filters.month) params.set("month", filters.month);
    if (filters.status) params.set("status", filters.status);
    const qs = params.toString();
    setData(await api.profile(id, qs ? `?${qs}` : ""));
  }

  useEffect(() => {
    api.lookups().then(setLookups);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    setPayReady(false);
  }, [id]);

  useEffect(() => {
    if (location.hash === "#payment" || new URLSearchParams(location.search).get("tab") === "payment") {
      setTab("payment");
    }
  }, [location.hash, location.search]);

  useEffect(() => {
    const row = data?.officer;
    if (!row || payReady) return;
    setPayForm({
      payment_method: row.payment_method || "",
      account_name: row.account_name || "",
      bank_name: row.bank_name || "",
      account_number: row.account_number || "",
      iban: row.iban || "",
      payment_mobile: row.payment_mobile || "",
      nayapay_account_name: row.nayapay_account_name || "",
      nayapay_number: row.nayapay_number || "",
      nayapay_iban: row.nayapay_iban || "",
      easypaisa_iban: row.easypaisa_iban || "",
    });
    setPayReady(true);
  }, [data, payReady]);

  if (error) {
    return (
      <div className="card card-pad">
        <p className="error">{error}</p>
        <Link to="/officers" className="btn btn-ghost">Back to officers</Link>
      </div>
    );
  }
  if (!data) return <p>Loading profile…</p>;

  const { officer, stats, salarySummary } = data;

  function kv(label, value) {
    return (
      <div className="kv">
        <span>{label}</span>
        <strong>{value || "—"}</strong>
      </div>
    );
  }

  function setPay(field, value) {
    setPayForm((f) => ({ ...f, [field]: value }));
    setPayErrors((e) => ({ ...e, [field]: "" }));
  }

  async function savePay(e) {
    e?.preventDefault?.();
    const next = validatePaymentAccountForm(payForm);
    setPayErrors(next);
    if (Object.keys(next).length) {
      setTab("payment");
      toast(Object.values(next)[0], "error");
      return;
    }
    setSavingPay(true);
    try {
      const saved = await api.updatePaymentAccount(id, payForm);
      setPayForm({
        payment_method: saved.payment_method || "",
        account_name: saved.account_name || "",
        bank_name: saved.bank_name || "",
        account_number: saved.account_number || "",
        iban: saved.iban || "",
        payment_mobile: saved.payment_mobile || "",
        nayapay_account_name: saved.nayapay_account_name || "",
        nayapay_number: saved.nayapay_number || "",
        nayapay_iban: saved.nayapay_iban || "",
        easypaisa_iban: saved.easypaisa_iban || "",
      });
      toast("Payment details saved.");
      await load();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSavingPay(false);
    }
  }

  function paymentSection() {
    return (
      <PaymentAccountSection
        form={payForm}
        onChange={setPay}
        errors={payErrors}
        banks={lookups.banks}
        onSave={isAdmin ? savePay : undefined}
        saving={savingPay}
        canSave={isAdmin}
      />
    );
  }

  async function saveAttendance(e) {
    e.preventDefault();
    try {
      await api.saveAttendance({
        officer_id: Number(id),
        work_date: editRow.work_date,
        shift_id: editRow.shift_id || officer.shift_id,
        status: editRow.status,
        check_in: ["present", "half_day"].includes(editRow.status) ? editRow.check_in : null,
        check_out: ["present", "half_day"].includes(editRow.status) ? editRow.check_out : null,
        remarks: editRow.remarks,
      });
      toast("Attendance saved.");
      setEditRow(null);
      await load();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function uploadDoc(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadDocument(id, file, docType);
      toast("Document uploaded.");
      await load();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <>
      <div className="profile-header card card-pad">
        <Avatar officer={officer} size={88} />
        <div className="profile-header-main">
          <p><Link to="/officers">Officers</Link> / {officerLabel(officer)}</p>
          <h2>{officer.name}</h2>
          <p>{officer.officer_code} · {officer.designation || "No designation"} · {officer.department_name || "No department"}</p>
        </div>
        <div className="profile-header-side">
          <Badge status={officer.status} />
          <div className="row-actions" style={{ marginTop: 10 }}>
            {isAdmin ? <button className="btn btn-ghost" onClick={() => navigate(`/officers/${id}/edit`)}>Edit</button> : null}
            {isAdmin ? <button className="btn btn-primary" onClick={() => setTab("payment")}>Payment details</button> : null}
            <Link className="btn btn-ghost" to="/attendance">Mark attendance</Link>
          </div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? "on" : ""}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="dash-grid" style={{ marginBottom: 16 }}>
            <div className="card card-pad">
              <h3 style={{ marginTop: 0 }}>Officer details</h3>
              {kv("Name", officer.name)}
              {kv("Phone", officer.phone)}
              {kv("Joining date", formatDate(officer.joining_date))}
              {kv("Salary", formatMoney(officer.salary))}
              {kv("Attendance", `${stats.attendance_percentage}%`)}
              {kv("Working hours", formatDuration(stats.hours))}
              {kv("Overtime", formatDuration(stats.overtime))}
            </div>
            <div className="card card-pad">
              <h3 style={{ marginTop: 0 }}>Bank account</h3>
              {kv("Bank name", officer.bank_name)}
              {kv("Account title", officer.account_name)}
              {kv("Account number", officer.account_number)}
              {kv("Bank IBAN", officer.iban)}
              <h3>NayaPay</h3>
              {kv("Account name", officer.nayapay_account_name)}
              {kv("Number / mobile", officer.nayapay_number)}
              {kv("NayaPay IBAN", officer.nayapay_iban)}
              <h3>Easypaisa</h3>
              {kv("Mobile number", officer.payment_mobile)}
              {kv("Easypaisa IBAN", officer.easypaisa_iban)}
            </div>
          </div>
          {paymentSection()}
          <h3>Attendance summary</h3>
          <div className="grid-stats">
            <div className="stat green"><span>Present days</span><strong>{stats.present}</strong></div>
            <div className="stat red"><span>Absent days</span><strong>{stats.absent}</strong></div>
            <div className="stat amber"><span>Half days</span><strong>{stats.half_day}</strong></div>
            <div className="stat purple"><span>Leave days</span><strong>{stats.leave}</strong></div>
            <div className="stat navy"><span>Off days</span><strong>{stats.off}</strong></div>
            <div className="stat amber"><span>Late days</span><strong>{stats.late}</strong></div>
            <div className="stat blue"><span>Working hours</span><strong>{formatDuration(stats.hours)}</strong></div>
            <div className="stat blue"><span>Overtime</span><strong>{formatDuration(stats.overtime)}</strong></div>
            <div className="stat green"><span>Attendance %</span><strong>{stats.attendance_percentage}%</strong></div>
          </div>
          <h3>Salary summary</h3>
          <div className="grid-stats">
            <div className="stat navy"><span>Current salary</span><strong>{formatMoney(salarySummary.current_salary)}</strong></div>
            <div className="stat green"><span>Total salary paid</span><strong>{formatMoney(salarySummary.salary_paid)}</strong></div>
            <div className="stat amber"><span>Pending salary</span><strong>{formatMoney(salarySummary.salary_pending)}</strong></div>
            <div className="stat blue"><span>Last payment date</span><strong>{formatDate(salarySummary.last_payment_date)}</strong></div>
          </div>
        </>
      )}

      {tab === "personal" && (
        <div className="card card-pad">
          {kv("Name", officer.name)}
          {kv("Father's name", officer.father_name)}
          {kv("Date of birth", formatDate(officer.date_of_birth))}
          {kv("CNIC", officer.cnic)}
          {kv("Phone", officer.phone)}
          {kv("WhatsApp", officer.whatsapp)}
          {kv("Email", officer.email)}
          {kv("Address", officer.address)}
          {kv("Emergency contact", [officer.emergency_contact_name, officer.emergency_contact_phone].filter(Boolean).join(" · ") || officer.emergency_contact)}
        </div>
      )}

      {tab === "employment" && (
        <div className="card card-pad">
          {kv("Employee ID", officer.officer_code)}
          {kv("Designation", officer.designation)}
          {kv("Department", officer.department_name)}
          {kv("Shift", officer.shift_name)}
          {kv("Joining date", formatDate(officer.joining_date))}
          {kv("Supervisor", officer.supervisor_name ? `${officer.supervisor_code} — ${officer.supervisor_name}` : null)}
          {kv("Status", EMPLOYMENT_STATUSES.find((s) => s.id === officer.status)?.label)}
          {kv("Leaving date", formatDate(officer.leaving_date))}
          {kv("Leaving reason", officer.leaving_reason)}
          {kv("Notes", officer.notes)}
        </div>
      )}

      {tab === "payment" && paymentSection()}

      {tab === "attendance" && (
        <>
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="filters">
              <Field label="Month">
                <select value={attFilters.month} onChange={(e) => setAttFilters((f) => ({ ...f, month: e.target.value }))}>
                  {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
                </select>
              </Field>
              <Field label="Year">
                <input type="number" value={attFilters.year} onChange={(e) => setAttFilters((f) => ({ ...f, year: e.target.value }))} />
              </Field>
              <Field label="Status">
                <select value={attFilters.status} onChange={(e) => setAttFilters((f) => ({ ...f, status: e.target.value }))}>
                  <option value="">All</option>
                  {ATTENDANCE_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </Field>
              <button className="btn btn-ghost" onClick={() => load(attFilters)}>Apply</button>
            </div>
          </div>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Day</th><th>Shift</th><th>Check-in</th><th>Check-out</th>
                  <th>Hours</th><th>Status</th><th>Late</th><th>Overtime</th><th>Remarks</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.attendance.length === 0 ? (
                  <tr><td colSpan="11"><EmptyState title="No attendance in this filter" text="Mark attendance from Daily Attendance or choose another month." /></td></tr>
                ) : data.attendance.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.work_date)}</td>
                    <td>{weekday(row.work_date)}</td>
                    <td>{row.shift_name || "—"}</td>
                    <td>{row.check_in || "—"}</td>
                    <td>{row.check_out || "—"}</td>
                    <td>{formatDuration(row.working_hours)}</td>
                    <td><Badge status={row.status} /></td>
                    <td>{lateLabel(row)}</td>
                    <td>{formatDuration(row.overtime_hours)}</td>
                    <td>{row.remarks || "—"}</td>
                    <td><button className="btn btn-ghost" onClick={() => setEditRow({ ...row, shift_id: row.shift_id || officer.shift_id || "" })}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "salary" && (
        <div className="form-grid">
          <div className="card card-pad">
            {kv("Monthly salary", formatMoney(officer.monthly_salary))}
            {kv("Daily salary", formatMoney(officer.daily_salary))}
            {kv("Hourly rate", formatMoney(officer.hourly_rate))}
            {kv("Salary effective date", formatDate(officer.salary_effective_date || data.salaryHistory[0]?.effective_date))}
            {kv("Payment method", paymentMethodLabel(officer.payment_method))}
            {kv("Bank name", officer.bank_name)}
            {kv("Bank account title", officer.account_name)}
            {kv("Bank account number", officer.account_number)}
            {kv("Bank IBAN", officer.iban)}
            {kv("NayaPay account name", officer.nayapay_account_name)}
            {kv("NayaPay number", officer.nayapay_number)}
            {kv("NayaPay IBAN", officer.nayapay_iban)}
            {kv("Easypaisa / JazzCash mobile", officer.payment_mobile)}
            {kv("Easypaisa IBAN", officer.easypaisa_iban)}
          </div>
          <div className="card table-wrap">
            <div className="card-pad"><strong>Salary history</strong><p style={{ margin: "6px 0 0", color: "#5c6b80" }}>Previous amounts are never overwritten.</p></div>
            <table>
              <thead><tr><th>Salary</th><th>Effective date</th><th>Reason</th><th>Changed by</th><th>Date changed</th></tr></thead>
              <tbody>
                {data.salaryHistory.length === 0 ? (
                  <tr><td colSpan="5">No salary history.</td></tr>
                ) : data.salaryHistory.map((row) => (
                  <tr key={row.id}>
                    <td>{formatMoney(row.amount)}</td>
                    <td>{formatDate(row.effective_date)}</td>
                    <td>{row.reason || row.notes || "—"}</td>
                    <td>{row.changed_by || "Admin"}</td>
                    <td>{formatDateTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card table-wrap full">
            <div className="card-pad"><strong>Salary payments</strong></div>
            <table>
              <thead><tr><th>Period</th><th>Net</th><th>Paid</th><th>Date</th><th>Paid to</th></tr></thead>
              <tbody>
                {data.payments.length === 0 ? (
                  <tr><td colSpan="5">No salary payments yet.</td></tr>
                ) : data.payments.map((row) => (
                  <tr key={row.id}>
                    <td>{row.month}/{row.year}</td>
                    <td>{formatMoney(row.net_salary)}</td>
                    <td>{row.paid ? "Paid" : "Pending"}</td>
                    <td>{formatDate(row.payment_date)}</td>
                    <td>{formatPaymentAccount(officer) || paymentMethodLabel(officer.payment_method)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div className="card card-pad">
          <div className="filters" style={{ marginBottom: 16 }}>
            {isAdmin ? (
              <>
            <Field label="Type">
              <select value={docType} onChange={(e) => setDocType(e.target.value)}>
                {DOCUMENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Upload">
              <input type="file" disabled={uploading} onChange={uploadDoc} />
            </Field>
              </>
            ) : null}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>File</th><th>Uploaded</th><th></th></tr></thead>
              <tbody>
                {(data.documents || []).length === 0 ? (
                  <tr><td colSpan="4"><EmptyState title="No documents" text="Upload CNIC, CV, contract or other files for this officer." /></td></tr>
                ) : data.documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>{DOCUMENT_TYPES.find((t) => t.id === doc.doc_type)?.label || doc.doc_type}</td>
                    <td>
                      <a href={api.documentFileUrl(id, doc.id)} target="_blank" rel="noreferrer">{doc.original_name}</a>
                    </td>
                    <td>{formatDateTime(doc.created_at)}</td>
                    <td>
                      {isAdmin ? (
                      <button
                        className="btn btn-danger"
                        onClick={async () => {
                          await api.deleteDocument(id, doc.id);
                          toast("Document removed.");
                          await load();
                        }}
                      >
                        Remove
                      </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "activity" && (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Action</th><th>Officer</th><th>Date/Time</th><th>User</th><th>Details</th></tr></thead>
            <tbody>
              {(data.activity || []).length === 0 && (data.employment || []).length === 0 ? (
                <tr><td colSpan="5"><EmptyState title="No activity yet" /></td></tr>
              ) : ((data.activity && data.activity.length) ? data.activity : (data.employment || []).map((row) => ({
                id: `emp-${row.id}`,
                action: row.event_type,
                officer_name: officer.name,
                officer_code: officer.officer_code,
                created_at: row.created_at || row.event_date,
                actor: "Admin",
                details: row.details,
              }))).map((row) => (
                <tr key={row.id}>
                  <td>{statusLabel(row.action)}</td>
                  <td>{row.officer_code ? `${row.officer_code} — ${row.officer_name}` : officerLabel(officer)}</td>
                  <td>{formatDateTime(row.created_at)}</td>
                  <td>{row.actor || "Admin"}</td>
                  <td>{row.details ? String(row.details).replace(/[{}"\\]/g, " ").replace(/,/g, " · ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editRow ? (
        <Modal title="Edit attendance" onClose={() => setEditRow(null)}>
          <form onSubmit={saveAttendance} className="form-grid">
            <Field label="Date">
              <input type="date" value={editRow.work_date} onChange={(e) => setEditRow((r) => ({ ...r, work_date: e.target.value }))} />
            </Field>
            <Field label="Shift">
              <select value={editRow.shift_id || ""} onChange={(e) => setEditRow((r) => ({ ...r, shift_id: e.target.value }))}>
                {lookups.shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={editRow.status} onChange={(e) => setEditRow((r) => ({ ...r, status: e.target.value }))}>
                {ATTENDANCE_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Check-in">
              <input type="time" value={editRow.check_in || ""} onChange={(e) => setEditRow((r) => ({ ...r, check_in: e.target.value }))} />
            </Field>
            <Field label="Check-out">
              <input type="time" value={editRow.check_out || ""} onChange={(e) => setEditRow((r) => ({ ...r, check_out: e.target.value }))} />
            </Field>
            {(() => {
              const metrics = previewAttendance(
                { ...editRow, officer },
                lookups.shifts
              );
              return metrics ? (
                <div className="full" style={{ color: "#334155" }}>
                  Working Hours: {formatDuration(metrics.workingHours)}
                  {" · "}
                  Overtime: {formatDuration(metrics.overtimeHours)}
                </div>
              ) : null;
            })()}
            <Field label="Remarks" className="full">
              <input value={editRow.remarks || ""} onChange={(e) => setEditRow((r) => ({ ...r, remarks: e.target.value }))} />
            </Field>
            <div className="full" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEditRow(null)}>Cancel</button>
              <button className="btn btn-primary" type="submit">Save attendance</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
