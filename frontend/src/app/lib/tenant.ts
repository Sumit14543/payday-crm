export interface TenantBranding {
  slug: string;
  name: string;
  logoUrl: string;
  themeColor: string;
  secondaryColor: string;
  company: string;
  product: string;
}

const DEFAULT_BRANDING: TenantBranding = {
  slug: "waqtfinance",
  name: "Waqt Finance",
  logoUrl: "/logo.png",
  themeColor: "#059669",
  secondaryColor: "#07111f",
  company: "Waqt Finance",
  product: "Waqt Finance CRM",
};

const BRANDINGS: Record<string, Partial<TenantBranding>> = {
  geetpay: {
    name: "GeetPay",
    logoUrl: "/logo-geetpay.png",
    themeColor: "#16a34a",
    company: "GeetPay",
    product: "GeetPay CRM",
  },
  loaninwallet: {
    name: "LoanInWallet",
    company: "LoanInWallet",
    product: "LoanInWallet CRM",
  },
  salarywaves: {
    name: "SalaryWaves",
    company: "SalaryWaves",
    product: "SalaryWaves CRM",
  },
};

export function getTenantSlug(): string {
  if (typeof window === "undefined") return "waqtfinance";
  
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const paramTenant = searchParams.get("tenant")?.toLowerCase();
    if (paramTenant && BRANDINGS[paramTenant]) {
      localStorage.setItem("paydayops.tenant_slug", paramTenant);
      return paramTenant;
    }
  } catch {}

  try {
    const storedTenant = localStorage.getItem("paydayops.tenant_slug");
    if (storedTenant && BRANDINGS[storedTenant]) {
      return storedTenant;
    }
  } catch {}

  const hostname = window.location.hostname.toLowerCase();
  if (hostname.includes("geetpay")) return "geetpay";
  if (hostname.includes("loaninwallet")) return "loaninwallet";
  if (hostname.includes("salarywaves")) return "salarywaves";

  const parts = hostname.split(".");
  const first = parts[0].toLowerCase();
  
  if (BRANDINGS[first]) {
    return first;
  }
  
  const systemSubdomains = new Set([
    "localhost",
    "127",
    "payday",
    "payday-api",
    "testing",
    "testing-api",
    "testing-waqtmoney",
    "testing-api-waqtmoney",
    "api",
  ]);
  
  if (systemSubdomains.has(first)) {
    return "waqtfinance";
  }
  
  return first;
}

export function getTenantBranding(): TenantBranding {
  const slug = getTenantSlug();
  const brandingOverride = BRANDINGS[slug] || {};
  return {
    ...DEFAULT_BRANDING,
    slug,
    ...brandingOverride,
  };
}
