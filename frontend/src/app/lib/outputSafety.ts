export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
}
export function safeCsvText(value: unknown): string {
  const text = String(value ?? "");
  const numeric = typeof value === 'number' || /^-\d+(?:\.\d+)?$/.test(text);
  const safe = !numeric && /^[\s\u0000-\u001f\u007f]*[=+@-]/.test(text) ? "'" + text : text;
  return safe.replace(/"/g, '""');
}
