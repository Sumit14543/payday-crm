import {
  Banknote,
  BarChart3,
  ClipboardCheck,
  Clock,
  Gauge,
  FileText,
  FileSignature,
  Landmark,
  LineChart,
  ShieldCheck,
  PhoneCall,
  Receipt,
  ScrollText,
  TrendingUp,
  UserCog,
  Users,
  UsersRound,
  Layers,
  Settings,
} from "lucide-react";

export const workspace = {
  company: "Waqt Finance",
  product: "Waqt Finance CRM",
  environment: "Live",
};

export const quickActions = [
  { label: "Open lead queue", href: "/leads", section: "Pipeline" },
  { label: "Credit review queue", href: "/credit-manager", section: "Credit" },
  { label: "Create application", href: "/leads", section: "Pipeline" },
  { label: "Log repayment", href: "/collections/log-payment", section: "Servicing" },
  { label: "Check accountant queue", href: "/loan-management", section: "Loans" },
];

export const navigationItems = [
  { name: "Dashboard", href: "/", icon: Gauge, section: "Workspace" },
  { name: "Credit Manager", href: "/credit-manager", icon: ShieldCheck, section: "Credit" },
  { name: "Credit Applications", href: "/credit-applications", icon: FileSignature, section: "Credit" },
  { name: "Leads", href: "/leads", icon: Users, section: "Pipeline" },
  { name: "Follow-ups", href: "/followups", icon: Clock, section: "Workspace" },
  { name: "Pipeline", href: "/pipeline", icon: Layers, section: "Pipeline" },
  { name: "Customers", href: "/customers", icon: UserCog, section: "Portfolio" },
  { name: "Origination", href: "/loan-origination", icon: ClipboardCheck, section: "Loans" },
  { name: "Loan Portfolio", href: "/loan-management", icon: Landmark, section: "Loans" },
  { name: "Dashboard", href: "/collections", icon: Gauge, section: "Servicing" },
  { name: "My Collections", href: "/collections/my-collections", icon: PhoneCall, section: "Servicing" },
  { name: "Log Payment", href: "/collections/log-payment", icon: Receipt, section: "Servicing" },
  { name: "Team", href: "/team", icon: UsersRound, section: "Admin" },
  { name: "Settings", href: "/settings", icon: Settings, section: "Admin" },
  { name: "Documents", href: "/documents", icon: FileText, section: "Reporting" },
  { name: "Commissions", href: "/commission", icon: TrendingUp, section: "Finance" },
  { name: "Income", href: "/income", icon: TrendingUp, section: "Finance" },
  { name: "Invoices", href: "/invoice", icon: Receipt, section: "Finance" },
  { name: "MIS", href: "/mis-reports", icon: FileText, section: "Reporting" },
  { name: "Analytics", href: "/analytics", icon: LineChart, section: "Reporting" },
];

export const searchRecords = [
  ...navigationItems.map((item) => ({
    id: `nav-${item.href}`,
    title: item.name,
    subtitle: `${item.section} module`,
    href: item.href,
    type: "Page",
  })),
  ...quickActions.map((item) => ({
    id: `action-${item.label}`,
    title: item.label,
    subtitle: item.section,
    href: item.href,
    type: "Action",
  })),
];

export const exportRows = [
  ["Metric", "Value", "Owner"],
  ["Active leads", "280", "Sales"],
  ["Active loans", "156", "Operations"],
  ["Overdue loans", "4", "Collections"],
  ["Monthly revenue", "67000", "Finance"],
  ["Compliance reviews", "7", "Risk"],
];
