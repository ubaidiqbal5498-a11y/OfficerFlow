import { useState } from "react";

export function Badge({ status }) {
  const key = String(status || "").replaceAll(" ", "_");
  return <span className={`badge badge-${key}`}>{String(status || "").replaceAll("_", " ")}</span>;
}

export function Avatar({ officer, size = 40 }) {
  const initials = String(officer?.name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const style = { width: size, height: size, fontSize: Math.max(12, Math.round(size / 2.6)) };
  if (officer?.has_photo && officer.id) {
    return (
      <img
        className="avatar"
        src={`/api/officers/${officer.id}/photo`}
        alt={officer.name || "Profile"}
        style={style}
      />
    );
  }
  return (
    <div className="avatar avatar-fallback" style={style} aria-hidden="true">
      {initials}
    </div>
  );
}

export function Modal({ title, children, onClose, wide }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="page-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmLabel = "Confirm", danger, onConfirm, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(440px, 100%)" }}>
        <h3>{title}</h3>
        <p style={{ color: "#5c6b80" }}>{message}</p>
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, children, className = "", error }) {
  return (
    <label className={`field ${className}`}>
      {label}
      {children}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  required,
  minLength,
  autoComplete,
  placeholder,
  error,
  name,
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="field">
      {label}
      <div className="password-wrap">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          name={name}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export function EmptyState({ title, text, action }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}

export function SearchSelect({ label, options, value, onChange, getValue, getLabel, placeholder = "All" }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={getValue(opt)} value={getValue(opt)}>{getLabel(opt)}</option>
        ))}
      </select>
    </Field>
  );
}
