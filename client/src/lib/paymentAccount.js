export const ACCOUNT_PAYMENT_METHODS = [
  { id: "bank_account", label: "Bank Account" },
  { id: "easypaisa", label: "Easypaisa" },
  { id: "jazzcash", label: "JazzCash" },
];

export const LEGACY_PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "other", label: "Other" },
];

export const PAYMENT_METHODS = [
  ...ACCOUNT_PAYMENT_METHODS,
  ...LEGACY_PAYMENT_METHODS,
  { id: "bank_transfer", label: "Bank Account" },
];

export const PAKISTANI_BANKS = [
  "HBL",
  "Meezan Bank",
  "UBL",
  "MCB",
  "Bank Alfalah",
  "Allied Bank",
  "Askari Bank",
  "Faysal Bank",
  "Standard Chartered",
  "Bank Al Habib",
  "Habib Metropolitan Bank",
  "Soneri Bank",
  "JS Bank",
  "Dubai Islamic Bank",
  "BankIslami",
  "NBP",
  "Silkbank",
];

export function normalizePaymentMethod(id) {
  const raw = String(id || "").trim();
  if (raw === "bank_transfer") return "bank_account";
  return raw;
}

export function isBankMethod(id) {
  return normalizePaymentMethod(id) === "bank_account";
}

export function isWalletMethod(id) {
  const method = normalizePaymentMethod(id);
  return method === "easypaisa" || method === "jazzcash";
}

export function paymentMethodLabel(id) {
  const method = normalizePaymentMethod(id);
  return PAYMENT_METHODS.find((m) => m.id === method || m.id === id)?.label || method || "—";
}

export function paymentMethodOptions(current) {
  const method = normalizePaymentMethod(current);
  const options = [...ACCOUNT_PAYMENT_METHODS];
  if (method && !options.some((m) => m.id === method)) {
    const legacy = PAYMENT_METHODS.find((m) => m.id === method);
    if (legacy) options.unshift(legacy);
  }
  return options;
}

export function formatPaymentAccount(officer = {}) {
  if (officer.payment_account_summary) return officer.payment_account_summary;
  const method = normalizePaymentMethod(officer.officer_payment_method || officer.payment_method);
  if (isBankMethod(method)) {
    return ["Bank Account", officer.bank_name, officer.account_name, officer.account_number, officer.iban]
      .filter(Boolean)
      .join(" · ");
  }
  if (isWalletMethod(method)) {
    const label = method === "easypaisa" ? "Easypaisa" : "JazzCash";
    return [label, officer.account_name, officer.payment_mobile].filter(Boolean).join(" · ");
  }
  return officer.bank_details || "";
}

export function emptyPaymentAccount() {
  return {
    payment_method: "",
    account_name: "",
    bank_name: "",
    account_number: "",
    iban: "",
    payment_mobile: "",
  };
}

export function validatePaymentAccountForm(form) {
  const errors = {};
  const method = normalizePaymentMethod(form.payment_method);
  if (!method) return errors;
  if (isBankMethod(method)) {
    if (!String(form.account_name || "").trim()) errors.account_name = "Account title / account name is required.";
    if (!String(form.bank_name || "").trim()) errors.bank_name = "Bank name is required.";
    if (!String(form.account_number || "").trim()) errors.account_number = "Account number is required.";
  }
  if (isWalletMethod(method)) {
    if (!String(form.account_name || "").trim()) errors.account_name = "Account name is required.";
    if (!String(form.payment_mobile || "").trim()) errors.payment_mobile = "Mobile number is required.";
    else if (!/^(?:\+92|92|0)?3\d{9}$/.test(String(form.payment_mobile).replace(/[\s-]/g, ""))) {
      errors.payment_mobile = "Enter a valid Pakistani mobile number, for example 03XXXXXXXXX.";
    }
  }
  const iban = String(form.iban || "").replace(/\s+/g, "").toUpperCase();
  if (iban) {
    const ok = /^PK\d{2}[A-Z]{4}\d{16}$/.test(iban) || (/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) && iban.length >= 15 && iban.length <= 34);
    if (!ok) errors.iban = "IBAN format is not valid.";
  }
  return errors;
}
