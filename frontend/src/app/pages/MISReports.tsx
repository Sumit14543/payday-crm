import { AlertTriangle, BarChart3, FileSpreadsheet, ShieldCheck } from "lucide-react";

const reports = [
  { name: "Daily disbursement register", owner: "Finance", cadence: "Daily 6:00 PM", status: "Ready" },
  { name: "Collections aging report", owner: "Collections", cadence: "Daily 9:00 AM", status: "Ready" },
  { name: "Lead source attribution", owner: "Sales Ops", cadence: "Weekly Monday", status: "Scheduled" },
  { name: "Regulatory exception log", owner: "Compliance", cadence: "Daily 5:00 PM", status: "Needs review" },
];

export function MISReports() {
  return (
    <div className="w-full min-w-0">
      <header className="bg-white border-b border-slate-200 px-4 py-5 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Management information</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">MIS Reports</h1>
      </header>

      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {[
            ["Reports generated", "38", FileSpreadsheet, "Last 24 hours"],
            ["Portfolio PAR 7", "6.2%", AlertTriangle, "-0.4% vs yesterday"],
            ["Compliance pass", "98.1%", ShieldCheck, "2 exceptions open"],
            ["Funded loans", "214", BarChart3, "Month to date"],
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
            <h2 className="text-base font-semibold text-slate-950">Report Control Center</h2>
            <p className="text-sm text-slate-500">Operational reports used by finance, compliance, and collections leads.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-x lg:divide-y-0 divide-slate-200">
            {reports.map((report) => (
              <div key={report.name} className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-slate-950">{report.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{report.owner} - {report.cadence}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${report.status === "Needs review" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{report.status}</span>
                </div>
                <button className="mt-5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Open report</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


