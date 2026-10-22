/**
 * Indian Public, National, Gazetted & RBI Bank Holidays
 * Covering 2025, 2026, and 2027 with automatic 2nd/4th Saturday & Sunday detection.
 */

export type HolidayInfo = {
  isHoliday: boolean;
  name: string;
  type: 'national' | 'gazetted' | 'bank' | 'weekend';
  isWeekend: boolean;
  description?: string;
};

// Fixed and Lunar/Solar Calendar Indian Gazetted & Bank Holidays
const INDIAN_HOLIDAYS_MAP: Record<string, { name: string; type: 'national' | 'gazetted' | 'bank' }> = {
  // 2025
  '2025-01-01': { name: "New Year's Day", type: 'bank' },
  '2025-01-14': { name: "Makar Sankranti / Pongal", type: 'gazetted' },
  '2025-01-26': { name: "Republic Day", type: 'national' },
  '2025-02-26': { name: "Maha Shivratri", type: 'gazetted' },
  '2025-03-14': { name: "Holi", type: 'gazetted' },
  '2025-03-31': { name: "Eid-ul-Fitr (Ramzan Id)", type: 'gazetted' },
  '2025-04-10': { name: "Mahavir Jayanti", type: 'gazetted' },
  '2025-04-14': { name: "Dr. B.R. Ambedkar Jayanti", type: 'gazetted' },
  '2025-04-18': { name: "Good Friday", type: 'gazetted' },
  '2025-05-01': { name: "May Day / Maharashtra Day", type: 'bank' },
  '2025-05-12': { name: "Buddha Purnima", type: 'gazetted' },
  '2025-06-07': { name: "Bakrid / Eid-ul-Adha", type: 'gazetted' },
  '2025-07-06': { name: "Muharram", type: 'gazetted' },
  '2025-08-15': { name: "Independence Day", type: 'national' },
  '2025-08-16': { name: "Janmashtami", type: 'gazetted' },
  '2025-08-27': { name: "Ganesh Chaturthi", type: 'gazetted' },
  '2025-09-05': { name: "Milad-un-Nabi", type: 'gazetted' },
  '2025-10-02': { name: "Mahatma Gandhi Jayanti", type: 'national' },
  '2025-10-20': { name: "Diwali (Deepavali)", type: 'gazetted' },
  '2025-10-21': { name: "Govardhan Puja", type: 'gazetted' },
  '2025-10-22': { name: "Bhai Dooj", type: 'gazetted' },
  '2025-11-05': { name: "Guru Nanak Jayanti", type: 'gazetted' },
  '2025-12-25': { name: "Christmas Day", type: 'national' },

  // 2026
  '2026-01-01': { name: "New Year's Day", type: 'bank' },
  '2026-01-14': { name: "Makar Sankranti / Pongal", type: 'gazetted' },
  '2026-01-26': { name: "Republic Day", type: 'national' },
  '2026-02-15': { name: "Maha Shivratri", type: 'gazetted' },
  '2026-03-03': { name: "Holi / Dhuleti", type: 'gazetted' },
  '2026-03-20': { name: "Eid-ul-Fitr (Ramzan Id)", type: 'gazetted' },
  '2026-03-26': { name: "Ram Navami", type: 'gazetted' },
  '2026-03-31': { name: "Mahavir Jayanti", type: 'gazetted' },
  '2026-04-01': { name: "Annual Bank Closing", type: 'bank' },
  '2026-04-03': { name: "Good Friday", type: 'gazetted' },
  '2026-04-14': { name: "Dr. B.R. Ambedkar Jayanti", type: 'gazetted' },
  '2026-05-01': { name: "May Day / Labour Day", type: 'bank' },
  '2026-05-27': { name: "Bakrid / Eid-ul-Adha", type: 'gazetted' },
  '2026-05-31': { name: "Buddha Purnima", type: 'gazetted' },
  '2026-06-26': { name: "Muharram", type: 'gazetted' },
  '2026-08-15': { name: "Independence Day", type: 'national' },
  '2026-08-27': { name: "Raksha Bandhan", type: 'gazetted' },
  '2026-09-04': { name: "Janmashtami", type: 'gazetted' },
  '2026-09-14': { name: "Ganesh Chaturthi", type: 'gazetted' },
  '2026-09-15': { name: "Eid-e-Milad (Milad-un-Nabi)", type: 'gazetted' },
  '2026-10-02': { name: "Mahatma Gandhi Jayanti", type: 'national' },
  '2026-10-20': { name: "Dussehra (Vijayadashami)", type: 'gazetted' },
  '2026-11-08': { name: "Diwali (Lakshmi Puja)", type: 'national' },
  '2026-11-09': { name: "Govardhan Puja", type: 'gazetted' },
  '2026-11-10': { name: "Bhai Dooj", type: 'gazetted' },
  '2026-11-24': { name: "Guru Nanak Jayanti", type: 'gazetted' },
  '2026-12-25': { name: "Christmas Day", type: 'national' },

  // 2027
  '2027-01-01': { name: "New Year's Day", type: 'bank' },
  '2027-01-14': { name: "Makar Sankranti", type: 'gazetted' },
  '2027-01-26': { name: "Republic Day", type: 'national' },
  '2027-03-06': { name: "Maha Shivratri", type: 'gazetted' },
  '2027-03-10': { name: "Eid-ul-Fitr", type: 'gazetted' },
  '2027-03-22': { name: "Holi", type: 'gazetted' },
  '2027-03-26': { name: "Good Friday", type: 'gazetted' },
  '2027-04-14': { name: "Dr. B.R. Ambedkar Jayanti", type: 'gazetted' },
  '2027-04-16': { name: "Ram Navami", type: 'gazetted' },
  '2027-05-01': { name: "May Day", type: 'bank' },
  '2027-05-17': { name: "Bakrid / Eid-ul-Adha", type: 'gazetted' },
  '2027-08-15': { name: "Independence Day", type: 'national' },
  '2027-08-25': { name: "Janmashtami", type: 'gazetted' },
  '2027-10-02': { name: "Mahatma Gandhi Jayanti", type: 'national' },
  '2027-10-10': { name: "Dussehra", type: 'gazetted' },
  '2027-10-29': { name: "Diwali", type: 'national' },
  '2027-12-25': { name: "Christmas Day", type: 'national' },
};

/**
 * Formats a Date object or YYYY-MM-DD string to standard YYYY-MM-DD
 */
export function toIsoDateString(dateInput: Date | string): string {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') {
    // If already in YYYY-MM-DD
    const clean = dateInput.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    const parsed = new Date(dateInput);
    if (Number.isNaN(parsed.getTime())) return '';
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const y = dateInput.getFullYear();
  const m = String(dateInput.getMonth() + 1).padStart(2, '0');
  const d = String(dateInput.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Checks if a given date is an Indian Public / Bank Holiday or Weekend
 */
export function getIndianHoliday(dateInput: Date | string): HolidayInfo | null {
  const iso = toIsoDateString(dateInput);
  if (!iso) return null;

  const [year, month, day] = iso.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday

  // 1. Check fixed/gazetted list first
  const mapped = INDIAN_HOLIDAYS_MAP[iso];
  if (mapped) {
    return {
      isHoliday: true,
      name: mapped.name,
      type: mapped.type,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      description: `${mapped.name} (${mapped.type === 'national' ? 'National Holiday' : 'Gazetted Holiday'})`,
    };
  }

  // 2. Check Sundays
  if (dayOfWeek === 0) {
    return {
      isHoliday: true,
      name: 'Sunday (Weekly Off)',
      type: 'weekend',
      isWeekend: true,
      description: 'Sunday - Bank & Commercial Weekly Off',
    };
  }

  // 3. Check 2nd and 4th Saturday (RBI Bank Holidays)
  if (dayOfWeek === 6) {
    if (day >= 8 && day <= 14) {
      return {
        isHoliday: true,
        name: '2nd Saturday (Bank Holiday)',
        type: 'bank',
        isWeekend: true,
        description: '2nd Saturday - Official RBI Banking Holiday',
      };
    }
    if (day >= 22 && day <= 28) {
      return {
        isHoliday: true,
        name: '4th Saturday (Bank Holiday)',
        type: 'bank',
        isWeekend: true,
        description: '4th Saturday - Official RBI Banking Holiday',
      };
    }
  }

  return null;
}

/**
 * Calculates number of days between two YYYY-MM-DD dates
 */
export function calculateDaysDifference(startDateStr: string, endDateStr: string): number {
  const startIso = toIsoDateString(startDateStr);
  const endIso = toIsoDateString(endDateStr);
  if (!startIso || !endIso) return 0;

  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);

  const startUtc = Date.UTC(sy, sm - 1, sd);
  const endUtc = Date.UTC(ey, em - 1, ed);

  const diffMs = endUtc - startUtc;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Adds N days to a YYYY-MM-DD date and returns new YYYY-MM-DD date
 */
export function addDaysToDate(startDateStr: string, days: number): string {
  const startIso = toIsoDateString(startDateStr);
  if (!startIso) return '';

  const [sy, sm, sd] = startIso.split('-').map(Number);
  const dateObj = new Date(sy, sm - 1, sd);
  dateObj.setDate(dateObj.getDate() + Number(days || 0));

  return toIsoDateString(dateObj);
}

/**
 * Formats YYYY-MM-DD to human readable "DD-MM-YYYY (Day)"
 */
export function formatDisplayDate(dateStr: string): string {
  const iso = toIsoDateString(dateStr);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
  const dayName = dateObj.toLocaleDateString('en-IN', { weekday: 'short' });
  const monthName = dateObj.toLocaleDateString('en-IN', { month: 'short' });
  return `${d} ${monthName} ${y} (${dayName})`;
}
