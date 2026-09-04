const PAKISTANI_BANKS = [
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

const ACCOUNT_PAYMENT_METHODS = [
  { id: "bank_account", label: "Bank Account" },
  { id: "nayapay", label: "NayaPay" },
  { id: "easypaisa", label: "Easypaisa" },
  { id: "jazzcash", label: "JazzCash" },
];

const SALARY_PAYOUT_METHODS = [
  { id: "Bank", label: "Bank" },
  { id: "NayaPay", label: "NayaPay" },
  { id: "Cash", label: "Cash" },
];

const LEGACY_PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "other", label: "Other" },
];

const PAYMENT_METHOD_ALIASES = {
  bank_transfer: "bank_account",
};

function trim(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizePaymentMethod(id) {
  const raw = trim(id);
  if (!raw) return "";
  return PAYMENT_METHOD_ALIASES[raw] || raw;
}

function isBankMethod(id) {
  const method = normalizePaymentMethod(id);
  return method === "bank_account";
}

function isWalletMethod(id) {
  const method = normalizePaymentMethod(id);
  return method === "easypaisa" || method === "jazzcash";
}

function isEasypaisaMethod(id) {
  return normalizePaymentMethod(id) === "easypaisa";
}

function isJazzCashMethod(id) {
  return normalizePaymentMethod(id) === "jazzcash";
}

function isNayaPayMethod(id) {
  return normalizePaymentMethod(id) === "nayapay";
}

function needsPaymentAccount(id) {
  return isBankMethod(id) || isWalletMethod(id) || isNayaPayMethod(id);
}

function normalizeIban(value) {
  return trim(value).replace(/\s+/g, "").toUpperCase();
}

function normalizeMobile(value) {
  return trim(value).replace(/[\s-]/g, "");
}

function isValidIban(value) {
  const iban = normalizeIban(value);
  if (!iban) return true;
  if (/^PK\d{2}[A-Z]{4}\d{16}$/.test(iban)) return true;
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) && iban.length >= 15 && iban.length <= 34;
}

function isValidWalletMobile(value) {
  const mobile = normalizeMobile(value);
  if (!mobile) return false;
  return /^(?:\+92|92|0)?3\d{9}$/.test(mobile);
}

function paymentAccountFromBody(body = {}) {
  return {
    payment_method: normalizePaymentMethod(body.payment_method),
    account_name: trim(body.account_name || body.account_title),
    bank_name: trim(body.bank_name),
    account_number: trim(body.account_number),
    iban: normalizeIban(body.iban),
    payment_mobile: normalizeMobile(body.payment_mobile || body.mobile_number),
    nayapay_account_name: trim(body.nayapay_account_name),
    nayapay_number: normalizeMobile(body.nayapay_number || body.nayapay_mobile),
    nayapay_iban: normalizeIban(body.nayapay_iban),
    easypaisa_iban: normalizeIban(body.easypaisa_iban),
  };
}

function validatePaymentAccount(body = {}) {
  const errors = [];
  const account = paymentAccountFromBody(body);
  const method = account.payment_method;
  if (!method) return errors;
  if (isBankMethod(method)) {
    if (!account.account_name) errors.push("Account title / account name is required.");
    if (!account.bank_name) errors.push("Bank name is required for bank accounts.");
    else if (![...PAKISTANI_BANKS, "Other"].includes(account.bank_name)) {
      errors.push("Choose a bank from the list.");
    }
    if (!account.account_number) errors.push("Account number is required for bank accounts.");
  } else if (isNayaPayMethod(method)) {
    if (!account.nayapay_account_name) errors.push("NayaPay account name is required.");
    if (!account.nayapay_number) errors.push("NayaPay number / mobile number is required.");
    else if (!isValidWalletMobile(account.nayapay_number)) {
      errors.push("Enter a valid NayaPay mobile number, for example 03XXXXXXXXX.");
    }
  } else if (isWalletMethod(method)) {
    if (!account.account_name) errors.push("Account name is required.");
    if (!account.payment_mobile) errors.push("Mobile number is required for Easypaisa and JazzCash.");
    else if (!isValidWalletMobile(account.payment_mobile)) {
      errors.push("Enter a valid Pakistani mobile number, for example 03XXXXXXXXX.");
    }
  }
  if (account.iban && !isValidIban(account.iban)) {
    errors.push("Bank IBAN format is not valid. Pakistani IBANs look like PK36HABB0000001234567890.");
  }
  if (account.nayapay_iban && !isValidIban(account.nayapay_iban)) {
    errors.push("NayaPay IBAN format is not valid.");
  }
  if (account.easypaisa_iban && !isValidIban(account.easypaisa_iban)) {
    errors.push("Easypaisa IBAN format is not valid.");
  }
  return errors;
}

function formatPaymentAccountSummary(row = {}) {
  const method = normalizePaymentMethod(row.payment_method);
  const name = trim(row.account_name);
  if (isBankMethod(method)) {
    const parts = ["Bank Account", trim(row.bank_name), name, trim(row.account_number)];
    if (trim(row.iban)) parts.push(trim(row.iban));
    return parts.filter(Boolean).join(" · ");
  }
  if (isNayaPayMethod(method)) {
    return ["NayaPay", trim(row.nayapay_account_name), trim(row.nayapay_number), trim(row.nayapay_iban)]
      .filter(Boolean)
      .join(" · ");
  }
  if (isEasypaisaMethod(method)) {
    return ["Easypaisa", name, trim(row.payment_mobile), trim(row.easypaisa_iban)].filter(Boolean).join(" · ");
  }
  if (isJazzCashMethod(method)) {
    return ["JazzCash", name, trim(row.payment_mobile)].filter(Boolean).join(" · ");
  }
  return trim(row.bank_details);
}

function composeBankDetails(row = {}, previous = "") {
  return formatPaymentAccountSummary(row) || trim(previous) || null;
}

function salaryPayoutFromOfficer(officer = {}) {
  const method = normalizePaymentMethod(officer.payment_method);
  if (method === "nayapay") return "NayaPay";
  if (method === "cash" || isWalletMethod(method)) return "Cash";
  if (isBankMethod(method)) return "Bank";
  return "Bank";
}

function payoutAccountDisplay(officer = {}, payout = "") {
  const method = payout || salaryPayoutFromOfficer(officer);
  if (method === "Cash") {
    return formatPaymentAccountSummary(officer) || "Cash";
  }
  if (method === "NayaPay") {
    return [trim(officer.nayapay_account_name), trim(officer.nayapay_number), trim(officer.nayapay_iban)]
      .filter(Boolean)
      .join(" · ") || "NayaPay";
  }
  if (method === "Bank") {
    return [trim(officer.bank_name), trim(officer.account_name), trim(officer.account_number), trim(officer.iban)]
      .filter(Boolean)
      .join(" · ") || "Bank";
  }
  return formatPaymentAccountSummary(officer) || trim(officer.bank_details);
}

module.exports = {
  PAKISTANI_BANKS,
  ACCOUNT_PAYMENT_METHODS,
  SALARY_PAYOUT_METHODS,
  LEGACY_PAYMENT_METHODS,
  PAYMENT_METHOD_ALIASES,
  normalizePaymentMethod,
  isBankMethod,
  isWalletMethod,
  isEasypaisaMethod,
  isJazzCashMethod,
  isNayaPayMethod,
  needsPaymentAccount,
  normalizeIban,
  normalizeMobile,
  isValidIban,
  isValidWalletMobile,
  paymentAccountFromBody,
  validatePaymentAccount,
  formatPaymentAccountSummary,
  composeBankDetails,
  salaryPayoutFromOfficer,
  payoutAccountDisplay,
};
