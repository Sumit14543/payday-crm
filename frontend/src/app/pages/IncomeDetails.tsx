import { Banknote, CreditCard, ReceiptText, TrendingUp } from "lucide-react";

const incomeLines = [
  { source: "Origination fees", today: 1840, month: 41260, margin: "82%" },
  { source: "Interest income", today: 3260, month: 89340, margin: "76%" },
  { source: "Late fees", today: 410, month: 9820, margin: "64%" },
  { source: "ACH return fees", today: 95, month: 2145, margin: "38%" },
];

export function IncomeDetails() {
  const monthTotal = incomeLines.reduce((sum, row) => sum + row.month, 0);

  return (
    <div className="w-full min-w-0">
      <header className="bg-white border-b border-slate-200 px-4 py-5 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Revenue</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">Income Details</h1>
      </header>

      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {[
            ["Month income", `$${monthTotal.toLocaleString()}`, Banknote, "+13.6% vs last month"],
            ["Today collected", "$5,605", CreditCard, "ACH + card payments"],
            ["Avg yield", "18.4%", TrendingUp, "Across active loans"],
            ["Pending settlement", "$12,480", ReceiptText, "Next ACH batch"],
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
            <h2 className="text-base font-semibold text-slate-950">Income Breakdown</h2>
            <p className="text-sm text-slate-500">Operational revenue by product ledger line.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {["Source", "Today", "Month to date", "Gross margin", "Recognition"].map((head) => (
                    <th key={head} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {incomeLines.map((line) => (
                  <tr key={line.source} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-950">{line.source}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">${line.today.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-950">${line.month.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{line.margin}</td>
                    <td className="px-6 py-4"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">Accrued daily</span></td>
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


