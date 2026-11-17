// Prepare public JavaScript only. Never fetch leads or start assignment here.
export const loadAppLayoutCode = () => import("../components/Layout").then(module => ({ default: module.Layout }));
export const loadTelecallerLeadsCode = () => import("../pages/Leads").then(module => ({ default: module.Leads }));

export function preloadTelecallerPageCode(includeLayout = false) {
  // Failed speculation must not interrupt login. Actual rendering still uses
  // the existing lazyRetry behavior.
  void loadTelecallerLeadsCode().catch(() => undefined);
  if (includeLayout) void loadAppLayoutCode().catch(() => undefined);
}
