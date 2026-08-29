export const DEFAULT_OVERTIME_CUTOFF = "17:00";

export function toMinutes(time) {
  if (!time) return null;
  const [h, m] = String(time).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function hoursFromMinutes(mins) {
  const n = Math.round(Number(mins) || 0);
  if (n <= 0) return 0;
  return n / 60;
}

export function calculateWorkingHours(checkIn, checkOut, isNight) {
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

export function resolveOvertimeMode(shift, isNight) {
  const mode = shift?.overtime_mode;
  if (mode === "cutoff" || mode === "after_hours") return mode;
  return isNight || shift?.is_night ? "after_hours" : "cutoff";
}

export function calculateCutoffOvertimeHours(checkOut, cutoff) {
  const end = toMinutes(checkOut);
  const cut = toMinutes(cutoff || DEFAULT_OVERTIME_CUTOFF);
  if (end == null || cut == null) return 0;
  if (end <= cut) return 0;
  return hoursFromMinutes(end - cut);
}

export function computeAttendanceMetrics({
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

  let overtimeHours = 0;
  if (status === "present") {
    const mode = overtimeMode || resolveOvertimeMode(shift, night);
    if (mode === "after_hours") {
      const otAfter = Number(overtimeAfterHours) || 0;
      overtimeHours = hoursFromMinutes(
        Math.max(0, Math.round((Number(workingHours) || 0) * 60) - Math.round(otAfter * 60))
      );
    } else {
      overtimeHours = calculateCutoffOvertimeHours(
        checkOut,
        shift?.overtime_cutoff || overtimeCutoff || DEFAULT_OVERTIME_CUTOFF
      );
    }
  }

  return { workingHours, lateMinutes, isLate, overtimeHours };
}

export function previewAttendance(row, shifts = []) {
  if (!["present", "half_day"].includes(row?.status)) return null;
  const shift =
    shifts.find((s) => String(s.id) === String(row.shift_id)) ||
    shifts.find((s) => String(s.id) === String(row.officer?.shift_id)) ||
    null;
  return computeAttendanceMetrics({
    status: row.status,
    checkIn: row.check_in,
    checkOut: row.check_out,
    isNight: Boolean(shift?.is_night || row.officer?.is_night),
    officeStartTime: shift?.start_time || row.officer?.shift_start || "09:00",
    lateGraceMinutes: 0,
    overtimeAfterHours: Number(row.officer?.working_hours_per_day) || 10,
    overtimeCutoff: shift?.overtime_cutoff || DEFAULT_OVERTIME_CUTOFF,
    shift,
  });
}
