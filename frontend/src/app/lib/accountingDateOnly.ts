// Repayment dates are calendar dates. Legacy APIs may serialize a MySQL DATE
// as an instant at midnight IST, whose UTC date is the previous day.
export function accountingDateOnly(value?: string | null): string {
  if (!value) return "";
  const normalized = value.trim();
  const calendarDate = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:$|[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$)/);
  if (calendarDate) return calendarDate[1];

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
