import { useState } from "react";
import { Plus, Search, Filter, Eye, CheckCircle, XCircle, Clock } from "lucide-react";
import { NiceSelect } from "../components/ui/nice-select";

export function LoanOrigination() {
  const [showNewLoanForm, setShowNewLoanForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [newLoanTerm, setNewLoanTerm] = useState("14 days");
  const [newEmploymentStatus, setNewEmploymentStatus] = useState("Full-time");

  const applications = [
    {
      id: "L-2024-001",
      customer: "John Doe",
      email: "john.doe@email.com",
      phone: "(555) 123-4567",
      amount: 500,
      term: "14 days",
      status: "Pending Review",
      creditScore: 680,
      submittedDate: "2024-04-25",
      employmentStatus: "Full-time",
      monthlyIncome: 3500,
    },
    {
      id: "L-2024-002",
      customer: "Jane Smith",
      email: "jane.smith@email.com",
      phone: "(555) 234-5678",
      amount: 750,
      term: "30 days",
      status: "Approved",
      creditScore: 720,
      submittedDate: "2024-04-24",
      employmentStatus: "Full-time",
      monthlyIncome: 4200,
    },
    {
      id: "L-2024-003",
      customer: "Mike Johnson",
      email: "mike.j@email.com",
      phone: "(555) 345-6789",
      amount: 600,
      term: "14 days",
      status: "Rejected",
      creditScore: 550,
      submittedDate: "2024-04-24",
      employmentStatus: "Part-time",
      monthlyIncome: 2100,
    },
    {
      id: "L-2024-004",
      customer: "Sarah Williams",
      email: "sarah.w@email.com",
      phone: "(555) 456-7890",
      amount: 450,
      term: "14 days",
      status: "Under Review",
      creditScore: 640,
      submittedDate: "2024-04-23",
      employmentStatus: "Full-time",
      monthlyIncome: 3200,
    },
  ];

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1";
    switch (status) {
      case "Approved":
        return (
          <span className={`${baseClasses} bg-green-100 text-green-800`}>
            <CheckCircle className="h-3 w-3" />
            {status}
          </span>
        );
      case "Rejected":
        return (
          <span className={`${baseClasses} bg-red-100 text-red-800`}>
            <XCircle className="h-3 w-3" />
            {status}
          </span>
        );
      default:
        return (
          <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>
            <Clock className="h-3 w-3" />
            {status}
          </span>
        );
    }
  };

  const filteredApplications = applications.filter((app) => {
    const matchesSearch = 
      app.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = 
      statusFilter === "all" || app.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Loan Origination System (LOS)</h2>
          <p className="mt-1 text-sm text-gray-600">Process and manage new loan applications</p>
        </div>
        <button
          onClick={() => setShowNewLoanForm(!showNewLoanForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="h-5 w-5" />
          New Application
        </button>
      </div>

      {/* New Loan Application Form */}
      {showNewLoanForm && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">New Loan Application</h3>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
              <input
                type="text"
                placeholder="Full name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                placeholder="email@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input
                type="tel"
                placeholder="(555) 123-4567"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loan Amount ($)</label>
              <input
                type="number"
                placeholder="500"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loan Term</label>
              <NiceSelect
                ariaLabel="Loan term"
                value={newLoanTerm}
                onValueChange={setNewLoanTerm}
                options={["14 days", "30 days", "60 days", "90 days"].map((term) => ({ label: term, value: term }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Income ($)</label>
              <input
                type="number"
                placeholder="3500"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employment Status</label>
              <NiceSelect
                ariaLabel="Employment status"
                value={newEmploymentStatus}
                onValueChange={setNewEmploymentStatus}
                options={["Full-time", "Part-time", "Self-employed", "Unemployed"].map((status) => ({ label: status, value: status }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Credit Score</label>
              <input
                type="number"
                placeholder="680"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowNewLoanForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Submit Application
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, ID, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-gray-500" />
            <NiceSelect
              ariaLabel="Filter by application status"
              value={statusFilter}
              onValueChange={setStatusFilter}
              className="min-w-44"
              options={[
                { label: "All Status", value: "all" },
                { label: "Pending Review", value: "Pending Review" },
                { label: "Under Review", value: "Under Review" },
                { label: "Approved", value: "Approved" },
                { label: "Rejected", value: "Rejected" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Application ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Term
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Credit Score
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
              {filteredApplications.map((app) => (
                <tr key={app.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {app.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{app.customer}</div>
                    <div className="text-sm text-gray-500">{app.employmentStatus}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{app.email}</div>
                    <div className="text-sm text-gray-500">{app.phone}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                    ${app.amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {app.term}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium ${
                      app.creditScore >= 700 ? "text-green-600" :
                      app.creditScore >= 600 ? "text-yellow-600" :
                      "text-red-600"
                    }`}>
                      {app.creditScore}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(app.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      <button className="text-blue-600 hover:text-blue-800 flex items-center gap-1">
                        <Eye className="h-4 w-4" />
                        View
                      </button>
                      {app.status === "Pending Review" || app.status === "Under Review" ? (
                        <>
                          <button className="text-green-600 hover:text-green-800 flex items-center gap-1">
                            <CheckCircle className="h-4 w-4" />
                            Approve
                          </button>
                          <button className="text-red-600 hover:text-red-800 flex items-center gap-1">
                            <XCircle className="h-4 w-4" />
                            Reject
                          </button>
                        </>
                      ) : null}
                    </div>
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

