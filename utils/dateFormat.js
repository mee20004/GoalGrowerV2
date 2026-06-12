import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'dateFormat';
const WEEK_START_KEY = 'weekStart';
const SHOW_LAST_6_DAYS_KEY = 'showLast6Days';
const DEFAULT_FORMAT = 'YYYY-MM-DD';
const DEFAULT_WEEK_START = 0; // 0 = Sunday, 1 = Monday
const DEFAULT_SHOW_LAST_6_DAYS = false;
let cachedFormat = DEFAULT_FORMAT;
let cachedWeekStart = DEFAULT_WEEK_START;
let cachedShowLast6Days = DEFAULT_SHOW_LAST_6_DAYS;

(async () => {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    if (v) cachedFormat = v;
  } catch (e) {
    // ignore
  }
  try {
    const v = await AsyncStorage.getItem(WEEK_START_KEY);
    if (v !== null) cachedWeekStart = Number(v) || DEFAULT_WEEK_START;
  } catch (e) {
    // ignore
  }
  try {
    const v = await AsyncStorage.getItem(SHOW_LAST_6_DAYS_KEY);
    if (v !== null) cachedShowLast6Days = v === 'true';
  } catch (e) {
    // ignore
  }
})();

export function getDateFormatSync() {
  return cachedFormat || DEFAULT_FORMAT;
}

export async function setDateFormat(format) {
  try {
    cachedFormat = format;
    await AsyncStorage.setItem(STORAGE_KEY, format);
    return true;
  } catch (e) {
    console.error('Failed to save date format', e);
    return false;
  }
}

export function getWeekStartSync() {
  return cachedWeekStart;
}

export async function setWeekStart(start) {
  try {
    const next = Number(start) || DEFAULT_WEEK_START;
    cachedWeekStart = next;
    await AsyncStorage.setItem(WEEK_START_KEY, String(next));
    return true;
  } catch (e) {
    console.error('Failed to save week start', e);
    return false;
  }
}

export function getShowLast6DaysSync() {
  return cachedShowLast6Days;
}

export async function setShowLast6Days(value) {
  try {
    const next = Boolean(value);
    cachedShowLast6Days = next;
    await AsyncStorage.setItem(SHOW_LAST_6_DAYS_KEY, String(next));
    return true;
  } catch (e) {
    console.error('Failed to save rolling week history preference', e);
    return false;
  }
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WEEK_START_OPTIONS = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
];

export function getWeekdayLabelsSync() {
  const offset = getWeekStartSync();
  return WEEKDAY_LABELS.slice(offset).concat(WEEKDAY_LABELS.slice(0, offset));
}

function pad(n) { return String(n).padStart(2, '0'); }

export function formatISOToDisplay(iso) {
  if (!iso) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y,m,d] = iso.split('-');
  const fmt = getDateFormatSync();
  if (fmt === 'YYYY-MM-DD') return `${y}-${m}-${d}`;
  if (fmt === 'DD-MM-YYYY') return `${d}-${m}-${y}`;
  if (fmt === 'MM-DD-YYYY') return `${m}-${d}-${y}`;
  return `${y}-${m}-${d}`;
}

export function parseDisplayToISO(input) {
  if (!input) return '';
  // If already ISO
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Extract numbers
  const nums = trimmed.replace(/[^0-9]/g, ' ').trim().split(/\s+/);
  if (nums.length < 3) return '';
  const fmt = getDateFormatSync();
  let y, m, d;
  if (fmt === 'YYYY-MM-DD') {
    // assume order Y M D or Y M D with separators
    if (nums[0].length === 4) {
      [y, m, d] = nums;
    } else {
      // fallback: last is day
      y = nums[0]; m = nums[1]; d = nums[2];
    }
  } else if (fmt === 'DD-MM-YYYY') {
    [d, m, y] = nums;
  } else if (fmt === 'MM-DD-YYYY') {
    [m, d, y] = nums;
  } else {
    [y, m, d] = nums;
  }
  y = String(y);
  m = pad(Number(m) || 0);
  d = pad(Number(d) || 0);
  if (y.length === 2) {
    // interpret two-digit year as 20xx
    y = '20' + y;
  }
  if (!/^\d{4}$/.test(y)) return '';
  return `${y}-${m}-${d}`;
}

export const FORMATS = ['YYYY-MM-DD','DD-MM-YYYY','MM-DD-YYYY'];

// Format a partial/raw user input to include separators matching chosen format
export function formatPartialDisplay(input) {
  if (!input) return '';
  const digits = String(input).replace(/\D/g, '').slice(0, 8);
  const fmt = getDateFormatSync();
  if (fmt === 'YYYY-MM-DD') {
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0,4)}-${digits.slice(4)}`;
    return `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`;
  }
  // DD-MM-YYYY or MM-DD-YYYY -> groups 2-2-4
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0,2)}-${digits.slice(2)}`;
  return `${digits.slice(0,2)}-${digits.slice(2,4)}-${digits.slice(4,8)}`;
}

// Format when caller provides only digits (no separators)
export function formatPartialFromDigits(digits) {
  const d = String(digits || '').replace(/\D/g, '').slice(0, 8);
  const fmt = getDateFormatSync();
  if (fmt === 'YYYY-MM-DD') {
    if (d.length <= 4) return d;
    if (d.length <= 6) return `${d.slice(0,4)}-${d.slice(4)}`;
    return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
  }
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0,2)}-${d.slice(2)}`;
  return `${d.slice(0,2)}-${d.slice(2,4)}-${d.slice(4,8)}`;
}
