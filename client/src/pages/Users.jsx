import { useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../components/Toast.jsx";
import { Confirm, Field, Modal, PasswordField } from "../components/Ui.jsx";

const EMPTY = {
  username: "",
  password: "",
  confirm_password: "",
  role: "boss",
  display_name: "",
  email: "",
  active: true,
};

export default function UsersPage({ embedded = false }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [resetForm, setResetForm] = useState({ password: "", confirm_password: "" });
  const [confirmRow, setConfirmRow] = useState(null);
  const [formError, setFormError] = useState("");

  async function load() {
    setRows(await api.users());
  }

  useEffect(() => {
    load().catch((e) => toast(e.message, "error"));
  }, []);

  function closeAdd() {
    setAdding(false);
    setForm(EMPTY);
    setFormError("");
  }

  async function create(e) {
    e.preventDefault();
    if (form.password !== form.confirm_password) {
      setFormError("Password and confirmation do not match.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await api.createUser({
        display_name: form.display_name,
        username: form.username,
        email: form.email,
        role: form.role,
        password: form.password,
        confirm_password: form.confirm_password,
        active: form.active,
      });
      toast("User created. The password is not stored in plain text.");
      closeAdd();
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateUser(editing.id, {
        display_name: editing.display_name,
        email: editing.email,
        role: editing.role,
        active: editing.active,
      });
      toast("User updated.");
      setEditing(null);
      await load();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    if (resetForm.password !== resetForm.confirm_password) {
      setFormError("Password and confirmation do not match.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await api.updateUser(resetUser.id, {
        password: resetForm.password,
        confirm_password: resetForm.confirm_password,
      });
      toast("Password updated. It will not be shown again.");
      setResetUser(null);
      setResetForm({ password: "", confirm_password: "" });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row) {
    try {
      await api.updateUser(row.id, { active: !row.active });
      toast(row.active ? "User deactivated." : "User activated.");
      await load();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function remove(row) {
    try {
      await api.deleteUser(row.id);
      toast("User deleted.");
      setConfirmRow(null);
      await load();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          {embedded ? <h3 style={{ margin: 0 }}>User Management</h3> : <h2>User Management</h2>}
          <p>Create a Boss account here. Enter the password yourself — it is hashed and never shown after save.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => { setForm(EMPTY); setFormError(""); setAdding(true); }}>
          Add User
        </button>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Full name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="6">No users yet. Click Add User to create a Boss account.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id}>
                <td>{row.display_name || "—"}</td>
                <td><strong>{row.username}</strong></td>
                <td>{row.email || "—"}</td>
                <td>{row.role === "admin" ? "Admin" : "Boss"}</td>
                <td>{row.active ? "Active" : "Inactive"}</td>
                <td className="row-actions">
                  <button className="btn btn-ghost" type="button" onClick={() => setEditing({ ...row, email: row.email || "", active: Boolean(row.active) })}>
                    Edit
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      setResetUser(row);
                      setResetForm({ password: "", confirm_password: "" });
                      setFormError("");
                    }}
                  >
                    Change password
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => toggleActive(row)}>
                    {row.active ? "Deactivate" : "Activate"}
                  </button>
                  <button className="btn btn-danger" type="button" onClick={() => setConfirmRow(row)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding ? (
        <Modal title="Add User" onClose={closeAdd}>
          <form onSubmit={create}>
            <p style={{ color: "#5c6b80", marginBottom: 12 }}>
              Choose the username and password yourself. The password is never stored as plain text.
            </p>
            {formError ? <p className="error" role="alert">{formError}</p> : null}
            <div className="form-grid">
              <Field label="Full Name">
                <input
                  required
                  value={form.display_name}
                  onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                />
              </Field>
              <Field label="Username">
                <input
                  required
                  minLength={3}
                  autoComplete="off"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                />
              </Field>
              <Field label="Email (optional)">
                <input
                  type="email"
                  autoComplete="off"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </Field>
              <Field label="Role">
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                  <option value="admin">Admin</option>
                  <option value="boss">Boss</option>
                </select>
              </Field>
              <PasswordField
                label="Password"
                required
                minLength={8}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
              <PasswordField
                label="Confirm Password"
                required
                minLength={8}
                autoComplete="new-password"
                value={form.confirm_password}
                onChange={(e) => setForm((f) => ({ ...f, confirm_password: e.target.value }))}
              />
              <Field label="Status">
                <select
                  value={form.active ? "active" : "inactive"}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === "active" }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
            </div>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={closeAdd}>Cancel</button>
              <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Create user"}</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editing ? (
        <Modal title={`Edit ${editing.username}`} onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit}>
            <div className="form-grid">
              <Field label="Full Name">
                <input
                  required
                  value={editing.display_name || ""}
                  onChange={(e) => setEditing((u) => ({ ...u, display_name: e.target.value }))}
                />
              </Field>
              <Field label="Username">
                <input value={editing.username} disabled />
              </Field>
              <Field label="Email (optional)">
                <input
                  type="email"
                  value={editing.email || ""}
                  onChange={(e) => setEditing((u) => ({ ...u, email: e.target.value }))}
                />
              </Field>
              <Field label="Role">
                <select value={editing.role} onChange={(e) => setEditing((u) => ({ ...u, role: e.target.value }))}>
                  <option value="admin">Admin</option>
                  <option value="boss">Boss</option>
                </select>
              </Field>
              <Field label="Status">
                <select
                  value={editing.active ? "active" : "inactive"}
                  onChange={(e) => setEditing((u) => ({ ...u, active: e.target.value === "active" }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
            </div>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {resetUser ? (
        <Modal
          title={`Change password for ${resetUser.username}`}
          onClose={() => { setResetUser(null); setResetForm({ password: "", confirm_password: "" }); setFormError(""); }}
        >
          <form onSubmit={submitReset}>
            <p style={{ color: "#5c6b80", marginBottom: 12 }}>
              Enter a new password. It is hashed immediately and will not be shown again.
            </p>
            {formError ? <p className="error" role="alert">{formError}</p> : null}
            <div className="form-grid">
              <PasswordField
                label="Password"
                required
                minLength={8}
                autoComplete="new-password"
                value={resetForm.password}
                onChange={(e) => setResetForm((f) => ({ ...f, password: e.target.value }))}
              />
              <PasswordField
                label="Confirm Password"
                required
                minLength={8}
                autoComplete="new-password"
                value={resetForm.confirm_password}
                onChange={(e) => setResetForm((f) => ({ ...f, confirm_password: e.target.value }))}
              />
            </div>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setResetUser(null); setResetForm({ password: "", confirm_password: "" }); setFormError(""); }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save password"}</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {confirmRow ? (
        <Confirm
          title="Delete user"
          message={`Delete ${confirmRow.username}? This does not delete officers, attendance, or salary records.`}
          confirmLabel="Delete"
          danger
          onClose={() => setConfirmRow(null)}
          onConfirm={() => remove(confirmRow)}
        />
      ) : null}
    </>
  );
}
