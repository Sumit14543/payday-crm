import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { BadgeCheck, BriefcaseBusiness, CheckCircle2, Landmark, LoaderCircle, Send, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import { apiPost } from "../lib/api";
import { setPublicFavicons } from "../lib/favicon";

type LeadForm = {
  name: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  panNumber: string;
  aadhaarNumber: string;
  loanAmount: string;
  loanPurpose: string;
  employmentStatus: string;
  monthlyIncome: string;
  companyName: string;
  designation: string;
  officeEmail: string;
  officeAddress: string;
  city: string;
  pincode: string;
  bankName: string;
  branchName: string;
  accountHolder: string;
  accountNumber: string;
  ifscCode: string;
  reference1Name: string;
  reference1Mobile: string;
  reference1Relation: string;
};

type LeadResponse = {
  action: string;
  applicationId: string;
  crmLeadId: string;
  status: string;
};

const digitFields = new Set<keyof LeadForm>([
  "phone",
  "aadhaarNumber",
  "pincode",
  "accountNumber",
  "reference1Mobile",
]);
const amountFields = new Set<keyof LeadForm>(["loanAmount", "monthlyIncome"]);

function createInitialForm(): LeadForm {
  return {
    name: "",
    phone: "",
    email: "",
    dateOfBirth: "",
    panNumber: "",
    aadhaarNumber: "",
    loanAmount: "",
    loanPurpose: "Testing lead",
    employmentStatus: "salaried",
    monthlyIncome: "",
    companyName: "",
    designation: "",
    officeEmail: "",
    officeAddress: "",
    city: "",
    pincode: "",
    bankName: "",
    branchName: "",
    accountHolder: "",
    accountNumber: "",
    ifscCode: "",
    reference1Name: "",
    reference1Mobile: "",
    reference1Relation: "",
  };
}

function normalizeValue(field: keyof LeadForm, value: string) {
  if (digitFields.has(field)) return value.replace(/\D/g, "");
  if (amountFields.has(field)) return value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
  if (field === "panNumber" || field === "ifscCode") return value.toUpperCase().replace(/\s/g, "");
  return value;
}

function validateForm(form: LeadForm) {
  if (!form.name.trim()) return "Full name is required.";
  if (form.phone.length !== 10) return "Mobile number must be 10 digits.";
  if (!Number(form.loanAmount) || Number(form.loanAmount) <= 0) return "Loan amount must be greater than 0.";
  if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return "Enter a valid email address.";
  if (form.officeEmail && !/^\S+@\S+\.\S+$/.test(form.officeEmail)) return "Enter a valid office email address.";
  if (form.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.panNumber)) return "PAN must be in valid format, e.g. ABCDE1234F.";
  if (form.aadhaarNumber && form.aadhaarNumber.length !== 12) return "Aadhaar number must be 12 digits.";
  if (form.pincode && form.pincode.length !== 6) return "Pincode must be 6 digits.";
  if (form.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifscCode)) return "IFSC code must be in valid format, e.g. HDFC0001234.";
  if (form.reference1Mobile && form.reference1Mobile.length !== 10) return "Reference mobile must be 10 digits.";
  return "";
}

const inputClass = "mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const textareaClass = "mt-1 min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

type FieldProps = {
  field: keyof LeadForm;
  label: string;
  onChange: (field: keyof LeadForm, value: string) => void;
  value: string;
  helper?: string;
  inputMode?: "numeric" | "email" | "text" | "decimal";
  maxLength?: number;
  required?: boolean;
  type?: string;
};

function Field({ field, label, onChange, value, helper, inputMode, maxLength, required, type = "text" }: FieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(field, event.target.value)}
        className={inputClass}
        inputMode={inputMode}
        maxLength={maxLength}
        required={required}
      />
      {helper && <span className="mt-1 block text-xs text-slate-500">{helper}</span>}
    </label>
  );
}

function Section({ children, icon: Icon, title }: { children: ReactNode; icon: LucideIcon; title: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-700">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-bold text-slate-950">{title}</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

export function TestingLeadForm() {
  const [form, setForm] = useState<LeadForm>(() => createInitialForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LeadResponse | null>(null);

  useEffect(() => {
    setPublicFavicons("Testing Lead Form");

    const root = document.getElementById("root");
    const previous = {
      htmlHeight: document.documentElement.style.height,
      htmlOverflow: document.documentElement.style.overflow,
      bodyHeight: document.body.style.height,
      bodyOverflow: document.body.style.overflow,
      rootHeight: root?.style.height || "",
      rootOverflow: root?.style.overflow || "",
    };

    document.documentElement.style.height = "auto";
    document.documentElement.style.overflow = "auto";
    document.body.style.height = "auto";
    document.body.style.overflow = "auto";
    if (root) {
      root.style.height = "auto";
      root.style.overflow = "visible";
    }

    return () => {
      document.documentElement.style.height = previous.htmlHeight;
      document.documentElement.style.overflow = previous.htmlOverflow;
      document.body.style.height = previous.bodyHeight;
      document.body.style.overflow = previous.bodyOverflow;
      if (root) {
        root.style.height = previous.rootHeight;
        root.style.overflow = previous.rootOverflow;
      }
    };
  }, []);

  const updateField = (field: keyof LeadForm, value: string) => {
    setForm((current) => ({ ...current, [field]: normalizeValue(field, value) }));
    setError("");
  };

  const submitLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setResult(null);

    const payload = {
      ...form,
      loanType: "payday",
      priority: "Medium",
    };
    const validationMessage = validateForm(form);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await apiPost<LeadResponse>("/public/test-leads", payload);
      setResult(response);
      setForm(createInitialForm());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to submit lead.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-dvh bg-slate-100 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="rounded-lg bg-[#07111f] px-5 py-4 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-white p-1">
              <img src="/logo.webp" alt="Testing CRM" className="h-full w-full object-contain" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Testing Lead Form</h1>
              <p className="text-sm text-slate-300">Submit leads directly into testing CRM</p>
            </div>
          </div>
        </header>

        <form onSubmit={submitLead} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6" style={{ backgroundColor: "#ffffff" }}>
          <Section icon={UserRound} title="Applicant Details">
            <Field field="name" label="Full name" value={form.name} onChange={updateField} required />
            <Field field="phone" label="Mobile number" value={form.phone} onChange={updateField} inputMode="numeric" maxLength={10} required />
            <Field field="email" label="Email" value={form.email} onChange={updateField} type="email" />
            <Field field="dateOfBirth" label="Date of birth" value={form.dateOfBirth} onChange={updateField} type="date" />
            <Field field="panNumber" label="PAN" value={form.panNumber} onChange={updateField} maxLength={10} helper="Optional, but format is validated if entered." />
            <Field field="aadhaarNumber" label="Aadhaar number" value={form.aadhaarNumber} onChange={updateField} inputMode="numeric" maxLength={12} />
          </Section>

          <Section icon={BadgeCheck} title="Loan Details">
            <Field field="loanAmount" label="Loan amount" value={form.loanAmount} onChange={updateField} inputMode="decimal" required />
            <Field field="monthlyIncome" label="Monthly income" value={form.monthlyIncome} onChange={updateField} inputMode="decimal" />
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">Loan purpose</span>
              <input value={form.loanPurpose} onChange={(event) => updateField("loanPurpose", event.target.value)} className={inputClass} />
            </label>
          </Section>

          <Section icon={BriefcaseBusiness} title="Employment & Address">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Employment status</span>
              <select value={form.employmentStatus} onChange={(event) => updateField("employmentStatus", event.target.value)} className={inputClass}>
                <option value="salaried">Salaried</option>
                <option value="self">Self-employed</option>
              </select>
            </label>
            <Field field="companyName" label="Company" value={form.companyName} onChange={updateField} />
            <Field field="designation" label="Designation" value={form.designation} onChange={updateField} />
            <Field field="officeEmail" label="Office email" value={form.officeEmail} onChange={updateField} type="email" />
            <Field field="city" label="City" value={form.city} onChange={updateField} />
            <Field field="pincode" label="Pincode" value={form.pincode} onChange={updateField} inputMode="numeric" maxLength={6} />
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">Office address</span>
              <textarea value={form.officeAddress} onChange={(event) => updateField("officeAddress", event.target.value)} className={textareaClass} />
            </label>
          </Section>

          <Section icon={Landmark} title="Bank Details">
            <Field field="bankName" label="Bank name" value={form.bankName} onChange={updateField} />
            <Field field="branchName" label="Branch name" value={form.branchName} onChange={updateField} />
            <Field field="accountHolder" label="Account holder" value={form.accountHolder} onChange={updateField} />
            <Field field="accountNumber" label="Account number" value={form.accountNumber} onChange={updateField} inputMode="numeric" />
            <Field field="ifscCode" label="IFSC code" value={form.ifscCode} onChange={updateField} maxLength={11} />
          </Section>

          <Section icon={UsersRound} title="Reference">
            <Field field="reference1Name" label="Reference name" value={form.reference1Name} onChange={updateField} />
            <Field field="reference1Mobile" label="Reference mobile" value={form.reference1Mobile} onChange={updateField} inputMode="numeric" maxLength={10} />
            <Field field="reference1Relation" label="Reference relation" value={form.reference1Relation} onChange={updateField} />
          </Section>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</div>}
          {result && (
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Lead submitted successfully</p>
                <p className="mt-1">Application ID: {result.applicationId}</p>
                <p>CRM Lead ID: {result.crmLeadId}</p>
              </div>
            </div>
          )}

          <button type="submit" disabled={isSubmitting} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#07111f] px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isSubmitting ? "Submitting..." : "Submit"}
          </button>
        </form>
      </div>
    </main>
  );
}
