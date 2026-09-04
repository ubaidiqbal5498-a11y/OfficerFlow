import { Field } from "./Ui.jsx";
import {
  PAKISTANI_BANKS,
  isJazzCashMethod,
  paymentMethodOptions,
} from "../lib/paymentAccount.js";

export default function PaymentAccountFields({ form, onChange, errors = {}, banks = PAKISTANI_BANKS }) {
  const method = form.payment_method || "";
  const bankList = banks?.length ? banks : PAKISTANI_BANKS;
  const jazzOn = isJazzCashMethod(method);

  return (
    <div className="form-grid">
      <Field label="Preferred payment method" className="full" error={errors.payment_method}>
        <select value={method} onChange={(e) => onChange("payment_method", e.target.value)}>
          <option value="">Select</option>
          {paymentMethodOptions(method).map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </Field>

      <div className="full payment-group">
        <h4>Bank Account</h4>
        <p>Existing Bank IBAN stays on this officer. NayaPay and Easypaisa use separate fields below.</p>
        <div className="form-grid">
          <Field label="Bank name" error={errors.bank_name}>
            <select
              value={form.bank_name || ""}
              onChange={(e) => onChange("bank_name", e.target.value)}
            >
              <option value="">Select bank</option>
              {bankList.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
              <option value="Other">Other</option>
            </select>
          </Field>
          <Field label="Bank account title" error={errors.account_name}>
            <input
              value={form.account_name || ""}
              onChange={(e) => onChange("account_name", e.target.value)}
              placeholder="Name on the bank account"
              autoComplete="name"
            />
          </Field>
          <Field label="Bank account number" error={errors.account_number}>
            <input
              value={form.account_number || ""}
              onChange={(e) => onChange("account_number", e.target.value)}
              placeholder="Account number"
              inputMode="numeric"
              autoComplete="off"
            />
          </Field>
          <Field label="Bank IBAN" error={errors.iban}>
            <input
              value={form.iban || ""}
              onChange={(e) => onChange("iban", e.target.value.toUpperCase())}
              placeholder="PK36HABB0000001234567890"
              autoComplete="off"
            />
          </Field>
        </div>
      </div>

      <div className="full payment-group">
        <h4>NayaPay</h4>
        <p>Stored separately from Bank IBAN. Leave blank if this officer is not paid via NayaPay.</p>
        <div className="form-grid">
          <Field label="NayaPay account name" error={errors.nayapay_account_name}>
            <input
              value={form.nayapay_account_name || ""}
              onChange={(e) => onChange("nayapay_account_name", e.target.value)}
              placeholder="Name on NayaPay"
              autoComplete="name"
            />
          </Field>
          <Field label="NayaPay number / mobile" error={errors.nayapay_number}>
            <input
              value={form.nayapay_number || ""}
              onChange={(e) => onChange("nayapay_number", e.target.value)}
              placeholder="03XXXXXXXXX"
              inputMode="tel"
              autoComplete="tel"
            />
          </Field>
          <Field label="NayaPay IBAN (if applicable)" className="full" error={errors.nayapay_iban}>
            <input
              value={form.nayapay_iban || ""}
              onChange={(e) => onChange("nayapay_iban", e.target.value.toUpperCase())}
              placeholder="Optional NayaPay IBAN"
              autoComplete="off"
            />
          </Field>
        </div>
      </div>

      <div className="full payment-group">
        <h4>Easypaisa</h4>
        <p>Easypaisa IBAN is stored separately from Bank IBAN and from the Easypaisa mobile number.</p>
        <div className="form-grid">
          {jazzOn ? null : (
            <Field label="Easypaisa mobile number" error={errors.payment_mobile}>
              <input
                value={form.payment_mobile || ""}
                onChange={(e) => onChange("payment_mobile", e.target.value)}
                placeholder="03XXXXXXXXX"
                inputMode="tel"
                autoComplete="tel"
              />
            </Field>
          )}
          <Field label="Easypaisa IBAN" className={jazzOn ? "full" : ""} error={errors.easypaisa_iban}>
            <input
              value={form.easypaisa_iban || ""}
              onChange={(e) => onChange("easypaisa_iban", e.target.value.toUpperCase())}
              placeholder="Optional Easypaisa IBAN"
              autoComplete="off"
            />
          </Field>
        </div>
      </div>

      {jazzOn ? (
        <div className="full payment-group">
          <h4>JazzCash</h4>
          <p>JazzCash continues to use the existing mobile number field.</p>
          <div className="form-grid">
            <Field label="JazzCash mobile number *" className="full" error={errors.payment_mobile}>
              <input
                value={form.payment_mobile || ""}
                onChange={(e) => onChange("payment_mobile", e.target.value)}
                placeholder="03XXXXXXXXX"
                inputMode="tel"
                autoComplete="tel"
              />
            </Field>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PaymentAccountSection({
  form,
  onChange,
  errors = {},
  banks,
  onSave,
  saving,
  canSave,
  saveLabel = "Save Payment Details",
}) {
  return (
    <section className="payment-account-card card card-pad" id="payment-account-details">
      <div className="payment-account-head">
        <h3>Payment Information</h3>
        <p>Bank IBAN, NayaPay, and Easypaisa IBAN are stored as separate details on this officer.</p>
      </div>
      <PaymentAccountFields form={form} onChange={onChange} errors={errors} banks={banks} />
      {canSave && onSave ? (
        <div className="form-nav" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : saveLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}
