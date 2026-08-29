const DEFAULT_OVERTIME_CUTOFF = "17:00";

function toMinutes(time) {
  if (!time) return null;
  const [h, m] = String(time).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function roundHours(value) {
  return Math.round(value * 100) / 100;
}

function hoursFromMinutes(mins) {
  const n = Math.round(Number(mins) || 0);
  if (n <= 0) return 0;
  return n / 60;
}

function calculateWorkingHours(checkIn, checkOut, isNight) {
  const start = toMinutes(checkIn);
  const end = toMinutes(checkOut);
  if (start == null || end == null) return 0;
  let duration = end - start;
  if (duration < 0 || (isNight && end <= start)) {
    duration += 24 * 60;
  }
  if (duration < 0) return 0;
  return hoursFromMinutes(duration);
}

function resolveOvertimeMode(shift, isNight) {
  const mode = shift?.overtime_mode;
  if (mode === "cutoff" || mode === "after_hours") return mode;
  return isNight || shift?.is_night ? "after_hours" : "cutoff";
}

function calculateCutoffOvertimeHours(checkOut, cutoff) {
  const end = toMinutes(checkOut);
  const cut = toMinutes(cutoff || DEFAULT_OVERTIME_CUTOFF);
  if (end == null || cut == null) return 0;
  if (end <= cut) return 0;
  return hoursFromMinutes(end - cut);
}

function calculateOvertimeHours({
  status,
  checkOut,
  workingHours,
  isNight,
  shift,
  overtimeMode,
  overtimeCutoff,
  overtimeAfterHours,
}) {
  if (status !== "present") return 0;
  const mode = overtimeMode || resolveOvertimeMode(shift, isNight);
  if (mode === "after_hours") {
    const otAfter = Number(overtimeAfterHours) || 0;
    return hoursFromMinutes(Math.max(0, Math.round((Number(workingHours) || 0) * 60) - Math.round(otAfter * 60)));
  }
  return calculateCutoffOvertimeHours(
    checkOut,
    shift?.overtime_cutoff || overtimeCutoff || DEFAULT_OVERTIME_CUTOFF
  );
}

function computeAttendanceMetrics({
  status,
  checkIn,
  checkOut,
  isNight,
  officeStartTime,
  lateGraceMinutes,
  overtimeAfterHours,
  overtimeMode,
  overtimeCutoff,
  shift,
}) {
  const needsTimes = status === "present" || status === "half_day";
  const night = Boolean(isNight || shift?.is_night);
  const workingHours = needsTimes ? calculateWorkingHours(checkIn, checkOut, night) : 0;

  let lateMinutes = 0;
  let isLate = 0;
  if (status === "present" && checkIn) {
    const checkInMins = toMinutes(checkIn);
    const startMins = toMinutes(officeStartTime);
    const grace = Number(lateGraceMinutes) || 0;
    if (checkInMins != null && startMins != null && checkInMins > startMins + grace) {
      lateMinutes = checkInMins - startMins;
      isLate = 1;
    }
  }

  const overtimeHours = calculateOvertimeHours({
    status,
    checkOut,
    workingHours,
    isNight: night,
    shift,
    overtimeMode,
    overtimeCutoff,
    overtimeAfterHours,
  });

  return { workingHours, lateMinutes, isLate, overtimeHours };
}

function attendancePercentage(stats) {
  const present = Number(stats.present || 0);
  const half = Number(stats.half_day || 0);
  const absent = Number(stats.absent || 0);
  const leave = Number(stats.leave || 0);
  const denominator = present + half + absent + leave;
  if (!denominator) return 0;
  const earned = present + half * 0.5;
  return roundHours((earned / denominator) * 100);
}

function validateTimes({ status, checkIn, checkOut, isNight }) {
  const needsTimes = status === "present" || status === "half_day";
  if (!needsTimes) return null;
  if (checkIn && checkOut) {
    const start = toMinutes(checkIn);
    const end = toMinutes(checkOut);
    if (start == null || end == null) return "Check-in and check-out must be valid times.";
    if (end < start && !isNight) {
      return "Check-out cannot be earlier than check-in unless this is a night shift.";
    }
  }
  return null;
}

function monthDateRange(year, month) {
  const y = Number(year);
  const m = String(month).padStart(2, "0");
  const last = new Date(y, Number(month), 0).getDate();
  return {
    start: `${y}-${m}-01`,
    end: `${y}-${m}-${String(last).padStart(2, "0")}`,
  };
}

module.exports = {
  DEFAULT_OVERTIME_CUTOFF,
  toMinutes,
  roundHours,
  hoursFromMinutes,
  calculateWorkingHours,
  resolveOvertimeMode,
  calculateCutoffOvertimeHours,
  calculateOvertimeHours,
  computeAttendanceMetrics,
  attendancePercentage,
  validateTimes,
  monthDateRange,
};
