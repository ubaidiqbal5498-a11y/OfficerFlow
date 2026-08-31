import { Field } from "./Ui.jsx";
import {
  PAKISTANI_BANKS,
  isBankMethod,
  isWalletMethod,
  paymentMethodOptions,
} from "../lib/paymentAccount.js";

export default function PaymentAccountFields({ form, onChange, errors = {}, banks = PAKISTANI_BANKS }) {
  const method = form.payment_method || "";
  const bankList = banks?.length ? banks : PAKISTANI_BANKS;
  const bankOn = !method || isBankMethod(method);
  const walletOn = isWalletMethod(method);

  return (
    <div className="form-grid">
      <Field label="Payment method" className="full" error={errors.payment_method}>
        <select value={method} onChange={(e) => onChange("payment_method", e.target.value)}>
          <option value="">Select</option>
          {paymentMethodOptions(method).map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </Field>

      <Field label={bankOn ? "Bank name *" : "Bank name"} error={errors.bank_name}>
        <select
          value={form.bank_name || ""}
          onChange={(e) => onChange("bank_name", e.target.value)}
          disabled={walletOn}
        >
          <option value="">Select bank</option>
          {bankList.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
          <option value="Other">Other</option>
        </select>
      </Field>
      <Field label={walletOn ? "Account name *" : "Account title / account name *"} error={errors.account_name}>
        <input
          value={form.account_name || ""}
          onChange={(e) => onChange("account_name", e.target.value)}
          placeholder="Name on the account"
          autoComplete="name"
        />
      </Field>
      <Field label={bankOn ? "Account number *" : "Account number"} error={errors.account_number}>
        <input
          value={form.account_number || ""}
          onChange={(e) => onChange("account_number", e.target.value)}
          placeholder="Account number"
          inputMode="numeric"
          autoComplete="off"
          disabled={walletOn}
        />
      </Field>
      <Field label="IBAN (optional)" error={errors.iban}>
        <input
          value={form.iban || ""}
          onChange={(e) => onChange("iban", e.target.value.toUpperCase())}
          placeholder="PK36HABB0000001234567890"
          autoComplete="off"
          disabled={walletOn}
        />
      </Field>
      <Field label={walletOn ? "Mobile number *" : "Mobile number"} error={errors.payment_mobile} className="full">
        <input
          value={form.payment_mobile || ""}
          onChange={(e) => onChange("payment_mobile", e.target.value)}
          placeholder="03XXXXXXXXX for Easypaisa or JazzCash"
          inputMode="tel"
          autoComplete="tel"
          disabled={bankOn && method === "bank_account"}
        />
      </Field>
      <p className="full" style={{ margin: 0, color: "#5c6b80" }}>
        Bank Account uses bank name, account title, account number, and optional IBAN.
        Easypaisa and JazzCash use account name and mobile number.
      </p>
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
        <h3>Payment Account Details</h3>
        <p>Where this officer should be paid. These details belong only to this officer.</p>
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
