import { CheckCircle2, Clock, FileText, Send, Wallet } from "lucide-react";

const payouts = [
  { id: "PAY-0429-01", vendor: "ACH Processor", type: "Settlement", amount: 18420, due: "2026-04-29", status: "Queued" },
  { id: "PAY-0429-02", vendor: "Agent Payroll", type: "Commission", amount: 4973, due: "2026-04-30", status: "Approval" },
  { id: "INV-1048", vendor: "Credit Bureau", type: "Data Pulls", amount: 1260, due: "2026-05-02", status: "Open" },
  { id: "INV-1049", vendor: "SMS Gateway", type: "Collections", amount: 845, due: "2026-05-04", status: "Open" },
];

export function InvoicePayout() {
  const totalQueued = payouts.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="w-full min-w-0">
      <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Payables</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-950">Invoice & Payout</h1>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <Send className="h-4 w-4" />
          Release approved batch
        </button>
      </header>

      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {[
            ["Queued amount", `$${totalQueued.toLocaleString()}`, Wallet, "4 pending items"],
            ["Awaiting approval", "$4,973", Clock, "Commission batch"],
            ["Invoices due", "2", FileText, "Next 7 days"],
            ["Ready to release", "$18,420", CheckCircle2, "ACH settlement"],
          ].map(([label, value, Icon, note]) => (
            <div key={label as string} className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{label as string}</p>
                <Icon className="h-5 w-5 text-slate-400" />
              </div>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{value as string}</p>
              <p className="mt-1 text-xs text-slate-500">{note as string}</p>
            </div>
          ))}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-950">Payout Queue</h2>
            <p className="text-sm text-slate-500">Vendor invoices, processor settlements, and agent payouts.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {["Reference", "Payee", "Type", "Amount", "Due date", "Status"].map((head) => (
                    <th key={head} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {payouts.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-950">{row.id}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{row.vendor}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{row.type}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-950">${row.amount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{row.due}</td>
                    <td className="px-6 py-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}


