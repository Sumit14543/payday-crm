import { type ComponentType, type FormEvent, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  DollarSign,
  FileText,
  Download,
  CheckCircle,
  AlertCircle,
  User,
  Briefcase,
  CreditCard,
  Home,
  ClipboardCheck,
  MessageSquare,
  RefreshCw,
  Trash2,
  ShieldCheck,
  UserPlus,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  FileCheck2,
  Copy,
  Pencil,
  Check,
  Building2,
  Send,
  RotateCcw,
  Printer,
  FileSpreadsheet,
} from "lucide-react";

import { apiDelete, apiGet, apiGetBlob, apiPatch, apiPost, apiPostForm, resolveBackendUploadBaseUrl, resolveBackendUploadUrl } from "../lib/api";
import { roleLabels, useAuth } from "../lib/auth";
import { getTenantSlug } from "../lib/tenant";
import { OfficialEmailVerifyModal } from "../components/crm/OfficialEmailVerifyModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { AppTooltip } from "../components/ui/app-tooltip";
import { NiceSelect, type NiceSelectOption } from "../components/ui/nice-select";
import { DuplicateLeadsModal } from "../components/DuplicateLeadsModal";


const objectUrlCache = new Map<string, string>();

type Lead = {
  id: string;
  rawId?: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  dateOfBirth?: string;
  loanAmount: number | null;
  loanPurpose?: string;
  source: string;
  sourceStatus?: string;
  sourceSystem?: string;
  sourceLeadId?: string;
  sourceApplicationId?: string;
  status: string;
  priority: string;
  assignedTo: string;
  assignedRole: string;
  createdDate: string;
  lastContact: string | null;
  creditScore: number;
  cibilReportUrl?: string;
  employmentStatus: string;
  monthlyIncome: number;
  city?: string;
  pincode?: string;
  panNumber?: string;
  uanNumber?: string;
  loanType?: string;
  companyName?: string;
  designation?: string;
  bankName?: string;
  branchName?: string;
  accountHolder?: string;
  accountNumber?: string;
  ifscCode?: string;
  salarySlipCurrent?: string;
  salarySlipPrevious?: string;
  salarySlipOld?: string;
  selfieImage?: string;
  officeEmail?: string;
  officialEmail?: string;
  officialEmailVerified?: number | boolean;
  officialEmailVerifiedAt?: string;
  officialEmailVerifiedBy?: string;
  emandateStatus?: string;
  emandateId?: string;
  emandateAuthUrl?: string;
  emandateBankName?: string;
  emandatePaymentMode?: string;
  emandateUpiId?: string;
  emandateAccountNumber?: string;
  emandateMaxAmount?: number;
  emandateRegisteredAt?: string;
  videoKyc?: string;
  aadhaarUniqueId?: string;
  aadhaarNumber?: string;
  aadhaarMasked?: string;
  aadhaarVerified?: number;
  references?: LoanApplicationReference[];
  pastLoans?: any[];
};

type LeadReturnLocation = {
  hash?: string;
  pathname?: string;
  search?: string;
};

type LoanApplicationReference = {
  id: number | string;
  applicationId: string;
  referenceType: string;
  fullName: string;
  mobile: string;
  relation: string;
  createdAt?: string;
  updatedAt?: string;
};

type AadhaarReport = {
  id: number;
  leadId: string;
  applicationId: string;
  uniqueId: string;
  fullName: string;
  dob: string;
  gender: string;
  mobile: string;
  aadhaarMasked: string;
  address: string;
  careOf: string;
  fatherName: string;
  photoDataUrl: string;
  isComplete: boolean;
  createdAt: string;
  updatedAt: string;
};

type CibilAnalysis = {
  cibilScore?: number | string;
  activeLoans?: unknown[];
  closedInactiveLoans?: unknown[];
  overdueAmount?: number | string;
  dpdHistory?: unknown[];
  maximumDpd?: number | string;
  dpdFlags?: {
    "30Plus"?: boolean | string;
    "60Plus"?: boolean | string;
    "90Plus"?: boolean | string;
    [key: string]: unknown;
  };
  writtenOffSettledAccounts?: unknown[];
  creditEnquiries?: unknown[];
  riskCategory?: string;
  riskReasons?: unknown[];
  analystSummary?: string;
  [key: string]: unknown;
};

type CibilReport = {
  id: number;
  fullName: string;
  email: string;
  mobile: string;
  pan: string;
  score: number | null;
  storedScore?: number | null;
  scoreSource?: string;
  pdfUrl: string;
  refId: string;
  analysis: CibilAnalysis | null;
  analysisRawResponse?: unknown;
  analysisStatus: string;
  analysisError: string;
  analysisModel?: string;
  analysisResponseId?: string;
  analyzedAt?: string | null;
  status: "pending" | "completed" | "failed";
  isStale?: boolean;
  message?: string;
  pendingRetryAt?: string | null;
  retryable?: boolean;
  createdAt: string;
};

type LeadActivity = {
  id: number;
  leadId: string;
  applicationId: string;
  type: string;
  description: string;
  user: string;
  metadata?: Record<string, unknown> | null;
  date: string;
};

type TelecallerCallLog = {
  id: number;
  disposition: string;
  subDisposition: string;
  notes: string;
  callDurationSeconds: number;
  nextFollowupAt: string | null;
  actor: string;
  createdAt: string;
};

type TelecallerFollowup = {
  id: number;
  dueAt: string;
  reason: string;
  status: string;
  notes: string;
  actor: string;
  completedAt: string | null;
};

type TelecallerDocumentCheck = {
  id: number;
  key: string;
  label: string;
  status: "pending" | "uploaded" | "verified" | "rejected";
  remark: string;
  verifiedBy: string;
  verifiedAt: string | null;
};

type CreditHandoff = {
  id: number;
  status: string;
  notes: string;
  submittedBy: string;
  submittedAt: string;
};

type WorkflowLeadResponse = {
  handoff?: CreditHandoff;
  lead: Lead;
  camSheet?: CamSheet | null;
  esign?: ESignRequest | null;
  sanction?: SanctionLetter | null;
  payment?: {
    id: number;
    amount: number;
    method: string;
    reference: string;
    status: string;
  };
};

type CamSheet = {
  id: number;
  version: number;
  status: string;
  requestedAmount: number;
  recommendedAmount: number;
  approvedAmount: number;
  loanTermDays: number;
  interestRate: number;
  processingFeeRate: number;
  totalRepayment: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  netIncome: number;
  dtiRatio: number;
  repaymentBuffer: number;
  policyScore: number;
  verificationScore: number;
  riskGrade: string;
  creditRisk: string;
  repaymentCapacity: string;
  recommendation: string;
  deviationLevel: string;
  decisionReason: string;
  conditions: string;
  notes: string;
  createdBy: string;
  decidedBy: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ESignRequest = {
  id: number;
  camSheetId: number | null;
  token: string;
  status: string;
  signerName: string;
  signerEmail: string;
  signerPhone: string;
  signedAt: string | null;
  expiresAt: string;
  createdAt: string;
};

type SanctionLetter = {
  id: number;
  agreementNumber: string;
  agreementDate: string;
  borrower: string;
  lender: string;
  principalAmount: number;
  tenureDays: number;
  interestRate: number;
  interestRateLabel: string;
  processingFee: number;
  gstAmount: number;
  disbursedAmount: number;
  dueDate: string;
  repaymentAmount: number;
  apr: number;
  disbursementDate: string | null;
  disbursementMode: string;
  borrowerEmail: string;
  borrowerPhone: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  penalInterestRate: number;
  lateFee: string;
  conditions: string;
  pdfPath: string;
  acceptanceProofPath: string;
  acceptanceProofOriginalFileName: string;
  acceptanceProofUploadedAt: string | null;
  acceptanceProofUploadedBy: string;
  emailTo: string;
  emailStatus: string;
  emailError: string;
  whatsappStatus: string;
  whatsappError: string;
  whatsappSentAt: string | null;
  parentSanctionId?: number | null;
  revisionNumber?: number;
  revisionReason?: string;
  supersededBySanctionId?: number | null;
  supersededAt?: string | null;
  sentAt: string | null;
  status?: string;
  createdAt: string;
};

type LoanAgreement = {
  id: number;
  sanctionId: number | null;
  camSheetId: number | null;
  agreementNumber: string;
  status: string;
  provider: string;
  signerName: string;
  signerEmail: string;
  signerPhone: string;
  pdfPath: string;
  signedPdfPath: string;
  providerDocumentId: string;
  providerStatus: string;
  signingUrl: string;
  supersededByAgreementId?: number | null;
  supersededAt?: string | null;
  sentAt: string | null;
  signedAt: string | null;
  expiresAt: string | null;
  errorMessage: string;
  createdAt: string;
};

type LeadDocumentRequest = {
  id: number;
  documentKey: string;
  label: string;
  token: string;
  groupToken?: string;
  status: string;
  uploadedFile: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  expiresAt: string;
  uploadedAt: string | null;
  createdAt: string;
};

type LeadDocumentRequestGroup = {
  token: string;
  groupToken?: string;
  expiresAt: string;
  requests: LeadDocumentRequest[];
  uploadUrl?: string;
  whatsapp?: {
    attempted: boolean;
    error?: string;
    sent: boolean;
  };
};

type TelecallerWorkspace = {
  callLogs: TelecallerCallLog[];
  documentChecks: TelecallerDocumentCheck[];
  followups: TelecallerFollowup[];
  latestHandoff: CreditHandoff | null;
};

type TeamMemberOption = {
  id: string;
  name: string;
  role: string;
};

type LeadViewModel = Lead & {
  address: string;
  dateOfBirth: string;
  loanPurpose: string;
  employer: string;
  jobTitle: string;
  references: LoanApplicationReference[];
};

type LeadDetailsResourceResult = {
  apiError: string;
  lead: LeadViewModel;
};

type TelecallerRejectResponse = {
  lead: Lead;
  whatsapp?: {
    attempted?: boolean;
    error?: string;
    sent?: boolean;
  };
};

type SuspenseResource<T> = {
  read: () => T;
};

const emptyLead = (leadId?: string): LeadViewModel => ({
  id: leadId || "",
  name: "",
  email: "",
  phone: "",
  address: "Not provided",
  dateOfBirth: "Not provided",
  loanAmount: null,
  loanPurpose: "Not provided",
  source: "",
  sourceStatus: "",
  sourceSystem: "",
  status: "New",
  priority: "Low",
  assignedTo: "Unassigned",
  assignedRole: "Intake Queue",
  createdDate: "",
  lastContact: null,
  creditScore: 0,
  employmentStatus: "Pending review",
  monthlyIncome: 0,
  city: "",
  panNumber: "",
  loanType: "",
  companyName: "",
  designation: "",
  bankName: "",
  branchName: "",
  accountHolder: "",
  accountNumber: "",
  ifscCode: "",
  salarySlipCurrent: "",
  salarySlipPrevious: "",
  salarySlipOld: "",
  selfieImage: "",
  videoKyc: "",
  aadhaarUniqueId: "",
  aadhaarMasked: "",
  employer: "Not provided",
  jobTitle: "Not provided",
  references: [],
  pastLoans: [],
});

const toLeadViewModel = (data: Lead, leadId?: string): LeadViewModel => ({
  ...emptyLead(leadId),
  ...data,
  address: data.address || data.city || "Not provided",
  dateOfBirth: data.dateOfBirth || "Not provided",
  loanPurpose: data.loanPurpose || "Not provided",
  employer: data.companyName || "Not provided",
  jobTitle: data.designation || "Not provided",
  references: Array.isArray(data.references) ? data.references : [],
});

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  maximumFractionDigits: 0,
  style: "currency",
});

const formatCurrency = (value: number | null | undefined) => (
  value === null || value === undefined ? "Not provided" : currencyFormatter.format(Number(value || 0))
);

const formatActivityDate = (value?: string) => {
  if (!value) return "Not provided";

  let dateStr = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(dateStr)) {
    dateStr = dateStr.replace(' ', 'T') + '+05:30';
  } else if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
    dateStr = dateStr + '+05:30';
  }

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
};

const getLeadDisplayId = (lead: Lead) => (
  lead.sourceApplicationId || lead.sourceLeadId || lead.id
);

const CIBIL_POLL_INTERVAL_MS = 5000;
const CIBIL_DELAYED_POLL_INTERVAL_MS = 10000;
const CIBIL_RETRY_GRACE_MS = 120000;
const LEAD_STATUSES = ["New", "Contacted", "Qualified", "Document Collection", "Documents Pending", "Not Connected", "Converted", "Lost"];
const LEAD_PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const CALL_DISPOSITIONS = [
  "Connected",
  "Not reachable",
  "Switched off",
  "Callback requested",
  "Interested",
  "Not interested",
  "Wrong number",
  "Duplicate",
  "Language issue",
];
const CALL_DISPOSITION_CONFIG: Record<string, {
  durationLabel?: string;
  followupRequired?: boolean;
  followupVisible?: boolean;
  notesPlaceholder: string;
  subDispositionLabel?: string;
  subDispositionOptions: string[];
  subDispositionRequired?: boolean;
  trackDuration?: boolean;
}> = {
  "Connected": {
    durationLabel: "Talk time (sec)",
    followupVisible: true,
    notesPlaceholder: "Customer response, pending docs, promise to send documents...",
    subDispositionOptions: ["Document discussion", "Eligibility explained", "Application details confirmed", "Payment / salary discussed", "Other"],
    trackDuration: true,
  },
  "Not reachable": {
    followupRequired: true,
    followupVisible: true,
    notesPlaceholder: "Mention attempt count, preferred callback time, or alternate number.",
    subDispositionOptions: ["No answer", "Ringing", "Busy", "Network issue", "Customer asked for evening callback"],
    subDispositionRequired: true,
  },
  "Switched off": {
    followupRequired: true,
    followupVisible: true,
    notesPlaceholder: "Mention attempt count and next retry slot.",
    subDispositionOptions: ["Phone switched off", "Out of coverage", "Temporary unavailable"],
    subDispositionRequired: true,
  },
  "Callback requested": {
    durationLabel: "Talk time (sec)",
    followupRequired: true,
    followupVisible: true,
    notesPlaceholder: "Capture requested callback time and what needs to be discussed next.",
    subDispositionOptions: ["Morning callback", "Afternoon callback", "Evening callback", "Tomorrow callback", "Specific time requested"],
    subDispositionRequired: true,
    trackDuration: true,
  },
  "Interested": {
    durationLabel: "Talk time (sec)",
    notesPlaceholder: "Capture agreed next step, documents promised, and expected timeline.",
    subDispositionOptions: ["Documents promised", "Loan amount confirmed", "Needs eligibility check", "Ready for document request"],
    subDispositionRequired: true,
    trackDuration: true,
  },
  "Not interested": {
    durationLabel: "Talk time (sec)",
    notesPlaceholder: "Capture reason for drop-off so future follow-up is clear.",
    subDispositionOptions: ["High charges", "Loan not required", "Got loan elsewhere", "Tenure not suitable", "No reason shared"],
    subDispositionRequired: true,
    trackDuration: true,
  },
  "Wrong number": {
    notesPlaceholder: "Capture who answered, if known, and whether alternate contact is needed.",
    subDispositionOptions: ["Number belongs to someone else", "Invalid number", "Customer unknown"],
    subDispositionRequired: true,
  },
  "Duplicate": {
    notesPlaceholder: "Mention duplicate lead/application reference if available.",
    subDispositionOptions: ["Duplicate application", "Existing active lead", "Repeat customer entry"],
  },
  "Language issue": {
    durationLabel: "Talk time (sec)",
    followupRequired: true,
    followupVisible: true,
    notesPlaceholder: "Mention preferred language and who should call next.",
    subDispositionOptions: ["Hindi required", "English required", "Regional language required", "Transfer required"],
    subDispositionRequired: true,
    trackDuration: true,
  },
};
const DOCUMENT_REQUEST_OPTIONS = [
  { key: "pan", label: "PAN Card" },
  { key: "aadhaar_front", label: "Aadhaar Card Front Side" },
  { key: "aadhaar_back", label: "Aadhaar Card Back Side" },
  { key: "selfie", label: "Selfie Image" },
  { key: "video_kyc", label: "Video KYC" },
  { key: "salary_slip_current", label: "Current Salary Slip" },
  { key: "salary_slip_previous", label: "Previous Salary Slip" },
  { key: "salary_slip_old", label: "Old Salary Slip" },
  { key: "salary_slip_last_3_6_months", label: "Last 3-6 Months Salary Slip" },
  { key: "company_id_card", label: "Company ID Card" },
  { key: "bank_proof", label: "Bank Proof / Cancelled Cheque" },
  { key: "bank_statement_last_6_months", label: "Last 6 Months Bank Statement" },
  { key: "bank_statement_6_months", label: "Bank Statement (6 months)" },
  { key: "cancelled_cheque", label: "Cancelled Cheque" },
  { key: "itr_last_2_3_years", label: "ITR (Last 2-3 Years)" },
  { key: "property_papers", label: "Property Papers" },
  { key: "rent_agreement", label: "Rent Agreement" },
  { key: "noc", label: "NOC" },
  { key: "appointment_letter", label: "Appointment Letter" },
  { key: "utility_bill", label: "Utility Bill (Electricity / Water / Gas)" },
  { key: "passport", label: "Passport" },
  { key: "voter_id", label: "Voter ID" },
  { key: "driving_license", label: "Driving License" },
  { key: "other", label: "Other Document" },
];

const DOCUMENT_REQUEST_KEY_BY_CHECK_KEY: Record<string, string> = {
  aadhaar: "aadhaar",
  bank_details: "bank_proof",
  cibil: "",
  company_id_card: "company_id_card",
  pan: "pan",
  salary_slip_current: "salary_slip_current",
  salary_slip_previous: "salary_slip_previous",
  selfie: "selfie",
  video_kyc: "video_kyc",
};

const CAM_INTEREST_RATE_OPTIONS = ["0.5", "0.6", "0.7", "1", "1.5", "2"];
const CAM_PROCESSING_FEE_OPTIONS = Array.from({ length: 15 }, (_, index) => String(index + 1));
const CAM_APPROVAL_RECOMMENDATIONS = ["Approve", "Approve with Conditions"] as const;
const CAM_RECOMMENDATIONS = [...CAM_APPROVAL_RECOMMENDATIONS, "Reject", "Request More Information"] as const;
const CAM_FOIR_POLICY_LIMIT = 50;
const CAM_FOIR_DEVIATION_LIMIT = 65;
const OPTIONAL_DOCUMENT_POLICY_LABELS = new Set([
  "CIBIL report available",
  "Aadhaar / KYC verified",
  "PAN captured",
  "Bank details captured",
  "Income proof available",
]);

type CamRecommendation = typeof CAM_RECOMMENDATIONS[number];

const documentBaseUrl = resolveBackendUploadBaseUrl().replace(/\/$/, "");

const getAuthToken = () => {
  try {
    const isSuperadmin = localStorage.getItem("paydayops.auth.superadmin");
    const user = localStorage.getItem("paydayops.auth.user");
    const rawUser = isSuperadmin || user;
    if (!rawUser) return "";
    const stored = JSON.parse(rawUser);
    return stored.token || "";
  } catch {
    return "";
  }
};

const normalizeLeadReturnHref = (value?: string | null) => {
  if (!value) return "";

  try {
    const isRelativePath = value.startsWith("/");
    if (!isRelativePath || value.startsWith("//")) return "";

    const parsed = new URL(value, "https://crm.local");
    if (parsed.pathname !== "/leads") return "";

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "";
  }
};

const getLeadReturnHref = (state: unknown, search: string) => {
  const queryReturnTo = normalizeLeadReturnHref(new URLSearchParams(search).get("returnTo"));
  if (queryReturnTo) return queryReturnTo;

  const returnTo = typeof state === "object" && state !== null && "returnTo" in state
    ? (state as { returnTo?: LeadReturnLocation }).returnTo
    : undefined;

  if (returnTo?.pathname !== "/leads") return "/leads";

  return `${returnTo.pathname}${returnTo.search || ""}${returnTo.hash || ""}`;
};
const LEGACY_UPLOAD_BASE_URL = "https://api.waqtmoney.com";

const isXmlLike = (value?: string) => {
  const text = String(value || "").trim();
  return /^<\??xml/i.test(text) || /^<OfflinePaperlessKyc/i.test(text) || /^<UidData/i.test(text);
};

const buildDocumentUploadUrl = (path: string) => {
  return resolveBackendUploadUrl(path);
};

const getDocumentHref = (value?: string) => {
  if (!value || isXmlLike(value)) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const normalizedValue = value.replace(/^\/+/, "");
  if (/^\/?uploads\//i.test(value)) {
    return buildDocumentUploadUrl(normalizedValue);
  }
  if (/^upload\/image\//i.test(normalizedValue)) {
    return `${LEGACY_UPLOAD_BASE_URL}/${normalizedValue}`;
  }
  return buildDocumentUploadUrl(normalizedValue);
};

const getFileName = (value?: string) => {
  if (!value || isXmlLike(value)) return "";
  return value.split(/[\\/]/).filter(Boolean).pop() || value;
};

const getLeadInitials = (name?: string) => String(name || "NA")
  .split(" ")
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join("") || "NA";

const getDocumentStorageLabel = (href?: string) => {
  const value = String(href || "").trim();
  if (!value) return "";
  if (value.startsWith("/uploads/")) return "CRM backend";

  try {
    const url = new URL(value);
    if (/waqtmoney\.com$/i.test(url.hostname) || /waqtfinance\.com$/i.test(url.hostname) || /geetpay\.(com|in)$/i.test(url.hostname)) {
      if (url.hostname.startsWith("payday")) return "CRM backend";
      return "Source website";
    }
    const backendUploads = /^https?:\/\//i.test(documentBaseUrl) ? new URL(documentBaseUrl) : null;
    if (url.pathname.startsWith("/uploads/") && (!backendUploads || url.host === backendUploads.host)) return "CRM backend";
    return "External";
  } catch {
    return "";
  }
};

const formatLoanAgreementStatus = (agreement?: LoanAgreement | null) => {
  if (!agreement) return "Not sent";

  const provider = String(agreement.providerStatus || "").toLowerCase();
  if (agreement.status === "signed" || provider.includes("complete") || provider.includes("signed")) {
    return agreement.signedPdfPath ? "Signed PDF archived" : "Signed, PDF pending";
  }
  if (agreement.status === "failed") return "Failed";
  if (agreement.status === "superseded") return "Superseded by revision";
  if (agreement.status === "sent" || provider.includes("requested")) return "Awaiting customer signature";
  if (agreement.status === "draft") return "Draft generated";
  return agreement.status || "In progress";
};

const formatDeliveryStatus = (value?: string) => {
  const status = String(value || "pending").trim().toLowerCase();
  if (status === "sent") return "Sent";
  if (status === "failed") return "Failed";
  if (status === "skipped") return "Skipped";
  return "Pending";
};

const deliveryStatusClasses = (value?: string) => {
  const status = String(value || "pending").trim().toLowerCase();
  if (status === "sent") return "border-green-200 bg-green-50 text-green-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "skipped") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
};

const isImageFile = (value?: string) => /\.(avif|gif|jpe?g|png|webp)$/i.test(value || "");
const isVideoFile = (value?: string) => /\.(mp4|webm|mov|3gp|mkv)$/i.test(value || "");

const hasUsableAadhaarData = (report: AadhaarReport | null) => Boolean(
  report?.isComplete ||
  (
    report?.fullName &&
    (report.aadhaarMasked || report.address || report.dob || report.gender || report.photoDataUrl)
  ),
);

const maskAadhaarNumber = (value?: string) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return digits;
  return `XXXXXXXX${digits.slice(-4)}`;
};

const isTransientProviderError = (value?: string) => (
  /handshake|timeout|timed?\s*out|network|socket|econn|fetch failed/i.test(String(value || ""))
);

const providerRecoveryMessage = (product: "Aadhaar" | "CIBIL", value?: string) => {
  if (isTransientProviderError(value)) {
    return `${product} provider did not respond in time. No customer data was changed. Please retry in a few minutes.`;
  }

  if (/no\s+record|not\s+found/i.test(String(value || ""))) {
    return `${product} provider returned: ${value}. Please verify the customer mobile, PAN, and name against the consented details before retrying.`;
  }

  return value || `${product} request could not be completed. Please retry after checking the lead details.`;
};

const formatClockTime = (value?: string) => {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const getAnalysisItems = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const formatAnalysisValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "Not Available";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "Not Available";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.length ? value.map(formatAnalysisValue).join(", ") : "Not Available";
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== "")
      .map(([key, entryValue]) => `${key}: ${formatAnalysisValue(entryValue)}`)
      .join(" | ") || "Not Available";
  }
  return String(value);
};

const formatDpdFlag = (value: unknown) => {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return formatAnalysisValue(value);
};

function VerificationAlert({
  actionLabel,
  isActionLoading,
  message,
  onAction,
  title,
  tone = "error",
}: {
  actionLabel?: string;
  isActionLoading?: boolean;
  message: string;
  onAction?: () => void;
  title: string;
  tone?: "error" | "warning";
}) {
  const toneClasses = tone === "warning"
    ? "border-yellow-200 bg-yellow-50 text-yellow-900"
    : "border-red-200 bg-red-50 text-red-900";
  const buttonClasses = tone === "warning"
    ? "border-yellow-300 bg-white text-yellow-900 hover:bg-yellow-100"
    : "border-red-300 bg-white text-red-700 hover:bg-red-100";

  return (
    <div className={`rounded-lg border px-3 py-3 text-left ${toneClasses}`}>
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-5">{message}</p>
        </div>
      </div>
      {onAction && actionLabel && (
        <button
          type="button"
          onClick={onAction}
          disabled={isActionLoading}
          className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${buttonClasses}`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isActionLoading ? "animate-spin" : ""}`} />
          {isActionLoading ? "Retrying..." : actionLabel}
        </button>
      )}
    </div>
  );
}

function DetailSection({
  action,
  children,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <section className="lead-detail-section rounded-lg border bg-white shadow-sm">
      <div className="lead-detail-section-header flex items-center justify-between border-b px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0 text-slate-500" />
          <h3 className="truncate text-base font-semibold text-slate-950">{title}</h3>
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="lead-detail-fields divide-y">
        {children}
      </div>
    </section>
  );
}

function DetailField({
  children,
  className = "",
  icon: Icon,
  label,
  valueTone = "default",
}: {
  children: ReactNode;
  className?: string;
  icon?: ComponentType<{ className?: string }>;
  label: string;
  valueTone?: "default" | "success" | "strong" | "warning";
}) {
  const valueClasses = valueTone === "success"
    ? "font-semibold text-green-700"
    : valueTone === "warning"
      ? "font-semibold text-amber-700"
    : valueTone === "strong"
      ? "font-bold text-gray-950"
      : "font-medium text-slate-950";

  return (
    <div className={`grid min-w-0 grid-cols-1 gap-1 px-5 py-3.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start ${className}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" />}
        <span className="truncate">{label}</span>
      </div>
      <div className={`break-words text-sm leading-6 sm:text-base ${valueClasses}`}>
        {children}
      </div>
    </div>
  );
}

function SummaryMetric({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "success" | "warning" | "danger";
  value: ReactNode;
}) {
  const toneClasses = tone === "success"
    ? "border-green-200 bg-green-50 text-green-800"
    : tone === "warning"
      ? "border-yellow-200 bg-yellow-50 text-yellow-800"
      : tone === "danger"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-white text-slate-900";

  return (
    <div className={`rounded-lg border px-4 py-3 shadow-sm ${toneClasses}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 truncate text-lg font-bold">{value}</div>
    </div>
  );
}

function AuthenticatedImage({
  alt,
  className = "",
  src,
}: {
  alt: string;
  className?: string;
  src: string;
}) {
  const [displaySrc, setDisplaySrc] = useState("");
  const [fallbackSources, setFallbackSources] = useState<string[]>([]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let objectUrl = "";
    let isMounted = true;
    const value = src || "";

    setDisplaySrc("");
    setFallbackSources([]);
    setHasError(false);

    if (!value) {
      setHasError(true);
      return () => undefined;
    }

    const cachedObjectUrl = objectUrlCache.get(value);
    if (cachedObjectUrl) {
      setDisplaySrc(cachedObjectUrl);
      return () => undefined;
    }

    const isProtectedUpload = (() => {
      if (value.startsWith("/uploads/")) return true;
      try {
        const url = new URL(value);
        const documentBase = /^https?:\/\//i.test(documentBaseUrl) ? new URL(documentBaseUrl) : null;
        return Boolean(documentBase && url.host === documentBase.host && url.pathname.startsWith("/uploads/"));
      } catch {
        return false;
      }
    })();

    if (!isProtectedUpload || value.startsWith("data:")) {
      const sources = [value];
      try {
        const url = new URL(value);
        if (url.pathname.startsWith("/uploads/")) {
          if (url.hostname === "www.waqtfinance.com") {
            sources.push(`https://waqtfinance.com${url.pathname}${url.search}`);
          } else if (url.hostname === "waqtfinance.com") {
            sources.push(`https://www.waqtfinance.com${url.pathname}${url.search}`);
          }
        }
      } catch {
        // Non-URL image sources are rendered as-is.
      }
      const uniqueSources = Array.from(new Set(sources));
      setFallbackSources(uniqueSources);
      setDisplaySrc(uniqueSources[0] || value);
      return () => undefined;
    }

    apiGetBlob(value)
      .then((blob) => {
        if (!isMounted) return;
        objectUrl = URL.createObjectURL(blob);
        objectUrlCache.set(value, objectUrl);
        setDisplaySrc(objectUrl);
      })
      .catch(() => {
        if (isMounted) {
          const token = getAuthToken();
          if (token) {
            setDisplaySrc(`${value}${value.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`);
          } else {
            setHasError(true);
          }
        }
      });

    return () => {
      isMounted = false;
      if (objectUrl) {
        window.setTimeout(() => {
          if (objectUrlCache.get(value) === objectUrl) {
            objectUrlCache.delete(value);
            URL.revokeObjectURL(objectUrl);
          }
        }, 60_000);
      }
    };
  }, [src]);

  if (hasError) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-400 ${className}`}>
        <FileText className="h-5 w-5" />
      </div>
    );
  }

  if (!displaySrc) {
    return <div className={`animate-pulse bg-gray-100 ${className}`} aria-label={`Loading ${alt}`} />;
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={className}
      onError={() => {
        const currentIndex = fallbackSources.indexOf(displaySrc);
        const nextSource = currentIndex >= 0 ? fallbackSources[currentIndex + 1] : "";
        if (nextSource) {
          setDisplaySrc(nextSource);
          return;
        }
        setHasError(true);
      }}
    />
  );
}

function AuthenticatedVideo({
  className = "",
  src,
}: {
  className?: string;
  src: string;
}) {
  const [displaySrc, setDisplaySrc] = useState("");
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let objectUrl = "";
    let isMounted = true;
    const value = src || "";

    setDisplaySrc("");
    setHasError(false);

    if (!value) {
      setHasError(true);
      return () => undefined;
    }

    const cachedObjectUrl = objectUrlCache.get(value);
    if (cachedObjectUrl) {
      setDisplaySrc(cachedObjectUrl);
      return () => undefined;
    }

    const isProtectedUpload = value.startsWith("/uploads/") || (
      () => {
        try {
          const url = new URL(value);
          const documentBase = /^https?:\/\//i.test(documentBaseUrl) ? new URL(documentBaseUrl) : null;
          return Boolean(documentBase && url.host === documentBase.host && url.pathname.startsWith("/uploads/"));
        } catch {
          return false;
        }
      }
    )();

    if (!isProtectedUpload || value.startsWith("data:")) {
      setDisplaySrc(value);
      return () => undefined;
    }

    apiGetBlob(value)
      .then((blob) => {
        if (!isMounted) return;
        objectUrl = URL.createObjectURL(blob);
        objectUrlCache.set(value, objectUrl);
        setDisplaySrc(objectUrl);
      })
      .catch(() => {
        if (isMounted) {
          const token = getAuthToken();
          if (token) {
            setDisplaySrc(`${value}${value.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`);
          } else {
            setHasError(true);
          }
        }
      });

    return () => {
      isMounted = false;
      if (objectUrl) {
        window.setTimeout(() => {
          if (objectUrlCache.get(value) === objectUrl) {
            objectUrlCache.delete(value);
            URL.revokeObjectURL(objectUrl);
          }
        }, 60_000);
      }
    };
  }, [src]);

  if (hasError) {
    return (
      <div className={`flex flex-col items-center justify-center bg-gray-900 text-gray-400 p-4 ${className}`}>
        <FileText className="h-8 w-8 text-red-500" />
        <span className="text-sm mt-2">Unable to load Video KYC file</span>
      </div>
    );
  }

  if (!displaySrc) {
    return (
      <div className={`flex flex-col items-center justify-center bg-gray-900 text-gray-400 p-4 animate-pulse ${className}`}>
        <span className="text-sm">Loading video...</span>
      </div>
    );
  }

  return (
    <video
      src={displaySrc}
      controls
      autoPlay
      playsInline
      className={className}
    />
  );
}

function ReadinessRow({
  isComplete,
  label,
}: {
  isComplete: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {isComplete ? (
        <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
      )}
    </div>
  );
}

function SanctionInput({
  label,
  onChange,
  readOnly,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="block text-sm font-medium text-gray-600">
      {label}
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${readOnly ? "border-gray-200 bg-gray-50 text-gray-700" : "border-gray-300 bg-white text-gray-950"
          }`}
      />
    </label>
  );
}

const leadDetailsResourceCache = new Map<string, SuspenseResource<LeadDetailsResourceResult>>();

const createLeadDetailsResource = (leadId?: string): SuspenseResource<LeadDetailsResourceResult> => {
  if (!leadId) {
    return {
      read: () => ({
        apiError: "Lead ID is missing.",
        lead: emptyLead(),
      }),
    };
  }

  let status: "pending" | "success" = "pending";
  let result: LeadDetailsResourceResult;

  const request = apiGet<Lead>(`/leads/${encodeURIComponent(leadId)}`)
    .then((data) => {
      status = "success";
      result = {
        apiError: "",
        lead: toLeadViewModel(data, leadId),
      };
    })
    .catch((error) => {
      status = "success";
      result = {
        apiError: error instanceof Error ? error.message : "Unable to load lead details",
        lead: emptyLead(leadId),
      };
    });

  return {
    read: () => {
      if (status === "pending") {
        throw request;
      }

      return result;
    },
  };
};

const getLeadDetailsResource = (leadId?: string) => {
  const cacheKey = leadId || "__missing_lead_id__";
  const cachedResource = leadDetailsResourceCache.get(cacheKey);

  if (cachedResource) return cachedResource;

  const resource = createLeadDetailsResource(leadId);
  leadDetailsResourceCache.set(cacheKey, resource);
  return resource;
};

function LeadDetailsFallback() {
  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 animate-pulse">
        <div className="mb-4 h-5 w-28 rounded bg-gray-200" />
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-3">
            <div className="h-9 w-64 rounded bg-gray-200" />
            <div className="h-4 w-36 rounded bg-gray-100" />
          </div>
          <div className="flex gap-3">
            <div className="h-10 w-32 rounded-lg bg-gray-200" />
            <div className="h-10 w-28 rounded-lg bg-gray-200" />
          </div>
        </div>
      </div>
      <div className="mb-6 flex gap-8 border-b border-gray-200">
        <div className="h-10 w-16 animate-pulse rounded bg-gray-100" />
        <div className="h-10 w-24 animate-pulse rounded bg-gray-100" />
        <div className="h-10 w-20 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {[0, 1].map((item) => (
            <div key={item} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-5 h-6 w-48 animate-pulse rounded bg-gray-200" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[0, 1, 2, 3, 4, 5].map((row) => (
                  <div key={row} className="space-y-2">
                    <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
                    <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-6">
          {[0, 1].map((item) => (
            <div key={item} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-5 h-6 w-36 animate-pulse rounded bg-gray-200" />
              <div className="space-y-4">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="h-10 animate-pulse rounded bg-gray-100" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function useAadhaarReport(leadId?: string) {
  const [report, setReport] = useState<AadhaarReport | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const reportPath = leadId ? `/leads/${encodeURIComponent(leadId)}/aadhaar-report` : "";

  const loadReport = async (signal?: AbortSignal) => {
    if (!reportPath) return null;

    const separator = reportPath.includes("?") ? "&" : "?";
    const data = await apiGet<AadhaarReport | null>(`${reportPath}${separator}t=${Date.now()}`, signal);
    setReport(data);
    return data;
  };

  useEffect(() => {
    if (!reportPath) return;

    const controller = new AbortController();
    setError("");

    loadReport(controller.signal)
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : "Unable to load Aadhaar data");
        }
      });

    return () => controller.abort();
  }, [reportPath]);

  const requestReport = async () => {
    if (!reportPath) return;

    try {
      setIsSubmitting(true);
      setError("");
      const nextReport = await apiPost<AadhaarReport>(reportPath, {});
      setReport(nextReport);
      const latestReport = await loadReport();

      if (!hasUsableAadhaarData(latestReport || nextReport)) {
        setError("Aadhaar data refreshed, but provider response is still missing DOB, gender, address, and photo.");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to fetch Aadhaar data");
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    aadhaarError: error,
    aadhaarReport: report,
    isAadhaarLoading: isSubmitting,
    requestAadhaarReport: requestReport,
  };
}

function useCibilReport(leadId?: string) {
  const [report, setReport] = useState<CibilReport | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPollingRefresh, setIsPollingRefresh] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState("");
  const [retryGraceUntil, setRetryGraceUntil] = useState(0);
  const [error, setError] = useState("");

  const reportPath = leadId ? `/leads/${encodeURIComponent(leadId)}/cibil-report` : "";
  const isRetryGraceActive = retryGraceUntil > Date.now();
  const effectiveReport = report && isRetryGraceActive && !report.pdfUrl && report.status === "pending"
    ? { ...report, isStale: false, message: "CIBIL request submitted. Waiting for report URL." }
    : report;
  const isAnalysisProcessing = effectiveReport?.analysisStatus === "processing";
  const isPending = Boolean(effectiveReport && ((!effectiveReport.pdfUrl && effectiveReport.status !== "failed" && !effectiveReport.isStale) || isAnalysisProcessing));
  const shouldPoll = Boolean(effectiveReport && ((!effectiveReport.pdfUrl && effectiveReport.status === "pending") || isAnalysisProcessing));
  const pollIntervalMs = effectiveReport?.isStale ? CIBIL_DELAYED_POLL_INTERVAL_MS : CIBIL_POLL_INTERVAL_MS;

  useEffect(() => {
    if (!reportPath) return;

    const controller = new AbortController();
    setError("");

    apiGet<CibilReport | null>(reportPath, controller.signal)
      .then((data) => {
        if (data) setReport(data);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : "Unable to load CIBIL report");
        }
      });

    return () => controller.abort();
  }, [reportPath]);

  useEffect(() => {
    if (!reportPath || !shouldPoll) return;

    let isMounted = true;

    const pollOnce = () => {
      setIsPollingRefresh(true);
      apiGet<CibilReport | null>(reportPath)
        .then((data) => {
          if (!isMounted) return;
          setLastCheckedAt(new Date().toISOString());
          if (data) {
            setReport(data);
            if (data.pdfUrl || data.status === "failed") setRetryGraceUntil(0);
            if (data.pdfUrl) setError("");
          }
        })
        .catch((requestError) => {
          if (!isMounted) return;
          setLastCheckedAt(new Date().toISOString());
          setError(requestError instanceof Error ? requestError.message : "Unable to refresh CIBIL report");
        })
        .finally(() => {
          if (!isMounted) return;
          setIsPollingRefresh(false);
        });
    };

    pollOnce();
    const intervalId = window.setInterval(pollOnce, pollIntervalMs);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      setIsPollingRefresh(false);
    };
  }, [reportPath, shouldPoll, pollIntervalMs]);

  const requestReport = async () => {
    if (!reportPath) return;

    try {
      setIsSubmitting(true);
      setError("");
      const graceUntil = Date.now() + CIBIL_RETRY_GRACE_MS;
      setRetryGraceUntil(graceUntil);
      setReport((currentReport) => currentReport
        ? {
          ...currentReport,
          status: "pending",
          isStale: false,
          message: "CIBIL request submitted. Waiting for report URL.",
          pendingRetryAt: new Date(graceUntil).toISOString(),
        }
        : currentReport);
      const nextReport = await apiPost<CibilReport>(reportPath, {});
      setReport(nextReport);
      if (nextReport.pdfUrl || nextReport.status === "failed") setRetryGraceUntil(0);
    } catch (requestError) {
      setRetryGraceUntil(0);
      setError(requestError instanceof Error ? requestError.message : "Unable to fetch CIBIL report");
    } finally {
      setIsSubmitting(false);
    }
  };

  const analyzeReport = async () => {
    if (!reportPath) return;

    try {
      setIsAnalyzing(true);
      setError("");
      setReport((currentReport) => currentReport
        ? { ...currentReport, analysisStatus: "processing", analysisError: "" }
        : currentReport);
      const nextReport = await apiPost<CibilReport>(`${reportPath}/analyze`, {});
      setReport(nextReport);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to analyze CIBIL report");
      throw requestError;
    } finally {
      setIsAnalyzing(false);
    }
  };

  return {
    analyzeCibilReport: analyzeReport,
    cibilError: error,
    cibilReport: effectiveReport,
    isCibilAnalyzing: isAnalyzing,
    isCibilLoading: isSubmitting,
    isCibilPending: isPending,
    isCibilPolling: shouldPoll,
    isCibilPollingRefresh: isPollingRefresh,
    cibilLastCheckedAt: lastCheckedAt,
    cibilPollIntervalMs: pollIntervalMs,
    requestCibilReport: requestReport,
  };
}

function useLeadActivities(leadId?: string) {
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const activitiesPath = leadId ? `/leads/${encodeURIComponent(leadId)}/activities` : "";

  const loadActivities = async (signal?: AbortSignal) => {
    if (!activitiesPath) {
      setActivities([]);
      setIsLoading(false);
      return [];
    }

    const data = await apiGet<LeadActivity[]>(activitiesPath, signal);
    setActivities(data);
    return data;
  };

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError("");

    loadActivities(controller.signal)
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : "Unable to load activity timeline");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [activitiesPath]);

  const refreshActivities = async () => {
    try {
      setError("");
      await loadActivities();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to refresh activity timeline");
    }
  };

  const addNote = async (description: string) => {
    if (!activitiesPath) return;

    try {
      setIsSaving(true);
      setError("");
      const activity = await apiPost<LeadActivity>(activitiesPath, {
        description,
        type: "note",
        user: "CRM User",
      });
      setActivities((currentActivities) => [activity, ...currentActivities]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save activity note");
      throw requestError;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    activities,
    activityError: error,
    addActivityNote: addNote,
    isActivityLoading: isLoading,
    isActivitySaving: isSaving,
    refreshActivities,
  };
}

function LeadDetailsContent({ leadId }: { leadId?: string }) {
  const initialState = getLeadDetailsResource(leadId).read();
  const { user, activeRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const currentRole = activeRole || user?.role || "telecaller";
  const canRemoveLeads = currentRole === "superadmin" || currentRole === "product-admin";

  const isTelecallerRole = currentRole === "telecaller";
  const isCreditManagerRole = currentRole === "credit-manager";
  const isAccountantRole = currentRole === "accountant";
  const isProductAdminRole = currentRole === "product-admin";
  const isSuperadminRole = currentRole === "superadmin";

  const isSupportUser = useMemo(() => {
    if (!user) return false;
    const email = String(user.email || "").toLowerCase();
    const name = String(user.name || "").toLowerCase();
    return email.startsWith("support@") || email.includes("support") || name.includes("support");
  }, [user]);

  const isLeadAssignedToTelecaller = useCallback((assignedTo?: string, currentUser?: { name?: string; email?: string } | null) => {
    if (!assignedTo || !currentUser) return false;
    const assigned = String(assignedTo).trim().toLowerCase();
    if (["unassigned", "intake queue", "none", "", "null", "undefined"].includes(assigned)) {
      return false;
    }

    const userName = String(currentUser.name || "").trim().toLowerCase();
    const userEmail = String(currentUser.email || "").trim().toLowerCase();
    const userEmailPrefix = userEmail.includes("@") ? userEmail.split("@")[0].trim() : "";

    if (userName && (assigned === userName || userName.includes(assigned) || assigned.includes(userName))) {
      return true;
    }
    if (userEmail && (assigned === userEmail || userEmail.includes(assigned))) {
      return true;
    }
    if (userEmailPrefix && (assigned === userEmailPrefix || userEmailPrefix.includes(assigned) || assigned.includes(userEmailPrefix))) {
      return true;
    }

    return false;
  }, []);

  const [lead, setLead] = useState<LeadViewModel>(initialState.lead);

  const isAssignedToOtherTelecaller = useMemo(() => {
    if (!isTelecallerRole || isSupportUser) return false;
    if (!lead.assignedTo) return false;
    const assigned = lead.assignedTo.trim().toLowerCase();
    if (["unassigned", "intake queue", "none", "", "null", "undefined", "credit manager", "credit-manager"].includes(assigned) || assigned.includes("shruti")) {
      return false;
    }
    return !isLeadAssignedToTelecaller(lead.assignedTo, user);
  }, [isTelecallerRole, isSupportUser, isLeadAssignedToTelecaller, lead.assignedTo, user]);

  const otherTelecallerWarning = useMemo(() => {
    const assignedName = lead.assignedTo && !["unassigned", "intake queue", "none", "", "null", "undefined"].includes(lead.assignedTo.trim().toLowerCase())
      ? `"${lead.assignedTo}"`
      : "another telecaller";
    return `This lead is assigned to ${assignedName}. You cannot perform actions on leads assigned to another telecaller.`;
  }, [lead.assignedTo]);

  const [showOtherTelecallerAlertModal, setShowOtherTelecallerAlertModal] = useState(false);

  useEffect(() => {
    if (isAssignedToOtherTelecaller) {
      setShowOtherTelecallerAlertModal(true);
    }
  }, [isAssignedToOtherTelecaller]);

  const leadReturnHref = getLeadReturnHref(location.state, location.search);
  const [activeTab, setActiveTab] = useState("details");
  const [showCAMSheet, setShowCAMSheet] = useState(false);
  const [showSanctionModal, setShowSanctionModal] = useState(false);
  const [apiError] = useState(initialState.apiError);
  const [statusError, setStatusError] = useState("");
  const [isStatusSaving, setIsStatusSaving] = useState(false);
  const [isInitiating, setIsInitiating] = useState(false);
  const [isOfficialEmailModalOpen, setIsOfficialEmailModalOpen] = useState(false);
  const [officialEmailVerified, setOfficialEmailVerified] = useState<boolean>(Boolean(initialState.lead?.officialEmailVerified));
  const [officialEmailVerifiedAt, setOfficialEmailVerifiedAt] = useState<string>(initialState.lead?.officialEmailVerifiedAt || "");
  const [officialEmailVerifiedBy, setOfficialEmailVerifiedBy] = useState<string>(initialState.lead?.officialEmailVerifiedBy || "");
  const [officialEmailMasked, setOfficialEmailMasked] = useState<string>("");

  const [showAddReferenceModal, setShowAddReferenceModal] = useState(false);
  const [isAddingReference, setIsAddingReference] = useState(false);
  const [newRefName, setNewRefName] = useState("");
  const [newRefRelation, setNewRefRelation] = useState("");
  const [newRefMobile, setNewRefMobile] = useState("");

  const handleAddReferenceSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (isAssignedToOtherTelecaller) {
      toast.warning(otherTelecallerWarning);
      return;
    }

    const name = newRefName.trim();
    const mobile = newRefMobile.trim();
    const relation = newRefRelation.trim();

    if (!name) {
      toast.error("Please enter reference full name");
      return;
    }
    if (!relation) {
      toast.error("Please enter relationship");
      return;
    }
    if (!mobile) {
      toast.error("Please enter reference mobile number");
      return;
    }
    const cleanDigits = mobile.replace(/\D/g, "");
    if (cleanDigits.length < 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }

    const targetLeadId = lead?.id || leadId;
    if (!targetLeadId) {
      toast.error("Lead ID not found");
      return;
    }

    setIsAddingReference(true);
    try {
      const response = await apiPost<{ success: boolean; lead: Lead; message?: string }>(
        `/leads/${encodeURIComponent(targetLeadId)}/add-reference`,
        {
          fullName: name,
          relation: relation || "Reference",
          mobile: mobile,
          leadId: targetLeadId,
          applicationId: targetLeadId,
        }
      );

      if (response && response.lead) {
        applyUpdatedLead(response.lead);
      } else {
        const nextType = (lead?.references?.length || 0) === 0
          ? "primary"
          : (lead?.references?.length || 0) === 1
          ? "secondary"
          : `reference_${(lead?.references?.length || 0) + 1}`;
        setLead((prev) => ({
          ...prev,
          references: [
            ...(prev?.references || []),
            {
              id: `ref-${Date.now()}`,
              fullName: name,
              relation: relation || "Reference",
              mobile: mobile,
              referenceType: nextType,
            },
          ],
        }));
      }

      toast.success(response?.message || "Reference added successfully");
      setShowAddReferenceModal(false);
      setNewRefName("");
      setNewRefRelation("");
      setNewRefMobile("");
      refreshActivities();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add reference";
      toast.error(message);
    } finally {
      setIsAddingReference(false);
    }
  };

  useEffect(() => {
    if (lead) {
      setOfficialEmailVerified(Boolean(lead.officialEmailVerified));
      if (lead.officialEmailVerifiedAt) setOfficialEmailVerifiedAt(lead.officialEmailVerifiedAt);
      if (lead.officialEmailVerifiedBy) setOfficialEmailVerifiedBy(lead.officialEmailVerifiedBy);
    }
  }, [lead]);

  const handleInitiateOfficialEmailVerify = async () => {
    const currentEmail = (lead.officeEmail || lead.officialEmail || lead.email || "").trim().toLowerCase();
    const domain = currentEmail.split("@")[1] || "";
    const freeProviders = ["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "hotmail.com", "outlook.com", "live.com", "icloud.com", "rediffmail.com", "aol.com", "zoho.com", "protonmail.com"];

    if (freeProviders.some((p) => domain.includes(p))) {
      toast.error(`Cannot verify '${currentEmail}': Personal email domains (@${domain}) are not allowed. Please click "Edit Email" to enter a valid corporate company email.`);
      return;
    }

    fetchDomainIntelligence(currentEmail);

    try {
      const res = await apiPost<{ success: boolean; maskedEmail: string; message?: string }>("/credit/official-email/send-otp", {
        applicationId: lead.id,
      });
      if (res.maskedEmail) {
        setOfficialEmailMasked(res.maskedEmail);
      }
      if (res.message) {
        toast.info(res.message);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send verification OTP");
      return;
    }
    setIsOfficialEmailModalOpen(true);
  };

  const handleOfficialEmailVerifiedSuccess = (data: { officialEmailVerifiedAt: string; officialEmailVerifiedBy: string }) => {
    setOfficialEmailVerified(true);
    setOfficialEmailVerifiedAt(data.officialEmailVerifiedAt);
    setOfficialEmailVerifiedBy(data.officialEmailVerifiedBy);
    setLead((prev) => ({
      ...prev,
      officialEmailVerified: 1,
      officialEmailVerifiedAt: data.officialEmailVerifiedAt,
      officialEmailVerifiedBy: data.officialEmailVerifiedBy,
    }));
    fetchDomainIntelligence();
    toast.success("Official Email verified successfully");
  };

  const [aaSession, setAaSession] = useState<any>(null);
  const [aaAnalytics, setAaAnalytics] = useState<any>(null);
  const [isAaLoading, setIsAaLoading] = useState(true);
  const [isAaGenerating, setIsAaGenerating] = useState(false);
  const [isAaSendingWa, setIsAaSendingWa] = useState(false);
  const [isAaRefreshing, setIsAaRefreshing] = useState(false);
  const [showAaStatementModal, setShowAaStatementModal] = useState(false);
  const [selectedAaAccountIndex, setSelectedAaAccountIndex] = useState(0);

  const activeAnalytics = aaAnalytics;

  const [showPostSanctionRejectDialog, setShowPostSanctionRejectDialog] = useState(false);
  const [postSanctionRejectEmail, setPostSanctionRejectEmail] = useState("");
  const [postSanctionRejectSubject, setPostSanctionRejectSubject] = useState("");
  const [postSanctionRejectBody, setPostSanctionRejectBody] = useState("");
  const [postSanctionRejectReason, setPostSanctionRejectReason] = useState("");
  const [isPostSanctionRejecting, setIsPostSanctionRejecting] = useState(false);
  const [postSanctionRejectError, setPostSanctionRejectError] = useState("");

  const openPostSanctionRejectModal = () => {
    const defaultEmail = latestSanction?.emailTo || lead.email || "";
    const defaultSubject = `Loan Application Rejection Notice - ${latestSanction?.agreementNumber || lead.id}`;
    const defaultBody = `Dear ${latestSanction?.borrower || lead.name || "Customer"},\n\nWe regret to inform you that upon final verification of your loan application (Agreement No: ${latestSanction?.agreementNumber || "N/A"}), your loan request has been rejected and cancelled.\n\nReason: Underwriting policy update.\n\nIf you have any questions or require clarification, please feel free to contact us.\n\nRegards,\nCredit Department\nWaqt Finance`;
    setPostSanctionRejectEmail(defaultEmail);
    setPostSanctionRejectSubject(defaultSubject);
    setPostSanctionRejectBody(defaultBody);
    setPostSanctionRejectReason("Rejected post-sanction review");
    setPostSanctionRejectError("");
    setShowPostSanctionRejectDialog(true);
  };

  const handlePostSanctionReject = async () => {
    if (!postSanctionRejectSubject.trim()) {
      setPostSanctionRejectError("Email subject is required.");
      return;
    }
    if (!postSanctionRejectBody.trim()) {
      setPostSanctionRejectError("Email body message is required.");
      return;
    }
    setIsPostSanctionRejecting(true);
    setPostSanctionRejectError("");
    try {
      await apiPost<{ lead: Lead; sanction: SanctionLetter }>(
        `/leads/${encodeURIComponent(lead.id)}/sanction/reject-post-sanction`,
        {
          emailTo: postSanctionRejectEmail.trim(),
          emailSubject: postSanctionRejectSubject.trim(),
          emailBody: postSanctionRejectBody.trim(),
          reason: postSanctionRejectReason.trim(),
        }
      );
      toast.success("Loan rejected post-sanction and rejection email sent to customer");
      setShowPostSanctionRejectDialog(false);
      setLead((prev) => ({ ...prev, status: "Lost" }));
      refreshActivities();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to reject loan post-sanction";
      setPostSanctionRejectError(msg);
    } finally {
      setIsPostSanctionRejecting(false);
    }
  };

  const loadAaStatus = useCallback(async (isInitial = false) => {
    if (!leadId) return;
    if (isInitial) setIsAaLoading(true);
    try {
      const res = await apiGet<any>(`/account-aggregator/leads/${encodeURIComponent(leadId)}/status`);
      const payload = res?.data || res;
      if (payload && (payload.hasSession || payload.session || payload.status === "ACTIVE" || payload.status === "PENDING")) {
        const sessionObj = payload.session || (payload.hasSession ? payload : null);
        if (sessionObj) setAaSession(sessionObj);
        if (payload.analytics) setAaAnalytics(payload.analytics);
      } else {
        setAaSession(null);
        setAaAnalytics(null);
      }
    } catch (err: any) {
      console.error("Error loading AA status:", err);
    } finally {
      setIsAaLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    loadAaStatus(true);
  }, [loadAaStatus]);

  useEffect(() => {
    if (aaSession?.status !== "PENDING") return;
    const interval = setInterval(() => {
      loadAaStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [aaSession?.status, loadAaStatus]);

  const handleGenerateAaUrl = async () => {
    if (!leadId) return;
    setIsAaGenerating(true);
    try {
      const res = await apiPost<any>(`/account-aggregator/leads/${encodeURIComponent(leadId)}/generate-url`, {
        sendWhatsApp: true,
      });
      toast.success(res.isMock ? "AA Flow link generated (UAT Mock Mode)" : "AA Flow Link generated and sent via WhatsApp!");
      await loadAaStatus();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate AA link");
    } finally {
      setIsAaGenerating(false);
    }
  };

  const handleSendAaWhatsApp = async () => {
    if (!leadId) return;
    setIsAaSendingWa(true);
    try {
      await apiPost(`/account-aggregator/leads/${encodeURIComponent(leadId)}/send-whatsapp`, {});
      toast.success("AA Consent link sent to borrower via WhatsApp & Email");
    } catch (err: any) {
      toast.error(err.message || "Failed to send WhatsApp & Email message");
    } finally {
      setIsAaSendingWa(false);
    }
  };

  const handleResetAaSession = async () => {
    if (!leadId) return;
    if (!window.confirm("Are you sure you want to clear/reset the Account Aggregator session for this lead?")) return;
    try {
      await apiPost(`/account-aggregator/leads/${encodeURIComponent(leadId)}/reset`, {});
      setAaSession(null);
      setAaAnalytics(null);
      toast.success("Account Aggregator session reset to Not Initiated");
    } catch (err: any) {
      toast.error(err.message || "Failed to reset AA session");
    }
  };

  const handleDownloadAaCsv = (
    account: any,
    transactions: any[],
    analyticsInfo: { credits: number; debits: number; cashFlow: any; aaAnalytics: any }
  ) => {
    if (!lead) return;
    try {
      const bankName = account?.bankName || lead.bankName || "Bank";
      const maskedAcc = account?.maskedAccNumber || (lead.accountNumber ? `XXXX${lead.accountNumber.slice(-4)}` : "XXXX");
      const accType = account?.accountType || "SAVINGS";
      const ifsc = account?.ifscCode || lead.ifscCode || "N/A";
      const leadName = lead.name || "Customer";
      const leadIdVal = lead.id || "";
      const nowStr = new Date().toLocaleString("en-IN");

      const rows: string[][] = [
        ["WAQT FINANCE - BANK ACCOUNT STATEMENT & CASH FLOW ANALYSIS REPORT"],
        ["Verified by CRIF Finvu Account Aggregator (RBI Regulated)"],
        [""],
        ["=== APPLICANT & BANK ACCOUNT DETAILS ==="],
        ["Applicant Name", leadName],
        ["Lead ID", leadIdVal],
        ["Mobile Number", lead.mobile || lead.phone || "N/A"],
        ["PAN Number", lead.pan || "N/A"],
        ["Bank Name", bankName],
        ["Account Number", maskedAcc],
        ["Account Type", accType],
        ["IFSC Code", ifsc],
        ["Consent / Sync Status", account?.status || "ACTIVE"],
        ["Report Exported On", nowStr],
        [""],
        ["=== FINANCIAL & UNDERWRITING SUMMARY ==="],
        ["Average Monthly Credits (INR)", String(analyticsInfo.credits || 0)],
        ["Average Monthly Debits (INR)", String(analyticsInfo.debits || 0)],
        [
          "Salary Verification",
          analyticsInfo.aaAnalytics?.salaryDetected
            ? `Detected (₹${analyticsInfo.aaAnalytics.avgSalary || 0}/mo)`
            : "Not Detected",
        ],
        ["Detected Employer", analyticsInfo.cashFlow?.detectedEmployer || "N/A"],
        [
          "CRIF Underwriting Score",
          analyticsInfo.aaAnalytics?.riskScore || analyticsInfo.cashFlow?.riskIndicatorScore || "LOW_RISK",
        ],
        ["NACH / Cheque Bounces", String(analyticsInfo.aaAnalytics?.bouncesCount || 0)],
        ["Total Transaction Records", String(transactions.length)],
        [""],
        ["=== BANK STATEMENT TRANSACTION LEDGER ==="],
        ["Date", "Transaction Narration", "Type", "Amount (INR)", "Ending Balance (INR)"],
      ];

      transactions.forEach((tx) => {
        rows.push([
          tx.date || "",
          tx.narration || "",
          tx.type || "",
          tx.amount !== undefined ? String(tx.amount) : "0",
          tx.balance !== undefined ? String(tx.balance) : "",
        ]);
      });

      const csvContent =
        "\uFEFF" +
        rows
          .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
          .join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeBank = bankName.replace(/[^a-zA-Z0-9]/g, "_");
      link.href = url;
      link.download = `AA_Statement_${leadIdVal}_${safeBank}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Bank statement CSV downloaded successfully");
    } catch (err: any) {
      console.error("Failed to export AA CSV:", err);
      toast.error("Failed to export statement CSV: " + (err.message || "Unknown error"));
    }
  };

  const handleDownloadAaPdf = (
    account: any,
    transactions: any[],
    analyticsInfo: { credits: number; debits: number; cashFlow: any; aaAnalytics: any }
  ) => {
    if (!lead) return;
    try {
      const bankName = account?.bankName || lead.bankName || "Bank";
      const maskedAcc = account?.maskedAccNumber || (lead.accountNumber ? `XXXX${lead.accountNumber.slice(-4)}` : "XXXX");
      const accType = account?.accountType || "SAVINGS";
      const ifsc = account?.ifscCode || lead.ifscCode || "N/A";
      const leadName = lead.name || "Customer";
      const leadIdVal = lead.id || "";
      const printDate = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

      const printWindow = window.open("", "_blank", "width=1000,height=900");
      if (!printWindow) {
        toast.error("Pop-up blocked. Please allow pop-ups for this site to print/save the statement as PDF.");
        return;
      }

      const rowsHtml = transactions
        .map((tx, idx) => {
          const isCredit = tx.type === "CREDIT";
          const typeStyle = isCredit
            ? "background-color: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0;"
            : "background-color: #fff1f2; color: #9f1239; border: 1px solid #fecdd3;";
          const amtStyle = isCredit ? "color: #059669; font-weight: 700;" : "color: #1e293b; font-weight: 600;";
          const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
          const formattedAmt = Number(tx.amount || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          const formattedBal =
            tx.balance !== undefined && tx.balance !== null && tx.balance !== ""
              ? "₹" + Number(tx.balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : "-";

          return `
            <tr style="background-color: ${bg};">
              <td style="padding: 7px 10px; font-family: monospace; font-size: 11px; color: #475569; white-space: nowrap; border-bottom: 1px solid #e2e8f0;">${tx.date || "-"}</td>
              <td style="padding: 7px 10px; font-size: 11px; color: #0f172a; border-bottom: 1px solid #e2e8f0; word-break: break-word;">${tx.narration || "-"}</td>
              <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">
                <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; ${typeStyle}">${tx.type}</span>
              </td>
              <td style="padding: 7px 10px; font-size: 11px; text-align: right; border-bottom: 1px solid #e2e8f0; ${amtStyle}">₹${formattedAmt}</td>
              <td style="padding: 7px 10px; font-family: monospace; font-size: 11px; text-align: right; color: #475569; border-bottom: 1px solid #e2e8f0;">${formattedBal}</td>
            </tr>
          `;
        })
        .join("");

      const creditsFormatted = Number(analyticsInfo.credits || 0).toLocaleString("en-IN");
      const debitsFormatted = Number(analyticsInfo.debits || 0).toLocaleString("en-IN");
      const salaryText = analyticsInfo.aaAnalytics?.salaryDetected
        ? `Detected (₹${Number(analyticsInfo.aaAnalytics.avgSalary || 0).toLocaleString("en-IN")}/mo)`
        : "Not Detected";

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>Bank Statement - ${leadName} (${leadIdVal})</title>
          <style>
            @page {
              size: A4;
              margin: 12mm 10mm;
            }
            * { box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 24px;
              background: #ffffff;
              font-size: 12px;
              line-height: 1.4;
            }
            .no-print-bar {
              display: flex;
              justify-content: space-between;
              align-items: center;
              background: #0f172a;
              color: #ffffff;
              padding: 12px 20px;
              border-radius: 10px;
              margin-bottom: 24px;
              box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
            }
            .no-print-bar button {
              cursor: pointer;
              border: none;
              padding: 8px 16px;
              border-radius: 6px;
              font-weight: 700;
              font-size: 13px;
              transition: all 0.2s;
            }
            .btn-primary { background: #4f46e5; color: #ffffff; margin-right: 8px; }
            .btn-primary:hover { background: #4338ca; }
            .btn-secondary { background: #334155; color: #ffffff; }
            .btn-secondary:hover { background: #475569; }
            .header-box {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              padding-bottom: 16px;
              border-bottom: 2px solid #e2e8f0;
              margin-bottom: 16px;
            }
            .brand-title {
              font-size: 20px;
              font-weight: 800;
              color: #1e1b4b;
              letter-spacing: -0.5px;
              margin: 0 0 4px 0;
            }
            .brand-subtitle {
              font-size: 12px;
              color: #64748b;
              margin: 0;
            }
            .badge-verified {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              background: #ecfdf5;
              color: #047857;
              border: 1px solid #a7f3d0;
              padding: 5px 12px;
              border-radius: 20px;
              font-size: 11px;
              font-weight: 700;
            }
            .grid-2 {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 16px;
              margin-bottom: 16px;
            }
            .card {
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 12px 14px;
              background: #f8fafc;
            }
            .card-title {
              font-size: 10px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #64748b;
              margin-bottom: 8px;
            }
            .info-table { width: 100%; border-collapse: collapse; }
            .info-table td { padding: 3px 0; font-size: 11.5px; }
            .info-label { color: #64748b; width: 40%; }
            .info-val { color: #0f172a; font-weight: 600; }
            .metrics-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 12px;
              margin-bottom: 20px;
            }
            .metric-box {
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 10px;
              background: #ffffff;
            }
            .metric-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; }
            .metric-val { font-size: 15px; font-weight: 800; margin-top: 4px; }
            .ledger-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 8px;
            }
            .ledger-title {
              font-size: 12px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #334155;
            }
            table.ledger-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 11px;
              border: 1px solid #cbd5e1;
            }
            table.ledger-table th {
              background: #f1f5f9;
              color: #334155;
              font-weight: 700;
              padding: 8px 10px;
              text-align: left;
              border-bottom: 2px solid #cbd5e1;
            }
            .footer-box {
              margin-top: 24px;
              padding-top: 12px;
              border-top: 1px solid #e2e8f0;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 10px;
              color: #94a3b8;
            }
            @media print {
              .no-print-bar { display: none !important; }
              body { padding: 0; }
              .card { background: #ffffff !important; }
              table.ledger-table th { background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="no-print-bar">
            <div>
              <strong>Bank Statement & Cash Flow Report</strong>
              <span style="font-size: 11px; opacity: 0.8; margin-left: 8px;">Click "Print / Save PDF" to download as PDF</span>
            </div>
            <div>
              <button class="btn-primary" onclick="window.print()">🖨️ Print / Save as PDF</button>
              <button class="btn-secondary" onclick="window.close()">✕ Close</button>
            </div>
          </div>

          <div class="header-box">
            <div>
              <h1 class="brand-title">WAQT FINANCE</h1>
              <p class="brand-subtitle">Bank Account Statement & Cash-Flow Analysis Report</p>
            </div>
            <div style="text-align: right;">
              <div class="badge-verified">✓ Finvu CRIF Account Aggregator Verified</div>
              <p style="margin: 6px 0 0 0; font-size: 10px; color: #64748b;">Report Date: ${printDate}</p>
            </div>
          </div>

          <div class="grid-2">
            <div class="card">
              <div class="card-title">Applicant Details</div>
              <table class="info-table">
                <tr><td class="info-label">Name:</td><td class="info-val">${leadName}</td></tr>
                <tr><td class="info-label">Lead ID:</td><td class="info-val" style="font-family: monospace;">${leadIdVal}</td></tr>
                <tr><td class="info-label">Mobile:</td><td class="info-val">${lead.mobile || lead.phone || "N/A"}</td></tr>
                <tr><td class="info-label">PAN:</td><td class="info-val">${lead.pan || "N/A"}</td></tr>
              </table>
            </div>
            <div class="card">
              <div class="card-title">Bank Account Details</div>
              <table class="info-table">
                <tr><td class="info-label">Bank:</td><td class="info-val">${bankName}</td></tr>
                <tr><td class="info-label">Account No:</td><td class="info-val" style="font-family: monospace;">${maskedAcc}</td></tr>
                <tr><td class="info-label">Type:</td><td class="info-val">${accType}</td></tr>
                <tr><td class="info-label">IFSC Code:</td><td class="info-val" style="font-family: monospace;">${ifsc}</td></tr>
              </table>
            </div>
          </div>

          <div class="metrics-grid">
            <div class="metric-box" style="border-left: 3px solid #059669;">
              <div class="metric-label">Avg Monthly Credits</div>
              <div class="metric-val" style="color: #059669;">₹${creditsFormatted}</div>
            </div>
            <div class="metric-box" style="border-left: 3px solid #e11d48;">
              <div class="metric-label">Avg Monthly Debits</div>
              <div class="metric-val" style="color: #e11d48;">₹${debitsFormatted}</div>
            </div>
            <div class="metric-box" style="border-left: 3px solid #4f46e5;">
              <div class="metric-label">Salary Detection</div>
              <div class="metric-val" style="color: #4f46e5; font-size: 12px;">${salaryText}</div>
              <div style="font-size: 9.5px; color: #64748b; margin-top: 2px;">Employer: ${analyticsInfo.cashFlow?.detectedEmployer || "N/A"}</div>
            </div>
            <div class="metric-box" style="border-left: 3px solid #0284c7;">
              <div class="metric-label">Underwriting Risk</div>
              <div class="metric-val" style="color: #0284c7; font-size: 13px;">${analyticsInfo.aaAnalytics?.riskScore || analyticsInfo.cashFlow?.riskIndicatorScore || "LOW_RISK"}</div>
              <div style="font-size: 9.5px; color: #64748b; margin-top: 2px;">Bounces: ${analyticsInfo.aaAnalytics?.bouncesCount || 0} NACH/Cheque</div>
            </div>
          </div>

          <div>
            <div class="ledger-header">
              <span class="ledger-title">Bank Statement Transaction Ledger (${transactions.length} Records)</span>
            </div>
            <table class="ledger-table">
              <thead>
                <tr>
                  <th style="width: 130px;">Date</th>
                  <th>Transaction Narration</th>
                  <th style="width: 70px; text-align: center;">Type</th>
                  <th style="width: 110px; text-align: right;">Amount (₹)</th>
                  <th style="width: 120px; text-align: right;">Ending Balance (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml.length > 0 ? rowsHtml : '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #94a3b8;">No transaction records available.</td></tr>'}
              </tbody>
            </table>
          </div>

          <div class="footer-box">
            <span>Secured & verified via CRIF Orchestrator FIU Webservice • Confidential Financial Record</span>
            <span>Waqt Finance Credit Panel</span>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 400);
            };
          </script>
        </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      toast.success("Opening statement PDF / print preview...");
    } catch (err: any) {
      console.error("Failed to generate AA PDF:", err);
      toast.error("Failed to generate PDF: " + (err.message || "Unknown error"));
    }
  };
  const [isEditingOfficialEmail, setIsEditingOfficialEmail] = useState(false);
  const [editedOfficialEmail, setEditedOfficialEmail] = useState("");
  const [isSavingOfficialEmail, setIsSavingOfficialEmail] = useState(false);

  const handleSaveOfficialEmail = async () => {
    if (isAssignedToOtherTelecaller) {
      toast.warning(otherTelecallerWarning);
      return;
    }

    const trimmed = editedOfficialEmail.trim();
    if (!trimmed || !trimmed.includes("@") || !trimmed.includes(".")) {
      toast.error("Please enter a valid Official Email address.");
      return;
    }

    setIsSavingOfficialEmail(true);
    try {
      const res = await apiPost<{
        success: boolean;
        message: string;
        officeEmail: string;
      }>("/credit/official-email/update", {
        applicationId: lead.id,
        officialEmail: trimmed,
      });

      if (res.success) {
        setLead((prev) => ({
          ...prev,
          officeEmail: res.officeEmail || trimmed,
          officialEmail: res.officeEmail || trimmed,
          officialEmailVerified: 0,
          officialEmailVerifiedAt: undefined,
          officialEmailVerifiedBy: undefined,
        }));
        setOfficialEmailVerified(false);
        setOfficialEmailVerifiedAt("");
        setOfficialEmailVerifiedBy("");
        setIsEditingOfficialEmail(false);
        toast.success(res.message || "Official Email updated successfully");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update Official Email");
    } finally {
      setIsSavingOfficialEmail(false);
    }
  };

  const [isCreatingEmandateLink, setIsCreatingEmandateLink] = useState(false);
  const [isCheckingEmandateStatus, setIsCheckingEmandateStatus] = useState(false);
  const [showEmandateModal, setShowEmandateModal] = useState(false);
  const [emandateModalAmount, setEmandateModalAmount] = useState("");
  const [emandateModalProvider] = useState<"cashfree">("cashfree");
  const [emandateModalError, setEmandateModalError] = useState("");
  const [emandateBankName, setEmandateBankName] = useState("");
  const [emandateAccountNumber, setEmandateAccountNumber] = useState("");
  const [emandateIfscCode, setEmandateIfscCode] = useState("");

  const openEmandateModal = () => {
    const defaultAmount = lead.approvedAmount || lead.loanAmount || lead.emandateMaxAmount || 50000;
    setEmandateModalAmount(String(defaultAmount));
    setEmandateBankName(lead.bankName || "");
    setEmandateAccountNumber(lead.accountNumber || "");
    setEmandateIfscCode(lead.ifscCode || "");
    setEmandateModalError("");
    setShowEmandateModal(true);
  };

  const handleCreateEmandateLink = async () => {
    const parsedMaxAmount = Number(String(emandateModalAmount).replace(/\D/g, ''));
    if (!parsedMaxAmount || parsedMaxAmount < 5 || parsedMaxAmount > 100000) {
      setEmandateModalError("Please enter a valid mandate limit between ₹5 and ₹1,00,000");
      return;
    }

    setIsCreatingEmandateLink(true);
    setEmandateModalError("");
    try {
      const endpoint = "/credit/cashfree-emandate/create-link";
      const res = await apiPost<{
        success: boolean;
        message: string;
        emandateProvider?: string;
        emandateStatus: string;
        emandateId: string;
        emandateAuthUrl: string;
        emandateMaxAmount: number;
      }>(endpoint, {
        applicationId: lead.id,
        maxAmount: parsedMaxAmount,
        bankName: emandateBankName,
        accountNumber: emandateAccountNumber,
        ifscCode: emandateIfscCode,
      });

      if (res) {
        setLead((prev) => ({
          ...prev,
          bankName: emandateBankName || prev.bankName,
          accountNumber: emandateAccountNumber || prev.accountNumber,
          ifscCode: emandateIfscCode || prev.ifscCode,
          emandateProvider: "cashfree",
          emandateStatus: res.emandateStatus || "PENDING",
          emandateId: res.emandateId || prev.emandateId,
          emandateAuthUrl: res.emandateAuthUrl || prev.emandateAuthUrl,
          emandateMaxAmount: res.emandateMaxAmount || prev.emandateMaxAmount,
        }));
        toast.success(res.message || `Cashfree eMandate link generated for ₹${parsedMaxAmount.toLocaleString('en-IN')}`);
        setShowEmandateModal(false);
      }
    } catch (err: any) {
      const message = err.message || "Failed to create eMandate link";
      setEmandateModalError(message);
      toast.error(message);
    } finally {
      setIsCreatingEmandateLink(false);
    }
  };

  const handleCheckEmandateStatus = async () => {
    setIsCheckingEmandateStatus(true);
    try {
      const primaryEndpoint = `/credit/cashfree-emandate/status/${lead.id}`;

      let res: any = null;
      try {
        res = await apiGet(primaryEndpoint);
      } catch (firstErr) {
        // Fallback to universal status endpoint /credit/emandate/status/${lead.id}
        res = await apiGet(`/credit/emandate/status/${lead.id}`);
      }

      if (res) {
        const currentStatus = res.emandateStatus || res.status || "PENDING";
        setLead((prev) => ({
          ...prev,
          emandateStatus: currentStatus,
          emandateId: res.emandateId || prev.emandateId,
          emandateBankName: res.emandateBankName || prev.emandateBankName,
          emandatePaymentMode: res.emandatePaymentMode || prev.emandatePaymentMode,
          emandateUpiId: res.emandateUpiId || prev.emandateUpiId,
          emandateAccountNumber: res.emandateAccountNumber || prev.emandateAccountNumber,
          emandateMaxAmount: res.emandateMaxAmount || prev.emandateMaxAmount,
          emandateRegisteredAt: res.emandateRegisteredAt || prev.emandateRegisteredAt,
        }));
        if (res.isVerified || currentStatus === "ACTIVE" || currentStatus === "AUTHENTICATED") {
          toast.success("eMandate is Active & Registered ✓");
        } else {
          toast.info(`eMandate Status: ${currentStatus}`);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to check eMandate status");
    } finally {
      setIsCheckingEmandateStatus(false);
    }
  };

  const handleCopyEmandateLink = () => {
    if (!lead.emandateAuthUrl) {
      toast.error("No eMandate link available");
      return;
    }
    navigator.clipboard.writeText(lead.emandateAuthUrl);
    toast.success("eMandate Auth Link copied to clipboard!");
  };

  const handleInitiateReloan = async () => {
    if (!lead?.id) return;
    if (
      !window.confirm(
        `Are you sure you want to initiate a Reloan for ${lead.name}? This will clone their details and assign them directly to the Credit Queue.`
      )
    ) {
      return;
    }

    setIsInitiating(true);
    try {
      const response = await apiPost<any>(`/leads/${encodeURIComponent(lead.id)}/reloan`, {});
      toast.success("Reloan lead created successfully! Redirecting...");
      navigate(`/leads/${response.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to initiate reloan");
    } finally {
      setIsInitiating(false);
    }
  };
  const [showTelecallerRejectDialog, setShowTelecallerRejectDialog] = useState(false);
  const [telecallerRejectReason, setTelecallerRejectReason] = useState("");
  const [telecallerRejectError, setTelecallerRejectError] = useState("");
  const [isTelecallerRejecting, setIsTelecallerRejecting] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [activityNote, setActivityNote] = useState("");
  const [previewImage, setPreviewImage] = useState<{ title: string; url: string } | null>(null);
  const [camRecommendedAmount, setCamRecommendedAmount] = useState("");
  const [camApprovedAmount, setCamApprovedAmount] = useState("");
  const camHydrationKeyRef = useRef("");
  const [camLoanTermDays, setCamLoanTermDays] = useState("30");
  const [camInterestRate, setCamInterestRate] = useState("1");
  const [camProcessingFeeRate, setCamProcessingFeeRate] = useState("10");
  const [camCreditRisk, setCamCreditRisk] = useState("Medium");
  const [camRepaymentCapacity, setCamRepaymentCapacity] = useState("Good");
  const [camRecommendation, setCamRecommendation] = useState<CamRecommendation>("Approve with Conditions");
  const [camConditions, setCamConditions] = useState("Bank details, KYC, CIBIL and income documents must be verified before disbursement.");
  const [camNotes, setCamNotes] = useState("");
  const [camDeviationLevel, setCamDeviationLevel] = useState("None");
  const [camDecisionReason, setCamDecisionReason] = useState("");
  const [camFeedback, setCamFeedback] = useState("");
  const [isCamSaving, setIsCamSaving] = useState(false);
  const [showCreditDecisionConfirm, setShowCreditDecisionConfirm] = useState<"approved" | "rejected" | null>(null);
  const [telecallerWorkspace, setTelecallerWorkspace] = useState<TelecallerWorkspace>({
    callLogs: [],
    documentChecks: [],
    followups: [],
    latestHandoff: null,
  });
  const [isTelecallerLoading, setIsTelecallerLoading] = useState(false);
  const [isTelecallerSaving, setIsTelecallerSaving] = useState(false);
  const [telecallerError, setTelecallerError] = useState("");
  const [callForm, setCallForm] = useState({
    callDurationSeconds: "",
    disposition: "Connected",
    followupReason: "",
    nextFollowupAt: "",
    notes: "",
    subDisposition: "",
  });
  const [handoffNote, setHandoffNote] = useState("");
  const [documentRequests, setDocumentRequests] = useState<LeadDocumentRequest[]>([]);
  const [selectedDocumentKeys, setSelectedDocumentKeys] = useState<string[]>([]);
  const [selectedVerificationKeys, setSelectedVerificationKeys] = useState<string[]>([]);
  const [isDocumentRequestSaving, setIsDocumentRequestSaving] = useState(false);
  const [removingDocumentToken, setRemovingDocumentToken] = useState("");
  const [removedDocumentGroupTokens, setRemovedDocumentGroupTokens] = useState<string[]>([]);
  const [documentRequestError, setDocumentRequestError] = useState("");
  const [isLeadDeleting, setIsLeadDeleting] = useState(false);
  const [showDeleteLeadDialog, setShowDeleteLeadDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("IMPS");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentDisbursementDate, setPaymentDisbursementDate] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);

  const [domainIntelligence, setDomainIntelligence] = useState<{
    domain: string;
    isCorporateDomain: boolean;
    isFreeEmail: boolean;
    isDisposable: boolean;
    hasMxRecords: boolean;
    primaryMx: string | null;
    createdDate: string | null;
    ageDays: number | null;
    ageYears: number | null;
    formattedAge: string | null;
    qualityScore: number;
    riskLevel: string;
    recommendation: string;
  } | null>(null);
  const [isFetchingDomainIntel, setIsFetchingDomainIntel] = useState(false);

  const fetchDomainIntelligence = useCallback(async (emailOverride?: string) => {
    const target = emailOverride || lead?.officeEmail || lead?.officialEmail || lead?.email;
    if (!target || !target.includes("@")) return;

    setIsFetchingDomainIntel(true);
    try {
      let res: any = null;
      const endpoints = [
        "/credit/official-email/check-domain",
        "/leads/official-email/check-domain",
        "/official-email/check-domain",
      ];

      for (const endpoint of endpoints) {
        try {
          res = await apiPost<any>(endpoint, {
            email: target,
            applicationId: leadId,
          });
          if (res && (res.domain || res.data?.domain)) break;
        } catch {
          // try fallback endpoint
        }
      }

      const payload = res?.data || res;
      if (payload && payload.domain) {
        setDomainIntelligence(payload);
      }
    } catch (err) {
      console.warn("Failed to fetch domain intel:", err);
    } finally {
      setIsFetchingDomainIntel(false);
    }
  }, [lead?.email, lead?.officeEmail, lead?.officialEmail, leadId]);

  useEffect(() => {
    if (officialEmailVerified && (lead?.officeEmail || lead?.officialEmail || lead?.email)) {
      fetchDomainIntelligence();
    }
  }, [officialEmailVerified, lead?.officeEmail, lead?.officialEmail, lead?.email, fetchDomainIntelligence]);

  const [isPaymentSaving, setIsPaymentSaving] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState("");
  const [latestCamSheet, setLatestCamSheet] = useState<CamSheet | null>(null);
  const [latestEsign, setLatestEsign] = useState<ESignRequest | null>(null);
  const [latestSanction, setLatestSanction] = useState<SanctionLetter | null>(null);
  const [latestLoanAgreement, setLatestLoanAgreement] = useState<LoanAgreement | null>(null);
  const [isEsignSaving, setIsEsignSaving] = useState(false);
  const [isLoanAgreementRefreshing, setIsLoanAgreementRefreshing] = useState(false);
  const [isAccountingHandoffSaving, setIsAccountingHandoffSaving] = useState(false);
  const [isAcceptanceProofUploading, setIsAcceptanceProofUploading] = useState(false);
  const [isSanctionResending, setIsSanctionResending] = useState(false);
  const [esignFeedback, setEsignFeedback] = useState("");
  const [loanAgreementFeedback, setLoanAgreementFeedback] = useState("");
  const [sanctionRevisionReason, setSanctionRevisionReason] = useState("");
  const [sanctionForm, setSanctionForm] = useState({
    agreementDate: new Date().toISOString().slice(0, 10),
    agreementNumber: "",
    apr: "365",
    bankName: "",
    accountNumber: "",
    borrowerEmail: "",
    borrowerPhone: "",
    conditions: "",
    disbursementDate: "",
    disbursementMode: "Bank Transfer",
    dueDate: "",
    gstAmount: "",
    ifscCode: "",
    interestRate: "1",
    lateFee: "2% of the loan amount, whichever is higher",
    penalInterestRate: "2",
    principalAmount: "",
    processingFee: "",
    processingFeeRate: "10",
    repaymentAmount: "",
    tenureDays: "30",
  });

  useEffect(() => {
    const section = new URLSearchParams(location.search).get("section");
    if (section === "documents") {
      setActiveTab("documents");
    }
    if (section === "credit" && currentRole === "credit-manager") {
      setShowCAMSheet(true);
    }
  }, [currentRole, location.search]);
  const {
    aadhaarError,
    aadhaarReport,
    isAadhaarLoading,
    requestAadhaarReport,
  } = useAadhaarReport(leadId);
  const {
    analyzeCibilReport,
    cibilError,
    cibilReport,
    isCibilAnalyzing,
    isCibilLoading,
    isCibilPending,
    isCibilPolling,
    isCibilPollingRefresh,
    cibilLastCheckedAt,
    cibilPollIntervalMs,
    requestCibilReport,
  } = useCibilReport(leadId);
  const {
    activities,
    activityError,
    addActivityNote,
    isActivityLoading,
    isActivitySaving,
    refreshActivities,
  } = useLeadActivities(leadId);

  useEffect(() => {
    const controller = new AbortController();

    apiGet<TeamMemberOption[]>("/team", controller.signal)
      .then((data) => {
        setTeamMembers(data.filter((member) => member.name));
      })
      .catch(() => {
        setTeamMembers([]);
      });

    return () => controller.abort();
  }, []);

  const loadTelecallerWorkspace = async (signal?: AbortSignal) => {
    if (!leadId) return;

    setIsTelecallerLoading(true);
    setTelecallerError("");
    try {
      const workspace = await apiGet<TelecallerWorkspace>(`/leads/${encodeURIComponent(leadId)}/telecaller-workspace`, signal);
      setTelecallerWorkspace(workspace);
      setSelectedVerificationKeys((currentKeys) => {
        const workspaceKeys = new Set(workspace.documentChecks.map((check) => check.key));
        return currentKeys.filter((key) => workspaceKeys.has(key));
      });
    } catch (error) {
      if (!signal?.aborted) {
        setTelecallerError(error instanceof Error ? error.message : "Unable to load telecaller workspace");
      }
    } finally {
      if (!signal?.aborted) {
        setIsTelecallerLoading(false);
      }
    }
  };

  const loadDocumentRequests = async (signal?: AbortSignal) => {
    if (!leadId) return;

    try {
      const requests = await apiGet<LeadDocumentRequest[]>(`/leads/${encodeURIComponent(leadId)}/document-requests`, signal);
      setDocumentRequests(requests);
      if (!signal?.aborted) setRemovedDocumentGroupTokens([]);
    } catch (error) {
      if (!signal?.aborted) {
        setDocumentRequestError(error instanceof Error ? error.message : "Unable to load document requests");
      }
    }
  };

  const loadCamAndEsign = async (signal?: AbortSignal) => {
    if (!leadId || (!isCreditManagerRole && !isAccountantRole)) return;

    try {
      const [camSheet, esign, sanction, loanAgreement] = await Promise.all([
        apiGet<CamSheet | null>(`/leads/${encodeURIComponent(leadId)}/cam-sheet`, signal),
        apiGet<ESignRequest | null>(`/leads/${encodeURIComponent(leadId)}/esign-requests/latest`, signal),
        apiGet<SanctionLetter | null>(`/leads/${encodeURIComponent(leadId)}/sanction/latest`, signal),
        apiGet<LoanAgreement | null>(`/leads/${encodeURIComponent(leadId)}/loan-agreement/latest`, signal),
      ]);
      setLatestCamSheet(camSheet);
      setLatestEsign(esign);
      setLatestSanction(sanction);
      setLatestLoanAgreement(loanAgreement);
    } catch (error) {
      if (!signal?.aborted) {
        setEsignFeedback(error instanceof Error ? error.message : "Unable to load CAM/eSign status");
      }
    }
  };

  useEffect(() => {
    if (!leadId) return;

    const controller = new AbortController();
    loadTelecallerWorkspace(controller.signal);
    loadDocumentRequests(controller.signal);
    loadCamAndEsign(controller.signal);

    return () => controller.abort();
  }, [leadId, isCreditManagerRole, isAccountantRole]);

  const applyUpdatedLead = (updatedLead: Lead) => {
    setLead((currentLead) => ({
      ...currentLead,
      ...updatedLead,
      address: updatedLead.address || updatedLead.city || currentLead.address,
      dateOfBirth: updatedLead.dateOfBirth || currentLead.dateOfBirth,
      loanPurpose: updatedLead.loanPurpose || currentLead.loanPurpose,
      employer: updatedLead.companyName || currentLead.employer,
      jobTitle: updatedLead.designation || currentLead.jobTitle,
    }));
  };

  const handleLeadOperationChange = async (changes: Partial<Pick<Lead, "assignedTo" | "priority" | "status">>) => {
    if (!leadId) return;

    if (isAssignedToOtherTelecaller) {
      toast.warning(otherTelecallerWarning);
      return;
    }

    if (changes.assignedTo === "assign to me") {
      changes.assignedTo = user?.name || "assign to me";
    }

    if (
      (changes.status === undefined || changes.status === lead.status) &&
      (changes.priority === undefined || changes.priority === lead.priority) &&
      (changes.assignedTo === undefined || changes.assignedTo === lead.assignedTo)
    ) {
      return;
    }

    if (changes.status === "Lost" || changes.status === "Rejected") {
      setShowTelecallerRejectDialog(true);
      return;
    }

    const previousLead = lead;
    setLead((currentLead) => ({ ...currentLead, ...changes }));
    setIsStatusSaving(true);
    setStatusError("");

    try {
      const updatedLead = await apiPatch<Lead>(`/leads/${encodeURIComponent(leadId)}/operations`, changes);
      applyUpdatedLead(updatedLead);
      toast.success("Lead operation updated");
      refreshActivities();
    } catch (error) {
      setLead(previousLead);
      const message = error instanceof Error ? error.message : "Unable to update lead operations";
      setStatusError(message);
      toast.error(message);
    } finally {
      setIsStatusSaving(false);
    }
  };

  const handleTelecallerRejectLead = async () => {
    if (!leadId || isTelecallerRejecting) return;

    if (isAssignedToOtherTelecaller) {
      toast.warning(otherTelecallerWarning);
      return;
    }

    const reason = telecallerRejectReason.trim();
    if (!reason) {
      setTelecallerRejectError("Please mention the rejection reason.");
      return;
    }

    setIsTelecallerRejecting(true);
    setTelecallerRejectError("");

    try {
      const response = await apiPost<TelecallerRejectResponse>(`/leads/${encodeURIComponent(leadId)}/reject`, {
        reason,
      });
      applyUpdatedLead(response.lead);
      setShowTelecallerRejectDialog(false);
      setTelecallerRejectReason("");
      refreshActivities();
      if (response.whatsapp?.sent) {
        toast.success("Loan rejected and WhatsApp message sent");
      } else if (response.whatsapp?.attempted) {
        toast.warn(response.whatsapp.error || "Loan rejected, but WhatsApp message was not accepted");
      } else {
        toast.success("Loan rejected");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to reject lead";
      setTelecallerRejectError(message);
      toast.error(message);
    } finally {
      setIsTelecallerRejecting(false);
    }
  };

  const telecallerOptions = useMemo(() => {
    const tenantSlug = getTenantSlug();
    const defaults = tenantSlug === "geetpay"
      ? ["nandini", "kalam", "kunal", "assign to me"]
      : ["nandini", "kajal", "saqib", "assign to me"];
    const assigned = /^stella/i.test(lead.assignedTo || "") ? "nandini" : lead.assignedTo;
    const uniqueNames = Array.from(new Set([...defaults, assigned].filter((name) => (
      Boolean(name) &&
      !String(name).toLowerCase().includes("shruti") &&
      String(name).toLowerCase() !== "credit manager"
    ))));
    return uniqueNames;
  }, [lead.assignedTo]);

  const leadStatusOptions = useMemo(() => {
    const statuses = Array.from(new Set([...LEAD_STATUSES, lead.status].filter(Boolean)));
    return statuses.map((status) => ({ label: status, value: status }));
  }, [lead.status]);

  const leadPriorityOptions = useMemo(() => (
    LEAD_PRIORITIES.map((priority) => ({ label: priority, value: priority }))
  ), []);

  const assignedToOptions = useMemo(() => {
    const isTestingEnv =
      typeof window !== "undefined" &&
      (window.location.hostname.includes("testing") ||
       window.location.hostname === "localhost" ||
       window.location.hostname === "127.0.0.1" ||
       Boolean(import.meta.env.VITE_API_URL && String(import.meta.env.VITE_API_URL).includes("testing")));

    return [
      { label: "Unassigned", value: "Unassigned" },
      { label: isTestingEnv ? "Credit Manager (Testing)" : "Credit Manager (Shruti)", value: "Credit Manager" },
      ...telecallerOptions
        .filter((name) => name !== "Unassigned" && name !== "Credit Manager")
        .map((name) => {
          if (name === "assign to me") {
            return { label: "Assign to me", value: "assign to me" };
          }
          return { label: `Assign to ${name}`, value: name };
        }),
    ];
  }, [telecallerOptions]);

  const handleCibilRequest = async () => {
    try {
      await requestCibilReport();
      toast.success("CIBIL request submitted");
      refreshActivities();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to fetch CIBIL report");
    }
  };

  const handleCibilAnalysis = async () => {
    try {
      await analyzeCibilReport();
      toast.success("CIBIL analysis completed");
      refreshActivities();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to analyze CIBIL report");
    }
  };

  const handleAadhaarRequest = async () => {
    try {
      await requestAadhaarReport();
      toast.success("Aadhaar request completed");
      refreshActivities();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to fetch Aadhaar data");
    }
  };

  const handleActivityNoteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const note = activityNote.trim();
    if (!note) return;

    try {
      await addActivityNote(note);
      setActivityNote("");
      toast.success("Activity note saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save activity note");
    }
  };

  const callDispositionConfig = CALL_DISPOSITION_CONFIG[callForm.disposition] || CALL_DISPOSITION_CONFIG.Connected;
  const shouldShowFollowup = Boolean(callDispositionConfig.followupVisible);
  const shouldShowDuration = Boolean(callDispositionConfig.trackDuration);
  const subDispositionOptions = callDispositionConfig.subDispositionOptions.map((option) => ({ label: option, value: option }));
  const minimumFollowupAt = useMemo(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset() + 5);
    return now.toISOString().slice(0, 16);
  }, []);

  const handleCallDispositionChange = (value: string) => {
    const nextConfig = CALL_DISPOSITION_CONFIG[value] || CALL_DISPOSITION_CONFIG.Connected;
    setCallForm((form) => ({
      ...form,
      callDurationSeconds: nextConfig.trackDuration ? form.callDurationSeconds : "",
      disposition: value,
      followupReason: nextConfig.followupVisible ? form.followupReason : "",
      nextFollowupAt: nextConfig.followupVisible ? form.nextFollowupAt : "",
      subDisposition: "",
    }));
  };

  const handleCallLogSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!leadId || !callForm.disposition) return;

    if (isAssignedToOtherTelecaller) {
      toast.warning(otherTelecallerWarning);
      return;
    }

    if (callDispositionConfig.subDispositionRequired && !callForm.subDisposition.trim()) {
      const message = "Please select a sub-disposition for this call outcome.";
      setTelecallerError(message);
      toast.warning(message);
      return;
    }

    if (callDispositionConfig.followupRequired && !callForm.nextFollowupAt) {
      const message = "Please schedule the next follow-up for this call outcome.";
      setTelecallerError(message);
      toast.warning(message);
      return;
    }

    if (shouldShowFollowup && callForm.nextFollowupAt && new Date(callForm.nextFollowupAt).getTime() <= Date.now()) {
      const message = "Please choose a future time for the next follow-up.";
      setTelecallerError(message);
      toast.warning(message);
      return;
    }

    try {
      setIsTelecallerSaving(true);
      setTelecallerError("");
      await apiPost<TelecallerCallLog>(`/leads/${encodeURIComponent(leadId)}/call-logs`, {
        ...callForm,
        callDurationSeconds: shouldShowDuration ? Number(callForm.callDurationSeconds || 0) : 0,
        followupReason: shouldShowFollowup ? callForm.followupReason || callForm.disposition : "",
        nextFollowupAt: shouldShowFollowup ? callForm.nextFollowupAt : "",
        user: "Telecaller",
      });
      setCallForm({
        callDurationSeconds: "",
        disposition: "Connected",
        followupReason: "",
        nextFollowupAt: "",
        notes: "",
        subDisposition: "",
      });
      await loadTelecallerWorkspace();
      refreshActivities();
      toast.success("Call update saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save call update";
      setTelecallerError(message);
      toast.error(message);
    } finally {
      setIsTelecallerSaving(false);
    }
  };

  const updateDocumentCheck = async (check: TelecallerDocumentCheck, status: TelecallerDocumentCheck["status"]) => {
    if (!leadId) return;

    if (isAssignedToOtherTelecaller) {
      toast.warning(otherTelecallerWarning);
      return;
    }

    try {
      setIsTelecallerSaving(true);
      setTelecallerError("");
      await apiPatch<TelecallerDocumentCheck>(`/leads/${encodeURIComponent(leadId)}/document-checks`, {
        key: check.key,
        label: check.label,
        remark: check.remark,
        status,
        user: "Telecaller",
      });
      await loadTelecallerWorkspace();
      refreshActivities();
      toast.success(`Document marked ${status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update document check";
      setTelecallerError(message);
      toast.error(message);
    } finally {
      setIsTelecallerSaving(false);
    }
  };

  const updateSelectedDocumentChecks = async (status: TelecallerDocumentCheck["status"]) => {
    if (!leadId) return;

    if (isAssignedToOtherTelecaller) {
      toast.warning(otherTelecallerWarning);
      return;
    }

    const selectedChecks = telecallerWorkspace.documentChecks.filter((check) => selectedVerificationKeys.includes(check.key));
    const checksToUpdate = status === "verified"
      ? selectedChecks.filter((check) => hasDocumentEvidence(check.key))
      : selectedChecks;

    if (!checksToUpdate.length) {
      const message = status === "verified"
        ? "Select at least one document with available evidence to verify."
        : "Select at least one document check to update.";
      setTelecallerError(message);
      toast.warning(message);
      return;
    }

    try {
      setIsTelecallerSaving(true);
      setTelecallerError("");
      await Promise.all(checksToUpdate.map((check) => apiPatch<TelecallerDocumentCheck>(`/leads/${encodeURIComponent(leadId)}/document-checks`, {
        key: check.key,
        label: check.label,
        remark: check.remark,
        status,
        user: user?.name || "Telecaller",
      })));
      setSelectedVerificationKeys([]);
      await loadTelecallerWorkspace();
      refreshActivities();
      toast.success(`${checksToUpdate.length} document check${checksToUpdate.length === 1 ? "" : "s"} marked ${status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update selected document checks";
      setTelecallerError(message);
      toast.error(message);
    } finally {
      setIsTelecallerSaving(false);
    }
  };

  const markReadyForCreditReview = async () => {
    if (!leadId) return;

    if (isAssignedToOtherTelecaller) {
      toast.warning(otherTelecallerWarning);
      return;
    }

    try {
      setIsTelecallerSaving(true);
      setTelecallerError("");
      const response = await apiPost<WorkflowLeadResponse>(`/leads/${encodeURIComponent(leadId)}/credit-handoffs`, {
        checklistSnapshot: telecallerWorkspace.documentChecks,
        notes: handoffNote,
        user: user?.name || "Telecaller",
      });
      applyUpdatedLead(response.lead);
      setHandoffNote("");
      await loadTelecallerWorkspace();
      refreshActivities();
      toast.success("Lead sent to credit manager review");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send lead for credit review";
      setTelecallerError(message);
      toast.error(message);
    } finally {
      setIsTelecallerSaving(false);
    }
  };

  const hasUploadedDocumentRequest = (keys: string | string[]) => {
    const allowedKeys = Array.isArray(keys) ? keys : [keys];
    return documentRequests.some((request) => (
      allowedKeys.includes(request.documentKey) &&
      Boolean(request.uploadedFile)
    ));
  };

  const documentHasEvidence = (key: string) => {
    switch (key) {
      case "pan":
        return Boolean(lead.panNumber) || hasUploadedDocumentRequest("pan");
      case "aadhaar":
        return Boolean(hasAadhaarData || lead.aadhaarVerified || lead.aadhaarMasked) || hasUploadedDocumentRequest("aadhaar");
      case "aadhaar_front":
        return hasUploadedDocumentRequest("aadhaar_front");
      case "aadhaar_back":
        return hasUploadedDocumentRequest("aadhaar_back");
      case "selfie":
        return Boolean(lead.selfieImage) || hasUploadedDocumentRequest("selfie");
      case "video_kyc":
        return Boolean(lead.videoKyc) || hasUploadedDocumentRequest("video_kyc");
      case "salary_slip_current":
        return Boolean(lead.salarySlipCurrent) || hasUploadedDocumentRequest("salary_slip_current");
      case "salary_slip_previous":
        return hasUploadedDocumentRequest(["salary_slip_previous", "salary_slip_old", "salary_slip_last_3_6_months"]);
      case "salary_slip_old":
        return hasUploadedDocumentRequest(["salary_slip_old", "salary_slip_previous", "salary_slip_last_3_6_months"]);
      case "company_id_card":
      case "bank_proof":
      case "other":
      default:
        return hasUploadedDocumentRequest(key);
    }
  };

  const createDocumentRequestForKeys = async (keys: string[]) => {
    if (!leadId) return;

    if (isAssignedToOtherTelecaller) {
      toast.warning(otherTelecallerWarning);
      return;
    }

    const uniqueKeys = Array.from(new Set(keys));
    const selectedOptions = DOCUMENT_REQUEST_OPTIONS.filter((option) => uniqueKeys.includes(option.key));
    if (selectedOptions.length === 0) {
      const message = "Please select at least one document.";
      setDocumentRequestError(message);
      toast.warning(message);
      return;
    }

    try {
      setIsDocumentRequestSaving(true);
      setDocumentRequestError("");
      const group = await apiPost<LeadDocumentRequestGroup>(`/leads/${encodeURIComponent(leadId)}/document-requests`, {
        documents: selectedOptions.map((option) => ({
          key: option.key,
          label: option.label,
        })),
        user: user?.name || roleLabels[currentRole],
      });
      setDocumentRequests((currentRequests) => [...group.requests, ...currentRequests]);
      setSelectedDocumentKeys([]);
      if (group.whatsapp?.sent) {
        toast.success("Document upload link generated and sent on WhatsApp");
      } else if (group.whatsapp?.attempted || group.whatsapp?.error) {
        toast.warning(group.whatsapp.error || "Document link generated, but WhatsApp message was not sent");
      } else {
        toast.success("Document upload link generated");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate upload link";
      setDocumentRequestError(message);
      toast.error(message);
    } finally {
      setIsDocumentRequestSaving(false);
    }
  };

  const createDocumentRequest = async () => {
    await createDocumentRequestForKeys(selectedDocumentKeys);
  };

  const toggleSelectedDocumentKey = (key: string) => {
    setSelectedDocumentKeys((currentKeys) => (
      currentKeys.includes(key)
        ? currentKeys.filter((currentKey) => currentKey !== key)
        : [...currentKeys, key]
    ));
  };

  const getUploadLink = (token: string) => `${window.location.origin}/document-upload/${encodeURIComponent(token)}`;

  const copyUploadLink = async (token: string) => {
    const link = getUploadLink(token);
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Upload link copied");
    } catch {
      toast.info(link, { autoClose: 8000 });
    }
  };

  const getEsignLink = (token: string) => `${window.location.origin}/esign/${encodeURIComponent(token)}`;

  const getDocumentLink = (path: string) => {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    const href = path.startsWith("/") ? path : `/${path}`;
    if (/^\/uploads\//i.test(href)) {
      return buildDocumentUploadUrl(href);
    }
    return href;
  };

  const openDocument = async (path: string) => {
    const href = getDocumentLink(path);
    if (!href) return;

    if (/^https?:\/\//i.test(href)) {
      try {
        const url = new URL(href);
        const documentBase = /^https?:\/\//i.test(documentBaseUrl) ? new URL(documentBaseUrl) : null;
        
        // Resolve if it is hosted on our backend or app host
        const isOurHost = url.host === window.location.host || (documentBase && url.host === documentBase.host);
        
        // If it is external (not our host, e.g. legacy server), open directly and return
        if (!isOurHost) {
          window.open(href, "_blank", "noopener,noreferrer");
          return;
        }
      } catch {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
    }

    const isUploadHref = href.startsWith("/uploads/") || (() => {
      try {
        const url = new URL(href);
        return url.pathname.startsWith("/uploads/");
      } catch {
        return false;
      }
    })();

    if (!isUploadHref) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      const blob = await apiGetBlob(href);
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      console.warn("apiGetBlob failed, falling back to direct window.open:", error);
      const token = getAuthToken();
      const authenticatedUrl = token 
        ? `${href}${href.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}` 
        : href;
      window.open(authenticatedUrl, "_blank", "noopener,noreferrer");
    }
  };

  const openSignedLoanAgreement = async () => {
    if (!leadId) return;

    try {
      const blob = await apiGetBlob(`/api/leads/${encodeURIComponent(leadId)}/loan-agreement/signed-pdf`);
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to download signed agreement");
    }
  };

  const openSanctionPdf = async () => {
    if (!leadId) return;

    try {
      const blob = await apiGetBlob(`/api/leads/${encodeURIComponent(leadId)}/sanction/pdf`);
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      apiGet<SanctionLetter | null>(`/leads/${encodeURIComponent(leadId)}/sanction/latest`)
        .then((sanction) => setLatestSanction(sanction))
        .catch(() => undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to download sanction PDF");
    }
  };

  const copyEsignLink = async (token: string) => {
    const link = getEsignLink(token);
    try {
      await navigator.clipboard.writeText(link);
      toast.success("eSign link copied");
    } catch {
      toast.info(link, { autoClose: 8000 });
    }
  };

  const createEsignRequest = async () => {
    if (!leadId) return;

    try {
      setIsEsignSaving(true);
      setEsignFeedback("");
      const esign = await apiPost<ESignRequest>(`/leads/${encodeURIComponent(leadId)}/esign-requests`, {
        camSheetId: latestCamSheet?.id || null,
        approvedAmount,
        user: user?.name || "Credit Manager",
      });
      setLatestEsign(esign);
      setEsignFeedback("eSign link generated. Share it with the customer for agreement signing.");
      toast.success("eSign link generated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate eSign link";
      setEsignFeedback(message);
      toast.error(message);
    } finally {
      setIsEsignSaving(false);
    }
  };

  const sendLoanAgreementForEsign = async () => {
    if (!leadId) return;

    try {
      setIsEsignSaving(true);
      setLoanAgreementFeedback("");
      const agreement = await apiPost<LoanAgreement>(`/leads/${encodeURIComponent(leadId)}/loan-agreement/send-esign`, {
        user: user?.name || "Credit Manager",
      });
      setLatestLoanAgreement(agreement);
      setLoanAgreementFeedback(agreement.signingUrl
        ? "Loan agreement sent to Digio. Signing link is available below."
        : "Loan agreement sent to Digio. Customer will receive the provider notification.");
      toast.success("Loan agreement sent for eSign");
      refreshActivities();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send loan agreement for eSign";
      setLoanAgreementFeedback(message);
      toast.error(message);
    } finally {
      setIsEsignSaving(false);
    }
  };

  const refreshLoanAgreementStatus = async () => {
    if (!leadId) return;

    try {
      setIsLoanAgreementRefreshing(true);
      setLoanAgreementFeedback("");
      const agreement = await apiPost<LoanAgreement>(`/leads/${encodeURIComponent(leadId)}/loan-agreement/refresh-status`, {
        user: user?.name || roleLabels[activeRole || user?.role || ""] || "Credit Manager",
      });
      setLatestLoanAgreement(agreement);
      setLoanAgreementFeedback(agreement.status === "signed"
        ? agreement.signedPdfPath
          ? "Loan agreement is signed. Signed PDF fetched from Digio."
          : "Loan agreement is signed in Digio. Signed PDF is not available yet."
        : `Digio status refreshed: ${agreement.providerStatus || agreement.status}.`);
      toast.success("Digio status refreshed");
      refreshActivities();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to refresh Digio status";
      setLoanAgreementFeedback(message);
      toast.error(message);
    } finally {
      setIsLoanAgreementRefreshing(false);
    }
  };

  const uploadSanctionAcceptanceProof = async (file?: File) => {
    if (!leadId || !file) return;

    try {
      setIsAcceptanceProofUploading(true);
      const body = new FormData();
      body.append("file", file);
      body.append("user", user?.name || "Credit Manager");
      const sanction = await apiPostForm<SanctionLetter>(`/leads/${encodeURIComponent(leadId)}/sanction/acceptance-proof`, body);
      setLatestSanction(sanction);
      setLoanAgreementFeedback("Customer acceptance reply proof uploaded. You can now keep it as sanction audit evidence.");
      toast.success("Acceptance proof uploaded");
      refreshActivities();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to upload acceptance proof";
      setLoanAgreementFeedback(message);
      toast.error(message);
    } finally {
      setIsAcceptanceProofUploading(false);
    }
  };

  const sendLeadToAccounting = async () => {
    if (!leadId) return;

    try {
      setIsAccountingHandoffSaving(true);
      setLoanAgreementFeedback("");
      const response = await apiPost<WorkflowLeadResponse>(`/leads/${encodeURIComponent(leadId)}/accounting-handoff`, {
        user: user?.name || "Credit Manager",
      });
      applyUpdatedLead(response.lead);
      setLoanAgreementFeedback("Lead sent to accountant queue for disbursement.");
      toast.success("Lead sent to accountant");
      refreshActivities();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send lead to accountant";
      setLoanAgreementFeedback(message);
      toast.error(message);
    } finally {
      setIsAccountingHandoffSaving(false);
    }
  };

  const resendSanctionEmail = async () => {
    if (!leadId || !latestSanction) return;

    try {
      setIsSanctionResending(true);
      setLoanAgreementFeedback("");
      const sanction = await apiPost<SanctionLetter>(`/leads/${encodeURIComponent(leadId)}/sanction/resend`, {
        user: user?.name || "Credit Manager",
      });
      setLatestSanction(sanction);
      setLoanAgreementFeedback("Sanction email resent successfully.");
      toast.success("Sanction email resent");
      refreshActivities();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to resend sanction email";
      setLoanAgreementFeedback(message);
      toast.error(message);
      apiGet<SanctionLetter | null>(`/leads/${encodeURIComponent(leadId)}/sanction/latest`)
        .then((sanction) => setLatestSanction(sanction))
        .catch(() => undefined);
    } finally {
      setIsSanctionResending(false);
    }
  };

  const removeDocumentLink = async (token: string) => {
    if (!leadId) return;

    try {
      setRemovingDocumentToken(token);
      setDocumentRequestError("");
      const updatedRequests = await apiDelete<LeadDocumentRequest[]>(`/leads/${encodeURIComponent(leadId)}/document-requests/${encodeURIComponent(token)}`);
      const removedTokens = new Set([
        token,
        ...updatedRequests.map((request) => request.groupToken || request.token),
      ]);
      setRemovedDocumentGroupTokens((currentTokens) => Array.from(new Set([...currentTokens, ...removedTokens])));
      setDocumentRequests((currentRequests) => currentRequests.map((request) => {
        const requestToken = request.groupToken || request.token;
        const updatedRequest = updatedRequests.find((candidate) => candidate.id === request.id);
        if (!removedTokens.has(requestToken)) return request;
        return {
          ...(updatedRequest || request),
          uploadedFile: updatedRequest?.uploadedFile || request.uploadedFile,
          status: updatedRequest?.status || (request.uploadedFile ? "cancelled" : request.status),
        };
      }));
      toast.success("Upload link removed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to remove upload link";
      setDocumentRequestError(message);
      toast.error(message);
    } finally {
      setRemovingDocumentToken("");
    }
  };

  const handleDeleteLead = async () => {
    if (!leadId || !isTelecallerRole) return;

    try {
      setIsLeadDeleting(true);
      await apiDelete<{ counts: Record<string, number>; id: string; removedFiles: number }>(`/leads/${encodeURIComponent(leadId)}`);
      leadDetailsResourceCache.delete(leadId);
      setShowDeleteLeadDialog(false);
      toast.success("Lead deleted successfully");
      navigate(leadReturnHref, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete lead");
    } finally {
      setIsLeadDeleting(false);
    }
  };

  const buildCamPayload = (status: "draft" | "approved" | "rejected" = "draft") => ({
    status,
    requestedAmount: Number(loanAmount || 0),
    recommendedAmount: Number(recommendedEligibleAmount || 0),
    approvedAmount: Number(approvedAmount || 0),
    loanTermDays: Number(camLoanTermDays || 30),
    interestRate: Number(camInterestRate || 0),
    processingFeeRate: Number(camProcessingFeeRate || 0),
    totalRepayment: Number(camTotalRepayment || 0),
    monthlyIncome: Number(totalIncome || 0),
    monthlyExpenses: Number(totalExpenses || 0),
    netIncome: Number(netIncome || 0),
    dtiRatio: Number(debtRatio || 0),
    repaymentBuffer: Number(repaymentBuffer || 0),
    policyScore: policyPassPercent,
    verificationScore: verificationPercent,
    riskGrade,
    creditRisk: camCreditRisk,
    repaymentCapacity: camRepaymentCapacity,
    recommendation: camRecommendation,
    suggestedRecommendation: systemCamRecommendation,
    deviationLevel: camDeviationLevel,
    decisionReason: camDecisionReason,
    conditions: camConditions,
    notes: camNotes,
    user: user?.name || "Credit Manager",
    snapshot: {
      leadId: lead.id,
      leadName: lead.name,
      blockers: creditApprovalBlockers,
      approvalReadiness: {
        amountError: camAmountError,
        needsDeviationReason,
        canApprove: canApproveCam,
      },
      policyChecks: camPolicyChecks,
      verification: {
        verifiedDocumentChecks,
        totalDocumentChecks,
        verificationPercent,
      },
      summary: buildCamSummary(status === "approved" ? "approved" : "saved"),
    },
  });

  const addDaysIso = (dateValue: string, days: number) => {
    const date = dateValue ? new Date(dateValue) : new Date();
    if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const buildSanctionDefaults = () => {
    const principal = Math.round(Number(approvedAmount || recommendedEligibleAmount || loanAmount || 0));
    const tenure = Number(camLoanTermDays || 30);
    const interestRate = Number(camInterestRate || 1);
    const interestAmount = Math.round((principal * interestRate * tenure) / 100);
    const processingFee = Math.round(principal * (Number(camProcessingFeeRate || 0) / 100));
    const gstAmount = Math.round(processingFee * 0.18);
    const repaymentAmount = principal + interestAmount;
    const agreementDate = new Date().toISOString().slice(0, 10);
    const agreementSeed = String(lead.rawId || lead.id || Date.now()).replace(/\D/g, '').slice(-5).padStart(5, '0');
    const sourceSystem = String(lead.sourceSystem || '').trim().toLowerCase();
    const activeTenantSlug = getTenantSlug();
    const matchedSlug = sourceSystem || activeTenantSlug;
    
    let agreementPrefix = 'WQTMN';
    if (matchedSlug === 'geetpay') {
      agreementPrefix = 'GEETPAY';
    } else if (matchedSlug === 'loaninwallet') {
      agreementPrefix = 'LNWLT';
    } else if (matchedSlug === 'salarywaves') {
      agreementPrefix = 'SLWV';
    }

    return {
      agreementDate,
      agreementNumber: latestSanction?.agreementNumber || `${agreementPrefix}${agreementSeed}`,
      apr: String(Math.round(interestRate * 365)),
      accountNumber: lead.accountNumber || "",
      bankName: lead.bankName || "",
      borrowerEmail: lead.email || "",
      borrowerPhone: lead.phone || "",
      conditions: camConditions,
      disbursementDate: agreementDate,
      disbursementMode: "Bank Transfer",
      dueDate: addDaysIso(agreementDate, tenure),
      gstAmount: String(gstAmount),
      ifscCode: lead.ifscCode || "",
      interestRate: String(interestRate),
      lateFee: "2% of the loan amount, whichever is higher",
      penalInterestRate: "2",
      principalAmount: String(principal),
      processingFee: String(processingFee),
      processingFeeRate: String(Number(camProcessingFeeRate || 10)),
      repaymentAmount: String(repaymentAmount),
      tenureDays: String(tenure),
    };
  };

  const deriveSanctionAmounts = (form: typeof sanctionForm) => {
    const principal = Number(form.principalAmount || 0);
    const tenure = Number(form.tenureDays || 30);
    const interestRate = Number(form.interestRate || 0);
    const feeRate = Number(form.processingFeeRate || 0);
    const interestAmount = Math.round((principal * interestRate * tenure) / 100);
    const processingFee = Math.round(principal * (feeRate / 100));
    const gstAmount = Math.round(processingFee * 0.18);
    const repaymentAmount = principal + interestAmount;

    return {
      ...form,
      apr: String(Math.round(interestRate * 365)),
      gstAmount: String(gstAmount),
      processingFee: String(processingFee),
      repaymentAmount: String(repaymentAmount),
    };
  };

  const updateSanctionForm = (changes: Partial<typeof sanctionForm>) => {
    setSanctionForm((form) => deriveSanctionAmounts({ ...form, ...changes }));
  };

  const openSanctionModal = () => {
    setSanctionForm(buildSanctionDefaults());
    if (canCompleteCreditDecision) setSanctionRevisionReason("");
    setCamFeedback("");
    setShowSanctionModal(true);
  };

  const buildSanctionPayload = () => {
    const principalAmount = Number(sanctionForm.principalAmount || 0);
    const processingFee = Number(sanctionForm.processingFee || 0);
    const gstAmount = Math.round(processingFee * 0.18);

    return {
      agreementDate: sanctionForm.agreementDate,
      agreementNumber: sanctionForm.agreementNumber.trim(),
      apr: Number(sanctionForm.apr || 0),
      accountNumber: sanctionForm.accountNumber,
      bankName: sanctionForm.bankName,
      borrower: lead.name,
      borrowerEmail: sanctionForm.borrowerEmail,
      borrowerPhone: sanctionForm.borrowerPhone,
      conditions: sanctionForm.conditions,
      disbursementDate: sanctionForm.disbursementDate || sanctionForm.agreementDate,
      disbursementMode: sanctionForm.disbursementMode,
      disbursedAmount: Math.max(0, principalAmount - processingFee - gstAmount),
      dueDate: sanctionForm.dueDate,
      emailTo: sanctionForm.borrowerEmail || lead.email,
      gstAmount,
      ifscCode: sanctionForm.ifscCode,
      interestRate: Number(sanctionForm.interestRate || 0),
      interestRateLabel: `${Number(sanctionForm.interestRate || 0).toFixed(2)} % - Per Day`,
      lateFee: sanctionForm.lateFee,
      lender: "WAQT FINANCE PRIVATE LIMITED",
      penalInterestRate: Number(sanctionForm.penalInterestRate || 2),
      principalAmount,
      processingFee,
      repaymentAmount: Number(sanctionForm.repaymentAmount || 0),
      tenureDays: Number(sanctionForm.tenureDays || 30),
    };
  };

  const validateSanctionForm = () => {
    if (!sanctionForm.borrowerEmail.trim()) return "Customer email is required before sending sanction letter.";
    if (!sanctionForm.agreementNumber.trim()) return "Loan agreement number is required.";
    if (Number(sanctionForm.principalAmount || 0) <= 0) return "Principal loan amount must be greater than zero.";
    if (!sanctionForm.agreementDate || !sanctionForm.disbursementDate || !sanctionForm.dueDate) return "Agreement, disbursement, and due dates are required.";
    if (!sanctionForm.bankName.trim() || !sanctionForm.accountNumber.trim() || !sanctionForm.ifscCode.trim()) return "Registered bank details are required for sanction.";
    if (Number(sanctionForm.repaymentAmount || 0) <= 0) return "Repayment amount must be greater than zero.";
    if (Number(buildSanctionPayload().disbursedAmount) < 0) return "Amount to be disbursed cannot be negative.";
    return "";
  };

  const buildCamSummary = (action: "saved" | "approved") => {
    const failedChecks = failedPolicyChecks.map((check) => check.label).join(", ") || "None";
    const conditions = camConditions.trim() || "No additional conditions recorded.";
    const notes = camNotes.trim() || "No notes recorded.";
    const decisionReason = camDecisionReason.trim() || "No separate decision reason recorded.";

    return [
      `CAM ${action === "approved" ? "approved and converted to loan" : "saved"} for ${lead.name || lead.id}.`,
      `Decision: ${camRecommendation}. Reason: ${decisionReason}. Risk: ${camCreditRisk}. Repayment capacity: ${camRepaymentCapacity}. Deviation: ${camDeviationLevel}.`,
      `Requested: ${formatCurrency(loanAmount)}. Approved: ${formatCurrency(approvedAmount)}. Term: ${camLoanTermDays} days. Rate: ${camInterestRate}% per day. Processing fee: ${camProcessingFeeRate}%. GST: ${formatCurrency(camGstAmount)}. Total repayment: ${formatCurrency(camTotalRepayment)}.`,
      `Income: ${formatCurrency(totalIncome)}. Expenses: ${formatCurrency(totalExpenses)}. Net disposable income: ${formatCurrency(netIncome)}. DTI: ${debtRatio}%. Repayment buffer: ${repaymentBuffer.toFixed(2)}x.`,
      `Verification: ${verificationPercent}% complete. Policy score: ${policyPassPercent}%. Risk grade: ${riskGrade}. Policy gaps: ${failedChecks}. Conditions: ${conditions}. Notes: ${notes}`,
    ].join(" ");
  };

  const handleSaveCamSheet = async () => {
    if (!leadId) return;

    try {
      setIsCamSaving(true);
      setCamFeedback("");
      const camSheet = await apiPost<CamSheet>(`/leads/${encodeURIComponent(leadId)}/cam-sheet`, buildCamPayload("draft"));
      setLatestCamSheet(camSheet);
      setCamFeedback(`CAM sheet saved as version ${camSheet.version}.`);
      toast.success("CAM sheet saved");
      refreshActivities();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save CAM sheet";
      setCamFeedback(message);
      toast.error(message);
    } finally {
      setIsCamSaving(false);
    }
  };

  const buildApprovalCamPayload = (sanction = buildSanctionPayload()) => {
    const basePayload = buildCamPayload("approved");
    const approvalRecommendation = CAM_APPROVAL_RECOMMENDATIONS.includes(camRecommendation as typeof CAM_APPROVAL_RECOMMENDATIONS[number])
      ? camRecommendation
      : "Approve";
    const finalPrincipal = Number(sanction.principalAmount || approvedAmount || 0);
    const finalTenure = Number(sanction.tenureDays || camLoanTermDays || 30);
    const finalInterestRate = Number(sanction.interestRate || camInterestRate || 0);
    const finalProcessingFeeRate = finalPrincipal > 0
      ? Number(((Number(sanction.processingFee || 0) / finalPrincipal) * 100).toFixed(2))
      : Number(camProcessingFeeRate || 0);
    const finalTotalRepayment = Number(sanction.repaymentAmount || 0);

    return {
      ...basePayload,
      approvedAmount: finalPrincipal,
      interestRate: finalInterestRate,
      loanTermDays: finalTenure,
      processingFeeRate: finalProcessingFeeRate,
      recommendation: approvalRecommendation,
      conditions: camConditions.trim() || (approvalRecommendation === "Approve with Conditions" ? "Approved with credit manager conditions." : ""),
      totalRepayment: finalTotalRepayment,
      snapshot: {
        ...basePayload.snapshot,
        blockers: [],
        advisoryGaps: creditApprovalBlockers,
        approvalReadiness: {
          ...basePayload.snapshot.approvalReadiness,
          canApprove: !camAmountError,
          advisoryOnly: true,
        },
        finalSanction: {
          disbursedAmount: sanction.disbursedAmount,
          gstAmount: sanction.gstAmount,
          principalAmount: sanction.principalAmount,
          processingFee: sanction.processingFee,
          repaymentAmount: sanction.repaymentAmount,
          tenureDays: sanction.tenureDays,
        },
      },
    };
  };

  const handleApproveCamSheet = async () => {
    if (!leadId) return;
    const sanctionError = validateSanctionForm();
    if (sanctionError) {
      setCamFeedback(sanctionError);
      toast.warning(sanctionError);
      return;
    }
    if (canCompleteCreditDecision && camAmountError) {
      setCamFeedback(camAmountError);
      toast.warning(camAmountError);
      return;
    }
    if (!canCompleteCreditDecision && sanctionRevisionReason.trim().length < 8) {
      const message = "Add a clear revision reason before sending revised sanction.";
      setCamFeedback(message);
      toast.warning(message);
      return;
    }

    try {
      setIsCamSaving(true);
      setCamFeedback("");
      const sanctionPayload = buildSanctionPayload();
      if (!canCompleteCreditDecision) {
        if (!creditLifecycleComplete) {
          const message = "Credit decision is not active for this lead.";
          setCamFeedback(message);
          toast.warning(message);
          return;
        }

        const response = await apiPost<{ sanction: SanctionLetter; camSheet: CamSheet | null }>(`/leads/${encodeURIComponent(leadId)}/sanction/revise`, {
          approvedAmount: sanctionPayload.principalAmount,
          cam: buildApprovalCamPayload(sanctionPayload),
          revisionReason: sanctionRevisionReason.trim(),
          sanction: sanctionPayload,
          user: user?.name || "Credit Manager",
        });
        setLatestCamSheet(response.camSheet || latestCamSheet);
        setLatestSanction(response.sanction || null);
        setLatestLoanAgreement((agreement) => agreement
          ? { ...agreement, status: "superseded", supersededAt: new Date().toISOString() }
          : agreement);
        setLoanAgreementFeedback("Revised sanction sent. Now resend the loan agreement eSign so the customer receives corrected terms.");
        refreshActivities();
        setShowSanctionModal(false);
        setShowCAMSheet(false);
        toast.success("Revised sanction letter sent");
        return;
      }

      const response = await apiPost<WorkflowLeadResponse>(`/leads/${encodeURIComponent(leadId)}/credit-decision`, {
        approvedAmount: sanctionPayload.principalAmount,
        cam: buildApprovalCamPayload(sanctionPayload),
        decision: "approved",
        notes: buildCamSummary("approved"),
        sanction: sanctionPayload,
        user: user?.name || "Credit Manager",
      });
      applyUpdatedLead(response.lead);
      setLatestCamSheet(response.camSheet || null);
      setLatestEsign(response.esign || null);
      setLatestSanction(response.sanction || null);
      setLoanAgreementFeedback(response.sanction?.emailStatus === "sent"
        ? "Sanction sent. Next step: send the loan agreement through Digio for customer eSign."
        : "");
      if (response.sanction?.emailStatus === "failed") {
        setCamFeedback(`Loan approved, but sanction email failed: ${response.sanction.emailError}`);
      }
      refreshActivities();
      setShowSanctionModal(false);
      setShowCAMSheet(false);
      toast.success(response.sanction?.emailStatus === "failed"
        ? "Loan approved, but sanction email failed"
        : "Loan approved and sanction letter emailed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to approve CAM sheet";
      setCamFeedback(message);
      toast.error(message);
    } finally {
      setIsCamSaving(false);
    }
  };

  const handleRejectCamSheet = async () => {
    if (!leadId) return;

    try {
      setIsCamSaving(true);
      setCamFeedback("");
      const response = await apiPost<WorkflowLeadResponse>(`/leads/${encodeURIComponent(leadId)}/credit-decision`, {
        cam: buildCamPayload("rejected"),
        decision: "rejected",
        notes: camDecisionReason.trim() || camNotes.trim() || camConditions.trim() || "Rejected during credit review.",
        user: user?.name || "Credit Manager",
      });
      applyUpdatedLead(response.lead);
      setLatestCamSheet(response.camSheet || null);
      refreshActivities();
      setShowCAMSheet(false);
      toast.success("Lead rejected by credit manager");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to reject lead";
      setCamFeedback(message);
      toast.error(message);
    } finally {
      setIsCamSaving(false);
    }
  };

  const handleCopyCamSummary = async () => {
    const summary = buildCamSummary(camRecommendation === "Approve" || camRecommendation === "Approve with Conditions" ? "approved" : "saved");
    try {
      await navigator.clipboard.writeText(summary);
      toast.success("CAM summary copied");
    } catch {
      toast.info(summary, { autoClose: 10000 });
    }
  };

  const handleRequestMoreInfoCamSheet = async () => {
    if (!leadId) return;

    if (!creditDocumentGapRequestKeys.length) {
      if (!creditApprovalBlockers.length) {
        const message = "No missing document mapped for request. Add manual conditions/notes and save CAM.";
        setCamFeedback(message);
        toast.info(message);
        return;
      }

      try {
        setIsCamSaving(true);
        const fallbackConditions = camConditions.trim() || creditApprovalBlockers.join(", ");
        const camSheet = await apiPost<CamSheet>(`/leads/${encodeURIComponent(leadId)}/cam-sheet`, {
          ...buildCamPayload("draft"),
          recommendation: "Request More Information",
          conditions: fallbackConditions,
        });
        setLatestCamSheet(camSheet);
        setCamRecommendation("Request More Information");
        setCamConditions(fallbackConditions);
        setCamFeedback("CAM saved as Request More Information. Resolve the listed gaps before approval.");
        toast.success("CAM saved for more information");
        refreshActivities();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to save CAM request";
        setCamFeedback(message);
        toast.error(message);
      } finally {
        setIsCamSaving(false);
      }
      return;
    }

    await createDocumentRequestForKeys(creditDocumentGapRequestKeys);
    await addActivityNote(`Credit manager requested more information from CAM. Gaps: ${creditApprovalBlockers.join(", ") || "Document gap"}.`);
    setCamRecommendation("Request More Information");
    setShowCAMSheet(false);
    setActiveTab("documents");
  };

  const handleMarkPaymentComplete = async () => {
    if (!leadId) return;
    const transactionId = paymentReference.trim();
    if (!transactionId) {
      const message = "Submit UTR / transaction ID before marking fund transfer.";
      setPaymentFeedback(message);
      toast.warning(message);
      return;
    }

    try {
      setIsPaymentSaving(true);
      setPaymentFeedback("");
      const response = await apiPost<WorkflowLeadResponse>(`/leads/${encodeURIComponent(leadId)}/accounting-payment`, {
        transactionId,
        transferType: paymentMethod,
        notes: paymentNotes,
        disbursementDate: paymentDisbursementDate || undefined,
        user: user?.name || "Accountant",
      });
      applyUpdatedLead(response.lead);
      setPaymentReference("");
      setPaymentNotes("");
      setPaymentFeedback("Payment completed, loan activated, and collection tracking started.");
      refreshActivities();
      toast.success("Payment marked complete");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to mark payment complete";
      setPaymentFeedback(message);
      toast.error(message);
    } finally {
      setIsPaymentSaving(false);
    }
  };

  const documents = useMemo(() => {
    const cibilUrl = cibilReport?.pdfUrl || "";
    const latestUploadedRequestsByKey = new Map<string, LeadDocumentRequest>();
    documentRequests
      .filter((request) => request.uploadedFile)
      .sort((first, second) => new Date(second.uploadedAt || second.createdAt || 0).getTime() - new Date(first.uploadedAt || first.createdAt || 0).getTime())
      .forEach((request) => {
        if (!latestUploadedRequestsByKey.has(request.documentKey)) {
          latestUploadedRequestsByKey.set(request.documentKey, request);
        }
      });
    const uploadedRequestRows = Array.from(latestUploadedRequestsByKey.values())
      .map((request) => ({
        id: 1000 + request.id,
        documentKey: request.documentKey,
        name: request.label,
        type: "Customer Upload",
        uploadedDate: request.uploadedAt || request.createdAt || "Not provided",
        value: request.uploadedFile,
        displayFileName: request.originalFileName || getFileName(request.uploadedFile),
        status: "Uploaded",
        isFile: true,
      }));
    const documentRows = [
      { id: 1, documentKey: "pan", name: "PAN / ID details", type: "Identity", uploadedDate: lead.createdDate || "Not provided", value: "", displayFileName: "", status: lead.panNumber ? "Verified" : "Pending", isFile: false },
      { id: 2, documentKey: "aadhaar", name: "Aadhaar verification", type: "KYC", uploadedDate: aadhaarReport?.createdAt || lead.createdDate || "Not provided", value: "", displayFileName: "", status: hasUsableAadhaarData(aadhaarReport) || lead.aadhaarVerified ? "Verified" : "Pending", isFile: false },
      { id: 3, documentKey: "salary_slip_current", name: "Current salary slip", type: "Income", uploadedDate: lead.createdDate || "Not provided", value: lead.salarySlipCurrent || "", displayFileName: getFileName(lead.salarySlipCurrent), status: lead.salarySlipCurrent ? "Verified" : "Pending", isFile: true },
      { id: 4, documentKey: "salary_slip_previous", name: "Previous salary slip", type: "Income", uploadedDate: lead.createdDate || "Not provided", value: lead.salarySlipPrevious || "", displayFileName: getFileName(lead.salarySlipPrevious), status: lead.salarySlipPrevious ? "Verified" : "Pending", isFile: true },
      { id: 5, documentKey: "salary_slip_old", name: "Old salary slip", type: "Income", uploadedDate: lead.createdDate || "Not provided", value: lead.salarySlipOld || "", displayFileName: getFileName(lead.salarySlipOld), status: lead.salarySlipOld ? "Verified" : "Pending", isFile: true },
      { id: 6, documentKey: "selfie", name: "Selfie image", type: "KYC", uploadedDate: lead.createdDate || "Not provided", value: lead.selfieImage || "", displayFileName: getFileName(lead.selfieImage), status: lead.selfieImage ? "Verified" : "Pending", isFile: true },
      { id: 7, documentKey: "video_kyc", name: "Video KYC", type: "KYC", uploadedDate: lead.createdDate || "Not provided", value: lead.videoKyc || "", displayFileName: getFileName(lead.videoKyc), status: lead.videoKyc ? "Verified" : "Pending", isFile: true },
      { id: 8, documentKey: "cibil_report", name: "CIBIL Report", type: "Credit", uploadedDate: cibilReport?.createdAt || lead.createdDate || "Not provided", value: cibilUrl, displayFileName: getFileName(cibilUrl), status: cibilUrl ? "Verified" : "Pending", isFile: true },
      ...uploadedRequestRows,
    ];

    return documentRows.map((document) => ({
      ...document,
      fileName: document.isFile ? document.displayFileName || getFileName(document.value) : "",
      href: document.isFile ? getDocumentHref(document.value) : "",
      isImage: document.isFile && isImageFile(document.value),
      isVideo: document.isFile && isVideoFile(document.value),
      storageLabel: document.isFile ? getDocumentStorageLabel(getDocumentHref(document.value)) : "",
    }));
  }, [lead, cibilReport, aadhaarReport, documentRequests]);

  const selfieProfileDocument = useMemo(
    () => documents.find((document) => document.documentKey === "selfie" && document.href),
    [documents],
  );

  const documentRequestGroups = useMemo(() => {
    const groups = new Map<string, LeadDocumentRequest[]>();
    documentRequests.forEach((request) => {
      const groupKey = request.groupToken || request.token;
      const existingRequests = groups.get(groupKey) || [];
      groups.set(groupKey, [...existingRequests, request]);
    });

    return Array.from(groups.entries())
      .filter(([token, requests]) => (
        !removedDocumentGroupTokens.includes(token) &&
        requests.some((request) => request.status !== "cancelled")
      ))
      .map(([token, requests]) => {
        const sortedRequests = [...requests].sort((first, second) => first.id - second.id);
        const createdAt = sortedRequests[0]?.createdAt || "";
        const expiresAt = sortedRequests[0]?.expiresAt || "";
        const isUploaded = sortedRequests.every((request) => request.status === "uploaded");
        const isExpired = Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());

        return {
          token,
          requests: sortedRequests,
          createdAt,
          expiresAt,
          isUploaded,
          isExpired,
        };
      })
      .sort((first, second) => new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime());
  }, [documentRequests, removedDocumentGroupTokens]);

  const loanAmount = Number(lead.loanAmount || 0);
  const totalIncome = Number(lead.monthlyIncome || 0);
  const totalExpenses = 0;
  const netIncome = totalIncome - totalExpenses;
  const debtRatio = totalIncome > 0 ? ((totalExpenses / totalIncome) * 100).toFixed(1) : "0.0";
  const displayedCreditScore = cibilReport?.score ?? null;
  const isProviderCibilScore = cibilReport?.scoreSource === "provider";
  const isAnalyzedCibilScore = cibilReport?.scoreSource === "analysis";
  const cibilPdfUrl = cibilReport?.pdfUrl || "";
  const cibilAnalysis = cibilReport?.analysis || null;
  const cibilAnalysisStatus = cibilReport?.analysisStatus || "";
  const cibilAnalysisError = cibilReport?.analysisError || "";
  const cibilIsStalePending = cibilReport?.status === "pending" && Boolean(cibilReport?.isStale);
  const cibilNeedsAttention = cibilReport?.status === "failed" || Boolean(cibilReport?.isStale) || Boolean(cibilError);
  const cibilFailureMessage = providerRecoveryMessage("CIBIL", cibilReport?.message || cibilError);
  const cibilCanRetry = cibilNeedsAttention && !isCibilPending && Boolean(lead.panNumber && lead.phone) && cibilReport?.retryable !== false;
  const cibilStatusLabel = cibilAnalysisStatus === "processing"
    ? "Analyzing"
    : cibilPdfUrl
      ? cibilAnalysis
        ? "Ready"
        : "PDF ready"
      : cibilReport?.status === "failed" || cibilError
        ? "Failed"
        : cibilIsStalePending
          ? "Delayed"
          : isCibilPolling
            ? "Checking"
            : "Not started";
  const cibilStatusClasses = cibilAnalysisStatus === "processing"
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : cibilPdfUrl
      ? "border-green-200 bg-green-50 text-green-700"
      : cibilReport?.status === "failed" || cibilError
        ? "border-red-200 bg-red-50 text-red-700"
        : cibilIsStalePending
          ? "border-yellow-200 bg-yellow-50 text-yellow-800"
          : isCibilPolling
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-gray-200 bg-gray-50 text-gray-600";
  const cibilPrimaryDisabled = isCibilLoading || isCibilPolling || !lead.phone;
  const cibilPrimaryLabel = isCibilLoading
    ? "Submitting..."
    : isCibilPollingRefresh
      ? "Fetching CIBIL status..."
      : isCibilPolling
        ? cibilIsStalePending
          ? "Still checking CIBIL..."
          : "Generating report..."
        : cibilNeedsAttention
          ? "Retry CIBIL Fetch"
          : "Fetch CIBIL Report";
  const cibilPollSeconds = Math.round(cibilPollIntervalMs / 1000);
  const cibilLastCheckedLabel = formatClockTime(cibilLastCheckedAt);
  const cibilCanAnalyze = Boolean(cibilPdfUrl && !isCibilAnalyzing && cibilAnalysisStatus !== "processing");
  const activeLoanItems = getAnalysisItems(cibilAnalysis?.activeLoans);
  const closedLoanItems = getAnalysisItems(cibilAnalysis?.closedInactiveLoans);
  const enquiryItems = getAnalysisItems(cibilAnalysis?.creditEnquiries);
  const writtenOffItems = getAnalysisItems(cibilAnalysis?.writtenOffSettledAccounts);
  const dpdHistoryItems = getAnalysisItems(cibilAnalysis?.dpdHistory);
  const riskReasonItems = getAnalysisItems(cibilAnalysis?.riskReasons);
  const hasAadhaarData = hasUsableAadhaarData(aadhaarReport);
  const aadhaarFailureMessage = providerRecoveryMessage("Aadhaar", aadhaarError);
  const aadhaarCanRetry = Boolean(aadhaarError && lead.aadhaarUniqueId);
  const aadhaarMaskedFromReport = isXmlLike(aadhaarReport?.aadhaarMasked)
    ? ""
    : aadhaarReport?.aadhaarMasked || "";
  const aadhaarMasked = aadhaarMaskedFromReport || lead.aadhaarMasked || maskAadhaarNumber(lead.aadhaarNumber);
  const aadhaarNumberDisplay = lead.aadhaarNumber || aadhaarMasked || "";
  const approvedAmount = Number(camApprovedAmount || 0);
  const camInterestAmount = Math.round((approvedAmount * Number(camInterestRate || 0) * Number(camLoanTermDays || 0)) / 100);
  const camProcessingFee = Math.round((approvedAmount * Number(camProcessingFeeRate || 0)) / 100);
  const camGstAmount = Math.round(camProcessingFee * 0.18);
  const camTotalRepayment = approvedAmount + camInterestAmount;
  const repaymentBuffer = camTotalRepayment > 0 ? netIncome / camTotalRepayment : 0;
  const systemRecommendedEligibleAmount = Math.max(0, Math.min(loanAmount || totalIncome * 0.5, netIncome * 0.6));
  const recommendedEligibleAmount = Number(camRecommendedAmount || 0);
  const monthlyRepaymentEquivalent = Number(camLoanTermDays || 0) > 0
    ? Math.round((camTotalRepayment / Number(camLoanTermDays || 1)) * 30)
    : camTotalRepayment;
  const obligationAfterLoan = totalExpenses + monthlyRepaymentEquivalent;
  const foirAfterLoan = totalIncome > 0 ? Math.round((obligationAfterLoan / totalIncome) * 100) : 0;
  const camPolicyChecks = [
    { label: "CIBIL report available", passed: Boolean(cibilPdfUrl || displayedCreditScore) },
    { label: "Aadhaar / KYC verified", passed: Boolean(hasAadhaarData || lead.aadhaarVerified) },
    { label: "PAN captured", passed: Boolean(lead.panNumber) },
    { label: "Bank details captured", passed: Boolean(lead.bankName && lead.accountNumber && lead.ifscCode) },
    { label: "Income proof available", passed: Boolean(lead.salarySlipCurrent) },
    { label: "Minimum monthly income met", passed: totalIncome >= 15000 },
    { label: "Positive disposable income", passed: netIncome > 0 },
    { label: "DTI within policy", passed: Number(debtRatio) <= 50 },
    { label: "Repayment fits disposable income", passed: camTotalRepayment <= netIncome },
  ];
  const failedPolicyChecks = camPolicyChecks.filter((check) => !check.passed);
  const policyPassPercent = Math.round(((camPolicyChecks.length - failedPolicyChecks.length) / camPolicyChecks.length) * 100);
  const camDecisionTone = camRecommendation === "Reject"
    ? "text-red-700 bg-red-50 border-red-200"
    : camRecommendation === "Request More Information"
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : "text-green-700 bg-green-50 border-green-200";
  const hasDocumentEvidence = (key: string) => {
    switch (key) {
      case "pan":
        return Boolean(lead.panNumber) || hasUploadedDocumentRequest("pan");
      case "aadhaar":
        return Boolean(hasAadhaarData || lead.aadhaarVerified) || hasUploadedDocumentRequest("aadhaar");
      case "aadhaar_front":
        return hasUploadedDocumentRequest("aadhaar_front");
      case "aadhaar_back":
        return hasUploadedDocumentRequest("aadhaar_back");
      case "selfie":
        return Boolean(lead.selfieImage) || hasUploadedDocumentRequest("selfie");
      case "video_kyc":
        return Boolean(lead.videoKyc) || hasUploadedDocumentRequest("video_kyc");
      case "salary_slip_current":
        return Boolean(lead.salarySlipCurrent) || hasUploadedDocumentRequest("salary_slip_current");
      case "salary_slip_previous":
        return hasUploadedDocumentRequest(["salary_slip_previous", "salary_slip_old", "salary_slip_last_3_6_months"]);
      case "company_id_card":
        return hasUploadedDocumentRequest("company_id_card");
      case "bank_details":
        return Boolean(lead.bankName && lead.accountNumber && lead.ifscCode) || hasUploadedDocumentRequest(["bank_proof", "bank_statement_last_6_months", "bank_statement_6_months", "cancelled_cheque"]);
      case "cibil":
        return Boolean(cibilPdfUrl || displayedCreditScore);
      default:
        return hasUploadedDocumentRequest(key);
    }
  };
  const getEffectiveDocumentCheckStatus = (check: TelecallerDocumentCheck) => (
    hasDocumentEvidence(check.key) ? check.status : "pending"
  );
  const verifiedDocumentChecks = telecallerWorkspace.documentChecks.filter((check) => getEffectiveDocumentCheckStatus(check) === "verified").length;
  const totalDocumentChecks = telecallerWorkspace.documentChecks.length;
  const verificationPercent = totalDocumentChecks ? Math.round((verifiedDocumentChecks / totalDocumentChecks) * 100) : 0;
  const creditDocumentGapChecks = telecallerWorkspace.documentChecks.filter((check) => {
    const status = getEffectiveDocumentCheckStatus(check);
    return status === "pending" || status === "uploaded" || status === "rejected";
  });
  const creditDocumentGapRequestKeys = Array.from(new Set(
    creditDocumentGapChecks
      .map((check) => DOCUMENT_REQUEST_KEY_BY_CHECK_KEY[check.key] || check.key)
      .filter((key) => DOCUMENT_REQUEST_OPTIONS.some((option) => option.key === key))
  ));
  const evidenceReadyDocumentChecks = telecallerWorkspace.documentChecks.filter((check) => (
    hasDocumentEvidence(check.key) && getEffectiveDocumentCheckStatus(check) !== "verified"
  ));
  const selectedVerificationChecks = telecallerWorkspace.documentChecks.filter((check) => selectedVerificationKeys.includes(check.key));
  const selectedEvidenceReadyCount = selectedVerificationChecks.filter((check) => hasDocumentEvidence(check.key)).length;
  const allEvidenceReadySelected = evidenceReadyDocumentChecks.length > 0
    && evidenceReadyDocumentChecks.every((check) => selectedVerificationKeys.includes(check.key));
  const toggleVerificationKey = (key: string) => {
    setSelectedVerificationKeys((currentKeys) => (
      currentKeys.includes(key)
        ? currentKeys.filter((currentKey) => currentKey !== key)
        : [...currentKeys, key]
    ));
  };
  const toggleEvidenceReadyDocumentChecks = () => {
    const readyKeys = evidenceReadyDocumentChecks.map((check) => check.key);
    setSelectedVerificationKeys((currentKeys) => {
      if (readyKeys.length && readyKeys.every((key) => currentKeys.includes(key))) {
        return currentKeys.filter((key) => !readyKeys.includes(key));
      }

      return Array.from(new Set([...currentKeys, ...readyKeys]));
    });
  };
  const latestCallLog = telecallerWorkspace.callLogs[0];
  const nextOpenFollowup = telecallerWorkspace.followups.find((followup) => followup.status === "open" || followup.status === "scheduled");
  const canRequestDocuments = isTelecallerRole || isCreditManagerRole;
  const latestCreditHandoffStatus = telecallerWorkspace.latestHandoff?.status || "";
  const isReadyCreditHandoff = latestCreditHandoffStatus === "ready";
  const isTerminalLead = lead.status === "Qualified" || lead.status === "Converted" || lead.status === "Lost";
  const canCreateCreditHandoff = !isReadyCreditHandoff && !isTerminalLead && latestCreditHandoffStatus !== "approved";
  const canCompleteCreditDecision = isCreditManagerRole && isReadyCreditHandoff && lead.status !== "Qualified" && lead.status !== "Converted" && lead.status !== "Lost";
  const creditDecisionBlockReason = !isCreditManagerRole
    ? ""
    : !telecallerWorkspace.latestHandoff
      ? "Telecaller handoff is required before credit decision."
      : !isReadyCreditHandoff
        ? `This handoff is already ${latestCreditHandoffStatus}. Use Credit Applications to track the next stage.`
        : lead.status === "Qualified"
          ? "Loan is already approved. Send or track loan agreement eSign from this page."
          : lead.status === "Converted"
            ? "Loan is already disbursed."
            : lead.status === "Lost"
              ? "Lead is already rejected."
              : "";
  const isSanctionCustomerAccepted = latestSanction?.customerDecision === "accepted";
  const canSendLoanAgreement = isCreditManagerRole && Boolean(latestSanction?.emailStatus === "sent") && isSanctionCustomerAccepted && latestSanction?.status !== "superseded" && lead.status !== "Lost";

  const canCompletePayment = isAccountantRole && lead.status === "Qualified" && hasSignedDisbursementAgreement;
  const uploadedDocumentCount = documents.filter((document) => document.status === "Verified" || document.status === "Uploaded").length;
  const pendingDocumentCount = Math.max(0, documents.length - uploadedDocumentCount);
  const readinessChecks = [
    { label: "PAN captured", actionLabel: "Capture PAN", isComplete: Boolean(lead.panNumber) },
    { label: "Aadhaar / KYC verified", actionLabel: "Verify Aadhaar / KYC", isComplete: Boolean(hasAadhaarData || lead.aadhaarVerified) },
    { label: "Bank details captured", actionLabel: "Capture verified bank details", isComplete: Boolean(lead.bankName && lead.accountNumber && lead.ifscCode) },
    { label: "Income proof available", actionLabel: "Upload current income proof", isComplete: Boolean(lead.salarySlipCurrent) },
    { label: "CIBIL ready", actionLabel: "Generate CIBIL report", isComplete: Boolean(cibilPdfUrl || displayedCreditScore) },
    { label: "Document checklist optional", actionLabel: "Review document checklist", isComplete: true },
  ];
  const completedReadinessChecks = readinessChecks.filter((check) => check.isComplete).length;
  const readinessPercent = Math.round((completedReadinessChecks / readinessChecks.length) * 100);
  const firstMissingReadiness = readinessChecks.find((check) => !check.isComplete)?.label || "Profile complete";
  const riskGrade = (() => {
    const score = Number(displayedCreditScore || 0);
    if (score >= 750 && repaymentBuffer >= 1.5 && policyPassPercent >= 90) return "A";
    if (score >= 700 && repaymentBuffer >= 1.25 && policyPassPercent >= 80) return "B";
    if (score >= 650 && repaymentBuffer >= 1 && policyPassPercent >= 70) return "C";
    if (score || policyPassPercent >= 60) return "D";
    return "Refer";
  })();
  const decisionPolicyGaps = failedPolicyChecks.filter((check) => !OPTIONAL_DOCUMENT_POLICY_LABELS.has(check.label));
  const hasLowCreditScore = Number(displayedCreditScore || 0) > 0 && Number(displayedCreditScore || 0) < 600;
  const recommendedDecision = decisionPolicyGaps.length > 3 || repaymentBuffer < 1 || hasLowCreditScore
    ? "Reject"
    : decisionPolicyGaps.length || camDeviationLevel !== "None" || foirAfterLoan > CAM_FOIR_POLICY_LIMIT
      ? "Approve with Conditions"
      : "Approve";
  const creditApprovalBlockers = [
    ...decisionPolicyGaps.map((check) => {
      switch (check.label) {
        case "CIBIL report available":
          return "Generate CIBIL report";
        case "Aadhaar / KYC verified":
          return "Verify Aadhaar / KYC";
        case "PAN captured":
          return "Capture PAN";
        case "Bank details captured":
          return "Capture verified bank details";
        case "Income proof available":
          return "Upload current income proof";
        case "Minimum monthly income met":
          return "Minimum monthly income not met";
        case "Positive disposable income":
          return "Positive disposable income required";
        case "DTI within policy":
          return "Bring DTI within policy";
        case "Repayment fits disposable income":
          return "Reduce amount or improve repayment capacity";
        default:
          return check.label;
      }
    }),
  ].filter((value, index, list) => list.indexOf(value) === index);
  const hasCreditApprovalBlockers = creditApprovalBlockers.length > 0;
  const systemCamRecommendation: CamRecommendation = recommendedDecision as CamRecommendation;
  const camAmountError = approvedAmount <= 0
    ? "Approved amount must be greater than zero."
    : "";
  const needsDeviationReason = CAM_APPROVAL_RECOMMENDATIONS.includes(camRecommendation as typeof CAM_APPROVAL_RECOMMENDATIONS[number])
    && !camAmountError
    && (
      approvedAmount > recommendedEligibleAmount
      || foirAfterLoan > CAM_FOIR_DEVIATION_LIMIT
      || riskGrade === "D"
      || riskGrade === "Refer"
    )
    && !camDecisionReason.trim()
    && !camNotes.trim();
  const needsConditionalApprovalReason = camRecommendation === "Approve with Conditions" && !camConditions.trim();
  const needsRejectReason = camRecommendation === "Reject" && !camDecisionReason.trim() && !camNotes.trim() && !camConditions.trim();
  const camApprovalWarnings = [
    approvedAmount > loanAmount ? "Approved amount is higher than the requested amount." : "",
    needsConditionalApprovalReason ? "Conditional approval has no conditions entered." : "",
    needsDeviationReason ? "Deviation or higher-risk approval has no underwriter note." : "",
    ...creditApprovalBlockers.map((blocker) => `Policy gap: ${blocker}`),
  ].filter(Boolean);
  const creditLifecycleComplete = ["Qualified", "Converted", "Lost"].includes(lead.status) || Boolean(latestSanction || latestLoanAgreement);
  const canApproveCam = isCreditManagerRole
    && canCompleteCreditDecision
    && !camAmountError;
  const canOpenCamSheet = isCreditManagerRole && (canCompleteCreditDecision || creditLifecycleComplete || Boolean(latestCamSheet));
  const statusBadgeClasses = lead.status === "Converted"
    ? "border-green-200 bg-green-50 text-green-700"
    : lead.status === "Lost"
      ? "border-red-200 bg-red-50 text-red-700"
      : lead.status === "Document Collection"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-slate-200 bg-white text-slate-700";
  const backLink = isCreditManagerRole
    ? canCompleteCreditDecision
      ? { href: "/credit-manager", label: "Back to Credit Queue" }
      : { href: "/credit-applications", label: "Back to Credit Applications" }
    : isAccountantRole
      ? { href: "/accountant", label: "Back to Accountant Queue" }
      : { href: leadReturnHref, label: "Back to Leads" };
  const creditNextStepText = (() => {
    if (!telecallerWorkspace.latestHandoff) return "Telecaller handoff is required before this lead can be reviewed by credit manager.";
    if (lead.status === "Converted") return "Loan is already disbursed. Use this page for historical documents, CAM, sanction, and agreement review.";
    if (lead.status === "Lost") return "Lead has been rejected. Review CAM notes and activity history for the decision reason.";
    if (lead.status === "Qualified") {
      if (latestLoanAgreement?.status === "signed") return "Loan agreement is signed. Accountant can complete disbursement.";
      if (latestLoanAgreement?.status === "sent") return "Loan agreement has been sent. Track customer eSign status from the agreement card.";
      if (latestSanction?.emailStatus === "sent") return "Sanction letter is sent. Next step is sending the loan agreement for eSign.";
      return "Loan is approved. Review sanction and agreement status before accountant disbursement.";
    }
    if (canCompleteCreditDecision) return "Review documents, complete CAM, then approve, request more information, or reject.";
    return creditDecisionBlockReason || "Open Credit Applications to track this lead's current stage.";
  })();
  const canEditLeadOperations = isTelecallerRole;
  const canTelecallerRejectLead = isTelecallerRole && !["Qualified", "Converted", "Lost"].includes(lead.status);
  const priorityBadgeClasses = lead.priority === "Urgent"
    ? "border-red-200 bg-red-50 text-red-700"
    : lead.priority === "High"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-white text-slate-700";
  const scoreTone = Number(displayedCreditScore || 0) >= 700
    ? "success"
    : Number(displayedCreditScore || 0) >= 600
      ? "warning"
      : displayedCreditScore
        ? "danger"
        : "default";
  const tabs = [
    { id: "details", label: "Details", badge: `${readinessPercent}% ready` },
    { id: "documents", label: "Documents", badge: `${uploadedDocumentCount}/${documents.length}` },
    { id: "activity", label: "Activity", badge: String(activities.length) },
    ...(lead.pastLoans && lead.pastLoans.length > 0 ? [{ id: "past-loans", label: "Past Loans", badge: String(lead.pastLoans.length) }] : []),
  ];

  useEffect(() => {
    if (!showCAMSheet) {
      camHydrationKeyRef.current = "";
      return;
    }

    if (latestCamSheet) {
      const camHydrationKey = `saved:${latestCamSheet.id}:${latestCamSheet.version}:${latestCamSheet.updatedAt || ""}`;
      if (camHydrationKeyRef.current === camHydrationKey) return;

      const savedRecommendedAmount = Number.isFinite(latestCamSheet.recommendedAmount)
        ? latestCamSheet.recommendedAmount
        : systemRecommendedEligibleAmount || loanAmount || 0;
      setCamRecommendedAmount(String(Math.round(savedRecommendedAmount)));
      setCamApprovedAmount(String(Math.round(Number.isFinite(latestCamSheet.approvedAmount) ? latestCamSheet.approvedAmount : savedRecommendedAmount || loanAmount || 0)));
      setCamLoanTermDays(String(latestCamSheet.loanTermDays || 30));
      const savedInterestRate = String(latestCamSheet.interestRate || 1);
      const savedProcessingFeeRate = String(latestCamSheet.processingFeeRate || 10);
      setCamInterestRate(CAM_INTEREST_RATE_OPTIONS.includes(savedInterestRate) ? savedInterestRate : "1");
      setCamProcessingFeeRate(CAM_PROCESSING_FEE_OPTIONS.includes(savedProcessingFeeRate) ? savedProcessingFeeRate : "10");
      setCamCreditRisk(latestCamSheet.creditRisk || "Medium");
      setCamRepaymentCapacity(latestCamSheet.repaymentCapacity || "Good");
      const savedRecommendation = CAM_RECOMMENDATIONS.includes(latestCamSheet.recommendation as CamRecommendation)
        ? latestCamSheet.recommendation as CamRecommendation
        : systemCamRecommendation;
      setCamRecommendation(savedRecommendation);
      setCamDeviationLevel(latestCamSheet.deviationLevel || "None");
      setCamDecisionReason(latestCamSheet.decisionReason || "");
      setCamConditions(latestCamSheet.conditions || "");
      setCamNotes(latestCamSheet.notes || "");
      setCamFeedback(`Loaded saved CAM v${latestCamSheet.version} (${latestCamSheet.status}).`);
      camHydrationKeyRef.current = camHydrationKey;
      return;
    }

    const camHydrationKey = `new:${leadId || lead.id || "lead"}`;
    if (camHydrationKeyRef.current === camHydrationKey) return;

    const score = Number(displayedCreditScore || 0);
    const nextRisk = score >= 750 && Number(debtRatio) <= 35
      ? "Low"
      : score && (score < 650 || Number(debtRatio) > 55)
        ? "High"
        : "Medium";
    const nextCapacity = repaymentBuffer >= 1.75
      ? "Excellent"
      : repaymentBuffer >= 1.25
        ? "Good"
        : repaymentBuffer >= 1
          ? "Fair"
          : "Poor";
    const nextRecommendation: CamRecommendation = nextRisk === "High" || nextCapacity === "Poor" || decisionPolicyGaps.length > 3
      ? "Request More Information"
      : decisionPolicyGaps.length
        ? "Approve with Conditions"
        : "Approve";

    const initialRecommendedAmount = Math.round(systemRecommendedEligibleAmount || loanAmount || 0);
    setCamRecommendedAmount(String(initialRecommendedAmount));
    setCamApprovedAmount(String(initialRecommendedAmount));
    setCamCreditRisk(nextRisk);
    setCamRepaymentCapacity(nextCapacity);
    setCamRecommendation(nextRecommendation);
    setCamDeviationLevel(decisionPolicyGaps.length > 2 || Number(debtRatio) > 50 || repaymentBuffer < 1 ? "Major" : decisionPolicyGaps.length ? "Minor" : "None");
    setCamDecisionReason("");
    setCamFeedback("");
    camHydrationKeyRef.current = camHydrationKey;
  }, [showCAMSheet, latestCamSheet, displayedCreditScore, debtRatio, repaymentBuffer, decisionPolicyGaps.length, systemRecommendedEligibleAmount, loanAmount, systemCamRecommendation, leadId, lead.id]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "call":
        return <Phone className="h-4 w-4 text-blue-600" />;
      case "email":
        return <Mail className="h-4 w-4 text-green-600" />;
      case "status":
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      case "note":
        return <FileText className="h-4 w-4 text-purple-600" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const getDocumentStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1";
    switch (status) {
      case "Verified":
        return (
          <span className={`${baseClasses} bg-green-100 text-green-800`}>
            <CheckCircle className="h-3 w-3" />
            {status}
          </span>
        );
      case "Pending":
        return (
          <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>
            <AlertCircle className="h-3 w-3" />
            {status}
          </span>
        );
      default:
        return (
          <span className={`${baseClasses} bg-gray-100 text-gray-800`}>
            {status}
          </span>
        );
    }
  };

  const getDocumentCheckBadge = (status: string) => {
    const baseClasses = "rounded-full px-2 py-1 text-xs font-semibold";
    switch (status) {
      case "verified":
        return <span className={`${baseClasses} bg-green-100 text-green-800`}>Verified</span>;
      case "uploaded":
        return <span className={`${baseClasses} bg-blue-100 text-blue-800`}>Uploaded</span>;
      case "rejected":
        return <span className={`${baseClasses} bg-red-100 text-red-800`}>Rejected</span>;
      default:
        return <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>Pending</span>;
    }
  };

  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
      {isAssignedToOtherTelecaller && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <h4 className="font-semibold text-sm">Read-Only Mode (Alert)</h4>
            <p className="text-sm mt-0.5">
              This lead is assigned to {lead.assignedTo && !["unassigned", "intake queue", "none", "", "null", "undefined"].includes(lead.assignedTo.trim().toLowerCase()) ? `"${lead.assignedTo}"` : "another telecaller"}. You are in read-only mode and cannot take action on this lead.
            </p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="mb-6">
        <Link
          to={backLink.href}
          className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLink.label}
        </Link>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClasses}`}>
                  {lead.status}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${priorityBadgeClasses}`}>
                  {lead.priority} priority
                </span>
                {(Boolean(lead.isDuplicate) || Number(lead.duplicateCount || 0) > 0) && (
                  <button
                    type="button"
                    onClick={() => setDuplicateModalOpen(true)}
                    className="rounded-full border border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/50 dark:hover:bg-amber-900/70 px-3 py-1 text-xs font-bold text-amber-900 dark:text-amber-200 transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                    title="Click to view matching duplicate lead records"
                  >
                    <Copy className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Duplicate Lead ({lead.duplicateCount || 1} match in CRM)</span>
                    <span className="text-amber-600 dark:text-amber-400 font-extrabold ml-0.5">➔</span>
                  </button>
                )}
              </div>
              <h2 className="truncate text-2xl font-bold text-slate-950 sm:text-3xl">{lead.name || "Lead details"}</h2>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                <span>Lead ID: {getLeadDisplayId(lead)}</span>
                <span>Source: {lead.source || "Not provided"}</span>
                <span>Created: {formatActivityDate(lead.createdDate)}</span>
              </div>


            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {/* Primary Actions First */}
              {isTelecallerRole && (
                <AppTooltip label="Documents are optional; lead can be handed off for credit review">
                  <button
                    type="button"
                    onClick={() => setActiveTab("details")}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2 sm:px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition"
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    Ready for Handoff
                  </button>
                </AppTooltip>
              )}
              {lead && (lead.status === "Closed" || lead.status === "closed") && (currentRole === "credit-manager" || currentRole === "superadmin" || currentRole === "product-admin") && (
                <button
                  type="button"
                  onClick={handleInitiateReloan}
                  disabled={isInitiating}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-2.5 sm:px-3.5 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-60 shadow-sm"
                >
                  <UserPlus className="h-4 w-4" />
                  {isInitiating ? "Initiating..." : "Initiate Reloan"}
                </button>
              )}
              {isAccountantRole && (
                <button
                  type="button"
                  onClick={() => setActiveTab("details")}
                  className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-md px-2 sm:px-3 text-sm font-semibold transition shadow-sm ${canCompletePayment
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                    }`}
                  disabled={!canCompletePayment}
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Disburse Loan
                </button>
              )}
              {isCreditManagerRole && !canOpenCamSheet && (
                <AppTooltip label={creditNextStepText}>
                  <Link
                    to="/credit-applications"
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-slate-200 px-2 sm:px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    Track Stage
                  </Link>
                </AppTooltip>
              )}

              {/* Secondary Actions (Communication/Notes) */}
              <AppTooltip label={lead.phone ? "Call this lead" : "Phone number is not available"}>
                <a
                  href={lead.phone ? `tel:${lead.phone}` : undefined}
                  aria-disabled={!lead.phone}
                  className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-md border px-2 sm:px-3 text-sm font-semibold transition ${lead.phone
                    ? "border-slate-300 text-slate-700 hover:bg-slate-50"
                    : "pointer-events-none border-slate-200 text-slate-400"
                    }`}
                >
                  <Phone className="h-4 w-4" />
                  Call
                </a>
              </AppTooltip>
              <AppTooltip label={lead.email ? "Email this lead" : "Email is not available"}>
                <a
                  href={lead.email ? `mailto:${lead.email}` : undefined}
                  aria-disabled={!lead.email}
                  className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-md border px-2 sm:px-3 text-sm font-semibold transition ${lead.email
                    ? "border-slate-300 text-slate-700 hover:bg-slate-50"
                    : "pointer-events-none border-slate-200 text-slate-400"
                    }`}
                >
                  <Mail className="h-4 w-4" />
                  Email
                </a>
              </AppTooltip>
              <AppTooltip label="Add or review activity notes">
                <button
                  type="button"
                  onClick={() => setActiveTab("activity")}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-slate-300 px-2 sm:px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <MessageSquare className="h-4 w-4" />
                  Note
                </button>
              </AppTooltip>
              {canRequestDocuments && (
                <AppTooltip label="Generate or manage document upload links">
                  <button
                    type="button"
                    onClick={() => setActiveTab("documents")}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-blue-200 px-2 sm:px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 transition"
                  >
                    <FileText className="h-4 w-4" />
                    Request Docs
                  </button>
                </AppTooltip>
              )}
              {canRemoveLeads && (
                <AppTooltip label="Permanently remove this lead and related records">
                  <button
                    type="button"
                    onClick={() => setShowDeleteLeadDialog(true)}
                    disabled={isLeadDeleting}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    {isLeadDeleting ? "Removing..." : "Remove Lead"}
                  </button>
                </AppTooltip>
              )}

            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryMetric label="Requested amount" value={formatCurrency(lead.loanAmount)} />
            <SummaryMetric label="Monthly income" value={formatCurrency(lead.monthlyIncome)} />
            <SummaryMetric label="Credit score" tone={scoreTone} value={displayedCreditScore || "Not fetched"} />
            <SummaryMetric label="Documents" tone="default" value={`${uploadedDocumentCount}/${documents.length} uploaded`} />
            <SummaryMetric
              label="Next follow-up"
              tone={nextOpenFollowup ? "warning" : "default"}
              value={nextOpenFollowup ? formatActivityDate(nextOpenFollowup.dueAt) : "Not scheduled"}
            />
          </div>
          <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${isTelecallerRole
            ? "border-green-200 bg-green-50 text-green-800"
            : isCreditManagerRole
              ? "border-blue-200 bg-blue-50 text-blue-800"
              : "border-slate-200 bg-slate-50 text-slate-700"
            }`}>
            {isTelecallerRole && (
              <p>
                Telecaller next step: add a handoff note and mark ready for credit review. Document checks are optional.
              </p>
            )}
            {isCreditManagerRole && (
              <p>Credit manager next step: {creditNextStepText}</p>
            )}
            {isAccountantRole && (
              <p>
                Accountant next step: payment can be completed only when lead status is Qualified and the customer loan agreement eSign is completed.
                {latestLoanAgreement ? ` Current agreement status: ${latestLoanAgreement.status}.` : ""}
              </p>
            )}
          </div>
          {isCreditManagerRole && (
            <div className="mt-4 rounded-lg border border-blue-100 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-slate-950">Credit Review Summary</h3>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${creditLifecycleComplete
                  ? "bg-slate-100 text-slate-700"
                  : hasCreditApprovalBlockers ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                  }`}>
                  {creditLifecycleComplete ? "Historical" : hasCreditApprovalBlockers ? `${creditApprovalBlockers.length} advisories` : "Decision ready"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-600 md:grid-cols-4">
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="font-semibold text-slate-950">Readiness</p>
                  <p className="mt-1">{readinessPercent}% complete</p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="font-semibold text-slate-950">Docs gap</p>
                  <p className="mt-1">{creditDocumentGapChecks.length} pending/rejected</p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="font-semibold text-slate-950">Risk</p>
                  <p className="mt-1">{camCreditRisk} - {displayedCreditScore || "No score"}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="font-semibold text-slate-950">Repayment</p>
                  <p className="mt-1">{repaymentBuffer.toFixed(2)}x buffer</p>
                </div>
              </div>
              {!creditLifecycleComplete && creditApprovalBlockers.length > 0 && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                  Advisory before approval: {creditApprovalBlockers.slice(0, 5).join(", ")}
                  {creditApprovalBlockers.length > 5 ? "..." : ""}
                </div>
              )}
              {creditLifecycleComplete && (
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                  Credit review is no longer active for this lead. Use sanction, agreement, and activity sections below for audit trail.
                </div>
              )}
              {!creditLifecycleComplete && creditDocumentGapRequestKeys.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => createDocumentRequestForKeys(creditDocumentGapRequestKeys)}
                    disabled={isDocumentRequestSaving}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileText className="h-4 w-4" />
                    {isDocumentRequestSaving ? "Generating..." : "Request Missing Docs"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDocumentKeys(creditDocumentGapRequestKeys);
                      setActiveTab("documents");
                    }}
                    className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Review docs selection
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {apiError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {apiError}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3 pb-3 text-sm font-semibold transition-colors ${activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
            >
              {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${activeTab === tab.id ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"
                }`}>
                {tab.badge}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "details" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information */}
            <DetailSection icon={User} title="Personal Information">
              <DetailField label="Full Name" valueTone="strong">{lead.name || "Not provided"}</DetailField>
              <DetailField icon={Calendar} label="Date of Birth">{lead.dateOfBirth}</DetailField>
              <DetailField icon={Mail} label="Email">{lead.email || "Not provided"}</DetailField>
              <DetailField icon={Phone} label="Phone">{lead.phone || "Not provided"}</DetailField>
              <DetailField label="City">{lead.city || "Not provided"}</DetailField>
              <DetailField label="Pincode">{lead.pincode || "Not provided"}</DetailField>
              <DetailField className="md:col-span-2" icon={MapPin} label="Address">{lead.address}</DetailField>
            </DetailSection>

            {/* PAN Details */}
            <DetailSection icon={CreditCard} title="PAN Details">
              <DetailField label="PAN Number" valueTone="strong">{lead.panNumber || cibilReport?.pan || "Not provided"}</DetailField>
              <DetailField label="UAN Number">{lead.uanNumber || "Not provided"}</DetailField>
              <DetailField label="PAN Name">{cibilReport?.fullName || lead.name || "Not provided"}</DetailField>
              <DetailField label="Linked Mobile">{cibilReport?.mobile || lead.phone || "Not provided"}</DetailField>
              <DetailField label="Linked Email">{cibilReport?.email || lead.email || "Not provided"}</DetailField>
              <DetailField label="Verification Source">
                {cibilReport?.pan ? "CIBIL report" : lead.panNumber ? "Lead application" : "Not fetched"}
              </DetailField>
              <DetailField label="Verification Status" valueTone={lead.panNumber || cibilReport?.pan ? "success" : "warning"}>
                {lead.panNumber || cibilReport?.pan ? "Captured" : "Pending"}
              </DetailField>
            </DetailSection>

            {/* Aadhaar Details */}
            <DetailSection icon={ShieldCheck} title="Aadhaar Details">
              <DetailField label="Aadhaar Number" valueTone={aadhaarNumberDisplay ? "strong" : "default"}>
                {aadhaarNumberDisplay || "Not provided"}
              </DetailField>
              <DetailField label="Verification Status" valueTone={hasAadhaarData || lead.aadhaarVerified ? "success" : "warning"}>
                {hasAadhaarData || lead.aadhaarVerified ? "Verified" : "Pending"}
              </DetailField>
            </DetailSection>

            {/* Employment Information */}
            <DetailSection icon={Briefcase} title="Employment Information">
              <DetailField label="Employment Status">{lead.employmentStatus}</DetailField>
              <DetailField label="Employer">{lead.employer}</DetailField>
              <DetailField label="Job Title">{lead.jobTitle}</DetailField>
              <DetailField icon={DollarSign} label="Monthly Income" valueTone="strong">
                {formatCurrency(lead.monthlyIncome)}
              </DetailField>

              <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 mt-1">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 max-w-md">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Official Email</p>
                      {!isEditingOfficialEmail && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditedOfficialEmail(lead.officeEmail || lead.officialEmail || lead.email || "");
                            setIsEditingOfficialEmail(true);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit Email
                        </button>
                      )}
                    </div>

                    {isEditingOfficialEmail ? (
                      <div className="mt-2 flex items-center gap-2 max-w-md">
                        <input
                          type="email"
                          value={editedOfficialEmail}
                          onChange={(e) => setEditedOfficialEmail(e.target.value)}
                          placeholder="name@company.com"
                          className="flex-1 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white font-mono"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleSaveOfficialEmail}
                          disabled={isSavingOfficialEmail}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition cursor-pointer"
                        >
                          {isSavingOfficialEmail ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingOfficialEmail(false)}
                          disabled={isSavingOfficialEmail}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm font-bold text-slate-900 mt-0.5 font-mono break-all">
                        {lead.officeEmail || lead.officialEmail || lead.email || "Not provided"}
                      </p>
                    )}

                    {(() => {
                      const currentEmail = (lead.officeEmail || lead.officialEmail || lead.email || "").trim().toLowerCase();
                      const domain = currentEmail.split("@")[1] || "";
                      const freeProviders = ["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "hotmail.com", "outlook.com", "live.com", "icloud.com", "rediffmail.com", "aol.com", "zoho.com", "protonmail.com"];
                      const isFree = freeProviders.some((p) => domain.includes(p));

                      if (isFree) {
                        return (
                          <div className="space-y-2 mt-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800 border border-red-300">
                                🚫 Status: Rejected (Personal Email - @{domain || 'gmail.com'} Not Allowed)
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-300">
                                ⚠️ Free/Personal Provider (Gmail/Yahoo)
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-red-700 bg-red-50 p-2.5 rounded-xl border border-red-200">
                              ⚠️ <strong>Underwriting Rule Alert:</strong> Personal email domains (@gmail.com, @yahoo.com) cannot be accepted as Official Corporate Email. Please click "Edit Email" and enter a valid company email (e.g. user@company.com).
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2 mt-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {officialEmailVerified ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Status: Verified ✓
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                                Status: Not Verified
                              </span>
                            )}
                          </div>

                          {/* Domain Intelligence & Age Breakdown Box - ONLY shown when OTP verification is successful */}
                          {officialEmailVerified && (
                            <>
                              {isFetchingDomainIntel ? (
                                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-700 font-medium flex items-center gap-2">
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600 shrink-0" />
                                  <span>Checking DNS MX records & Domain registration age...</span>
                                </div>
                              ) : domainIntelligence ? (
                                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2.5 text-xs">
                                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                    <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                                      <ShieldCheck className="h-4 w-4 text-emerald-600" /> Domain & DNS Intelligence
                                    </span>
                                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                                      domainIntelligence.qualityScore >= 80 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                                      domainIntelligence.qualityScore >= 50 ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                                      'bg-red-100 text-red-800 border border-red-300'
                                    }`}>
                                      Score: {domainIntelligence.qualityScore}/100 ({domainIntelligence.riskLevel} Risk)
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                                    <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                                      <span className="text-slate-400 font-semibold text-[10.5px] uppercase tracking-wider block">Domain Active / Creation Age:</span>
                                      <p className="font-bold text-slate-900 font-mono mt-0.5 text-xs">
                                        {domainIntelligence.createdDate
                                          ? `📅 ${domainIntelligence.createdDate} (${domainIntelligence.formattedAge})`
                                          : `📅 ${domainIntelligence.formattedAge || 'Active Registered Domain'}`}
                                      </p>
                                    </div>

                                    <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                                      <span className="text-slate-400 font-semibold text-[10.5px] uppercase tracking-wider block">DNS MX Mail Server:</span>
                                      <p className="font-bold font-mono mt-0.5 text-xs">
                                        {domainIntelligence.hasMxRecords ? (
                                          <span className="text-emerald-700">✓ Active ({domainIntelligence.primaryMx})</span>
                                        ) : (
                                          <span className="text-red-600">✕ No MX Records</span>
                                        )}
                                      </p>
                                    </div>
                                  </div>

                                  {domainIntelligence.recommendation && (
                                    <div className="text-[11px] font-medium text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200">
                                      💡 <strong>Underwriting Advice:</strong> {domainIntelligence.recommendation}
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </>
                          )}

                          {officialEmailVerified && (
                            <div className="mt-2 text-xs text-slate-500 space-y-0.5">
                              {officialEmailVerifiedAt && <p>Verified At: <span className="font-medium text-slate-700">{officialEmailVerifiedAt}</span></p>}
                              {officialEmailVerifiedBy && <p>Verified By: <span className="font-medium text-slate-700">{officialEmailVerifiedBy}</span></p>}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {!isEditingOfficialEmail && (
                    <div className="flex flex-col gap-2 shrink-0">
                      {!officialEmailVerified ? (
                        <button
                          type="button"
                          onClick={handleInitiateOfficialEmailVerify}
                          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-95 cursor-pointer"
                        >
                          <ShieldCheck className="h-4 w-4" /> Verify Official Email
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleInitiateOfficialEmailVerify}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 cursor-pointer"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Re-verify
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </DetailSection>

            <OfficialEmailVerifyModal
              open={isOfficialEmailModalOpen}
              onOpenChange={setIsOfficialEmailModalOpen}
              applicationId={lead.id}
              maskedEmail={officialEmailMasked || lead.officeEmail || lead.officialEmail || lead.email}
              onVerifiedSuccess={handleOfficialEmailVerifiedSuccess}
            />

            {/* Financial Information */}
            <DetailSection icon={DollarSign} title="Income & Loan Snapshot">
              <DetailField label="Monthly Income" valueTone="strong">{formatCurrency(lead.monthlyIncome)}</DetailField>
              <DetailField label="Requested Amount" valueTone="strong">{formatCurrency(lead.loanAmount)}</DetailField>
              <DetailField label="Loan Type">Payday Loan</DetailField>
              <DetailField label="Loan Purpose">{lead.loanPurpose}</DetailField>
              <DetailField label="Income Proof">
                {lead.salarySlipCurrent ? "Current salary slip captured" : "Pending"}
              </DetailField>
              <DetailField label="Bank Details">
                {lead.bankName || lead.accountNumber || lead.ifscCode ? "Captured" : "Pending"}
              </DetailField>
            </DetailSection>

            {/* Bank Details */}
            <DetailSection icon={CreditCard} title="Bank Details">
              <DetailField label="Bank Name">{lead.bankName || "Not provided"}</DetailField>
              <DetailField label="Branch Name">{lead.branchName || "Not provided"}</DetailField>
              <DetailField label="Account Holder">{lead.accountHolder || "Not provided"}</DetailField>
              <DetailField label="Account Number" valueTone="strong">{lead.accountNumber || "Not provided"}</DetailField>
              <DetailField label="IFSC Code" valueTone="strong">{lead.ifscCode || "Not provided"}</DetailField>
            </DetailSection>

            {/* Loan Request */}
            <DetailSection icon={Home} title="Loan Request">
              <DetailField icon={DollarSign} label="Requested Amount" valueTone="strong">
                <span className="text-xl">{formatCurrency(lead.loanAmount)}</span>
              </DetailField>
              <DetailField label="Loan Purpose">{lead.loanPurpose}</DetailField>
            </DetailSection>

            {/* Application References */}
            <DetailSection
              icon={Phone}
              title="Application References"
              action={
                <button
                  type="button"
                  onClick={() => {
                    setNewRefName("");
                    setNewRefRelation("");
                    setNewRefMobile("");
                    setShowAddReferenceModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 shadow-2xs transition cursor-pointer"
                >
                  <UserPlus className="h-3.5 w-3.5 text-blue-600" />
                  <span>+ Add Reference</span>
                </button>
              }
            >
              {lead.references.length ? (
                lead.references.map((reference, index) => (
                  <div
                    key={reference.id || `${reference.referenceType}-${reference.mobile}-${index}`}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{reference.fullName || "Not provided"}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{reference.relation || "Relation not provided"}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${
                        reference.referenceType === "primary"
                          ? "bg-blue-100 text-blue-700"
                          : reference.referenceType === "secondary"
                          ? "bg-slate-100 text-slate-700"
                          : "bg-purple-100 text-purple-700"
                      }`}>
                        {reference.referenceType === "primary"
                          ? "Primary"
                          : reference.referenceType === "secondary"
                          ? "Secondary"
                          : reference.referenceType || `Reference ${index + 1}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <span className="font-medium">{reference.mobile || "Mobile not provided"}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 px-3 py-5 text-center text-sm text-slate-500 md:col-span-2 flex flex-col items-center gap-2">
                  <span>No application references found.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setNewRefName("");
                      setNewRefRelation("");
                      setNewRefMobile("");
                      setShowAddReferenceModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <UserPlus className="h-4 w-4 text-blue-600" />
                    <span>+ Add Reference</span>
                  </button>
                </div>
              )}
            </DetailSection>

            {/* Add Reference Modal */}
            {showAddReferenceModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
                <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                        <UserPlus className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900">Add Application Reference</h3>
                        <p className="text-xs text-slate-500">Add an emergency or personal contact reference</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => !isAddingReference && setShowAddReferenceModal(false)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <form onSubmit={handleAddReferenceSubmit} className="mt-4 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newRefName}
                        onChange={(e) => setNewRefName(e.target.value)}
                        placeholder="e.g. Ramesh Kumar"
                        disabled={isAddingReference}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition disabled:bg-slate-50"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Relationship <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newRefRelation}
                        onChange={(e) => setNewRefRelation(e.target.value)}
                        placeholder="e.g. Friend, Father, Brother, Colleague, Spouse"
                        disabled={isAddingReference}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition disabled:bg-slate-50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Mobile Number <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                          type="tel"
                          maxLength={10}
                          value={newRefMobile}
                          onChange={(e) => setNewRefMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                          placeholder="10-digit mobile number"
                          disabled={isAddingReference}
                          className="w-full pl-10 pr-3.5 py-2 text-xs font-bold font-mono rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition disabled:bg-slate-50"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowAddReferenceModal(false)}
                        disabled={isAddingReference}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isAddingReference}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-extrabold text-white shadow-md shadow-blue-600/20 transition cursor-pointer disabled:opacity-50"
                      >
                        {isAddingReference ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            <span>Adding...</span>
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-3.5 w-3.5" />
                            <span>Add Reference</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Aadhaar Verification */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="h-5 w-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">Aadhaar Verification</h3>
              </div>
              <div className="space-y-4">
                {aadhaarReport ? (
                  <div className={`space-y-3 rounded-lg p-4 text-left ${hasAadhaarData ? "bg-green-50" : "bg-yellow-50"}`}>
                    <div className={`flex items-center gap-2 text-sm font-semibold ${hasAadhaarData ? "text-green-800" : "text-yellow-800"}`}>
                      {hasAadhaarData ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                      {hasAadhaarData ? "Aadhaar data fetched" : "Aadhaar cache is incomplete"}
                    </div>
                    {!hasAadhaarData && (
                      <p className="text-xs text-yellow-800">
                        Saved data has only partial details. Fetch again to refresh it from the provider.
                      </p>
                    )}
                    {aadhaarReport.photoDataUrl && (
                      <button
                        type="button"
                        onClick={() => setPreviewImage({ title: "Aadhaar Photo", url: aadhaarReport.photoDataUrl })}
                        className="flex w-full items-center gap-3 rounded-lg border border-green-200 bg-white p-3 text-left hover:bg-green-50"
                      >
                        <img
                          src={aadhaarReport.photoDataUrl}
                          alt="Aadhaar profile"
                          className="h-16 w-16 rounded-md object-cover"
                        />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Aadhaar photo</p>
                          <p className="text-xs text-gray-500">Click to preview</p>
                        </div>
                      </button>
                    )}
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">Name</p>
                        <p className="text-gray-900">{aadhaarReport.fullName || lead.name || "Not provided"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">Aadhaar Number</p>
                        <p className="text-gray-900">{aadhaarNumberDisplay || "Not provided"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">Father / Care Of</p>
                        <p className="text-gray-900">
                          {aadhaarReport.fatherName || aadhaarReport.careOf || "Not provided"}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase text-gray-500">DOB</p>
                          <p className="text-gray-900">{aadhaarReport.dob || "Not provided"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase text-gray-500">Gender</p>
                          <p className="text-gray-900">{aadhaarReport.gender || "Not provided"}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">Address</p>
                        <p className="text-gray-900">{aadhaarReport.address || "Not provided"}</p>
                      </div>
                    </div>
                    {!hasAadhaarData && (
                      <button
                        type="button"
                        onClick={handleAadhaarRequest}
                        disabled={isAadhaarLoading || !lead.aadhaarUniqueId}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CreditCard className="h-4 w-4" />
                        {isAadhaarLoading ? "Fetching Aadhaar..." : aadhaarError ? "Retry Aadhaar Fetch" : "Refresh Aadhaar Data"}
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleAadhaarRequest}
                    disabled={isAadhaarLoading || !lead.aadhaarUniqueId}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CreditCard className="h-4 w-4" />
                    {isAadhaarLoading ? "Fetching Aadhaar..." : aadhaarError ? "Retry Aadhaar Fetch" : "Fetch Aadhaar Data"}
                  </button>
                )}

                {!aadhaarReport && !lead.aadhaarUniqueId && (
                  <p className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                    Aadhaar unique ID is not available for this lead.
                  </p>
                )}

                {aadhaarError && (
                  <VerificationAlert
                    actionLabel={aadhaarCanRetry ? "Retry Aadhaar Fetch" : undefined}
                    isActionLoading={isAadhaarLoading}
                    message={aadhaarFailureMessage}
                    onAction={aadhaarCanRetry ? handleAadhaarRequest : undefined}
                    title="KYC provider request failed"
                  />
                )}
              </div>
            </div>
            {/* Credit Score */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <CreditCard className="h-5 w-5 shrink-0 text-gray-600" />
                  <h3 className="truncate text-lg font-semibold text-gray-900">CIBIL Report</h3>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${cibilStatusClasses}`}>
                  {cibilStatusLabel}
                </span>
              </div>
              <div className="space-y-4 text-center">
                {displayedCreditScore !== null && displayedCreditScore !== undefined && (
                  <div>
                    <p className="text-4xl font-bold text-blue-600">{displayedCreditScore}</p>
                    <p className="text-sm text-gray-600 mt-2">
                      {displayedCreditScore >= 700 ? "Good" : displayedCreditScore >= 600 ? "Fair" : "Poor"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {isProviderCibilScore ? "Provider score" : isAnalyzedCibilScore ? "Extracted from PDF analysis" : "CIBIL score"}
                    </p>
                  </div>
                )}

                {displayedCreditScore === null && cibilPdfUrl && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Provider score is not available in the API response. Run CIBIL analysis or verify the score from the downloaded PDF.
                  </div>
                )}

                {cibilPdfUrl ? (
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => openDocument(cibilPdfUrl)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                    >
                      <Download className="h-4 w-4" />
                      Download CIBIL
                    </button>
                    <button
                      type="button"
                      onClick={handleCibilAnalysis}
                      disabled={!cibilCanAnalyze}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isCibilAnalyzing || cibilAnalysisStatus === "processing" ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}
                      {isCibilAnalyzing || cibilAnalysisStatus === "processing"
                        ? "Analyzing CIBIL..."
                        : cibilAnalysis
                          ? "Re-analyze CIBIL"
                          : "Analyze CIBIL"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleCibilRequest}
                    disabled={cibilPrimaryDisabled}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCibilLoading || isCibilPolling ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4" />
                    )}
                    {cibilPrimaryLabel}
                  </button>
                )}

                {isCibilPolling && (
                  <div className="rounded-md bg-blue-50 px-3 py-2 text-left text-xs leading-5 text-blue-700">
                    <p className="font-medium">Request submitted. Checking every {cibilPollSeconds} seconds.</p>
                    {cibilLastCheckedLabel && (
                      <p className="text-blue-600">Last checked at {cibilLastCheckedLabel}</p>
                    )}
                  </div>
                )}

                {cibilNeedsAttention && (
                  <VerificationAlert
                    actionLabel={
                      cibilCanRetry ? "Retry CIBIL Check" : undefined
                    }
                    isActionLoading={isCibilLoading}
                    message={cibilFailureMessage}
                    onAction={
                      cibilCanRetry ? handleCibilRequest : undefined
                    }
                    title={cibilReport?.isStale
                      ? "CIBIL check timed out"
                      : /no\s+record|not\s+found/i.test(String(cibilReport?.message || cibilError || ""))
                        ? "CIBIL record not found"
                        : "Credit bureau request failed"}
                    tone={cibilReport?.isStale ? "warning" : "error"}
                  />
                )}

                {cibilAnalysisError && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-left text-xs leading-5 text-red-700">
                    {cibilAnalysisError}
                  </div>
                )}

                {cibilAnalysis && (
                  <div className="space-y-3 text-left">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <SummaryMetric label="Risk" tone={String(cibilAnalysis.riskCategory || "").includes("High") ? "danger" : String(cibilAnalysis.riskCategory || "").includes("Medium") ? "warning" : "success"} value={formatAnalysisValue(cibilAnalysis.riskCategory)} />
                      <SummaryMetric label="Max DPD" tone={Number(cibilAnalysis.maximumDpd || 0) >= 30 ? "warning" : "default"} value={formatAnalysisValue(cibilAnalysis.maximumDpd)} />
                      <SummaryMetric label="Overdue" tone={Number(cibilAnalysis.overdueAmount || 0) > 0 ? "danger" : "default"} value={formatAnalysisValue(cibilAnalysis.overdueAmount)} />
                    </div>

                    {cibilAnalysis.analystSummary && (
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                        {cibilAnalysis.analystSummary}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      {(["30Plus", "60Plus", "90Plus"] as const).map((flag) => (
                        <div key={flag} className="rounded-md border border-slate-200 px-3 py-2 text-center">
                          <p className="text-xs font-semibold text-slate-500">{flag.replace("Plus", "+ DPD")}</p>
                          <p className="mt-1 text-sm font-bold text-slate-900">{formatDpdFlag(cibilAnalysis.dpdFlags?.[flag])}</p>
                        </div>
                      ))}
                    </div>

                    {riskReasonItems.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Risk Reasons</p>
                        <div className="space-y-1">
                          {riskReasonItems.slice(0, 5).map((item, index) => (
                            <p key={`${formatAnalysisValue(item)}-${index}`} className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                              {formatAnalysisValue(item)}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {[
                      ["Active Loans", activeLoanItems],
                      ["Closed/Inactive Loans", closedLoanItems],
                      ["DPD History", dpdHistoryItems],
                      ["Written-off/Settled", writtenOffItems],
                      ["Credit Enquiries", enquiryItems],
                    ].map(([title, items]) => (
                      (items as unknown[]).length > 0 && (
                        <div key={title as string}>
                          <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{title as string}</p>
                          <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                            {(items as unknown[]).slice(0, 8).map((item, index) => (
                              <div key={`${title}-${index}`} className="rounded-md border border-slate-200 px-3 py-2 text-xs leading-5 text-slate-700">
                                {formatAnalysisValue(item)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            </div>



          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Profile Image */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
              <button
                type="button"
                onClick={() => {
                  if (selfieProfileDocument?.href) {
                    setPreviewImage({ title: "Selfie Image", url: selfieProfileDocument.href });
                  }
                }}
                disabled={!selfieProfileDocument?.href}
                className={`mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-3xl font-bold text-slate-500 ${selfieProfileDocument?.href ? "transition hover:border-blue-200 hover:bg-blue-50" : "cursor-default"}`}
                aria-label={selfieProfileDocument?.href ? `Preview selfie image for ${lead.name}` : `No selfie image for ${lead.name}`}
              >
                {selfieProfileDocument?.href ? (
                  <AuthenticatedImage
                    src={selfieProfileDocument.href}
                    alt={`${lead.name || "Lead"} selfie`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  getLeadInitials(lead.name)
                )}
              </button>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Profile Image</h3>
              <p className="mt-1 text-sm text-gray-500">
                {selfieProfileDocument?.href ? "Fetched from selfie document" : "Selfie image not available"}
              </p>
            </div>

            {/* Lead Status */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Lead Status</h3>
              {canEditLeadOperations ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Status</label>
                    <NiceSelect
                      ariaLabel="Lead status"
                      className="mt-1"
                      value={lead.status}
                      onValueChange={(value) => handleLeadOperationChange({ status: value })}
                      disabled={isStatusSaving}
                      options={leadStatusOptions}
                    />
                    {isStatusSaving && (
                      <p className="mt-2 text-xs text-blue-600">Saving telecaller changes...</p>
                    )}
                    {statusError && (
                      <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{statusError}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Priority</label>
                    <NiceSelect
                      ariaLabel="Lead priority"
                      className="mt-1"
                      value={lead.priority}
                      onValueChange={(value) => handleLeadOperationChange({ priority: value })}
                      disabled={isStatusSaving}
                      options={leadPriorityOptions}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Assigned To</label>
                    <NiceSelect
                      ariaLabel="Assigned telecaller"
                      className="mt-1"
                      value={lead.assignedTo || "Unassigned"}
                      onValueChange={(value) => handleLeadOperationChange({ assignedTo: value })}
                      disabled={isStatusSaving}
                      options={assignedToOptions}
                    />
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setTelecallerRejectReason("");
                        setTelecallerRejectError("");
                        setShowTelecallerRejectDialog(true);
                      }}
                      disabled={!canTelecallerRejectLead || isStatusSaving}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <AlertCircle className="h-4 w-4" />
                      Reject Loan
                    </button>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Reason is required. Customer rejection WhatsApp will be sent automatically.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <p className="flex justify-between gap-3"><span className="text-slate-500">Status</span><span className="font-semibold text-slate-950">{lead.status}</span></p>
                  <p className="flex justify-between gap-3"><span className="text-slate-500">Priority</span><span className="font-semibold text-slate-950">{lead.priority}</span></p>
                  <p className="flex justify-between gap-3"><span className="text-slate-500">Assigned To</span><span className="font-semibold text-slate-950">{lead.assignedTo && lead.assignedTo !== "Unassigned" ? `Assign to ${lead.assignedTo}` : "Unassigned"}</span></p>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Lead status is workflow-controlled for {roleLabels[currentRole]}. Use the relevant queue action instead of manual status changes.
                  </div>
                </div>
              )}
            </div>

            {/* Application Readiness */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Application Readiness</h3>
                  <p className="text-xs text-gray-500">Profile completeness, not a handoff blocker</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${readinessPercent === 100 ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                  }`}>
                  {readinessPercent}%
                </span>
              </div>
              <div className="mb-4">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${readinessPercent === 100 ? "bg-green-500" : "bg-blue-500"}`}
                    style={{ width: `${readinessPercent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {completedReadinessChecks}/{readinessChecks.length} checks complete. Advisory: {firstMissingReadiness}.
                </p>
              </div>
              <div className="space-y-2">
                {readinessChecks.map((check) => (
                  <ReadinessRow key={check.label} isComplete={check.isComplete} label={check.label} />
                ))}
              </div>
            </div>

            {/* Telecaller Workspace */}
            {isTelecallerRole && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Telecaller Workspace</h3>
                    <p className="text-xs text-gray-500">Call outcome, follow-up, documents, and credit handoff</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {verifiedDocumentChecks}/{totalDocumentChecks || 0} docs
                  </span>
                </div>

                {telecallerError && (
                  <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {telecallerError}
                  </div>
                )}

                <div className="mb-5 grid grid-cols-1 gap-3 text-xs text-gray-600 sm:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="font-semibold text-gray-900">Last call</p>
                    <p className="mt-1">{latestCallLog ? `${latestCallLog.disposition} - ${formatActivityDate(latestCallLog.createdAt)}` : "No call logged"}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="font-semibold text-gray-900">Next follow-up</p>
                    <p className="mt-1">{nextOpenFollowup ? formatActivityDate(nextOpenFollowup.dueAt) : "Not scheduled"}</p>
                  </div>
                </div>

                <form onSubmit={handleCallLogSubmit} className="space-y-3 border-t border-gray-100 pt-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Disposition</label>
                    <NiceSelect
                      ariaLabel="Call disposition"
                      className="mt-1"
                      value={callForm.disposition}
                      onValueChange={handleCallDispositionChange}
                      options={CALL_DISPOSITIONS.map((disposition) => ({ label: disposition, value: disposition }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">
                      {callDispositionConfig.subDispositionLabel || "Sub-disposition"}
                      {callDispositionConfig.subDispositionRequired && <span className="text-red-500"> *</span>}
                    </label>
                    <NiceSelect
                      ariaLabel="Call sub-disposition"
                      className="mt-1"
                      value={callForm.subDisposition}
                      onValueChange={(value) => setCallForm((form) => ({ ...form, subDisposition: value }))}
                      options={subDispositionOptions}
                      placeholder="Select outcome detail"
                    />
                  </div>
                  {(shouldShowFollowup || shouldShowDuration) && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {shouldShowFollowup && (
                        <div>
                          <label className="text-sm font-medium text-gray-600">
                            Next Follow-up
                            {callDispositionConfig.followupRequired && <span className="text-red-500"> *</span>}
                          </label>
                          <input
                            type="datetime-local"
                            min={minimumFollowupAt}
                            value={callForm.nextFollowupAt}
                            onChange={(event) => setCallForm((form) => ({ ...form, nextFollowupAt: event.target.value }))}
                            required={callDispositionConfig.followupRequired}
                            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      )}
                      {shouldShowDuration && (
                        <div>
                          <label className="text-sm font-medium text-gray-600">{callDispositionConfig.durationLabel || "Duration (sec)"}</label>
                          <input
                            min="0"
                            type="number"
                            value={callForm.callDurationSeconds}
                            onChange={(event) => setCallForm((form) => ({ ...form, callDurationSeconds: event.target.value }))}
                            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {shouldShowFollowup && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">Follow-up reason</label>
                      <input
                        value={callForm.followupReason}
                        onChange={(event) => setCallForm((form) => ({ ...form, followupReason: event.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={callForm.disposition}
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-gray-600">Call Notes</label>
                    <textarea
                      value={callForm.notes}
                      onChange={(event) => setCallForm((form) => ({ ...form, notes: event.target.value }))}
                      rows={3}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={callDispositionConfig.notesPlaceholder}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isTelecallerSaving}
                    className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isTelecallerSaving ? "Saving..." : "Save Call Update"}
                  </button>
                </form>

                <div className="mt-5 border-t border-gray-100 pt-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">Document Verification</h4>
                      <p className="mt-1 text-xs text-gray-500">
                        Select available checks and update them together.
                      </p>
                    </div>
                    {isTelecallerLoading && <span className="text-xs text-blue-600">Loading...</span>}
                  </div>
                  {telecallerWorkspace.documentChecks.length > 0 && (
                    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={allEvidenceReadySelected}
                            onChange={toggleEvidenceReadyDocumentChecks}
                            disabled={isTelecallerSaving || evidenceReadyDocumentChecks.length === 0}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          Select all ready ({evidenceReadyDocumentChecks.length})
                        </label>
                        <span className="text-xs text-slate-500">
                          {selectedVerificationKeys.length} selected, {selectedEvidenceReadyCount} ready to verify
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => updateSelectedDocumentChecks("verified")}
                          disabled={isTelecallerSaving || selectedEvidenceReadyCount === 0}
                          className="rounded-md border border-green-200 bg-white px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Verify Selected
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedDocumentChecks("rejected")}
                          disabled={isTelecallerSaving || selectedVerificationKeys.length === 0}
                          className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Reject Selected
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedDocumentChecks("pending")}
                          disabled={isTelecallerSaving || selectedVerificationKeys.length === 0}
                          className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Mark Pending
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    {telecallerWorkspace.documentChecks.map((check) => {
                      const evidenceAvailable = hasDocumentEvidence(check.key);
                      return (
                        <div key={check.key} className={`rounded-lg border p-3 ${selectedVerificationKeys.includes(check.key) ? "border-blue-200 bg-blue-50/40" : "border-gray-200"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <label className="flex min-w-0 items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selectedVerificationKeys.includes(check.key)}
                                onChange={() => toggleVerificationKey(check.key)}
                                disabled={isTelecallerSaving}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="min-w-0">
                                <p className="text-sm font-medium text-gray-900">{check.label}</p>
                                {!evidenceAvailable && (
                                  <p className="mt-1 text-xs text-gray-500">Required data/document is not available yet.</p>
                                )}
                              </span>
                            </label>
                            {getDocumentCheckBadge(getEffectiveDocumentCheckStatus(check))}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => updateDocumentCheck(check, "verified")}
                              disabled={isTelecallerSaving || !evidenceAvailable}
                              className="rounded-md border border-green-200 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Verify
                            </button>
                            <button
                              type="button"
                              onClick={() => updateDocumentCheck(check, "rejected")}
                              disabled={isTelecallerSaving}
                              className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => updateDocumentCheck(check, "pending")}
                              disabled={isTelecallerSaving}
                              className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Pending
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    {!isTelecallerLoading && telecallerWorkspace.documentChecks.length === 0 && (
                      <div className="rounded-lg border border-dashed border-gray-300 px-3 py-5 text-center text-sm text-gray-500">
                        No document checklist found.
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 border-t border-gray-100 pt-4">
                  <label className="text-sm font-medium text-gray-600">Credit Manager Handoff Note</label>
                  <textarea
                    value={handoffNote}
                    onChange={(event) => setHandoffNote(event.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Summary for credit manager..."
                  />
                  {telecallerWorkspace.latestHandoff && (
                    <div className="mt-2 rounded-md bg-green-50 px-3 py-2 text-xs text-green-800">
                      Sent to credit manager on {formatActivityDate(telecallerWorkspace.latestHandoff.submittedAt)}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={markReadyForCreditReview}
                    disabled={isTelecallerSaving || !canCreateCreditHandoff || !isTelecallerRole}
                    className="mt-3 w-full rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Mark Ready for Credit Review
                  </button>
                  <p className="mt-2 text-xs text-gray-500">
                    {isTelecallerRole
                      ? isReadyCreditHandoff
                        ? "This lead is already waiting in the credit manager queue."
                        : isTerminalLead || latestCreditHandoffStatus === "approved"
                          ? "This lead has already moved beyond telecaller handoff."
                          : "Document checks are optional; you can hand off with pending items."
                      : `Only Telecaller can create the first credit handoff. Current role: ${roleLabels[currentRole]}.`}
                  </p>
                </div>
              </div>
            )}

            {!isTelecallerRole && !isCreditManagerRole && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Handoff Review</h3>
                    <p className="text-xs text-gray-500">Telecaller context, checklist evidence, and credit review gaps.</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isReadyCreditHandoff ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"
                    }`}>
                    {latestCreditHandoffStatus || "No handoff"}
                  </span>
                </div>

                {telecallerError && (
                  <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {telecallerError}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 text-xs text-gray-600 sm:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="font-semibold text-gray-900">Submitted by</p>
                    <p className="mt-1">
                      {telecallerWorkspace.latestHandoff?.submittedBy || lead.assignedTo || "Not available"}
                    </p>
                    <p className="mt-1 text-gray-500">
                      {telecallerWorkspace.latestHandoff?.submittedAt
                        ? formatActivityDate(telecallerWorkspace.latestHandoff.submittedAt)
                        : "No handoff timestamp"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="font-semibold text-gray-900">Last customer contact</p>
                    <p className="mt-1">
                      {latestCallLog ? `${latestCallLog.disposition} - ${formatActivityDate(latestCallLog.createdAt)}` : "No call logged"}
                    </p>
                    {nextOpenFollowup && (
                      <p className="mt-1 text-amber-700">Follow-up: {formatActivityDate(nextOpenFollowup.dueAt)}</p>
                    )}
                  </div>
                </div>

                {telecallerWorkspace.latestHandoff?.notes && (
                  <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                    {telecallerWorkspace.latestHandoff.notes}
                  </div>
                )}

                <div className="mt-5 border-t border-gray-100 pt-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-gray-900">Underwriting Checklist</h4>
                    {isTelecallerLoading ? (
                      <span className="text-xs text-blue-600">Loading...</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {verifiedDocumentChecks}/{totalDocumentChecks || 0} verified
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {telecallerWorkspace.documentChecks.map((check) => {
                      const effectiveStatus = getEffectiveDocumentCheckStatus(check);
                      const evidenceAvailable = hasDocumentEvidence(check.key);

                      return (
                        <div key={check.key} className="rounded-lg border border-gray-200 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">{check.label}</p>
                              <p className={`mt-1 text-xs ${evidenceAvailable ? "text-green-700" : "text-amber-700"}`}>
                                {evidenceAvailable ? "Evidence available for review" : "Evidence missing or needs upload"}
                              </p>
                              {check.remark && (
                                <p className="mt-1 text-xs text-gray-500">{check.remark}</p>
                              )}
                            </div>
                            {getDocumentCheckBadge(effectiveStatus)}
                          </div>
                        </div>
                      );
                    })}
                    {!isTelecallerLoading && telecallerWorkspace.documentChecks.length === 0 && (
                      <div className="rounded-lg border border-dashed border-gray-300 px-3 py-5 text-center text-sm text-gray-500">
                        No telecaller checklist found for this application.
                      </div>
                    )}
                  </div>
                </div>

                {isCreditManagerRole && (
                  <div className="mt-5 grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("documents")}
                      className="rounded-md border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      Request / Review Documents
                    </button>
                    <AppTooltip label={canOpenCamSheet ? "Open CAM sheet" : creditDecisionBlockReason || "Complete readiness items first"}>
                      <span className="inline-flex">
                        <button
                          type="button"
                          onClick={() => setShowCAMSheet(true)}
                          disabled={!canOpenCamSheet}
                          className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {canCompleteCreditDecision ? "Open CAM Decision" : "Open CAM Sheet"}
                        </button>
                      </span>
                    </AppTooltip>
                  </div>
                )}
              </div>
            )}

            {isCreditManagerRole && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Credit Manager Decision</h3>
                    <p className="text-xs text-gray-500">Review details, request missing documents, then approve or reject.</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${canCompleteCreditDecision ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"
                    }`}>
                    {canCompleteCreditDecision ? "Action needed" : latestCreditHandoffStatus || lead.status}
                  </span>
                </div>
                <div className="space-y-2 text-sm text-slate-600">
                  <p>Missing readiness item: {firstMissingReadiness}</p>
                  <p>Documents: {uploadedDocumentCount}/{documents.length} uploaded</p>
                  {creditDecisionBlockReason && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {creditDecisionBlockReason}
                    </div>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("documents")}
                    className="rounded-md border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    Request / Review Documents
                  </button>
                  <AppTooltip label={canOpenCamSheet ? "Open CAM sheet" : creditDecisionBlockReason || "Complete readiness items first"}>
                    <span className="inline-flex">
                      <button
                        type="button"
                        onClick={() => setShowCAMSheet(true)}
                        disabled={!canOpenCamSheet}
                        className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {canCompleteCreditDecision ? "Open CAM Decision" : "Open CAM Sheet"}
                      </button>
                    </span>
                  </AppTooltip>
                </div>
              </div>
            )}

            {(isCreditManagerRole || isAccountantRole) && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Sanction Letter</h3>
                    <p className="text-xs text-gray-500">Customer loan confirmation email and PDF attachment.</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${latestSanction?.emailStatus === "sent"
                    ? "bg-green-100 text-green-800"
                    : latestSanction?.emailStatus === "failed"
                      ? "bg-red-100 text-red-800"
                      : "bg-slate-100 text-slate-700"
                    }`}>
                    {latestSanction?.emailStatus || "Not sent"}
                  </span>
                </div>
                {latestSanction ? (
                  <div className="space-y-2 text-sm text-slate-600">
                    <p>Agreement: <span className="font-semibold text-slate-950">{latestSanction.agreementNumber}</span></p>
                    {Number(latestSanction.revisionNumber || 0) > 0 && (
                      <p>Revision: R{latestSanction.revisionNumber} - {latestSanction.revisionReason || "Correction recorded"}</p>
                    )}
                    <p>Principal: {formatCurrency(latestSanction.principalAmount)} - Disbursed: {formatCurrency(latestSanction.disbursedAmount)}</p>
                    <p>Due: {formatActivityDate(latestSanction.dueDate)} - Repayment: {formatCurrency(latestSanction.repaymentAmount)}</p>
                    <p>Email: {latestSanction.emailTo || lead.email || "Not available"}</p>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase text-slate-500">Sanction WhatsApp</span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${deliveryStatusClasses(latestSanction.whatsappStatus)}`}>
                          {formatDeliveryStatus(latestSanction.whatsappStatus)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {latestSanction.whatsappSentAt
                          ? `Sent on ${formatActivityDate(latestSanction.whatsappSentAt)}`
                          : "Uses the same generated sanction PDF and customer phone."}
                      </p>
                    </div>
                    {/* Live Customer Decision Badge */}
                    {latestSanction.customerDecision === "accepted" ? (
                      <div className="rounded-xl border border-emerald-300 bg-emerald-500/10 p-3.5 text-center shadow-sm">
                        <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          <span>SANCTION ACCEPTED BY BORROWER</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Customer clicked [ACCEPT] in Sanction Email
                          {latestSanction.customerDecisionAt ? ` (${formatActivityDate(latestSanction.customerDecisionAt)})` : ""}
                        </p>
                        {latestSanction.customerDecisionIp && (
                          <div className="mt-2 pt-2 border-t border-emerald-200/60 dark:border-emerald-800/40 flex items-center justify-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                            <span className="text-slate-500">Customer IP:</span>
                            <span className="font-mono font-bold bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded shadow-xs">
                              {latestSanction.customerDecisionIp}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : latestSanction.customerDecision === "rejected" ? (
                      <div className="rounded-xl border border-rose-300 bg-rose-500/10 p-3.5 text-center shadow-sm">
                        <div className="flex items-center justify-center gap-2 text-rose-600 dark:text-rose-400 font-extrabold text-sm">
                          <XCircle className="h-5 w-5 text-rose-500" />
                          <span>SANCTION REJECTED BY BORROWER</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Customer clicked [REJECT] in Sanction Email
                          {latestSanction.customerDecisionAt ? ` (${formatActivityDate(latestSanction.customerDecisionAt)})` : ""}
                        </p>
                        {latestSanction.customerDecisionIp && (
                          <div className="mt-2 pt-2 border-t border-rose-200/60 dark:border-rose-800/40 flex items-center justify-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                            <span className="text-slate-500">Customer IP:</span>
                            <span className="font-mono font-bold bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded shadow-xs">
                              {latestSanction.customerDecisionIp}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-amber-300 bg-amber-500/10 p-3.5 text-center shadow-sm">
                        <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400 font-extrabold text-sm">
                          <Clock className="h-5 w-5 text-amber-500 animate-pulse" />
                          <span>AWAITING CUSTOMER DECISION</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Sanction email sent. Waiting for borrower ACCEPT/REJECT response.
                        </p>
                      </div>
                    )}

                    {latestSanction.emailError && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {latestSanction.emailError}
                      </div>
                    )}
                    {latestSanction.whatsappError && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {latestSanction.whatsappError}
                      </div>
                    )}
                    {latestSanction.pdfPath && (
                      <button
                        type="button"
                        onClick={openSanctionPdf}
                        className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        Download Sanction PDF
                      </button>
                    )}
                    {isCreditManagerRole && (
                      <AppTooltip label={lead.status === "Converted" ? "Loan is already disbursed." : "Generate revised sanction"}>
                        <span className="inline-flex w-full">
                          <button
                            type="button"
                            onClick={openSanctionModal}
                            disabled={isCamSaving || lead.status === "Converted"}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Generate Revised Sanction
                          </button>
                        </span>
                      </AppTooltip>
                    )}
                    {isCreditManagerRole && (
                      <button
                        type="button"
                        onClick={resendSanctionEmail}
                        disabled={isSanctionResending || !latestSanction.emailTo}
                        className={`inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${latestSanction.emailStatus === "failed"
                          ? "bg-red-600 text-white hover:bg-red-700"
                          : "border border-blue-200 text-blue-700 hover:bg-blue-50"
                          }`}
                      >
                        <RefreshCw className={`h-4 w-4 ${isSanctionResending ? "animate-spin" : ""}`} />
                        {isSanctionResending
                          ? "Resending..."
                          : latestSanction.emailStatus === "sent"
                            ? "Resend Sanction Email & WhatsApp"
                            : "Retry Sanction Email & WhatsApp"}
                      </button>
                    )}
                    {(isCreditManagerRole || isProductAdminRole || isSuperadminRole) && lead.status !== "Lost" && lead.status !== "Converted" && (
                      <button
                        type="button"
                        onClick={openPostSanctionRejectModal}
                        disabled={isPostSanctionRejecting}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 mt-1 cursor-pointer"
                      >
                        <XCircle className="h-4 w-4 text-red-600" />
                        Reject Loan (Post-Sanction)
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Sanction letter will be generated after loan approval.</p>
                )}
              </div>
            )}

            {/* Repayment eMandate (Razorpay / Cashfree) Card in Right Sidebar */}
            {(isCreditManagerRole || isAccountantRole || isProductAdminRole || isSuperadminRole) && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-indigo-600" />
                      Repayment eMandate
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Auto-debit setup via Cashfree Subscriptions.
                    </p>
                  </div>
                  {(() => {
                    const s = String(lead.emandateStatus || '').toUpperCase();
                    let badgeClass = "bg-amber-100 text-amber-800 border border-amber-300";
                    let badgeLabel = lead.emandateStatus || "Pending";

                    if (s === "ACTIVE" || s === "AUTHENTICATED") {
                      badgeClass = "bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold";
                      badgeLabel = "Active ✓";
                    } else if (s === "BANK_APPROVAL_PENDING" || s === "PENDING_BANK_APPROVAL") {
                      badgeClass = "bg-amber-100 text-amber-800 border border-amber-300 font-medium";
                      badgeLabel = "Bank Approval Pending ⏳";
                    } else if (s === "INITIALIZED" || s === "LINK_SENT") {
                      badgeClass = "bg-blue-100 text-blue-800 border border-blue-300 font-medium";
                      badgeLabel = "Initialized (Link Opened)";
                    } else if (s === "CANCELLED" || s === "CANCELED" || s === "TERMINATED") {
                      badgeClass = "bg-rose-100 text-rose-800 border border-rose-300 font-semibold";
                      badgeLabel = "Cancelled ✕";
                    } else if (s === "EXPIRED") {
                      badgeClass = "bg-slate-100 text-slate-800 border border-slate-300 font-medium";
                      badgeLabel = "Expired ⏰";
                    } else if (s === "REJECTED" || s === "FAILED") {
                      badgeClass = "bg-red-100 text-red-800 border border-red-300 font-semibold";
                      badgeLabel = "Rejected ✕";
                    }

                    return (
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${badgeClass}`}>
                        {badgeLabel}
                      </span>
                    );
                  })()}
                </div>

                {lead.emandateStatus === "ACTIVE" || lead.emandateStatus === "AUTHENTICATED" ? (
                  (() => {
                    const paymentModeUpper = String(lead.emandatePaymentMode || '').toUpperCase();
                    const isEnachOrBank = paymentModeUpper.includes('ENACH') || paymentModeUpper.includes('CARD') || paymentModeUpper.includes('BANK') || paymentModeUpper.includes('NETBANKING');

                    return (
                      <div className="space-y-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono">
                        <p>Provider: <span className="font-bold text-indigo-800 capitalize">Cashfree</span></p>
                        <p>Mandate ID: <span className="font-bold text-slate-900">{lead.emandateRefId || lead.emandateId || "Active Mandate"}</span></p>
                        <p>Payment Mode: <span className="font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">{lead.emandatePaymentMode || (isEnachOrBank ? "eNACH AutoPay" : "UPI AutoPay")}</span></p>
                        
                        {/* IF eNACH / Bank: ONLY show Authorized Bank Account */}
                        {isEnachOrBank ? (
                          <p>Authorized Bank Acc: <span className="font-bold text-slate-900">{lead.emandateAccountNumber || (lead.accountNumber ? `****${String(lead.accountNumber).slice(-4)}` : "Verified Bank Account")}</span></p>
                        ) : (
                          /* IF UPI AutoPay: ONLY show UPI VPA / ID if real VPA extracted, else show Verified badge */
                          <p>UPI VPA / ID: <span className="font-bold text-purple-900 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">{lead.emandateUpiId || "UPI AutoPay (Verified)"}</span></p>
                        )}

                        {isEnachOrBank && lead.emandateBankName && lead.emandateBankName !== lead.bankName && (
                          <p>Registered Bank: <span className="font-semibold text-slate-900">{lead.emandateBankName}</span></p>
                        )}

                        <p>Max Limit: <span className="font-semibold text-emerald-700">{formatCurrency(lead.emandateMaxAmount || lead.loanAmount || 50000)}</span></p>
                        {lead.emandateRegisteredAt && <p>Registered At: <span className="font-medium text-slate-700">{formatActivityDate(lead.emandateRegisteredAt)}</span></p>}
                      </div>
                    );
                  })()
                ) : (
                  <p className="text-xs text-slate-500 mb-3">
                    {lead.emandateAuthUrl
                      ? `Link sent via Cashfree. Waiting for customer bank authorization.`
                      : "Generate Cashfree eMandate link to allow customer to register auto-debit for loan repayments."}
                  </p>
                )}

                <div className="mt-4 grid grid-cols-1 gap-2">
                  {lead.emandateAuthUrl && (
                    <button
                      type="button"
                      onClick={handleCopyEmandateLink}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                    >
                      <Copy className="h-4 w-4" />
                      Copy eMandate Link
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCheckEmandateStatus}
                    disabled={isCheckingEmandateStatus}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
                  >
                    <RefreshCw className={`h-4 w-4 ${isCheckingEmandateStatus ? "animate-spin" : ""}`} />
                    Check eMandate Status
                  </button>

                  {lead.emandateStatus !== "ACTIVE" && lead.emandateStatus !== "AUTHENTICATED" && (
                    <button
                      type="button"
                      onClick={() => openEmandateModal()}
                      disabled={isCreatingEmandateLink}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm disabled:opacity-50 transition cursor-pointer"
                    >
                      {isCreatingEmandateLink ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <CreditCard className="h-4 w-4" />
                      )}
                      {lead.emandateAuthUrl ? "Resend Cashfree eMandate Link" : "Send Cashfree eMandate Link"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {(isCreditManagerRole || isAccountantRole) && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Loan Agreement eSign</h3>
                    <p className="text-xs text-gray-500">Generate, send, track, and archive the Digio-signed agreement before disbursement.</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${latestLoanAgreement?.status === "signed"
                    ? "bg-green-100 text-green-800"
                    : latestLoanAgreement?.status === "failed"
                      ? "bg-red-100 text-red-800"
                      : latestLoanAgreement
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-700"
                    }`}>
                    {formatLoanAgreementStatus(latestLoanAgreement)}
                  </span>
                </div>
                <div className="space-y-2 text-sm text-slate-600">
                  {latestCamSheet && (
                    <p>Latest CAM: v{latestCamSheet.version} - {latestCamSheet.status} - {formatActivityDate(latestCamSheet.updatedAt)}</p>
                  )}
                  {latestLoanAgreement ? (
                    <>
                      <p>Agreement: <span className="font-semibold text-slate-950">{latestLoanAgreement.agreementNumber}</span></p>
                      <p>Signer: {latestLoanAgreement.signerName || lead.name || "Customer"}</p>
                      {latestLoanAgreement.providerDocumentId && (
                        <p>Digio document: <span className="font-mono text-xs text-slate-700">{latestLoanAgreement.providerDocumentId}</span></p>
                      )}
                      {latestLoanAgreement.providerRequestId && (
                        <p>Digio request: <span className="font-mono text-xs text-slate-700">{latestLoanAgreement.providerRequestId}</span></p>
                      )}
                      <p>Status: <span className="font-medium text-slate-900">{formatLoanAgreementStatus(latestLoanAgreement)}</span></p>
                      <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                        Customer notification is handled by Digio. Custom Authkey WhatsApp for eSign is disabled.
                      </div>
                      {latestLoanAgreement.signingUrl && (
                        <p className="break-all rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                          Signing link: {latestLoanAgreement.signingUrl}
                        </p>
                      )}
                      {latestLoanAgreement.status === "signed" && (
                        <p>Signed on {formatActivityDate(latestLoanAgreement.signedAt)}</p>
                      )}
                      {latestLoanAgreement.providerStatus && latestLoanAgreement.status !== "signed" && (
                        <p>Provider status: {latestLoanAgreement.providerStatus}</p>
                      )}
                      {latestLoanAgreement.errorMessage && (
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          {latestLoanAgreement.errorMessage}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className={isSanctionCustomerAccepted ? "text-slate-600 font-medium" : "text-amber-800 font-medium bg-amber-50 border border-amber-200 rounded-md p-2 text-xs"}>
                      {isSanctionCustomerAccepted
                        ? "Sanction letter accepted by customer. Click below to send the loan agreement for eSign."
                        : latestSanction?.customerDecision === "rejected"
                          ? "Sanction letter was REJECTED by customer. eSign is disabled."
                          : "Awaiting Customer Acceptance: Customer must click ACCEPT on the emailed sanction letter before eSign can be sent."}
                    </p>
                  )}

                </div>
                {loanAgreementFeedback && (
                  <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    {loanAgreementFeedback}
                  </div>
                )}
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {isCreditManagerRole && (
                    <button
                      type="button"
                      onClick={sendLoanAgreementForEsign}
                      disabled={isEsignSaving || !canSendLoanAgreement}
                      className="rounded-md border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isEsignSaving ? "Sending..." : latestLoanAgreement ? "Resend Agreement eSign" : "Send Agreement eSign"}
                    </button>
                  )}
                  {latestLoanAgreement && (
                    <button
                      type="button"
                      onClick={refreshLoanAgreementStatus}
                      disabled={isLoanAgreementRefreshing}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoanAgreementRefreshing ? "animate-spin" : ""}`} />
                      {isLoanAgreementRefreshing ? "Refreshing..." : "Refresh Digio Status"}
                    </button>
                  )}
                  {latestLoanAgreement?.pdfPath && (
                    <button
                      type="button"
                      onClick={() => openDocument(latestLoanAgreement.pdfPath)}
                      className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Download Agreement
                    </button>
                  )}
                  {latestLoanAgreement?.status === "signed" && (
                    <button
                      type="button"
                      onClick={openSignedLoanAgreement}
                      className="inline-flex items-center justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
                    >
                      {latestLoanAgreement.signedPdfPath ? "Download Signed PDF" : "Fetch Signed PDF"}
                    </button>
                  )}
                  {isCreditManagerRole && latestLoanAgreement?.status === "signed" && lead.status !== "Converted" && (
                    <button
                      type="button"
                      onClick={sendLeadToAccounting}
                      disabled={isAccountingHandoffSaving}
                      className="inline-flex items-center justify-center rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isAccountingHandoffSaving ? "Sending..." : "Send Lead to Accountant"}
                    </button>
                  )}
                  {latestLoanAgreement?.signingUrl && (
                    <a
                      href={latestLoanAgreement.signingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-md border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      Open Signing Link
                    </a>
                  )}
                </div>
                {latestEsign && !latestLoanAgreement && (
                  <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Legacy dummy eSign status: {latestEsign.status}
                    {isCreditManagerRole && (
                      <button type="button" onClick={() => copyEsignLink(latestEsign.token)} className="ml-2 font-semibold text-blue-700">
                        Copy test link
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* CRIF Account Aggregator Card - Restricted to Credit Manager, Product Admin & Superadmin */}
            {(isCreditManagerRole || isProductAdminRole || isSuperadminRole) && (() => {
              const isAaActive = Boolean(activeAnalytics) || ["COMPLETED", "ACTIVE", "APPROVED", "SUCCESS"].includes(String(aaSession?.status || "").toUpperCase());

              return (
                <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-indigo-600" />
                        Account Aggregator (Bank Statement)
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">Finvu AA / CRIF Orchestrator bank cash-flow consent</p>
                    </div>
                    {isAaLoading ? (
                      <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-1.5">
                        <RefreshCw className="h-3 w-3 animate-spin text-slate-400" />
                        Checking...
                      </span>
                    ) : (
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        isAaActive
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : aaSession?.status === "PENDING"
                          ? "bg-amber-100 text-amber-800 border border-amber-300 animate-pulse"
                          : "bg-slate-100 text-slate-700 border border-slate-300"
                      }`}>
                        {isAaActive ? "ACTIVE" : aaSession?.status || "Not Initiated"}
                      </span>
                    )}
                  </div>

                  {isAaLoading ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2.5 text-center">
                      <div className="h-9 w-9 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                        <RefreshCw className="h-4 w-4 animate-spin text-indigo-600" />
                      </div>
                      <p className="text-xs font-medium text-slate-500">Checking Account Aggregator status...</p>
                    </div>
                  ) : (
                    <>
                      {/* Only show Consent Link Generated box if AA is NOT active */}
                      {!isAaActive && aaSession?.redirectionUrl && (
                        <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-xs">
                          <span className="font-semibold text-indigo-900">Consent Link Generated:</span>
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              type="text"
                              readOnly
                              value={aaSession.redirectionUrl}
                              className="w-full rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-indigo-950 font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(aaSession.redirectionUrl);
                                toast.success("AA Link copied to clipboard");
                              }}
                              className="shrink-0 rounded bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        {/* View Statement button shown when ACTIVE */}
                        {isAaActive && (
                          <button
                            type="button"
                            onClick={() => setShowAaStatementModal(true)}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500 bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-sm cursor-pointer"
                          >
                            <FileText className="h-4 w-4" />
                            View Full Bank Statement & Transactions
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={async () => {
                            setIsAaRefreshing(true);
                            await loadAaStatus();
                            setIsAaRefreshing(false);
                            toast.success("Account Aggregator status updated");
                          }}
                          disabled={isAaRefreshing}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50 cursor-pointer"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 text-indigo-600 ${isAaRefreshing || aaSession?.status === "PENDING" ? "animate-spin" : ""}`} />
                          {aaSession?.status === "PENDING" ? "Checking CRIF Status (Auto-Syncing)..." : "Refresh AA Status & Analytics"}
                        </button>

                        {/* All link generation, WhatsApp dispatch, and reset buttons hidden when ACTIVE */}
                        {!isAaActive && (
                          <>
                            <button
                              type="button"
                              onClick={handleGenerateAaUrl}
                              disabled={isAaGenerating}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-50 cursor-pointer"
                            >
                              <Building2 className="h-4 w-4 text-slate-600" />
                              {isAaGenerating ? "Generating Flow URL..." : aaSession ? "Re-generate / Resend AA Link" : "Initiate Account Aggregator"}
                            </button>

                            {aaSession && (
                              <p className="text-[11px] text-slate-500 italic text-center px-1">
                                ℹ️ Link already exists. Click "Re-generate" only if customer needs a new link.
                              </p>
                            )}

                            {aaSession?.redirectionUrl && (
                              <button
                                type="button"
                                onClick={handleSendAaWhatsApp}
                                disabled={isAaSendingWa}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
                              >
                                <Send className="h-3.5 w-3.5 text-emerald-600" />
                                {isAaSendingWa ? "Sending WhatsApp & Email..." : "Send Consent Link on WhatsApp & Email"}
                              </button>
                            )}

                            {/* Reset session ONLY when NOT active */}
                            {aaSession && (
                              <button
                                type="button"
                                onClick={handleResetAaSession}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-xs mt-1 cursor-pointer"
                              >
                                <RotateCcw className="h-3.5 w-3.5 text-rose-600" />
                                Reset AA Session (Fresh Start)
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Modal for Full Bank Statement & Transactions */}
            {showAaStatementModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
                <div className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
                  {(() => {
                    const rawFi = aaAnalytics?.rawAnalyticsJson?.rawFiData || aaAnalytics?.analytics?.rawFiData || aaAnalytics?.rawFiData || aaAnalytics?.rawAnalyticsJson || {};

                    // Extract list of all linked bank accounts from rawFi
                    const accountsList = (() => {
                      const list: any[] = [];
                      if (rawFi && typeof rawFi === "object") {
                        Object.keys(rawFi).forEach((k) => {
                          const item = rawFi[k];
                          if (item && typeof item === "object" && (item.accountId || item.data || item.Summary || item.summary)) {
                            const dataObj = item.data || item;
                            const summary = dataObj.Summary || dataObj.summary || {};
                            const ifsc = summary.ifsc || dataObj.ifscCode || item.ifscCode || summary.ifscCode || "";
                            
                            let bankName = item.bankName || dataObj.bankName || summary.bankName || item.fipName || dataObj.fipName || summary.fipName || "";

                            if (!bankName && ifsc) {
                              const ifscUpper = ifsc.toUpperCase();
                              if (ifscUpper.startsWith("UBIN") || ifscUpper.includes("UNION")) bankName = "Union Bank of India";
                              else if (ifscUpper.startsWith("UTIB") || ifscUpper.includes("AXIS")) bankName = "Axis Bank";
                              else if (ifscUpper.startsWith("SBIN") || ifscUpper.includes("SBI")) bankName = "State Bank of India";
                              else if (ifscUpper.startsWith("HDFC")) bankName = "HDFC Bank";
                              else if (ifscUpper.startsWith("ICIC")) bankName = "ICICI Bank";
                              else if (ifscUpper.startsWith("PUNB")) bankName = "Punjab National Bank";
                              else if (ifscUpper.startsWith("BARB")) bankName = "Bank of Baroda";
                              else if (ifscUpper.startsWith("CNRB")) bankName = "Canara Bank";
                              else if (ifscUpper.startsWith("KKBK")) bankName = "Kotak Mahindra Bank";
                              else if (ifscUpper.startsWith("IDFB")) bankName = "IDFC FIRST Bank";
                              else if (ifscUpper.startsWith("YESB")) bankName = "Yes Bank";
                              else if (ifscUpper.startsWith("INDB")) bankName = "IndusInd Bank";
                            }

                            if (!bankName) {
                              bankName = aaSession?.fipName || lead.bankName || "Bank Account";
                            }

                            const rawMasked = summary.maskedAccNumber || dataObj.maskedAccNumber || item.maskedAccNumber || summary.accountNumber || dataObj.accountNumber || item.accountNumber || "";
                            const masked = rawMasked
                              ? (rawMasked.length > 4 ? rawMasked : `XXXX${rawMasked}`)
                              : (lead.accountNumber ? `XXXX${lead.accountNumber.slice(-4)}` : "XXXX");
                            const status = item.status || (dataObj.Transactions ? "ACTIVE" : "PENDING");
                            const balance = summary.currentBalance !== undefined ? Number(summary.currentBalance) : (dataObj.balance || 0);

                            list.push({
                              key: k,
                              bankName,
                              maskedAccNumber: masked,
                              ifscCode: ifsc,
                              accountType: summary.accountSubType || summary.accountType || "SAVINGS",
                              status,
                              balance,
                              dataObj,
                            });
                          }
                        });
                      }

                      if (list.length === 0) {
                        list.push({
                          key: "0",
                          bankName: aaSession?.fipName || lead.bankName || "Bank Account",
                          maskedAccNumber: lead.accountNumber ? `XXXX${lead.accountNumber.slice(-4)}` : (aaAnalytics?.accountNumberMasked || "XXXX"),
                          ifscCode: lead.ifscCode || "",
                          accountType: "SAVINGS",
                          status: "ACTIVE",
                          balance: 0,
                          dataObj: rawFi,
                        });
                      }

                      return list;
                    })();

                    const activeAccount = accountsList[selectedAaAccountIndex] || accountsList[0];
                    const targetDataObj = activeAccount?.dataObj || rawFi;

                    // Universal recursive CRIF transaction array finder (supports Transactions.Transaction & all CRIF schemas)
                    const extractTransactions = (dataObj: any): any[] => {
                      if (!dataObj) return [];

                      const findTxnArray = (obj: any, depth = 0): any[] | null => {
                        if (!obj || typeof obj !== "object" || depth > 6) return null;
                        
                        if (Array.isArray(obj) && obj.length > 0 && (obj[0].txnId || obj[0].amount || obj[0].narration || obj[0].transactionTimestamp || obj[0].type)) {
                          return obj;
                        }

                        for (const key of Object.keys(obj)) {
                          const lower = key.toLowerCase();
                          if (lower === "transactions" || lower === "transaction" || lower === "txn" || lower === "txns") {
                            const val = obj[key];
                            if (Array.isArray(val) && val.length > 0) return val;
                            if (val && typeof val === "object") {
                              const inner = findTxnArray(val, depth + 1);
                              if (inner) return inner;
                            }
                          }
                        }

                        for (const key of Object.keys(obj)) {
                          const val = obj[key];
                          if (val && typeof val === "object" && !Array.isArray(val)) {
                            const inner = findTxnArray(val, depth + 1);
                            if (inner) return inner;
                          }
                        }

                        return null;
                      };

                      const list = findTxnArray(dataObj) || [];

                      return list.map((tx: any) => ({
                        date: String(tx.transactionTimestamp || tx.valueDate || tx.date || tx.txnDate || "").replace("T", " ").slice(0, 16),
                        narration: tx.narration || tx.description || tx.summary || "Bank Transaction",
                        type: String(tx.type || tx.txnType || "DEBIT").toUpperCase(),
                        amount: Number(tx.amount || tx.txnAmount || 0),
                        balance: tx.transactionalBalance !== undefined ? tx.transactionalBalance : tx.balance,
                      }));
                    };

                    const transactionsList = extractTransactions(targetDataObj);

                    // Calculate live credits & debits from transactionsList if summary is 0
                    const calcCredits = transactionsList.filter(t => t.type === "CREDIT").reduce((acc, t) => acc + t.amount, 0);
                    const calcDebits = transactionsList.filter(t => t.type === "DEBIT").reduce((acc, t) => acc + t.amount, 0);

                    const accountDetails = targetDataObj?.accountDetails || {};
                    const cashFlow = aaAnalytics?.cashFlowSummary || aaAnalytics?.analytics?.cashFlowSummary || {};
                    const credits = (aaAnalytics?.avgMonthlyCredits || cashFlow?.averageMonthlyCredits) || (calcCredits > 0 ? Math.round(calcCredits / 6) : 0);
                    const debits = (aaAnalytics?.avgMonthlyDebits || cashFlow?.averageMonthlyDebits) || (calcDebits > 0 ? Math.round(calcDebits / 6) : 0);

                    return (
                      <>
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50 dark:bg-slate-950">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600">
                              <Building2 className="h-6 w-6" />
                            </div>
                            <div>
                              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                Bank Account Statement & Cash-Flow Analysis
                              </h3>
                              <p className="text-xs text-slate-500">
                                Verified by CRIF Finvu Account Aggregator • {lead.name} ({lead.id})
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowAaStatementModal(false)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-600 cursor-pointer"
                            aria-label="Close modal"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                          {!aaAnalytics ? (
                            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                              <div className="h-14 w-14 rounded-full bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-700 flex items-center justify-center text-indigo-600">
                                <RefreshCw className="h-7 w-7 animate-spin" />
                              </div>
                              <div className="max-w-md space-y-2">
                                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                                  Bank Statement Processing in Progress
                                </h4>
                                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                  Customer consent has been submitted successfully. CRIF Orchestrator is currently fetching and analyzing bank transactions from the bank's FIP server.
                                </p>
                                <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/70 dark:bg-indigo-950/30 p-3 text-xs text-indigo-900 dark:text-indigo-200">
                                  💡 <strong>Next Step:</strong> Please close this popup, wait <strong>15–30 seconds</strong>, and click <strong>"Refresh AA Status & Analytics"</strong> on the Lead page to load the completed bank statement.
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* Multi-Bank Account Selector Tabs */}
                              {accountsList.length > 1 && (
                                <div className="mb-4 border-b border-slate-200 dark:border-slate-800 pb-3">
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 block">
                                    Linked Bank Accounts ({accountsList.length}):
                                  </span>
                                  <div className="flex flex-wrap gap-2">
                                    {accountsList.map((acc, idx) => (
                                      <button
                                        key={idx}
                                        type="button"
                                        onClick={() => setSelectedAaAccountIndex(idx)}
                                        className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition cursor-pointer ${
                                          selectedAaAccountIndex === idx
                                            ? "bg-indigo-600 text-white shadow-md ring-2 ring-indigo-300 dark:ring-indigo-800"
                                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                                        }`}
                                      >
                                        <Building2 className="h-4 w-4" />
                                        <span>{acc.bankName} ({acc.maskedAccNumber})</span>
                                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-extrabold ${
                                          acc.status === "ACTIVE" || acc.status === "READY"
                                            ? "bg-emerald-500/20 text-emerald-300"
                                            : "bg-amber-500/20 text-amber-300"
                                        }`}>
                                          {acc.status}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4">
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Account Details</span>
                                  <p className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{activeAccount.bankName}</p>
                                  <p className="text-xs text-slate-600 dark:text-slate-400">Account No: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{activeAccount.maskedAccNumber}</span></p>
                                  <p className="text-xs text-slate-600 dark:text-slate-400">Type: <span className="font-semibold text-slate-800 dark:text-slate-200">{activeAccount.accountType}</span></p>
                                </div>

                                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4">
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Monthly Cash Flow</span>
                                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Avg Credits: <span className="font-bold text-emerald-600">{formatCurrency(credits)}</span></p>
                                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Avg Debits: <span className="font-bold text-rose-600">{formatCurrency(debits)}</span></p>
                                </div>

                                <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
                                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Salary Verification</span>
                                  <p className="mt-2 text-sm font-bold text-emerald-900 dark:text-emerald-200">
                                    {aaAnalytics?.salaryDetected ? `Detected: ${formatCurrency(aaAnalytics.avgSalary || 0)}/mo` : "Not Detected"}
                                  </p>
                                  <p className="text-xs text-slate-600 dark:text-slate-400">Employer: <span className="font-semibold text-slate-800 dark:text-slate-200">{cashFlow?.detectedEmployer || "N/A"}</span></p>
                                </div>

                                <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 p-4">
                                  <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">CRIF Underwriting Score</span>
                                  <p className="mt-2 text-sm font-extrabold text-indigo-900 dark:text-indigo-200">{aaAnalytics?.riskScore || cashFlow?.riskIndicatorScore || "LOW_RISK"}</p>
                                  <p className="text-xs text-slate-600 dark:text-slate-400">Bounces: <span className="font-bold text-emerald-600">{aaAnalytics?.bouncesCount || 0} NACH/Cheque</span></p>
                                </div>
                              </div>

                              <div>
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Bank Statement Transaction Ledger ({transactionsList.length} Records)
                                  </h4>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadAaCsv(activeAccount, transactionsList, { credits, debits, cashFlow, aaAnalytics })}
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-emerald-600 shadow-xs transition cursor-pointer"
                                      title="Export transactions table as CSV"
                                    >
                                      <Download className="h-3 w-3 text-emerald-600" />
                                      Export CSV
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadAaPdf(activeAccount, transactionsList, { credits, debits, cashFlow, aaAnalytics })}
                                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition shadow-xs cursor-pointer"
                                      title="Print or save statement ledger as PDF"
                                    >
                                      <Printer className="h-3 w-3 text-indigo-600" />
                                      Print / PDF
                                    </button>
                                  </div>
                                </div>
                                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[400px] overflow-y-auto">
                                  <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700 sticky top-0">
                                      <tr>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">Transaction Narration</th>
                                        <th className="px-4 py-3">Type</th>
                                        <th className="px-4 py-3 text-right">Amount (₹)</th>
                                        <th className="px-4 py-3 text-right">Ending Balance (₹)</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                                      {transactionsList.map((tx: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                          <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">{tx.date}</td>
                                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 max-w-[280px] truncate" title={tx.narration}>{tx.narration}</td>
                                          <td className="px-4 py-3 whitespace-nowrap">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                              tx.type === 'CREDIT' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                            }`}>
                                              {tx.type}
                                            </span>
                                          </td>
                                          <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${tx.type === 'CREDIT' ? 'text-emerald-600' : 'text-slate-800 dark:text-slate-200'}`}>
                                            {formatCurrency(tx.amount)}
                                          </td>
                                          <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                            {tx.balance !== undefined ? formatCurrency(tx.balance) : "-"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {transactionsList.length === 0 && (
                                <div className={`rounded-xl border p-3.5 text-xs space-y-1 ${
                                  activeAccount.status === "DENIED" || activeAccount.status === "REJECTED"
                                    ? "border-amber-200 bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
                                    : "border-blue-200 bg-blue-50/80 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200"
                                }`}>
                                  <p className="font-bold flex items-center gap-1.5">
                                    {activeAccount.status === "DENIED" || activeAccount.status === "REJECTED" ? "⚠️ FIP Consent Status: DENIED / REJECTED" : "ℹ️ Bank FIP Data Sync Notice"}
                                  </p>
                                  <p className="leading-relaxed">
                                    {activeAccount.status === "DENIED" || activeAccount.status === "REJECTED" ? (
                                      <>
                                        Consent for <strong>{activeAccount.bankName} ({activeAccount.maskedAccNumber})</strong> was denied or rejected during verification by the customer/FIP. No transaction records were delivered for this specific bank account.
                                      </>
                                    ) : (
                                      <>
                                        Consent status for <strong>{activeAccount.bankName} ({activeAccount.maskedAccNumber})</strong> has been verified successfully. Real-time transaction records will update automatically as soon as the financial institution completes the data sync.
                                      </>
                                    )}
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        <div className="border-t border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
                          <span className="text-xs text-slate-500">Secured via CRIF Orchestrator FIU Webservice</span>
                          <button
                            type="button"
                            onClick={() => setShowAaStatementModal(false)}
                            className="rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2 text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-100 cursor-pointer"
                          >
                            Close Statement
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {isAccountantRole && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Accountant Payment</h3>
                    <p className="text-xs text-gray-500">Complete disbursement after credit approval.</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${canCompletePayment ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-700"
                    }`}>
                    {canCompletePayment ? "Ready" : lead.status}
                  </span>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Disbursement Date</label>
                    <input
                      type="date"
                      value={paymentDisbursementDate}
                      onChange={(event) => setPaymentDisbursementDate(event.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Payment Method</label>
                    <NiceSelect
                      ariaLabel="Payment method"
                      className="mt-1"
                      value={paymentMethod}
                      onValueChange={setPaymentMethod}
                      options={["IMPS", "NEFT", "UPI"].map((method) => ({ label: method, value: method }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">UTR / Transaction ID</label>
                    <input
                      value={paymentReference}
                      onChange={(event) => setPaymentReference(event.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="UTR / transaction ID"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Notes</label>
                    <textarea
                      value={paymentNotes}
                      onChange={(event) => setPaymentNotes(event.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Disbursement note"
                    />
                  </div>
                  {paymentFeedback && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                      {paymentFeedback}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleMarkPaymentComplete}
                    disabled={!canCompletePayment || isPaymentSaving}
                    className="w-full rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPaymentSaving ? "Saving..." : "Mark Payment Complete"}
                  </button>
                  {!canCompletePayment && (
                    <p className="text-xs text-gray-500">Payment can be completed only after credit approval and signed loan agreement.</p>
                  )}
                </div>
              </div>
            )}




          </div>
        </div>
      )}

      {activeTab === "documents" && (
        <div className="space-y-6">
          {/* Document Request Link */}
          {canRequestDocuments && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Request Customer Document</h3>
                  <p className="text-sm text-gray-500">Generate a secure upload link and send it to the customer. Links close after upload or expiry.</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Customer uploads are stored on this backend under <span className="font-medium text-gray-700">{documentBaseUrl}</span>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loadDocumentRequests()}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Refresh
                </button>
              </div>

              {documentRequestError && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {documentRequestError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(220px,1fr)_auto]">
                <div>
                  <label className="text-sm font-medium text-gray-700">Required Documents</label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {DOCUMENT_REQUEST_OPTIONS.map((option) => {
                      const isSelected = selectedDocumentKeys.includes(option.key);
                      const hasEvidence = documentHasEvidence(option.key);

                      return (
                        <label
                          key={option.key}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition ${isSelected ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectedDocumentKey(option.key)}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="min-w-0">
                            <span className="block font-medium text-gray-900">{option.label}</span>
                            <span className={`text-xs ${hasEvidence ? "text-green-700" : "text-amber-700"}`}>
                              {hasEvidence ? "Available, use for reupload if needed" : "Missing"}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Privacy note: request only documents required for this application. Uploaded files are stored with tokenized filenames and are visible inside this CRM workflow only.
                  </p>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={createDocumentRequest}
                    disabled={isDocumentRequestSaving || selectedDocumentKeys.length === 0}
                    className="h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDocumentRequestSaving ? "Generating..." : "Generate Link"}
                  </button>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {documentRequestGroups.slice(0, 5).map((group) => (
                  <div key={group.token} className="flex flex-col gap-3 rounded-lg border border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-gray-900">{group.requests.map((request) => request.label).join(", ")}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${group.isUploaded
                          ? "bg-green-100 text-green-800"
                          : group.isExpired
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                          }`}>
                          {group.isUploaded ? "Uploaded" : group.isExpired ? "Expired" : "Pending"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {group.requests.filter((request) => request.status === "uploaded").length}/{group.requests.length} uploaded
                      </p>
                      <p className="mt-1 truncate text-xs text-gray-500">{getUploadLink(group.token)}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <AppTooltip label="Copy upload link">
                        <button
                          type="button"
                          onClick={() => copyUploadLink(group.token)}
                          className="rounded-md border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          Copy Link
                        </button>
                      </AppTooltip>
                      <AppTooltip label="Remove this upload link">
                        <button
                          type="button"
                          onClick={() => removeDocumentLink(group.token)}
                          disabled={removingDocumentToken === group.token}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {removingDocumentToken === group.token ? "Removing..." : "Remove"}
                        </button>
                      </AppTooltip>
                      <AppTooltip label="Open upload page">
                        <a
                          href={getUploadLink(group.token)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          Open
                        </a>
                      </AppTooltip>
                    </div>
                  </div>
                ))}
                {documentRequestGroups.length === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                    No document upload links have been generated yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Documents List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Uploaded Documents</h3>
                  <p className="text-sm text-gray-500">
                    Source documents open from {lead.sourceSystem === "waqtmoney" ? "WaqtMoney" : lead.sourceSystem === "waqtfinance" ? "WaqtFinance" : lead.sourceSystem === "geetpay" ? "GeetPay" : "their source"}; requested uploads open from CRM backend.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {uploadedDocumentCount}/{documents.length} available
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Document Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Upload Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {doc.isImage && doc.href ? (
                            <button
                              type="button"
                              onClick={() => setPreviewImage({ title: doc.name, url: doc.href })}
                              className="h-12 w-12 overflow-hidden rounded-md border border-gray-200 bg-gray-50"
                            >
                              <AuthenticatedImage
                                src={doc.href}
                                alt={doc.name}
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : (
                            <FileText className="h-5 w-5 text-gray-400" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                            {doc.fileName && (
                              <p className="max-w-[220px] truncate text-xs text-gray-500">{doc.fileName}</p>
                            )}
                            {doc.storageLabel && (
                              <p className="mt-0.5 text-xs font-medium text-slate-500">{doc.storageLabel}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {doc.type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {doc.uploadedDate}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getDocumentStatusBadge(doc.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {(doc.isImage || doc.isVideo) && doc.href ? (
                          <button
                            type="button"
                            onClick={() => setPreviewImage({ title: doc.name, url: doc.href })}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                          >
                            <FileText className="h-4 w-4" />
                            Preview
                          </button>
                        ) : doc.href ? (
                          <button
                            type="button"
                            onClick={() => openDocument(doc.href)}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                          >
                            <Download className="h-4 w-4" />
                            View / Download
                          </button>
                        ) : doc.fileName ? (
                          <span className="text-gray-600">{doc.fileName}</span>
                        ) : (
                          <span className="text-gray-400">Not available</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "activity" && (
        <div className="space-y-6">
          <form onSubmit={handleActivityNoteSubmit} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Add Activity Note</h3>
            <div className="flex flex-col gap-3 sm:flex-row">
              <textarea
                value={activityNote}
                onChange={(event) => setActivityNote(event.target.value)}
                rows={3}
                className="min-h-24 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Add a call note, follow-up update, or internal remark"
              />
              <button
                type="submit"
                disabled={isActivitySaving || !activityNote.trim()}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:self-end"
              >
                {isActivitySaving ? "Saving..." : "Save Note"}
              </button>
            </div>
          </form>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
              <AppTooltip label="Reload activity timeline">
                <button
                  type="button"
                  onClick={refreshActivities}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Refresh
                </button>
              </AppTooltip>
            </div>

            {activityError && (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {activityError}
              </div>
            )}

            <div className="space-y-4">
              {isActivityLoading && [0, 1, 2].map((item) => (
                <div key={item} className="flex gap-4 pb-4">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
                    <div className="h-3 w-44 animate-pulse rounded bg-gray-100" />
                  </div>
                </div>
              ))}

              {!isActivityLoading && activities.map((activity) => (
                <div key={activity.id} className="flex gap-4 border-b border-gray-200 pb-4 last:border-0">
                  <div className="h-fit rounded-full bg-gray-100 p-2">
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{activity.description}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-gray-600">{activity.user}</span>
                      <span className="text-xs text-gray-400">-</span>
                      <span className="text-xs text-gray-500">{formatActivityDate(activity.date)}</span>
                    </div>
                  </div>
                </div>
              ))}

              {!isActivityLoading && activities.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
                  No activity has been recorded for this lead yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "past-loans" && lead.pastLoans && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4 bg-slate-50">
            <h3 className="text-base font-bold text-slate-950">Repayment & Past Loan History</h3>
            <p className="text-xs text-slate-500">Historical loans associated with this applicant's profile (matched by phone/email).</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {["Loan ID", "Principal", "Total Amount", "Amount Paid", "Balance", "Start Date", "Due Date", "Status"].map((head) => (
                    <th key={head} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {lead.pastLoans.map((loan: any) => (
                  <tr key={loan.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-semibold text-slate-950">{loan.id}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{formatCurrency(loan.principal)}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{formatCurrency(loan.totalAmount)}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-emerald-600">{formatCurrency(loan.amountPaid)}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-950">{formatCurrency(loan.balance)}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{new Date(loan.startDate).toLocaleDateString("en-IN")}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{new Date(loan.dueDate).toLocaleDateString("en-IN")}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        loan.status === "Paid Off"
                          ? "bg-emerald-100 text-emerald-800"
                          : loan.status === "Overdue"
                            ? "bg-red-100 text-red-800"
                            : "bg-blue-100 text-blue-800"
                      }`}>
                        {loan.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AlertDialog open={showDeleteLeadDialog} onOpenChange={(open) => !isLeadDeleting && setShowDeleteLeadDialog(open)}>
        <AlertDialogContent className="border-red-100 dark:border-red-900/50 bg-white dark:bg-slate-900">
          <AlertDialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400">
              <Trash2 className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-slate-950 dark:text-slate-100">Remove this lead permanently?</AlertDialogTitle>
            <AlertDialogDescription className="leading-6 text-slate-600 dark:text-slate-400">
              This will delete {lead.name || "this lead"} and related activities, calls, follow-ups, document requests,
              verification checks, credit handoffs, payment records, Aadhaar/CIBIL records, and local uploaded files.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLeadDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleDeleteLead();
              }}
              disabled={isLeadDeleting}
              className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-200"
            >
              {isLeadDeleting ? "Removing..." : "Remove Lead"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-gray-900">{previewImage.title}</h3>
                {!previewImage.url.startsWith("data:") && (
                  <p className="truncate text-xs text-gray-500">{getFileName(previewImage.url)}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openDocument(previewImage.url)}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" />
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex max-h-[78vh] items-center justify-center bg-gray-950 p-4 w-full">
              {isVideoFile(previewImage.url) ? (
                <AuthenticatedVideo
                  src={previewImage.url}
                  className="max-h-[72vh] max-w-full rounded-md"
                />
              ) : (
                <AuthenticatedImage
                  src={previewImage.url}
                  alt={previewImage.title}
                  className="max-h-[72vh] max-w-full rounded-md object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* CAM Sheet Modal */}
      {showCAMSheet && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-start gap-4 z-10">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">CAM Sheet - Credit Assessment Memorandum</h3>
                <p className="mt-1 text-sm text-gray-500">Underwriting worksheet for {lead.name || lead.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyCamSummary}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Copy Summary
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => setShowCAMSheet(false)}
                  className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Close CAM sheet"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Executive Decision Summary */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-semibold text-slate-950">Executive Credit Summary</h4>
                    <p className="text-sm text-slate-500">System-assisted recommendation with underwriter override controls.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${camDecisionTone}`}>
                      Selected: {camRecommendation}
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      Suggested: {systemCamRecommendation}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                  {[
                    ["Risk Grade", riskGrade],
                    ["Policy Score", `${policyPassPercent}%`],
                    ["Verification", `${verificationPercent}%`],
                    ["FOIR After Loan", `${foirAfterLoan}%`],
                    ["Deviation", camDeviationLevel],
                    ["Docs Gap", String(creditDocumentGapChecks.length)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md bg-white p-3 shadow-sm">
                      <p className="text-xs font-medium text-slate-500">{label}</p>
                      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
                    </div>
                  ))}
                </div>
                {creditApprovalBlockers.length > 0 && (
                  <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
                    Advisory before approval: {creditApprovalBlockers.slice(0, 6).join(", ")}{creditApprovalBlockers.length > 6 ? "..." : ""}
                  </div>
                )}
                {!hasCreditApprovalBlockers && needsDeviationReason && (
                  <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm leading-6 text-blue-800">
                    Underwriter reason is recommended for this exception.
                  </div>
                )}
              </div>

              {/* Applicant Information */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">Applicant Information</h4>
                <div className="grid grid-cols-1 gap-4 bg-gray-50 p-4 rounded-lg md:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Name</label>
                    <p className="text-sm text-gray-900">{lead.name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Credit Score</label>
                    <p className="text-sm text-gray-900 font-semibold">{displayedCreditScore || "Not fetched"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Monthly Income</label>
                    <p className="text-sm text-gray-900">{formatCurrency(lead.monthlyIncome)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Employment</label>
                    <p className="text-sm text-gray-900">{lead.employmentStatus}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">PAN / Aadhaar</label>
                    <p className="text-sm text-gray-900">{lead.panNumber || "PAN not captured"}</p>
                    <p className="text-xs text-gray-500">{aadhaarNumberDisplay || "Aadhaar pending"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Bank Details</label>
                    <p className="text-sm text-gray-900">{lead.bankName || "Not captured"}</p>
                    <p className="text-xs text-gray-500">{lead.ifscCode || "IFSC pending"}</p>
                  </div>
                </div>
              </div>

              {/* Loan Details */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">Loan Details</h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Requested Amount</label>
                    <input
                      type="text"
                      value={formatCurrency(loanAmount)}
                      readOnly
                      className="mt-1 w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Recommended Eligible Amount</label>
                    <input
                      min="0"
                      type="number"
                      value={camRecommendedAmount}
                      onChange={(event) => setCamRecommendedAmount(event.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Approved Amount</label>
                    <input
                      min="0"
                      type="number"
                      value={camApprovedAmount}
                      onChange={(event) => setCamApprovedAmount(event.target.value)}
                      className={`mt-1 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${camAmountError ? "border-red-300 bg-red-50" : "border-gray-300"}`}
                    />
                    {camAmountError && <p className="mt-1 text-xs font-medium text-red-600">{camAmountError}</p>}
                    {!camAmountError && approvedAmount > recommendedEligibleAmount && (
                      <p className="mt-1 text-xs font-medium text-amber-700">Above eligible amount. Add deviation reason before approval.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Loan Term</label>
                    <input
                      min="1"
                      step="1"
                      type="number"
                      value={camLoanTermDays}
                      onChange={(event) => setCamLoanTermDays(event.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label="Loan term in days"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Interest Rate (% per day)</label>
                    <NiceSelect
                      ariaLabel="Interest rate per day"
                      className="mt-1"
                      value={camInterestRate}
                      onValueChange={setCamInterestRate}
                      options={CAM_INTEREST_RATE_OPTIONS.map((rate) => ({ label: `${rate}%`, value: rate }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Processing Fee (%)</label>
                    <NiceSelect
                      ariaLabel="Processing fee percentage"
                      className="mt-1"
                      value={camProcessingFeeRate}
                      onValueChange={setCamProcessingFeeRate}
                      options={CAM_PROCESSING_FEE_OPTIONS.map((rate) => ({ label: `${rate}%`, value: rate }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">GST on Processing Fee</label>
                    <input
                      type="text"
                      value={`${formatCurrency(camGstAmount)} (18%)`}
                      className="mt-1 w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-md"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Total Repayment</label>
                    <input
                      type="text"
                      value={formatCurrency(camTotalRepayment)}
                      className="mt-1 w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-md"
                      readOnly
                    />
                  </div>
                </div>
              </div>

              {/* Financial Assessment */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">Financial Assessment</h4>
                <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-700">Captured Monthly Income</span>
                    <span className="text-sm font-semibold text-gray-900">{formatCurrency(totalIncome)}</span>
                  </div>
                  <div className="flex justify-between border-t border-blue-200 pt-3">
                    <span className="text-sm font-medium text-gray-900">Monthly Repayment Equivalent</span>
                    <span className="text-sm font-bold text-gray-900">{formatCurrency(monthlyRepaymentEquivalent)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-700">Proposed FOIR</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {foirAfterLoan}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-700">Income Coverage</span>
                    <span className={`text-sm font-semibold ${repaymentBuffer >= 1 ? "text-green-700" : "text-red-700"}`}>
                      {repaymentBuffer.toFixed(2)}x
                    </span>
                  </div>
                  <div className="rounded-md border border-blue-100 bg-white px-3 py-2 text-xs text-slate-600">
                    Expense, rent, and other loan obligation fields are not captured in the lead form, so this assessment uses captured income and proposed repayment only. Final affordability should be validated in CAM.
                  </div>
                </div>
              </div>

              {/* Verification Matrix */}
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-lg font-semibold text-gray-900">Verification Matrix</h4>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${verificationPercent === 100 ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                    {verifiedDocumentChecks}/{totalDocumentChecks || 0} verified
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {telecallerWorkspace.documentChecks.map((check) => {
                    const status = getEffectiveDocumentCheckStatus(check);
                    return (
                      <div key={check.key} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{check.label}</p>
                          {check.remark && <p className="mt-1 text-xs text-gray-500">{check.remark}</p>}
                        </div>
                        {getDocumentCheckBadge(status)}
                      </div>
                    );
                  })}
                </div>
                {creditDocumentGapRequestKeys.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRequestMoreInfoCamSheet}
                    disabled={isDocumentRequestSaving}
                    className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDocumentRequestSaving ? "Generating link..." : "Request Missing Documents"}
                  </button>
                )}
              </div>

              {/* Policy Checklist */}
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-lg font-semibold text-gray-900">Policy Checklist</h4>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${failedPolicyChecks.length ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                    {failedPolicyChecks.length ? `${failedPolicyChecks.length} gaps found` : "All checks passed"}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {camPolicyChecks.map((check) => (
                    <div key={check.label} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-3">
                      <span className="text-sm text-gray-700">{check.label}</span>
                      {check.passed ? (
                        <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk Assessment */}
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-lg font-semibold text-gray-900">Risk Assessment</h4>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${camDecisionTone}`}>
                    {camRecommendation}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Credit Risk</label>
                    <NiceSelect
                      ariaLabel="Credit risk"
                      className="mt-1"
                      value={camCreditRisk}
                      onValueChange={setCamCreditRisk}
                      options={["Low", "Medium", "High"].map((risk) => ({ label: risk, value: risk }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Repayment Capacity</label>
                    <NiceSelect
                      ariaLabel="Repayment capacity"
                      className="mt-1"
                      value={camRepaymentCapacity}
                      onValueChange={setCamRepaymentCapacity}
                      options={["Excellent", "Good", "Fair", "Poor"].map((capacity) => ({ label: capacity, value: capacity }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Recommendation</label>
                    <NiceSelect
                      ariaLabel="Credit recommendation"
                      className="mt-1"
                      value={camRecommendation}
                      onValueChange={(value) => setCamRecommendation(value as CamRecommendation)}
                      options={CAM_RECOMMENDATIONS.map((recommendation) => ({ label: recommendation, value: recommendation }))}
                    />
                    {hasCreditApprovalBlockers && CAM_APPROVAL_RECOMMENDATIONS.includes(camRecommendation as typeof CAM_APPROVAL_RECOMMENDATIONS[number]) && (
                      <p className="mt-1 text-xs font-medium text-amber-700">Approval is allowed; these gaps will be saved as advisory notes.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Deviation Level</label>
                    <NiceSelect
                      ariaLabel="Deviation level"
                      className="mt-1"
                      value={camDeviationLevel}
                      onValueChange={setCamDeviationLevel}
                      options={["None", "Minor", "Major"].map((level) => ({ label: level, value: level }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-600">Decision Reason</label>
                    <textarea
                      value={camDecisionReason}
                      onChange={(event) => setCamDecisionReason(event.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      placeholder="Summarize why this decision is appropriate. Required for rejection."
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Approval Conditions</label>
                    <textarea
                      value={camConditions}
                      onChange={(event) => setCamConditions(event.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      placeholder="Add conditions, pending checks, or deviations..."
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Underwriter Notes</label>
                    <textarea
                      value={camNotes}
                      onChange={(event) => setCamNotes(event.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      placeholder="Add assessment notes, bureau observations, customer discussion, or exception rationale..."
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              {camFeedback && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  {camFeedback}
                </div>
              )}
              {(camApprovalWarnings.length > 0 || camAmountError || needsRejectReason) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                  {camAmountError && <p>{camAmountError}</p>}
                  {camApprovalWarnings.slice(0, 5).map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                  {camApprovalWarnings.length > 5 && <p>{camApprovalWarnings.length - 5} more advisory gaps.</p>}
                  {needsRejectReason && <p>Reject reason is blank; system will record a default rejection note if you continue.</p>}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowCAMSheet(false)}
                  disabled={isCamSaving}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCamSheet}
                  disabled={isCamSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCamSaving ? "Saving..." : "Save CAM Sheet"}
                </button>
                <button
                  type="button"
                  onClick={handleRequestMoreInfoCamSheet}
                  disabled={isCamSaving || isDocumentRequestSaving || !canCompleteCreditDecision || (!creditDocumentGapRequestKeys.length && !creditApprovalBlockers.length)}
                  className="px-4 py-2 border border-amber-200 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDocumentRequestSaving ? "Requesting..." : "Request More Info"}
                </button>
                <button
                  type="button"
                  onClick={openSanctionModal}
                  disabled={isCamSaving || !canApproveCam}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCamSaving ? "Processing..." : "Loan Approved"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreditDecisionConfirm("rejected")}
                  disabled={isCamSaving || !canCompleteCreditDecision}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCamSaving ? "Processing..." : "Loan Rejection"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSanctionModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-6 py-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{canCompleteCreditDecision ? "Submit Sanction Details" : "Submit Revised Sanction Details"}</h3>
                <p className="mt-1 text-sm text-gray-500">This will generate the sanction PDF and send it by email and WhatsApp.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSanctionModal(false)}
                className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close sanction form"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                On OK, customer will receive the loan confirmation by email and WhatsApp with the generated sanction PDF.
              </div>
              {!canCompleteCreditDecision && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Revision Reason</label>
                  <textarea
                    rows={2}
                    value={sanctionRevisionReason}
                    onChange={(event) => setSanctionRevisionReason(event.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Example: Correcting sanctioned amount entered lower than approved customer terms."
                  />
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <SanctionInput label="Loan Agreement Number" value={sanctionForm.agreementNumber} onChange={(value) => setSanctionForm((form) => ({ ...form, agreementNumber: value }))} />
                <SanctionInput label="Agreement Date" type="date" value={sanctionForm.agreementDate} onChange={(value) => updateSanctionForm({ agreementDate: value, dueDate: addDaysIso(value, Number(sanctionForm.tenureDays || 30)) })} />
                <SanctionInput label="Borrower" value={lead.name || ""} readOnly onChange={() => undefined} />
                <SanctionInput label="Borrower Email" value={sanctionForm.borrowerEmail} onChange={(value) => setSanctionForm((form) => ({ ...form, borrowerEmail: value }))} />
                <SanctionInput label="Borrower Phone" value={sanctionForm.borrowerPhone} onChange={(value) => setSanctionForm((form) => ({ ...form, borrowerPhone: value }))} />
                <label className="block text-sm font-medium text-gray-600">
                  Disbursement Mode
                  <NiceSelect
                    ariaLabel="Disbursement mode"
                    className="mt-1"
                    value={sanctionForm.disbursementMode}
                    onValueChange={(value) => setSanctionForm((form) => ({ ...form, disbursementMode: value }))}
                    options={["Bank Transfer", "NEFT", "IMPS", "UPI"].map((mode) => ({ label: mode, value: mode }))}
                  />
                </label>
                <SanctionInput label="Principal Loan Amount" type="number" value={sanctionForm.principalAmount} onChange={(value) => updateSanctionForm({ principalAmount: value })} />
                <SanctionInput label="Tenure (Days)" type="number" value={sanctionForm.tenureDays} onChange={(value) => updateSanctionForm({ tenureDays: value, dueDate: addDaysIso(sanctionForm.agreementDate, Number(value || 30)) })} />
                <label className="block text-sm font-medium text-gray-600">
                  Rate of Interest (% per day)
                  <NiceSelect
                    ariaLabel="Sanction interest rate"
                    className="mt-1"
                    value={sanctionForm.interestRate}
                    onValueChange={(value) => updateSanctionForm({ interestRate: value })}
                    options={CAM_INTEREST_RATE_OPTIONS.map((rate) => ({ label: `${rate}%`, value: rate }))}
                  />
                </label>
                <label className="block text-sm font-medium text-gray-600">
                  Processing Fee (%)
                  <NiceSelect
                    ariaLabel="Sanction processing fee percentage"
                    className="mt-1"
                    value={sanctionForm.processingFeeRate}
                    onValueChange={(value) => updateSanctionForm({ processingFeeRate: value })}
                    options={CAM_PROCESSING_FEE_OPTIONS.map((rate) => ({ label: `${rate}%`, value: rate }))}
                  />
                </label>
                <SanctionInput label="Processing Fees" value={formatCurrency(Number(sanctionForm.processingFee || 0))} readOnly onChange={() => undefined} />
                <SanctionInput label="GST (18% fixed)" value={formatCurrency(Number(sanctionForm.gstAmount || 0))} readOnly onChange={() => undefined} />
                <SanctionInput label="Amount to be Disbursed" value={formatCurrency(buildSanctionPayload().disbursedAmount)} readOnly onChange={() => undefined} />
                <SanctionInput label="Disbursement Date" type="date" value={sanctionForm.disbursementDate} onChange={(value) => setSanctionForm((form) => ({ ...form, disbursementDate: value }))} />
                <SanctionInput label="Due Date" type="date" value={sanctionForm.dueDate} onChange={(value) => setSanctionForm((form) => ({ ...form, dueDate: value }))} />
                <SanctionInput label="Repayment Amount" type="number" value={sanctionForm.repaymentAmount} onChange={(value) => setSanctionForm((form) => ({ ...form, repaymentAmount: value }))} />
                <SanctionInput label="APR / Effective Annualized Rate (%)" type="number" value={sanctionForm.apr} onChange={(value) => setSanctionForm((form) => ({ ...form, apr: value }))} />
                <SanctionInput label="Bank Name" value={sanctionForm.bankName} onChange={(value) => setSanctionForm((form) => ({ ...form, bankName: value }))} />
                <SanctionInput label="Account Number" value={sanctionForm.accountNumber} onChange={(value) => setSanctionForm((form) => ({ ...form, accountNumber: value }))} />
                <SanctionInput label="IFSC Code" value={sanctionForm.ifscCode} onChange={(value) => setSanctionForm((form) => ({ ...form, ifscCode: value.toUpperCase() }))} />
                <SanctionInput label="Penal Interest (% per day)" type="number" value={sanctionForm.penalInterestRate} onChange={(value) => setSanctionForm((form) => ({ ...form, penalInterestRate: value }))} />
                <SanctionInput label="Late Fee Terms" value={sanctionForm.lateFee} onChange={(value) => setSanctionForm((form) => ({ ...form, lateFee: value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Sanction Conditions / Remarks</label>
                <textarea
                  rows={3}
                  value={sanctionForm.conditions}
                  onChange={(event) => setSanctionForm((form) => ({ ...form, conditions: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add final sanction conditions or remarks..."
                />
              </div>
              {camFeedback && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {camFeedback}
                </div>
              )}
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowSanctionModal(false)}
                  disabled={isCamSaving}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApproveCamSheet}
                  disabled={isCamSaving}
                  className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCamSaving ? "Processing..." : canCompleteCreditDecision ? "OK - Send Sanction Letter" : "OK - Send Revised Sanction"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={showTelecallerRejectDialog}
        onOpenChange={(open) => {
          if (!open && !isTelecallerRejecting) {
            setShowTelecallerRejectDialog(false);
            setTelecallerRejectError("");
          }
        }}
      >
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this loan?</AlertDialogTitle>
            <AlertDialogDescription className="leading-6 text-slate-600">
              {lead.name || "This customer"} will be marked as Lost. A WhatsApp rejection message will be sent using template ID 35391.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <label className="text-sm font-medium text-slate-700">Rejection reason</label>
            <textarea
              rows={4}
              value={telecallerRejectReason}
              onChange={(event) => {
                setTelecallerRejectReason(event.target.value);
                if (telecallerRejectError) setTelecallerRejectError("");
              }}
              disabled={isTelecallerRejecting}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Example: Customer not interested, eligibility mismatch, documents unavailable..."
            />
            {telecallerRejectError && (
              <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{telecallerRejectError}</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTelecallerRejecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isTelecallerRejecting}
              onClick={(event) => {
                event.preventDefault();
                handleTelecallerRejectLead();
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isTelecallerRejecting ? "Rejecting..." : "Reject Loan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(showCreditDecisionConfirm)}
        onOpenChange={(open) => {
          if (!open && !isCamSaving) setShowCreditDecisionConfirm(null);
        }}
      >
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {showCreditDecisionConfirm === "approved" ? "Approve this lead?" : "Reject this lead?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-6 text-slate-600">
              {showCreditDecisionConfirm === "approved"
                ? `${lead.name || "This lead"} will be approved and moved to the accountant payment queue.`
                : `${lead.name || "This lead"} will be rejected and marked as Lost.`}
              {" "}This action will be saved in audit logs and activity timeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p><span className="font-semibold">Recommendation:</span> {camRecommendation}</p>
            <p><span className="font-semibold">Risk:</span> {camCreditRisk}</p>
            <p><span className="font-semibold">Approved amount:</span> {showCreditDecisionConfirm === "approved" ? formatCurrency(approvedAmount) : "Not applicable"}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCamSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isCamSaving}
              onClick={(event) => {
                event.preventDefault();
                const action = showCreditDecisionConfirm;
                setShowCreditDecisionConfirm(null);
                if (action === "approved") {
                  handleApproveCamSheet();
                } else if (action === "rejected") {
                  handleRejectCamSheet();
                }
              }}
              className={showCreditDecisionConfirm === "approved" ? "bg-green-600 text-white hover:bg-green-700" : "bg-red-600 text-white hover:bg-red-700"}
            >
              {isCamSaving
                ? "Processing..."
                : showCreditDecisionConfirm === "approved"
                  ? "Approve Lead"
                  : "Reject Lead"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Post-Sanction Loan Rejection Dialog Modal */}
      {showPostSanctionRejectDialog && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden text-slate-900 ring-1 ring-slate-900/5">
            {/* Header */}
            <div className="px-6 py-4.5 bg-gradient-to-r from-red-600 via-rose-600 to-rose-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 text-white">
                  <XCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-white">
                    Reject Loan Post-Sanction & Send Email
                  </h3>
                  <p className="text-xs text-white/85 mt-0.5">
                    Write customer rejection email text and mark lead as Lost
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isPostSanctionRejecting && setShowPostSanctionRejectDialog(false)}
                className="text-white/80 hover:text-white rounded-lg p-1.5 hover:bg-white/10 transition cursor-pointer"
                disabled={isPostSanctionRejecting}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Customer Email Address</label>
                <input
                  type="email"
                  value={postSanctionRejectEmail}
                  onChange={(e) => setPostSanctionRejectEmail(e.target.value)}
                  disabled={isPostSanctionRejecting}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:opacity-60"
                  placeholder="customer@example.com"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Email Subject (Sent to Customer)</label>
                <input
                  type="text"
                  value={postSanctionRejectSubject}
                  onChange={(e) => setPostSanctionRejectSubject(e.target.value)}
                  disabled={isPostSanctionRejecting}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:opacity-60"
                  placeholder="Loan Application Rejection Notice..."
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Email Message Body (Input Field - Sent directly to Customer)
                </label>
                <textarea
                  rows={8}
                  value={postSanctionRejectBody}
                  onChange={(e) => setPostSanctionRejectBody(e.target.value)}
                  disabled={isPostSanctionRejecting}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono leading-relaxed outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:opacity-60"
                  placeholder="Type customer rejection email text here..."
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Whatever text you write here will be formatted and emailed directly to the customer.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Internal Audit Reason / Note</label>
                <input
                  type="text"
                  value={postSanctionRejectReason}
                  onChange={(e) => setPostSanctionRejectReason(e.target.value)}
                  disabled={isPostSanctionRejecting}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:opacity-60"
                  placeholder="Internal reason for CRM records..."
                />
              </div>

              {postSanctionRejectError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-medium">
                  {postSanctionRejectError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPostSanctionRejectDialog(false)}
                disabled={isPostSanctionRejecting}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePostSanctionReject}
                disabled={isPostSanctionRejecting || !postSanctionRejectSubject.trim() || !postSanctionRejectBody.trim()}
                className="px-5 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isPostSanctionRejecting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Sending & Rejecting...
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    Reject Loan & Send Email
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* eMandate Link Generator Dialog Modal */}
      {showEmandateModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden text-slate-900 ring-1 ring-slate-900/5">
            {/* Brand Logo Header (Emerald Teal Gradient for Cashfree) */}
            <div className="px-6 py-4.5 flex items-center justify-between bg-gradient-to-r from-emerald-700 via-teal-700 to-blue-800 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 text-white">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-extrabold tracking-tight text-white">
                      Generate Cashfree eMandate Link
                    </h3>
                    <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-white/20 text-white border border-white/30 backdrop-blur-xs">
                      1-Click Direct eNACH & AutoPay
                    </span>
                  </div>
                  <p className="text-xs text-white/85 mt-0.5">Set Auto-Debit Limit for Loan Repayments via Cashfree</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEmandateModal(false)}
                className="text-white/80 hover:text-white rounded-lg p-1.5 hover:bg-white/10 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* 2-Column Wide Grid Layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Column 1: Applicant Summary & Provider Notice */}
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-2.5">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <span className="text-xs font-bold text-slate-800">Applicant Information</span>
                      <span className="font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-[11px]">
                        {lead.id}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Applicant Name:</span>
                      <span className="font-bold text-slate-900 text-xs">{lead.name || 'Applicant'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Mobile Number:</span>
                      <span className="font-semibold text-slate-800">{lead.mobile || lead.phone || 'N/A'}</span>
                    </div>
                  </div>

                  {/* Cashfree Gateway Card Notice */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-950 space-y-1.5">
                    <div className="flex items-center gap-2 font-extrabold text-emerald-800">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span> Cashfree AutoPay Gateway
                    </div>
                    <p className="text-[11px] text-emerald-900/80 leading-relaxed">
                      Link generated will be sent via SMS/WhatsApp & Email. Customer can authorize auto-debit using <strong>Netbanking</strong>, <strong>Debit Card</strong>, or <strong>UPI AutoPay</strong>.
                    </p>
                  </div>
                </div>

                {/* Column 2: Target Bank Details & Limit Amount */}
                <div className="space-y-4">
                  <div className="space-y-3 bg-blue-50/40 p-4 rounded-xl border border-blue-200/60">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-blue-950 flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-blue-700" /> Target Bank Account Details
                      </span>
                      <span className="text-[10px] bg-blue-600 text-white font-extrabold px-2 py-0.5 rounded shadow-xs">
                        Editable by CM
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Bank Name</label>
                        <input
                          type="text"
                          value={emandateBankName}
                          onChange={(e) => setEmandateBankName(e.target.value)}
                          placeholder="e.g. Union Bank of India"
                          className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">IFSC Code</label>
                        <input
                          type="text"
                          value={emandateIfscCode}
                          onChange={(e) => setEmandateIfscCode(e.target.value.toUpperCase())}
                          placeholder="e.g. UBIN0535486"
                          className="w-full px-3 py-2 text-xs font-mono font-semibold uppercase border border-slate-300 rounded-xl bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Bank Account Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={emandateAccountNumber}
                        onChange={(e) => setEmandateAccountNumber(e.target.value)}
                        placeholder="Enter borrower bank account number"
                        className="w-full px-3.5 py-2 text-xs font-mono font-bold border border-slate-300 rounded-xl bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      Max Auto-Debit Mandate Limit Amount (₹) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2 text-slate-400 font-bold text-sm">₹</span>
                      <input
                        type="number"
                        value={emandateModalAmount}
                        onChange={(e) => setEmandateModalAmount(e.target.value)}
                        placeholder="Enter maximum mandate limit"
                        className="w-full pl-8 pr-4 py-2 text-sm font-bold border border-slate-300 rounded-xl bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">This is the maximum auto-debit ceiling limit authorized at applicant's bank.</p>
                  </div>
                </div>
              </div>

              {/* Error Box */}
              {emandateModalError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center gap-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{emandateModalError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowEmandateModal(false)}
                  className="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateEmandateLink}
                  disabled={isCreatingEmandateLink}
                  className="flex-1 rounded-xl py-3 text-xs font-extrabold text-white shadow-md disabled:opacity-50 flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 active:scale-[0.98]"
                >
                  {isCreatingEmandateLink ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Generating Link...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" /> Send Cashfree eMandate Link
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DuplicateLeadsModal
        isOpen={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
        leadId={leadId || null}
      />

      <AlertDialog open={showOtherTelecallerAlertModal} onOpenChange={setShowOtherTelecallerAlertModal}>
        <AlertDialogContent className="max-w-md bg-white rounded-2xl p-6 border border-amber-200 shadow-2xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 text-amber-700 pb-2 border-b border-amber-100">
              <AlertCircle className="h-6 w-6 shrink-0 text-amber-600" />
              <AlertDialogTitle className="text-lg font-extrabold text-slate-900">Read-Only Mode Alert</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-4 text-sm text-slate-700 leading-relaxed">
              This lead is assigned to {lead.assignedTo && !["unassigned", "intake queue", "none", "", "null", "undefined"].includes(lead.assignedTo.trim().toLowerCase()) ? <strong className="text-slate-950 font-bold">"{lead.assignedTo}"</strong> : "another telecaller"}.
              <br /><br />
              You are currently viewing this lead in <span className="font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">Read-Only Mode</span>. You cannot perform actions or update details on this lead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 pt-3 border-t border-slate-100">
            <AlertDialogAction
              onClick={() => setShowOtherTelecallerAlertModal(false)}
              className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-md transition cursor-pointer"
            >
              I Understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


export function LeadDetails() {
  const { leadId } = useParams();

  return (
    <Suspense fallback={<LeadDetailsFallback />}>
      <LeadDetailsContent key={leadId || "missing-lead"} leadId={leadId} />
    </Suspense>
  );
}
