import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  DollarSign,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  Star,
  TrendingUp,
  User,
} from "lucide-react";

const customers = [
  {
    id: "C-2024-456",
    name: "John Doe",
    email: "john.doe@email.com",
    phone: "(555) 123-4567",
    address: "123 Main St, New York, NY 10001",
    creditScore: 680,
    totalLoans: 5,
    activeLoans: 1,
    totalBorrowed: 3250,
    totalRepaid: 2950,
    onTimePayments: 12,
    latePayments: 1,
    defaulted: 0,
    joinDate: "2023-08-15",
    lastLoanDate: "2024-04-20",
    riskLevel: "Medium",
    ltv: 2850,
    employmentStatus: "Full-time",
    monthlyIncome: 3500,
  },
  {
    id: "C-2024-789",
    name: "Jane Smith",
    email: "jane.smith@email.com",
    phone: "(555) 234-5678",
    address: "456 Oak Ave, Los Angeles, CA 90001",
    creditScore: 720,
    totalLoans: 8,
    activeLoans: 1,
    totalBorrowed: 6400,
    totalRepaid: 6000,
    onTimePayments: 18,
    latePayments: 0,
    defaulted: 0,
    joinDate: "2023-02-10",
    lastLoanDate: "2024-04-15",
    riskLevel: "Low",
    ltv: 4200,
    employmentStatus: "Full-time",
    monthlyIncome: 4200,
  },
  {
    id: "C-2024-321",
    name: "David Brown",
    email: "david.b@email.com",
    phone: "(555) 345-6789",
    address: "789 Pine Rd, Chicago, IL 60601",
    creditScore: 640,
    totalLoans: 3,
    activeLoans: 1,
    totalBorrowed: 1800,
    totalRepaid: 1500,
    onTimePayments: 5,
    latePayments: 2,
    defaulted: 0,
    joinDate: "2024-01-20",
    lastLoanDate: "2024-04-18",
    riskLevel: "Medium",
    ltv: 1650,
    employmentStatus: "Full-time",
    monthlyIncome: 3200,
  },
  {
    id: "C-2024-654",
    name: "Emily Wilson",
    email: "emily.w@email.com",
    phone: "(555) 456-7890",
    address: "321 Elm St, Houston, TX 77001",
    creditScore: 750,
    totalLoans: 12,
    activeLoans: 0,
    totalBorrowed: 9600,
    totalRepaid: 9600,
    onTimePayments: 28,
    latePayments: 0,
    defaulted: 0,
    joinDate: "2022-11-05",
    lastLoanDate: "2024-04-10",
    riskLevel: "Low",
    ltv: 6800,
    employmentStatus: "Self-employed",
    monthlyIncome: 6200,
  },
  {
    id: "C-2024-987",
    name: "Michael Chen",
    email: "michael.chen@email.com",
    phone: "(555) 789-0123",
    address: "654 Maple Dr, Phoenix, AZ 85001",
    creditScore: 590,
    totalLoans: 4,
    activeLoans: 1,
    totalBorrowed: 2200,
    totalRepaid: 1400,
    onTimePayments: 3,
    latePayments: 4,
    defaulted: 1,
    joinDate: "2023-09-12",
    lastLoanDate: "2024-04-12",
    riskLevel: "High",
    ltv: 950,
    employmentStatus: "Part-time",
    monthlyIncome: 2400,
  },
];

const loansByCustomer: Record<string, Array<{ id: string; status: string; principal: number; balance: number; dueDate: string }>> = {
  "C-2024-456": [{ id: "L-2024-001", status: "Active", principal: 500, balance: 575, dueDate: "2024-05-04" }],
  "C-2024-789": [{ id: "L-2024-002", status: "Active", principal: 750, balance: 431.25, dueDate: "2024-05-15" }],
  "C-2024-321": [{ id: "L-2024-003", status: "Active", principal: 600, balance: 345, dueDate: "2024-05-02" }],
  "C-2024-654": [{ id: "L-2024-004", status: "Paid Off", principal: 800, balance: 0, dueDate: "2024-04-24" }],
  "C-2024-987": [{ id: "L-2024-005", status: "Overdue", principal: 450, balance: 517.5, dueDate: "2024-04-26" }],
};

function getRiskClasses(riskLevel: string) {
  if (riskLevel === "Low") return "bg-green-100 text-green-800";
  if (riskLevel === "Medium") return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

function getScoreColor(score: number) {
  if (score >= 700) return "text-green-600";
  if (score >= 600) return "text-yellow-600";
  return "text-red-600";
}

export function CustomerDetails() {
  const { customerId } = useParams();
  const customer = customers.find((item) => item.id === customerId) ?? customers[0];
  const loans = loansByCustomer[customer.id] ?? [];
  const repaymentRate = customer.totalBorrowed > 0
    ? ((customer.totalRepaid / customer.totalBorrowed) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
      <Link
        to="/customers"
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Customers
      </Link>

      <div className="mb-8 flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
            {customer.name.split(" ").map((part) => part[0]).join("")}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-950">{customer.name}</h1>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${getRiskClasses(customer.riskLevel)}`}>
                {customer.riskLevel} Risk
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{customer.id} | Member since {customer.joinDate}</p>
            <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <span className="flex items-center gap-2"><Mail className="h-4 w-4" /> {customer.email}</span>
              <span className="flex items-center gap-2"><Phone className="h-4 w-4" /> {customer.phone}</span>
              <span className="flex items-center gap-2 sm:col-span-2"><MapPin className="h-4 w-4" /> {customer.address}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Credit Score", customer.creditScore, CreditCard, getScoreColor(customer.creditScore)],
          ["Lifetime Value", `$${customer.ltv.toLocaleString()}`, Star, "text-blue-600"],
          ["Total Borrowed", `$${customer.totalBorrowed.toLocaleString()}`, DollarSign, "text-slate-900"],
          ["Repayment Rate", `${repaymentRate}%`, TrendingUp, "text-green-600"],
        ].map(([label, value, Icon, color]) => (
          <div key={label as string} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{label as string}</p>
              <Icon className="h-5 w-5 text-slate-400" />
            </div>
            <p className={`mt-3 text-3xl font-bold ${color as string}`}>{value as string | number}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-950">Profile Summary</h2>
          </div>
          <div className="space-y-3 text-sm">
            <p className="flex justify-between gap-4"><span className="text-slate-500">Employment</span><span className="font-medium text-slate-900">{customer.employmentStatus}</span></p>
            <p className="flex justify-between gap-4"><span className="text-slate-500">Monthly income</span><span className="font-medium text-slate-900">${customer.monthlyIncome.toLocaleString()}</span></p>
            <p className="flex justify-between gap-4"><span className="text-slate-500">Last loan date</span><span className="font-medium text-slate-900">{customer.lastLoanDate}</span></p>
            <p className="flex justify-between gap-4"><span className="text-slate-500">Active loans</span><span className="font-medium text-slate-900">{customer.activeLoans}</span></p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-950">Repayment Behavior</h2>
          </div>
          <div className="space-y-3 text-sm">
            <p className="flex justify-between gap-4"><span className="text-slate-500">On-time payments</span><span className="font-medium text-green-600">{customer.onTimePayments}</span></p>
            <p className="flex justify-between gap-4"><span className="text-slate-500">Late payments</span><span className="font-medium text-yellow-600">{customer.latePayments}</span></p>
            <p className="flex justify-between gap-4"><span className="text-slate-500">Defaults</span><span className="font-medium text-red-600">{customer.defaulted}</span></p>
            <p className="flex justify-between gap-4"><span className="text-slate-500">Total repaid</span><span className="font-medium text-slate-900">${customer.totalRepaid.toLocaleString()}</span></p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-950">Next Steps</h2>
          </div>
          <div className="space-y-3 text-sm text-slate-600">
            <p>Review KYC freshness before the next funding decision.</p>
            <p>Validate repayment trend and active balance before upsell offers.</p>
          </div>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Loan History</h2>
          <p className="text-sm text-slate-500">Recent loans associated with this customer.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Loan ID", "Principal", "Balance", "Due Date", "Status", "Actions"].map((head) => (
                  <th key={head} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loans.map((loan) => (
                <tr key={loan.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-950">{loan.id}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">${loan.principal.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-slate-950">${loan.balance.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{loan.dueDate}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{loan.status}</td>
                  <td className="px-6 py-4 text-sm">
                    <Link to={`/loan-management/${loan.id}`} className="font-medium text-blue-600 hover:text-blue-800">
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
