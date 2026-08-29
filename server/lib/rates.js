const { roundHours } = require("./attendance");

function officerWorkHours(officer, settingsMap) {
  const own = Number(officer?.working_hours_per_day);
  if (own > 0) return own;
  const fromSettings = Number(settingsMap?.normal_working_hours);
  return fromSettings > 0 ? fromSettings : 8;
}

function officerOvertimeAfter(officer, settingsMap) {
  const ownHours = Number(officer?.working_hours_per_day);
  if (ownHours > 0) return ownHours;
  const ot = Number(settingsMap?.overtime_after_hours);
  if (ot > 0) return ot;
  return officerWorkHours(officer, settingsMap);
}

function salaryRates(officer, settingsMap) {
  const hours = officerWorkHours(officer, settingsMap);
  const days = Number(settingsMap?.working_days_per_month) || 30;
  const amount = Number(officer?.salary) || 0;
  const type = officer?.salary_type || "monthly";
  const monthly = type === "daily" ? roundHours(amount * days) : amount;
  const daily = type === "daily" ? amount : days ? amount / days : 0;
  const hourly = hours ? daily / hours : 0;
  return {
    working_hours_per_day: hours,
    working_days_per_month: days,
    monthly_salary: roundHours(monthly),
    daily_salary: roundHours(daily),
    hourly_rate: roundHours(hourly),
  };
}

module.exports = { officerWorkHours, officerOvertimeAfter, salaryRates };
