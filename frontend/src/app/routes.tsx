import React, { lazy } from "react";
import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { RequireAuth, RequireRole } from "./lib/auth";

function lazyRetry<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const component = await factory();
      return component;
    } catch (error: any) {
      const msg = String(error?.message || "").toLowerCase();
      const isChunkError =
        msg.includes("dynamically imported module") ||
        msg.includes("failed to fetch") ||
        msg.includes("importing a module script failed") ||
        error?.name === "ChunkLoadError";

      const lastReload = Number(sessionStorage.getItem("chunk_reload_timestamp") || 0);
      const now = Date.now();

      if (isChunkError && now - lastReload > 5_000) {
        sessionStorage.setItem("chunk_reload_timestamp", String(now));
        const url = new URL(window.location.href);
        url.searchParams.set("_r", String(now));
        window.location.href = url.toString();
      }
      throw error;
    }
  });
}

const AccountantPanel = lazyRetry(() => import("./pages/AccountantPanel").then((module) => ({ default: module.AccountantPanel })));
const CreditApplications = lazyRetry(() => import("./pages/CreditApplications").then((module) => ({ default: module.CreditApplications })));
const CreditManagerPanel = lazyRetry(() => import("./pages/CreditManagerPanel").then((module) => ({ default: module.CreditManagerPanel })));
const Dashboard = lazyRetry(() => import("./pages/Dashboard").then((module) => ({ default: module.Dashboard })));
const Customers = lazyRetry(() => import("./pages/Customers").then((module) => ({ default: module.Customers })));
const Leads = lazyRetry(() => import("./pages/Leads").then((module) => ({ default: module.Leads })));
const LeadDetails = lazyRetry(() => import("./pages/LeadDetails").then((module) => ({ default: module.LeadDetails })));
const Login = lazyRetry(() => import("./pages/Login").then((module) => ({ default: module.Login })));
const TeamManagement = lazyRetry(() => import("./pages/TeamManagement").then((module) => ({ default: module.TeamManagement })));
const TeamPerformanceDashboard = lazyRetry(() => import("./pages/TeamPerformanceDashboard").then((module) => ({ default: module.TeamPerformanceDashboard })));
const AnalyticsReports = lazyRetry(() => import("./pages/AnalyticsReports").then((module) => ({ default: module.AnalyticsReports })));
const LoanOrigination = lazyRetry(() => import("./pages/LoanOrigination").then((module) => ({ default: module.LoanOrigination })));
const Followups = lazyRetry(() => import("./pages/Followups").then((module) => ({ default: module.Followups })));
const LoanManagement = lazyRetry(() => import("./pages/LoanManagement").then((module) => ({ default: module.LoanManagement })));
const LoanDetails = lazyRetry(() => import("./pages/LoanDetails").then((module) => ({ default: module.LoanDetails })));
const LoanCollection = lazyRetry(() => import("./pages/LoanCollection").then((module) => ({ default: module.LoanCollection })));
const Reports = lazyRetry(() => import("./pages/Reports").then((module) => ({ default: module.Reports })));
const UsersManagement = lazyRetry(() => import("./pages/UsersManagement").then((module) => ({ default: module.UsersManagement })));
const Roles = lazyRetry(() => import("./pages/Roles").then((module) => ({ default: module.Roles })));
const CustomerDetails = lazyRetry(() => import("./pages/CustomerDetails").then((module) => ({ default: module.CustomerDetails })));
const DocumentUpload = lazyRetry(() => import("./pages/DocumentUpload").then((module) => ({ default: module.DocumentUpload })));
const ESign = lazyRetry(() => import("./pages/ESign").then((module) => ({ default: module.ESign })));
const SanctionDecision = lazyRetry(() => import("./pages/SanctionDecision").then((module) => ({ default: module.SanctionDecision })));
const PublicEmandateCheckout = lazyRetry(() => import("./pages/PublicEmandateCheckout").then((module) => ({ default: module.PublicEmandateCheckout })));
const TestingLeadForm = lazyRetry(() => import("./pages/TestingLeadForm").then((module) => ({ default: module.TestingLeadForm })));
const NotFound = lazyRetry(() => import("./pages/NotFound").then((module) => ({ default: module.NotFound })));
const Unauthorized = lazyRetry(() => import("./pages/Unauthorized").then((module) => ({ default: module.Unauthorized })));
const SuperadminDashboard = lazyRetry(() => import("./pages/SuperadminDashboard").then((module) => ({ default: module.SuperadminDashboard })));
const ProductAdminLayout = lazyRetry(() => import("./components/ProductAdminLayout").then((module) => ({ default: module.ProductAdminLayout })));
const ProductAdminDashboard = lazyRetry(() => import("./pages/product-admin/Dashboard").then((module) => ({ default: module.Dashboard })));
const ProductAdminLeads = lazyRetry(() => import("./pages/product-admin/Leads").then((module) => ({ default: module.Leads })));
const ProductAdminLeadDetails = lazyRetry(() => import("./pages/product-admin/LeadDetails").then((module) => ({ default: module.LeadDetails })));
const ProductAdminCustomers = lazyRetry(() => import("./pages/product-admin/Customers").then((module) => ({ default: module.Customers })));
const ProductAdminDocuments = lazyRetry(() => import("./pages/product-admin/Documents").then((module) => ({ default: module.Documents })));
const Pipeline = lazyRetry(() => import("./pages/product-admin/Pipeline").then((module) => ({ default: module.Pipeline })));
const ProductAdminReports = lazyRetry(() => import("./pages/product-admin/Reports").then((module) => ({ default: module.Reports })));
const ProductAdminTeam = lazyRetry(() => import("./pages/product-admin/Team").then((module) => ({ default: module.Team })));
const ProductAdminSettings = lazyRetry(() => import("./pages/product-admin/Settings").then((module) => ({ default: module.Settings })));
const ProductAdminCreditApplications = lazyRetry(() => import("./pages/product-admin/CreditApplications").then((module) => ({ default: module.CreditApplications })));
const ProductAdminDisbursals = lazyRetry(() => import("./pages/product-admin/Disbursals").then((module) => ({ default: module.Disbursals })));
const ProductAdminCollections = lazyRetry(() => import("./pages/product-admin/Collections").then((module) => ({ default: module.Collections })));
const ProductAdminRevenue = lazyRetry(() => import("./pages/product-admin/RevenueAnalytics").then((module) => ({ default: module.RevenueAnalytics })));
const ProductAdminAuditLogs = lazyRetry(() => import("./pages/product-admin/AuditLogs").then((module) => ({ default: module.AuditLogs })));

import { useAuth } from "./lib/auth";

function LeadsRoute() {
  const { user, activeRole } = useAuth();
  const role = activeRole || user?.role;
  if (role === "product-admin") {
    return <ProductAdminLeads />;
  }
  return <Leads />;
}

function LeadDetailsRoute() {
  const { user, activeRole } = useAuth();
  const role = activeRole || user?.role;
  if (role === "product-admin") {
    return <ProductAdminLeadDetails />;
  }
  return <LeadDetails />;
}

function CustomersRoute() {
  const { user, activeRole } = useAuth();
  const role = activeRole || user?.role;
  if (role === "product-admin") {
    return <ProductAdminCustomers />;
  }
  return <Customers />;
}

function ReportsRoute() {
  const { user, activeRole } = useAuth();
  const role = activeRole || user?.role;
  if (role === "product-admin") {
    return <ProductAdminReports />;
  }
  return <Reports />;
}

function CreditApplicationsRoute() {
  const { user, activeRole } = useAuth();
  const role = activeRole || user?.role;
  if (role === "product-admin") {
    return <ProductAdminCreditApplications />;
  }
  return <CreditApplications />;
}

function LoanManagementRoute() {
  const { user, activeRole } = useAuth();
  const role = activeRole || user?.role;
  if (role === "product-admin") {
    return <ProductAdminDisbursals />;
  }
  return <LoanManagement />;
}

function CollectionsRoute() {
  const { user, activeRole } = useAuth();
  const role = activeRole || user?.role;
  if (role === "product-admin") {
    return <ProductAdminCollections />;
  }
  return <LoanCollection />;
}

const AccountAggregatorCallback = lazyRetry(() => import("./pages/AccountAggregatorCallback").then((module) => ({ default: module.AccountAggregatorCallback })));
const AccountAggregatorTestJourney = lazyRetry(() => import("./pages/AccountAggregatorTestJourney").then((module) => ({ default: module.AccountAggregatorTestJourney })));

export const router = createBrowserRouter([
  { path: "/login", element: <Login />, errorElement: <RouteErrorBoundary /> },
  { path: "/superadmin", element: <SuperadminDashboard />, errorElement: <RouteErrorBoundary /> },
  { path: "/document-upload/:token", element: <DocumentUpload />, errorElement: <RouteErrorBoundary /> },
  { path: "/esign/:token", element: <ESign />, errorElement: <RouteErrorBoundary /> },
  { path: "/sanction-decision/:token", element: <SanctionDecision />, errorElement: <RouteErrorBoundary /> },
  { path: "/api/sanction-decision/:token", element: <SanctionDecision />, errorElement: <RouteErrorBoundary /> },
  { path: "/emandate/pay/:id", element: <PublicEmandateCheckout />, errorElement: <RouteErrorBoundary /> },
  { path: "/account-aggregator/callback", element: <AccountAggregatorCallback />, errorElement: <RouteErrorBoundary /> },
  { path: "/account-aggregator/test-journey", element: <AccountAggregatorTestJourney />, errorElement: <RouteErrorBoundary /> },
  { path: "/lead-test", element: <TestingLeadForm />, errorElement: <RouteErrorBoundary /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: "/",
        Component: Layout,
        errorElement: <RouteErrorBoundary />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: "unauthorized", element: <Unauthorized /> },
          {
            element: <RequireRole roles={["telecaller", "product-admin"]} />,
            children: [
              { path: "leads", element: <LeadsRoute /> },
            ],
          },
          {
            element: <RequireRole roles={["telecaller", "credit-manager", "accountant", "product-admin"]} />,
            children: [
              { path: "leads/:leadId", element: <LeadDetailsRoute /> },
            ],
          },
          {
            element: <RequireRole roles={["credit-manager", "product-admin"]} />,
            children: [
              { path: "credit-manager", element: <CreditManagerPanel /> },
              { path: "credit-applications", element: <CreditApplicationsRoute /> },
            ],
          },
          {
            element: <RequireRole roles={["accountant", "product-admin"]} />,
            children: [
              { path: "loan-management", element: <LoanManagementRoute /> },
              { path: "loan-management/:loanId", element: <LoanDetails /> },
            ],
          },
          {
            element: <RequireRole roles={["collection", "product-admin"]} />,
            children: [
              { path: "collections", element: <CollectionsRoute /> },
              { path: "collections/my-collections", element: <CollectionsRoute /> },
              { path: "collections/my_collections", element: <CollectionsRoute /> },
              { path: "collections/log-payment", element: <CollectionsRoute /> },
              { path: "collections/log_payment", element: <CollectionsRoute /> },
              { path: "collections/reports", element: <CollectionsRoute /> },
            ],
          },
          {
            element: <RequireRole roles={["telecaller", "credit-manager", "product-admin", "superadmin"]} />,
            children: [
              { path: "analytics", element: <AnalyticsReports /> },
              { path: "team-performance", element: <TeamPerformanceDashboard /> },
              { path: "followups", element: <Followups /> },
              { path: "pipeline", element: <Pipeline /> },
              { path: "documents", element: <ProductAdminDocuments /> },
            ],
          },
          {
            element: <RequireRole roles={["superadmin", "product-admin"]} />,
            children: [
              { path: "reports", element: <ReportsRoute /> },
            ],
          },
          {
            element: <RequireRole roles={["superadmin"]} />,
            children: [
              { path: "users", element: <UsersManagement /> },
              { path: "roles", element: <Roles /> },
            ],
          },
          {
            element: <RequireRole roles={["accountant"]} />,
            children: [
              { path: "accountant", element: <AccountantPanel /> },
            ],
          },
          {
            element: <RequireRole roles={["product-admin"]} />,
            children: [
              { path: "revenue", element: <ProductAdminRevenue /> },
              { path: "audit-logs", element: <ProductAdminAuditLogs /> },
              { path: "customers", element: <CustomersRoute /> },
              { path: "documents", element: <ProductAdminDocuments /> },
              { path: "team", element: <ProductAdminTeam /> },
              { path: "settings", element: <ProductAdminSettings /> },
            ],
          },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);
