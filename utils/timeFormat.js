export function to12HourParts(hour24, minute = 0) {
  const h = Number(hour24) || 0;
  const m = Number(minute) || 0;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour12, minute: m, period };
}

export function to24Hour(hour12, minute, period) {
  let h = Number(hour12) || 12;
  const m = Number(minute) || 0;
  if (period === 'AM') {
    if (h === 12) h = 0;
  } else if (h !== 12) {
    h += 12;
  }
  return { hour: h, minute: m };
}

export function formatTime12(hour24, minute = 0) {
  const { hour12, minute: m, period } = to12HourParts(hour24, minute);
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export const HOUR_12_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));
export const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
export const PERIOD_OPTIONS = ['AM', 'PM'];
