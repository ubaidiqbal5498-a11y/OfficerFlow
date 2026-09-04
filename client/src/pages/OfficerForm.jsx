import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../components/Toast.jsx";
import { Avatar, Field } from "../components/Ui.jsx";
import { DOCUMENT_TYPES, EMPLOYMENT_STATUSES, SALARY_STATUSES } from "../lib/constants.js";
import {
  emptyPaymentAccount,
  formatPaymentAccount,
  paymentMethodLabel,
  validatePaymentAccountForm,
} from "../lib/paymentAccount.js";
import { PaymentAccountSection } from "../components/PaymentAccountFields.jsx";
import { formatMoney, todayISO } from "../lib/format.js";

const STEPS = ["Personal", "Employment", "Payment Account Details", "Salary", "Documents", "Review"];

const emptyForm = {
  name: "",
  officer_code: "",
  father_name: "",
  date_of_birth: "",
  cnic: "",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  designation: "",
  department_id: "",
  shift_id: "",
  joining_date: todayISO(),
  status: "active",
  leaving_date: "",
  leaving_reason: "",
  supervisor_id: "",
  notes: "",
  salary: "",
  salary_type: "monthly",
  salary_effective_date: todayISO(),
  salary_change_notes: "",
  ...emptyPaymentAccount(),
  salary_status: "active",
  working_hours_per_day: "10",
};

export default function OfficerForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [lookups, setLookups] = useState({ departments: [], shifts: [] });
  const [officers, setOfficers] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [savingPay, setSavingPay] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [queuedDocs, setQueuedDocs] = useState([]);
  const [existingDocs, setExistingDocs] = useState([]);
  const [officer, setOfficer] = useState(null);
  const [docType, setDocType] = useState("cnic_front");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (location.hash === "#payment") setStep(2);
  }, [location.hash]);

  useEffect(() => {
    async function boot() {
      const [lu, list] = await Promise.all([api.lookups(), api.officers()]);
      setLookups(lu);
      setOfficers(list);
      if (editing) {
        const row = await api.officer(id);
        setOfficer(row);
        setForm({
          ...emptyForm,
          ...row,
          department_id: row.department_id || "",
          shift_id: row.shift_id || "",
          supervisor_id: row.supervisor_id || "",
          salary: row.salary ?? "",
          salary_effective_date: row.salary_effective_date || todayISO(),
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
          salary_status: row.salary_status || "active",
        });
        setExistingDocs(await api.documents(id));
      } else {
        const next = await api.nextOfficerCode();
        setForm((f) => ({ ...f, officer_code: next.officer_code }));
      }
      setLoading(false);
    }
    boot().catch((e) => {
      toast(e.message, "error");
      setLoading(false);
    });
  }, [id, editing, toast]);

  const photoPreview = useMemo(() => {
    if (photoFile) return URL.createObjectURL(photoFile);
    if (officer?.has_photo) return `/api/officers/${officer.id}/photo`;
    return null;
  }, [photoFile, officer]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: "" }));
  }

  function validateStep(index) {
    const next = {};
    if (index === 0) {
      if (!form.name.trim()) next.name = "Full name is required.";
    }
    if (index === 1) {
      if (!form.officer_code.trim()) next.officer_code = "Employee ID is required.";
      if (!form.joining_date) next.joining_date = "Joining date is required.";
      if (!form.designation.trim()) next.designation = "Designation is required.";
      if (!form.shift_id) next.shift_id = "Shift is required.";
      if (!form.status) next.status = "Employment status is required.";
    }
    if (index === 2) {
      Object.assign(next, validatePaymentAccountForm(form));
    }
    if (index === 3) {
      if (form.salary === "" || form.salary == null) next.salary = "Salary is required.";
      else if (Number(form.salary) < 0) next.salary = "Salary cannot be negative.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function save() {
    if (!validateStep(0) || !validateStep(1) || !validateStep(2) || !validateStep(3)) {
      setStep(
        !form.name.trim()
          ? 0
          : !form.officer_code || !form.designation || !form.shift_id
            ? 1
            : Object.keys(validatePaymentAccountForm(form)).length
              ? 2
              : 3
      );
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        department_id: form.department_id || null,
        shift_id: form.shift_id || null,
        supervisor_id: form.supervisor_id || null,
        salary: Number(form.salary) || 0,
        payment_method: form.payment_method || null,
        account_name: form.account_name,
        bank_name: form.bank_name,
        account_number: form.account_number,
        iban: form.iban,
        payment_mobile: form.payment_mobile,
        nayapay_account_name: form.nayapay_account_name,
        nayapay_number: form.nayapay_number,
        nayapay_iban: form.nayapay_iban,
        easypaisa_iban: form.easypaisa_iban,
      };
      let saved;
      if (editing) saved = await api.updateOfficer(id, payload);
      else saved = await api.createOfficer(payload);
      if (photoFile) await api.uploadPhoto(saved.id, photoFile);
      for (const doc of queuedDocs) {
        await api.uploadDocument(saved.id, doc.file, doc.doc_type);
      }
      toast(editing ? "Officer updated." : "Officer saved.");
      navigate(`/officers/${saved.id}`);
    } catch (err) {
      setErrors({ form: err.message });
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function savePaymentDetails() {
    if (!editing) {
      toast("Save the officer first, then you can update payment details here.");
      return;
    }
    const next = validatePaymentAccountForm(form);
    setErrors(next);
    if (Object.keys(next).length) return;
    setSavingPay(true);
    try {
      await api.updatePaymentAccount(id, {
        payment_method: form.payment_method || null,
        account_name: form.account_name,
        bank_name: form.bank_name,
        account_number: form.account_number,
        iban: form.iban,
        payment_mobile: form.payment_mobile,
        nayapay_account_name: form.nayapay_account_name,
        nayapay_number: form.nayapay_number,
        nayapay_iban: form.nayapay_iban,
        easypaisa_iban: form.easypaisa_iban,
      });
      toast("Payment details saved.");
    } catch (err) {
      setErrors({ form: err.message });
      toast(err.message, "error");
    } finally {
      setSavingPay(false);
    }
  }

  async function removeDoc(docId) {
    if (!editing) return;
    await api.deleteDocument(id, docId);
    setExistingDocs(await api.documents(id));
    toast("Document removed.");
  }

  if (loading) return <p>Loading officer form…</p>;

  const supervisors = officers.filter((o) => String(o.id) !== String(id));

  return (
    <>
      <div className="page-head">
        <div>
          <p><Link to="/officers">Officers</Link> / {editing ? "Edit" : "Add officer"}</p>
          <h2>{editing ? `Edit ${form.name || "officer"}` : "Add officer"}</h2>
          <p>Complete each step. Required fields are marked.</p>
        </div>
      </div>

      <div className="steps">
        {STEPS.map((name, i) => (
          <button key={name} type="button" className={`step ${i === step ? "on" : ""} ${i < step ? "done" : ""}`} onClick={() => setStep(i)}>
            <span>{i + 1}</span> {name}
          </button>
        ))}
      </div>

      {errors.form ? <p className="error">{errors.form}</p> : null}

      <div className="card card-pad">
        {step === 0 && (
          <div className="form-grid">
            <div className="full photo-picker">
              {photoPreview ? <img src={photoPreview} alt="" className="avatar" style={{ width: 84, height: 84 }} /> : <Avatar officer={{ name: form.name }} size={84} />}
              <Field label="Profile photo">
                <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
              </Field>
            </div>
            <Field label="Full name *" error={errors.name}>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Father's name">
              <input value={form.father_name} onChange={(e) => set("father_name", e.target.value)} />
            </Field>
            <Field label="Date of birth">
              <input type="date" value={form.date_of_birth || ""} onChange={(e) => set("date_of_birth", e.target.value)} />
            </Field>
            <Field label="CNIC number">
              <input value={form.cnic} onChange={(e) => set("cnic", e.target.value)} />
            </Field>
            <Field label="Phone number">
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="WhatsApp number">
              <input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
            </Field>
            <Field label="Email address">
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Current address" className="full">
              <textarea value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <Field label="Emergency contact name">
              <input value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} />
            </Field>
            <Field label="Emergency contact number">
              <input value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="form-grid">
            <Field label="Employee ID *" error={errors.officer_code}>
              <input value={form.officer_code} onChange={(e) => set("officer_code", e.target.value.toUpperCase())} />
            </Field>
            <Field label="Designation *" error={errors.designation}>
              <input value={form.designation} onChange={(e) => set("designation", e.target.value)} />
            </Field>
            <Field label="Department">
              <select value={form.department_id} onChange={(e) => set("department_id", e.target.value)}>
                <option value="">Select</option>
                {lookups.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Shift *" error={errors.shift_id}>
              <select value={form.shift_id} onChange={(e) => set("shift_id", e.target.value)}>
                <option value="">Select</option>
                {lookups.shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Joining date *" error={errors.joining_date}>
              <input type="date" value={form.joining_date} onChange={(e) => set("joining_date", e.target.value)} />
            </Field>
            <Field label="Employment status *" error={errors.status}>
              <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                {EMPLOYMENT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Supervisor / Manager">
              <select value={form.supervisor_id} onChange={(e) => set("supervisor_id", e.target.value)}>
                <option value="">None</option>
                {supervisors.map((o) => <option key={o.id} value={o.id}>{o.officer_code} — {o.name}</option>)}
              </select>
            </Field>
            {form.status !== "active" ? (
              <>
                <Field label="Leaving date">
                  <input type="date" value={form.leaving_date || ""} onChange={(e) => set("leaving_date", e.target.value)} />
                </Field>
                <Field label="Leaving reason" className="full">
                  <input value={form.leaving_reason || ""} onChange={(e) => set("leaving_reason", e.target.value)} />
                </Field>
              </>
            ) : null}
            <Field label="Notes" className="full">
              <textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <PaymentAccountSection
            form={form}
            onChange={set}
            errors={errors}
            banks={lookups.banks}
            onSave={savePaymentDetails}
            saving={savingPay}
            canSave
          />
        )}

        {step === 3 && (
          <div className="form-grid">
            <Field label="Monthly salary *" error={errors.salary}>
              <input type="number" min="0" step="0.01" value={form.salary} onChange={(e) => set("salary", e.target.value)} />
            </Field>
            <Field label="Salary type">
              <select value={form.salary_type} onChange={(e) => set("salary_type", e.target.value)}>
                <option value="monthly">Monthly</option>
                <option value="daily">Daily</option>
              </select>
            </Field>
            <Field label="Salary effective date">
              <input type="date" value={form.salary_effective_date || ""} onChange={(e) => set("salary_effective_date", e.target.value)} />
            </Field>
            {editing ? (
              <Field label="Reason for salary change">
                <input value={form.salary_change_notes} onChange={(e) => set("salary_change_notes", e.target.value)} placeholder="Previous amount is kept in history" />
              </Field>
            ) : null}
            <Field label="Salary status">
              <select value={form.salary_status} onChange={(e) => set("salary_status", e.target.value)}>
                {SALARY_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
          </div>
        )}

        {step === 4 && (
          <div>
            <p style={{ color: "#5c6b80", marginTop: 0 }}>Files are stored privately for this officer only. You can also add them after saving.</p>
            <div className="filters" style={{ marginBottom: 12 }}>
              <Field label="Document type">
                <select value={docType} onChange={(e) => setDocType(e.target.value)}>
                  {DOCUMENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="File">
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setQueuedDocs((docs) => [...docs, { file, doc_type: docType, name: file.name }]);
                    e.target.value = "";
                  }}
                />
              </Field>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Type</th><th>File</th><th></th></tr></thead>
                <tbody>
                  {existingDocs.map((doc) => (
                    <tr key={`ex-${doc.id}`}>
                      <td>{DOCUMENT_TYPES.find((t) => t.id === doc.doc_type)?.label || doc.doc_type}</td>
                      <td>{doc.original_name}</td>
                      <td><button type="button" className="btn btn-danger" onClick={() => removeDoc(doc.id)}>Remove</button></td>
                    </tr>
                  ))}
                  {queuedDocs.map((doc, i) => (
                    <tr key={`q-${i}`}>
                      <td>{DOCUMENT_TYPES.find((t) => t.id === doc.doc_type)?.label}</td>
                      <td>{doc.name} <span style={{ color: "#5c6b80" }}>(pending save)</span></td>
                      <td>
                        <button type="button" className="btn btn-ghost" onClick={() => setQueuedDocs((docs) => docs.filter((_, idx) => idx !== i))}>Remove</button>
                      </td>
                    </tr>
                  ))}
                  {existingDocs.length === 0 && queuedDocs.length === 0 ? (
                    <tr><td colSpan="3">No documents yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="review-grid">
            <div>
              <h3>Personal</h3>
              <p><strong>{form.name}</strong></p>
              <p>{form.father_name || "No father's name"} · {form.cnic || "No CNIC"}</p>
              <p>{form.phone || "No phone"} · {form.email || "No email"}</p>
            </div>
            <div>
              <h3>Employment</h3>
              <p>{form.officer_code} · {form.designation} · {EMPLOYMENT_STATUSES.find((s) => s.id === form.status)?.label}</p>
              <p>Joined {form.joining_date}</p>
            </div>
            <div>
              <h3>Payment account</h3>
              <p>{paymentMethodLabel(form.payment_method)}</p>
              <p>{formatPaymentAccount(form) || "No payment account yet"}</p>
              {form.iban ? <p>Bank IBAN {form.iban}</p> : null}
              {form.nayapay_number ? <p>NayaPay {form.nayapay_account_name} · {form.nayapay_number}</p> : null}
              {form.easypaisa_iban || (form.payment_method === "easypaisa" && form.payment_mobile) ? (
                <p>Easypaisa {form.payment_mobile} {form.easypaisa_iban}</p>
              ) : null}
            </div>
            <div>
              <h3>Salary</h3>
              <p>{formatMoney(form.salary)} / {form.salary_type}</p>
            </div>
            <div>
              <h3>Documents</h3>
              <p>{existingDocs.length + queuedDocs.length} file(s)</p>
            </div>
          </div>
        )}

        <div className="form-nav">
          <button type="button" className="btn btn-ghost" onClick={() => (step === 0 ? navigate("/officers") : setStep(step - 1))}>
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={goNext}>Next</button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : editing ? "Save changes" : "Review & save"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
