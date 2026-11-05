// MySQL DATE fields are calendar dates, not instants. The driver currently
// creates these Date objects at midnight in the server's local timezone.
function databaseDateOnly(value) {
  if (!(value instanceof Date)) return value;
  if (Number.isNaN(value.getTime())) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatSanctionDate(value) {
  if (!value) return '';
  const dateValue = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00+05:30`
    : value;
  return new Date(dateValue).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  });
}

module.exports = { databaseDateOnly, formatSanctionDate };
