import { Award, CalendarCheck, PhoneCall, ShieldCheck, UsersRound } from "lucide-react";

const team = [
  { name: "Sarah Johnson", role: "Senior Loan Officer", region: "North East", leads: 28, approvalRate: "64%", sla: "1h 18m", status: "Available" },
  { name: "Mike Davis", role: "Sales Agent", region: "South", leads: 19, approvalRate: "51%", sla: "2h 06m", status: "In Review" },
  { name: "Tom Anderson", role: "Collections Agent", region: "West", leads: 14, approvalRate: "48%", sla: "1h 42m", status: "On Call" },
  { name: "Lisa White", role: "Operations Manager", region: "Central", leads: 9, approvalRate: "71%", sla: "46m", status: "Available" },
  { name: "Nina Patel", role: "KYC Analyst", region: "Remote", leads: 16, approvalRate: "58%", sla: "1h 05m", status: "Available" },
];

const shifts = [
  "Daily standup at 9:30 AM",
  "KYC escalation review at 12:00 PM",
  "Collections handoff at 4:30 PM",
];

export function TeamManagement() {
  return (
    <div className="w-full min-w-0">
      <header className="bg-white border-b border-slate-200 px-4 py-5 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Operations</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">Team Management</h1>
      </header>

      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {[
            ["Active staff", "42", UsersRound, "8 currently online"],
            ["Calls handled", "186", PhoneCall, "+12% vs yesterday"],
            ["SLA compliance", "94.8%", ShieldCheck, "Target 92%"],
            ["Top approval rate", "71%", Award, "Lisa White"],
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

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-950">Live Workload</h2>
              <p className="text-sm text-slate-500">Assignments, response SLA, and current availability.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    {["Team member", "Region", "Open items", "Approval", "Avg SLA", "Status"].map((head) => (
                      <th key={head} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {team.map((member) => (
                    <tr key={member.name} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-950">{member.name}</div>
                        <div className="text-sm text-slate-500">{member.role}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">{member.region}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-950">{member.leads}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">{member.approvalRate}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">{member.sla}</td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">{member.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="text-base font-semibold text-slate-950">Today&apos;s Operating Rhythm</h2>
            </div>
            <div className="mt-5 space-y-4">
              {shifts.map((item) => (
                <div key={item} className="border-l-2 border-emerald-500 pl-4">
                  <p className="text-sm font-medium text-slate-900">{item}</p>
                  <p className="text-xs text-slate-500">Owner assigned in workforce queue</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


