export const ACCOUNT_PAYMENT_METHODS = [
  { id: "bank_account", label: "Bank Account" },
  { id: "nayapay", label: "NayaPay" },
  { id: "easypaisa", label: "Easypaisa" },
  { id: "jazzcash", label: "JazzCash" },
];

export const SALARY_PAYOUT_METHODS = [
  { id: "Bank", label: "Bank" },
  { id: "NayaPay", label: "NayaPay" },
  { id: "Cash", label: "Cash" },
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

export function isEasypaisaMethod(id) {
  return normalizePaymentMethod(id) === "easypaisa";
}

export function isJazzCashMethod(id) {
  return normalizePaymentMethod(id) === "jazzcash";
}

export function isNayaPayMethod(id) {
  return normalizePaymentMethod(id) === "nayapay";
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

export function salaryPayoutFromOfficer(officer = {}) {
  const method = normalizePaymentMethod(officer.officer_payment_method || officer.payment_method);
  if (method === "nayapay") return "NayaPay";
  if (method === "cash" || isWalletMethod(method)) return "Cash";
  if (isBankMethod(method)) return "Bank";
  return "Bank";
}

export function payoutAccountDisplay(officer = {}, payout = "") {
  const method = payout || officer.payment_method || salaryPayoutFromOfficer(officer);
  if (method === "Cash") return formatPaymentAccount(officer) || "Cash";
  if (method === "NayaPay") {
    return [officer.nayapay_account_name, officer.nayapay_number, officer.nayapay_iban]
      .filter(Boolean)
      .join(" · ") || "NayaPay";
  }
  if (method === "Bank") {
    return [officer.bank_name, officer.account_name, officer.account_number, officer.iban]
      .filter(Boolean)
      .join(" · ") || "Bank";
  }
  return formatPaymentAccount(officer);
}

export function formatPaymentAccount(officer = {}) {
  if (officer.payout_account) return officer.payout_account;
  if (officer.payment_account_summary) return officer.payment_account_summary;
  const method = normalizePaymentMethod(officer.officer_payment_method || officer.payment_method);
  if (isBankMethod(method) || method === "Bank") {
    return ["Bank Account", officer.bank_name, officer.account_name, officer.account_number, officer.iban]
      .filter(Boolean)
      .join(" · ");
  }
  if (isNayaPayMethod(method) || method === "NayaPay") {
    return ["NayaPay", officer.nayapay_account_name, officer.nayapay_number, officer.nayapay_iban]
      .filter(Boolean)
      .join(" · ");
  }
  if (isEasypaisaMethod(method)) {
    return ["Easypaisa", officer.account_name, officer.payment_mobile, officer.easypaisa_iban]
      .filter(Boolean)
      .join(" · ");
  }
  if (isJazzCashMethod(method)) {
    return ["JazzCash", officer.account_name, officer.payment_mobile].filter(Boolean).join(" · ");
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
    nayapay_account_name: "",
    nayapay_number: "",
    nayapay_iban: "",
    easypaisa_iban: "",
  };
}

function validIban(value) {
  const iban = String(value || "").replace(/\s+/g, "").toUpperCase();
  if (!iban) return true;
  return /^PK\d{2}[A-Z]{4}\d{16}$/.test(iban) || (/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) && iban.length >= 15 && iban.length <= 34);
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
  if (isNayaPayMethod(method)) {
    if (!String(form.nayapay_account_name || "").trim()) errors.nayapay_account_name = "NayaPay account name is required.";
    if (!String(form.nayapay_number || "").trim()) errors.nayapay_number = "NayaPay number / mobile number is required.";
    else if (!/^(?:\+92|92|0)?3\d{9}$/.test(String(form.nayapay_number).replace(/[\s-]/g, ""))) {
      errors.nayapay_number = "Enter a valid NayaPay mobile number, for example 03XXXXXXXXX.";
    }
  }
  if (isWalletMethod(method)) {
    if (!String(form.account_name || "").trim()) errors.account_name = "Account name is required.";
    if (!String(form.payment_mobile || "").trim()) errors.payment_mobile = "Mobile number is required.";
    else if (!/^(?:\+92|92|0)?3\d{9}$/.test(String(form.payment_mobile).replace(/[\s-]/g, ""))) {
      errors.payment_mobile = "Enter a valid Pakistani mobile number, for example 03XXXXXXXXX.";
    }
  }
  if (!validIban(form.iban)) errors.iban = "Bank IBAN format is not valid.";
  if (!validIban(form.nayapay_iban)) errors.nayapay_iban = "NayaPay IBAN format is not valid.";
  if (!validIban(form.easypaisa_iban)) errors.easypaisa_iban = "Easypaisa IBAN format is not valid.";
  return errors;
}
