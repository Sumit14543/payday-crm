import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Filter, Eye, Mail, Phone, MapPin, Star, TrendingUp } from "lucide-react";
import { NiceSelect } from "../components/ui/nice-select";

export function Customers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");

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
      ltv: 2850, // Lifetime Value
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
    },
  ];

  const getRiskBadge = (risk: string) => {
    const baseClasses = "px-3 py-1 rounded-full text-xs font-medium";
    switch (risk) {
      case "Low":
        return <span className={`${baseClasses} bg-green-100 text-green-800`}>{risk}</span>;
      case "Medium":
        return <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>{risk}</span>;
      case "High":
        return <span className={`${baseClasses} bg-red-100 text-red-800`}>{risk}</span>;
      default:
        return <span className={`${baseClasses} bg-gray-100 text-gray-800`}>{risk}</span>;
    }
  };

  const getCreditScoreColor = (score: number) => {
    if (score >= 700) return "text-green-600";
    if (score >= 600) return "text-yellow-600";
    return "text-red-600";
  };

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch = 
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRisk = 
      riskFilter === "all" || customer.riskLevel === riskFilter;
    
    return matchesSearch && matchesRisk;
  });

  const stats = {
    totalCustomers: customers.length,
    activeCustomers: customers.filter(c => c.activeLoans > 0).length,
    avgCreditScore: Math.round(customers.reduce((sum, c) => sum + c.creditScore, 0) / customers.length),
    avgLTV: Math.round(customers.reduce((sum, c) => sum + c.ltv, 0) / customers.length),
  };

  return (
    <div className="w-full min-w-0">
      <header className="bg-white border-b border-gray-200 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 border border-gray-300 rounded flex items-center justify-center">
            <div className="w-2 h-2 bg-gray-400"></div>
          </div>
          <h1 className="text-base font-medium text-gray-900">Customer Management</h1>
        </div>
      </header>
      <div className="px-4 py-6 sm:px-6 lg:px-8">

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Customers</p>
            <Star className="h-5 w-5 text-blue-600" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.totalCustomers}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Active Customers</p>
            <TrendingUp className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.activeCustomers}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Avg Credit Score</p>
            <Star className="h-5 w-5 text-purple-600" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.avgCreditScore}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Avg LTV</p>
            <TrendingUp className="h-5 w-5 text-orange-600" />
          </div>
          <p className="text-3xl font-bold text-gray-900">${stats.avgLTV.toLocaleString()}</p>
        </div>
      </div>

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
              ariaLabel="Filter by risk level"
              value={riskFilter}
              onValueChange={setRiskFilter}
              className="min-w-40"
              options={[
                { label: "All Risk Levels", value: "all" },
                { label: "Low Risk", value: "Low" },
                { label: "Medium Risk", value: "Medium" },
                { label: "High Risk", value: "High" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Credit Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Loans
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Borrowed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Repayment Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Risk Level
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCustomers.map((customer) => {
                const repaymentRate = customer.totalBorrowed > 0 
                  ? ((customer.totalRepaid / customer.totalBorrowed) * 100).toFixed(1)
                  : "0";
                
                return (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {customer.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                      <div className="text-sm text-gray-500">Member since {customer.joinDate}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-sm text-gray-900 mb-1">
                        <Mail className="h-3 w-3" />
                        {customer.email}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Phone className="h-3 w-3" />
                        {customer.phone}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-semibold ${getCreditScoreColor(customer.creditScore)}`}>
                        {customer.creditScore}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{customer.totalLoans} total</div>
                      <div className="text-sm text-gray-500">{customer.activeLoans} active</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      ${customer.totalBorrowed.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${
                        parseFloat(repaymentRate) >= 95 ? "text-green-600" :
                        parseFloat(repaymentRate) >= 80 ? "text-yellow-600" :
                        "text-red-600"
                      }`}>
                        {repaymentRate}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getRiskBadge(customer.riskLevel)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Link
                        to={`/customers/${customer.id}`}
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <Eye className="h-4 w-4" />
                        View Profile
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}


