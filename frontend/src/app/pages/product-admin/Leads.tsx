import React, { useState, useMemo, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  ChevronDown,
  Download,
  Upload,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Columns,
  X,
  Briefcase,
  AlertCircle,
  TrendingUp,
  UserCheck,
  Clock,
  XCircle,
  BadgeCheck,
  Send,
  Plus,
  UserPlus
} from "lucide-react";
import { apiGet, apiDelete, apiPost } from "../../lib/api";
import { getTenantSlug } from "../../lib/tenant";
import { toast } from "react-toastify";

const ITEMS_PER_PAGE = 10;

export function Leads() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [leads, setLeads] = useState<any[]>(() => {
    const cached = sessionStorage.getItem("product_admin_leads_cache");
    return cached ? JSON.parse(cached) : [];
  });
  const [loading, setLoading] = useState(() => {
    const cached = sessionStorage.getItem("product_admin_leads_cache");
    return !cached;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday" | "custom">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [selectedQuickViewLead, setSelectedQuickViewLead] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    id: true,
    name: true,
    phone: true,
    pan: true,
    city: true,
    employment: true,
    loanAmount: true,
    source: true,
    assignedTo: true,
    status: true,
    date: true,
    actions: true
  });
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    phone: "",
    email: "",
    dateOfBirth: "",
    loanAmount: "",
    monthlyIncome: "",
    loanPurpose: "Payday loan",
    employmentStatus: "salaried",
    source: "Admin Panel",
    companyName: "",
    designation: "",
    city: "",
    state: "",
    pincode: "",
    panNumber: "",
    aadhaarNumber: "",
    bankName: "",
    branchName: "",
    accountHolder: "",
    accountNumber: "",
    ifscCode: "",
    reference1Name: "",
    reference1Mobile: "",
    reference1Relation: "",
    reference2Name: "",
    reference2Mobile: "",
    reference2Relation: ""
  });
  const [isCreating, setIsCreating] = useState(false);

  // Extract status filter from URL parameter
  const statusFilter = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("status") || "all";
  }, [search]);

  const fetchLeads = () => {
    if (!sessionStorage.getItem("product_admin_leads_cache")) {
      setLoading(true);
    }
    apiGet<any[]>("/leads")
      .then((data) => {
        if (Array.isArray(data)) {
          setLeads(data);
          sessionStorage.setItem("product_admin_leads_cache", JSON.stringify(data));
        }
      })
      .catch((err) => console.error("Failed to load leads list:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const mappedLeads = useMemo(() => {
    if (leads.length === 0 && !loading) {
      return [
        { id: "LD-1082", name: "Rahul Sharma", phone: "9876543210", pan: "ABCDE1234F", city: "Mumbai", state: "Maharashtra", employment: "Salaried", salary: "₹45,000", loanAmount: "₹25,000", source: "Website", assignedTo: "Kajal", status: "New Lead", date: "2026-07-15" },
        { id: "LD-1081", name: "Amit Patel", phone: "9876501234", pan: "FGHIJ5678K", city: "Ahmedabad", state: "Gujarat", employment: "Self-Employed", salary: "₹60,000", loanAmount: "₹50,000", source: "Partner API", assignedTo: "Jyoti", status: "Contacted", date: "2026-07-14" },
        { id: "LD-1080", name: "Jyoti Singh", phone: "9812345678", pan: "LMNOP9012Q", city: "Delhi", state: "Delhi", employment: "Salaried", salary: "₹35,000", loanAmount: "₹15,000", source: "Direct Telecall", assignedTo: "Nandini", status: "Approved", date: "2026-07-14" },
        { id: "LD-1079", name: "Vikram Malhotra", phone: "9988776655", pan: "RSTUV3456W", city: "Bangalore", state: "Karnataka", employment: "Salaried", salary: "₹85,000", loanAmount: "₹75,000", source: "Mobile App", assignedTo: "Waqt Telecaller", status: "Disbursed", date: "2026-07-13" },
        { id: "LD-1078", name: "Sumit Kumar", phone: "9823456789", pan: "JKLMN3456P", city: "Noida", state: "Uttar Pradesh", employment: "Salaried", salary: "₹30,000", loanAmount: "₹10,000", source: "Website", assignedTo: "Unassigned", status: "Not Interested", date: "2026-07-12" },
        { id: "LD-1077", name: "Neha Sharma", phone: "9512345678", pan: "POIUY9876T", city: "Pune", state: "Maharashtra", employment: "Salaried", salary: "₹55,005", loanAmount: "₹40,000", source: "Website", assignedTo: "Kajal", status: "KYC Pending", date: "2026-07-11" },
        { id: "LD-1076", name: "Rajesh Gupta", phone: "9900887766", pan: "ZXCVB8765Q", city: "Kolkata", state: "West Bengal", employment: "Self-Employed", salary: "₹70,000", loanAmount: "₹30,000", source: "Direct Telecall", assignedTo: "Jyoti", status: "Blacklisted", date: "2026-07-10" },
        { id: "LD-1075", name: "Kunal Kapoor", phone: "9123456789", pan: "ASDFG4321R", city: "Lucknow", state: "Uttar Pradesh", employment: "Salaried", salary: "₹40,000", loanAmount: "₹20,000", source: "Partner API", assignedTo: "Nandini", status: "Rejected", date: "2026-07-09" }
      ];
    }

    return leads.map(l => ({
      id: l.id,
      name: l.name || "N/A",
      phone: l.phone || "N/A",
      pan: l.panNumber || "N/A",
      city: l.city || "N/A",
      state: l.state || "India",
      employment: l.employmentStatus || "Salaried",
      salary: l.monthlyIncome ? `₹${Number(l.monthlyIncome).toLocaleString("en-IN")}` : "₹0",
      loanAmount: l.loanAmount ? `₹${Number(l.loanAmount).toLocaleString("en-IN")}` : "₹0",
      source: l.source || "Website",
      sourceSystem: l.sourceSystem || "",
      assignedTo: l.assignedTo || "Unassigned",
      status: l.status || "New Lead",
      date: l.createdAt ? l.createdAt.slice(0, 10) : "N/A"
    }));
  }, [leads, loading]);

  const filteredLeads = useMemo(() => {
    return mappedLeads.filter((lead) => {
      const matchesSearch =
        lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.phone.includes(searchQuery) ||
        lead.city.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" ||
        lead.status.toLowerCase() === statusFilter.toLowerCase() ||
        (statusFilter === "New Lead" && (lead.status === "New" || lead.status === "New Lead")) ||
        (statusFilter === "KYC Pending" && (lead.status === "KYC Pending" || lead.status === "Documents Pending" || lead.status === "Document Collection"));

      const matchesSource = sourceFilter === "all" || lead.source.toLowerCase() === sourceFilter.toLowerCase();

      const matchesDate = (() => {
        if (dateFilter === "all") return true;
        if (!lead.date || lead.date === "N/A") return false;
        
        const leadDateStr = lead.date; 
        
        const getLocalDateString = (d: Date) => {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };
        const todayStr = getLocalDateString(new Date());
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = getLocalDateString(yesterday);

        if (dateFilter === "today") {
          return leadDateStr === todayStr;
        }
        if (dateFilter === "yesterday") {
          return leadDateStr === yesterdayStr;
        }
        if (dateFilter === "this_month") {
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          return leadDateStr.startsWith(`${year}-${month}`);
        }
        if (dateFilter === "custom") {
          if (!startDate && !endDate) return true;
          if (startDate && leadDateStr < startDate) return false;
          if (endDate && leadDateStr > endDate) return false;
          return true;
        }
        return true;
      })();

      const tenantSlug = getTenantSlug();
      const leadSource = String(lead.sourceSystem || lead.source || "").toLowerCase();
      let matchesTenant = true;
      if (tenantSlug === "waqtfinance") {
        if (leadSource === "geetpay") matchesTenant = false;
      } else if (tenantSlug === "geetpay") {
        if (leadSource !== "geetpay") matchesTenant = false;
      }

      return matchesSearch && matchesStatus && matchesSource && matchesDate && matchesTenant;
    });
  }, [mappedLeads, searchQuery, statusFilter, sourceFilter, dateFilter, startDate, endDate]);

  // Reset page to 1 when search query, filter or date range changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, sourceFilter, dateFilter, startDate, endDate]);

  const totalItems = filteredLeads.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);

  const paginatedLeads = useMemo(() => {
    return filteredLeads.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredLeads, startIndex]);

  const dateFilteredLeads = useMemo(() => {
    return mappedLeads.filter((lead) => {
      if (dateFilter === "all") return true;
      if (!lead.date || lead.date === "N/A") return false;
      
      const leadDateStr = lead.date; 
      
      const getLocalDateString = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      const todayStr = getLocalDateString(new Date());
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = getLocalDateString(yesterday);

      if (dateFilter === "today") {
        return leadDateStr === todayStr;
      }
      if (dateFilter === "yesterday") {
        return leadDateStr === yesterdayStr;
      }
      if (dateFilter === "this_month") {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return leadDateStr.startsWith(`${year}-${month}`);
      }
      if (dateFilter === "custom") {
        if (!startDate && !endDate) return true;
        if (startDate && leadDateStr < startDate) return false;
        if (endDate && leadDateStr > endDate) return false;
        return true;
      }
      return true;
    });
  }, [mappedLeads, dateFilter, startDate, endDate]);

  const stats = useMemo(() => {
    const total = dateFilteredLeads.length;
    const fresh = dateFilteredLeads.filter(l => 
      l.status.toLowerCase() === "new" || 
      l.status.toLowerCase() === "new lead"
    ).length;
    const contacted = dateFilteredLeads.filter(l => 
      l.status.toLowerCase() === "contacted" || 
      l.status.toLowerCase() === "interested" || 
      l.status.toLowerCase() === "kyc pending" || 
      l.status.toLowerCase() === "documents pending" || 
      l.status.toLowerCase() === "document collection"
    ).length;
    const sentToCredit = dateFilteredLeads.filter(l => 
      l.assignedTo === "Credit Manager"
    ).length;
    const rejected = dateFilteredLeads.filter(l => 
      l.status.toLowerCase() === "rejected" || 
      l.status.toLowerCase() === "blacklisted" || 
      l.status.toLowerCase() === "lost"
    ).length;

    return { total, fresh, contacted, sentToCredit, rejected };
  }, [dateFilteredLeads]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedLeads(paginatedLeads.map((l) => l.id));
    } else {
      setSelectedLeads([]);
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedLeads((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleColumn = (col: string) => {
    setVisibleColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const handleDeleteLead = (id: string) => {
    if (window.confirm(`Are you sure you want to delete lead ${id}?`)) {
      apiDelete(`/leads/${id}`)
        .then(() => {
          setLeads((prev) => {
            const updated = prev.filter((l) => l.id !== id);
            sessionStorage.setItem("product_admin_leads_cache", JSON.stringify(updated));
            return updated;
          });
        })
        .catch((err) => {
          console.error("Failed to delete lead:", err);
          setLeads((prev) => {
            const updated = prev.filter((l) => l.id !== id);
            sessionStorage.setItem("product_admin_leads_cache", JSON.stringify(updated));
            return updated;
          });
        });
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return toast.error("Full name is required.");
    if (createForm.phone.length !== 10) return toast.error("Mobile number must be 10 digits.");
    if (!Number(createForm.loanAmount) || Number(createForm.loanAmount) <= 0) return toast.error("Loan amount must be greater than 0.");
    if (createForm.reference1Mobile && createForm.reference1Mobile.length !== 10) return toast.error("Reference 1 mobile number must be 10 digits.");
    if (createForm.reference2Mobile && createForm.reference2Mobile.length !== 10) return toast.error("Reference 2 mobile number must be 10 digits.");

    const payload = {
      ...createForm,
      panNumber: createForm.panNumber.toUpperCase().replace(/\s/g, ""),
      ifscCode: createForm.ifscCode.toUpperCase().replace(/\s/g, ""),
      loanType: "payday",
      priority: "Medium"
    };

    try {
      setIsCreating(true);
      await apiPost("/leads", payload);
      toast.success("Lead created successfully!");
      setIsCreateModalOpen(false);
      setCreateForm({
        name: "",
        phone: "",
        email: "",
        dateOfBirth: "",
        loanAmount: "",
        monthlyIncome: "",
        loanPurpose: "Payday loan",
        employmentStatus: "salaried",
        source: "Admin Panel",
        companyName: "",
        designation: "",
        city: "",
        state: "",
        pincode: "",
        panNumber: "",
        aadhaarNumber: "",
        bankName: "",
        branchName: "",
        accountHolder: "",
        accountNumber: "",
        ifscCode: "",
        reference1Name: "",
        reference1Mobile: "",
        reference1Relation: "",
        reference2Name: "",
        reference2Mobile: "",
        reference2Relation: ""
      });
      fetchLeads();
    } catch (err: any) {
      console.error("Failed to create lead:", err);
      toast.toastError?.(err?.message || "Failed to create lead.");
      toast.error(err?.message || "Failed to create lead.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSendToCreditManager = async (leadId: string) => {
    if (window.confirm(`Are you sure you want to send lead ${leadId} to Credit Manager?`)) {
      try {
        await apiPost(`/leads/${encodeURIComponent(leadId)}/credit-handoffs`, {
          actor: "Product Admin",
          checklistSnapshot: []
        });
        toast.success(`Lead ${leadId} successfully sent to Credit Manager!`);
        setLeads((prev) => {
          const updated = prev.map((l) => {
            const matches = l.id === leadId || l.application_id === leadId;
            if (matches) {
              return { ...l, assignedTo: "Credit Manager", status: "Document Collection" };
            }
            return l;
          });
          sessionStorage.setItem("product_admin_leads_cache", JSON.stringify(updated));
          return updated;
        });
        fetchLeads();
      } catch (err: any) {
        console.error("Failed to send to Credit Manager:", err);
        toast.error(err?.message || "Failed to send to Credit Manager.");
      }
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header and Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Leads Workbench</h1>
          <p className="text-xs text-slate-505 dark:text-slate-400 font-bold mt-1.5">Review and route inbound loan applications.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Date pill filter */}
          <div className="flex items-center bg-slate-100/80 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm w-fit">
            {[
              { id: "today", label: "Today" },
              { id: "this_month", label: "This Month" },
              { id: "all", label: "All Time" }
            ].map((p) => {
              const active = dateFilter === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setDateFilter(p.id as any);
                    setStartDate("");
                    setEndDate("");
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                    active
                      ? "bg-white dark:bg-slate-900 text-indigo-650 dark:text-indigo-400 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-sm transition cursor-pointer"
            type="button"
          >
            <Plus className="w-4 h-4" />
            <span>Create Lead</span>
          </button>

          <button className="inline-flex h-9 items-center gap-1.5 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-705 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-sm transition cursor-pointer">
            <Upload className="w-4 h-4 text-slate-400" />
            <span>Import Excel</span>
          </button>
          <button className="inline-flex h-9 items-center gap-1.5 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-705 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-sm transition cursor-pointer">
            <Download className="w-4 h-4 text-slate-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Leads", value: loading ? "..." : stats.total, icon: Briefcase, color: "border-indigo-500/30 dark:border-indigo-500/40 text-indigo-600 dark:text-indigo-400 bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent" },
          { label: "Fresh Leads", value: loading ? "..." : stats.fresh, icon: Sparkles, color: "border-emerald-500/30 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent" },
          { label: "In-Progress", value: loading ? "..." : stats.contacted, icon: Clock, color: "border-amber-500/30 dark:border-amber-500/40 text-amber-600 dark:text-amber-400 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent" },
          { label: "Sent to Credit Manager", value: loading ? "..." : stats.sentToCredit, icon: Send, color: "border-purple-500/30 dark:border-purple-500/40 text-purple-600 dark:text-purple-400 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent" },
          { label: "Rejected / Bad", value: loading ? "..." : stats.rejected, icon: XCircle, color: "border-rose-500/30 dark:border-rose-500/40 text-rose-600 dark:text-rose-400 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent" },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`border rounded-2xl p-4 flex flex-col justify-between shadow-sm transition-all hover:scale-[1.02] duration-200 backdrop-blur-md ${card.color}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider opacity-90">{card.label}</span>
                <Icon className="w-4 h-4 opacity-80 shrink-0" />
              </div>
              <span className="text-2xl font-black mt-2 tracking-tight text-slate-900 dark:text-white">{card.value}</span>
            </div>
          );
        })}
      </div>

      {/* Control Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search by Lead ID, Customer Name, Mobile No, City..."
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-205 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-505 transition text-slate-800 dark:text-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
          {statusFilter !== "all" && (
            <span className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-955/30 border border-indigo-100/50 dark:border-indigo-900/30 rounded-xl text-xs font-extrabold text-indigo-650 dark:text-indigo-400 flex items-center gap-1.5">
              <span>Filter: {statusFilter}</span>
              <Link to="/leads?status=all" className="hover:text-slate-800 dark:hover:text-white">×</Link>
            </span>
          )}

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-707 dark:text-slate-250 outline-none cursor-pointer"
          >
            <option value="all">All Sources</option>
            <option value="Website">Website</option>
            <option value="Mobile App">Mobile App</option>
            <option value="Partner API">Partner API</option>
            <option value="Direct Telecall">Direct Telecall</option>
          </select>

          {/* Date Filter Select */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-707 dark:text-slate-250 outline-none cursor-pointer"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="custom">Custom Range</option>
          </select>

          {/* Custom Date Picker Inputs */}
          {dateFilter === "custom" && (
            <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-800 rounded-xl px-3 h-10 bg-white dark:bg-slate-900 shadow-sm">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
              />
              <span className="text-slate-400 text-[10px] font-bold">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
              />
            </div>
          )}

          <div className="relative">
            <button
              onClick={() => setShowColumnDropdown(!showColumnDropdown)}
              className="inline-flex h-10 items-center gap-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-705 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <Columns className="w-4 h-4 text-slate-400" />
              <span>Columns</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
            <AnimatePresence>
              {showColumnDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowColumnDropdown(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl p-3 space-y-1.5 z-20"
                  >
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Select Columns</span>
                    {Object.keys(visibleColumns).map((col) => (
                      <label key={col} className="flex items-center gap-2 text-xs font-bold text-slate-705 dark:text-slate-350 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visibleColumns[col]}
                          onChange={() => toggleColumn(col)}
                          className="rounded text-indigo-650 focus:ring-indigo-500 w-3.5 h-3.5"
                        />
                        <span className="capitalize">{col === "pan" ? "PAN" : col.replace(/([A-Z])/g, " $1")}</span>
                      </label>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Leads Table Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-550">
              <span className="w-4 h-4 rounded-full border-2 border-indigo-650 border-t-transparent animate-spin" />
              <span className="text-xs font-bold uppercase tracking-wider">Syncing lead streams...</span>
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-slate-700 dark:text-slate-200">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-300">
                  <th className="px-5 py-4 w-12 text-center">
                    <input
                      type="checkbox"
                      className="rounded text-indigo-600 border-slate-200 dark:border-slate-700 w-4 h-4 focus:ring-indigo-500 cursor-pointer"
                      onChange={handleSelectAll}
                      checked={selectedLeads.length === paginatedLeads.length && paginatedLeads.length > 0}
                    />
                  </th>
                  {visibleColumns.id && <th className="px-5 py-4">Lead ID</th>}
                  {visibleColumns.name && <th className="px-5 py-4">Customer Name</th>}
                  {visibleColumns.phone && <th className="px-5 py-4">Phone</th>}
                  {visibleColumns.pan && <th className="px-5 py-4">PAN</th>}
                  {visibleColumns.city && <th className="px-5 py-4">City</th>}
                  {visibleColumns.employment && <th className="px-5 py-4">Employment</th>}
                  {visibleColumns.loanAmount && <th className="px-5 py-4">Loan Amount</th>}
                  {visibleColumns.source && <th className="px-5 py-4">Source</th>}
                  {visibleColumns.assignedTo && <th className="px-5 py-4">Assigned To</th>}
                  {visibleColumns.status && <th className="px-5 py-4">Status</th>}
                  {visibleColumns.date && <th className="px-5 py-4">Created Date</th>}
                  {visibleColumns.actions && <th className="px-5 py-4 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {paginatedLeads.map((lead) => {
                  const isSelected = selectedLeads.includes(lead.id);

                  return (
                    <tr
                      key={lead.id}
                      className={`hover:bg-indigo-50/20 dark:hover:bg-slate-800/60 transition-colors duration-150 ${
                        isSelected ? "bg-indigo-50/30 dark:bg-indigo-950/20" : ""
                      }`}
                    >
                      <td className="px-5 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(lead.id)}
                          className="rounded text-indigo-600 border-slate-200 dark:border-slate-700 w-4 h-4 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      {visibleColumns.id && (
                        <td className="px-5 py-4 text-xs font-black text-indigo-600 dark:text-indigo-400">
                          <Link to={`/leads/${lead.id}`} className="hover:underline">{lead.id}</Link>
                        </td>
                      )}
                      {visibleColumns.name && (
                        <td className="px-5 py-4 text-xs font-black text-slate-800 dark:text-slate-100">
                          {lead.name}
                        </td>
                      )}
                      {visibleColumns.phone && <td className="px-5 py-4 text-xs font-bold text-slate-700 dark:text-slate-200">{lead.phone}</td>}
                      {visibleColumns.pan && <td className="px-5 py-4 text-xs font-bold uppercase text-slate-700 dark:text-slate-200">{lead.pan}</td>}
                      {visibleColumns.city && <td className="px-5 py-4 text-xs font-semibold text-slate-700 dark:text-slate-300">{lead.city}</td>}
                      {visibleColumns.employment && <td className="px-5 py-4 text-xs font-semibold text-slate-700 dark:text-slate-300">{lead.employment}</td>}
                      {visibleColumns.loanAmount && (
                        <td className="px-5 py-4 text-xs font-black text-slate-900 dark:text-white">
                          {lead.loanAmount}
                        </td>
                      )}
                      {visibleColumns.source && (
                        <td className="px-5 py-4">
                          <span className="px-2.5 py-1 rounded-lg text-[9px] font-black bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                            {lead.source}
                          </span>
                        </td>
                      )}
                      {visibleColumns.assignedTo && <td className="px-5 py-4 text-xs font-bold text-slate-700 dark:text-slate-300">{lead.assignedTo}</td>}
                      {visibleColumns.status && (
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black border uppercase tracking-wider ${
                            ["disbursed", "converted"].includes(lead.status.toLowerCase()) ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                            ["approved", "qualified"].includes(lead.status.toLowerCase()) ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" :
                            ["rejected", "lost"].includes(lead.status.toLowerCase()) ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          }`}>
                            {lead.status}
                          </span>
                        </td>
                      )}
                      {visibleColumns.date && <td className="px-5 py-4 text-xs font-semibold text-slate-700 dark:text-slate-300">{lead.date}</td>}
                      {visibleColumns.actions && (
                        <td className="px-5 py-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedQuickViewLead(lead)}
                              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition cursor-pointer"
                              title="Timeline split-screen"
                            >
                              <Sparkles className="w-4 h-4" />
                            </button>
                            <Link
                              to={`/leads/${lead.id}`}
                              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                              title="Open details folder"
                            >
                              <Eye className="w-4 h-4" />
                            </Link>
                            {lead.assignedTo !== "Credit Manager" ? (
                              <button
                                onClick={() => handleSendToCreditManager(lead.id)}
                                className="p-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-955/30 text-emerald-500 hover:text-emerald-600 transition cursor-pointer"
                                title="Send to Credit Manager"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                disabled
                                className="p-1 rounded-lg text-slate-350 dark:text-slate-600 cursor-not-allowed"
                                title="Already sent to Credit Manager"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteLead(lead.id)}
                              className="p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-955/30 text-rose-550 hover:text-rose-600 transition cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Table Pagination / Footer */}
        <div className="bg-slate-50/50 dark:bg-slate-950/60 px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-slate-550">
          <span>Showing {totalItems > 0 ? startIndex + 1 : 0} to {endIndex} of {totalItems} entries</span>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1 || loading}
              className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-black text-slate-600 px-3">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages || loading}
              className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-805 transition disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Split Slide-Over Panel */}
      <AnimatePresence>
        {selectedQuickViewLead && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedQuickViewLead(null)}
              className="fixed inset-0 bg-slate-950/60 z-40 backdrop-blur-sm"
            />

            {/* Slide-over Container */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 220 }}
              className="fixed inset-y-0 right-0 w-full max-w-lg bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 p-6 flex flex-col justify-between overflow-y-auto"
            >
              <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-105 dark:border-slate-800 pb-4">
                  <div>
                    <span className="text-[10px] font-black text-indigo-650 dark:text-indigo-400 uppercase tracking-widest">{selectedQuickViewLead.id}</span>
                    <h2 className="text-base font-black text-slate-800 dark:text-white mt-1 leading-none">{selectedQuickViewLead.name}</h2>
                  </div>
                  <button
                    onClick={() => setSelectedQuickViewLead(null)}
                    className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-805 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Lead Profile Summary */}
                <div className="space-y-3.5">
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Customer Profile Summary</h3>
                  <div className="grid grid-cols-2 gap-4 bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-2xl border border-slate-105 dark:border-slate-800">
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold block">Mobile Phone</span>
                      <span className="text-xs font-extrabold text-slate-800 dark:text-white">{selectedQuickViewLead.phone}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold block">PAN Card</span>
                      <span className="text-xs font-extrabold text-slate-800 dark:text-white uppercase">{selectedQuickViewLead.pan}</span>
                    </div>
                    <div className="mt-1">
                      <span className="text-[9px] text-slate-400 font-bold block">City & State</span>
                      <span className="text-xs font-extrabold text-slate-800 dark:text-white">{selectedQuickViewLead.city}, {selectedQuickViewLead.state}</span>
                    </div>
                    <div className="mt-1">
                      <span className="text-[9px] text-slate-400 font-bold block">Monthly Salary</span>
                      <span className="text-xs font-extrabold text-emerald-500">{selectedQuickViewLead.salary}</span>
                    </div>
                  </div>
                </div>

                {/* Loan & Agent Details */}
                <div className="space-y-3.5">
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Lending & Operations Context</h3>
                  <div className="grid grid-cols-2 gap-4 bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-2xl border border-slate-105 dark:border-slate-800">
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold block">Required Principal</span>
                      <span className="text-xs font-extrabold text-slate-800 dark:text-white">{selectedQuickViewLead.loanAmount}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold block">Inbound Source</span>
                      <span className="text-xs font-extrabold text-slate-800 dark:text-white">{selectedQuickViewLead.source}</span>
                    </div>
                    <div className="mt-1">
                      <span className="text-[9px] text-slate-400 font-bold block">Assigned Officer</span>
                      <span className="text-xs font-extrabold text-slate-805 dark:text-white">{selectedQuickViewLead.assignedTo}</span>
                    </div>
                    <div className="mt-1">
                      <span className="text-[9px] text-slate-400 font-bold block">Process Status</span>
                      <span className="text-xs font-extrabold text-slate-805 dark:text-white">{selectedQuickViewLead.status}</span>
                    </div>
                  </div>
                </div>

                {/* Loan Journey Timeline */}
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-550 uppercase tracking-wider">Lending Workflow Journey</h3>
                  <div className="space-y-4 pl-3.5 border-l-2 border-slate-100 dark:border-slate-800 relative ml-1">
                    <div className="relative">
                      <span className="absolute -left-5 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/10" />
                      <div className="text-[11px] font-extrabold text-slate-805 dark:text-slate-202">Inbound Lead Created</div>
                      <div className="text-[9px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">Application successfully registered via {selectedQuickViewLead.source}.</div>
                    </div>
                    <div className="relative">
                      <span className={`absolute -left-5 top-1 w-2.5 h-2.5 rounded-full ring-4 ${
                        ["New Lead", "New"].includes(selectedQuickViewLead.status) ? "bg-slate-200 dark:bg-slate-800 ring-slate-200/10" : "bg-emerald-500 ring-emerald-500/10"
                      }`} />
                      <div className="text-[11px] font-extrabold text-slate-805 dark:text-slate-202">Customer Contacted</div>
                      <div className="text-[9px] text-slate-400 dark:text-slate-550 font-bold mt-0.5">Lending agent spoke to borrower for eligibility checks.</div>
                    </div>
                    <div className="relative">
                      <span className={`absolute -left-5 top-1 w-2.5 h-2.5 rounded-full ring-4 ${
                        ["New Lead", "New", "Contacted"].includes(selectedQuickViewLead.status) ? "bg-slate-200 dark:bg-slate-800 ring-slate-200/10" : "bg-emerald-500 ring-emerald-500/10"
                      }`} />
                      <div className="text-[11px] font-extrabold text-slate-805 dark:text-slate-202">Underwriting & Verification</div>
                      <div className="text-[9px] text-slate-400 dark:text-slate-555 font-bold mt-0.5">KYC and Penny Drop bank statement verifications.</div>
                    </div>
                    <div className="relative">
                      <span className={`absolute -left-5 top-1 w-2.5 h-2.5 rounded-full ring-4 ${
                        selectedQuickViewLead.status === "Disbursed" ? "bg-indigo-650 ring-indigo-500/10" :
                        selectedQuickViewLead.status === "Approved" ? "bg-emerald-500 ring-emerald-500/10" : "bg-slate-200 dark:bg-slate-800 ring-slate-200/10"
                      }`} />
                      <div className="text-[11px] font-extrabold text-slate-805 dark:text-slate-202">Disbursement Payout</div>
                      <div className="text-[9px] text-slate-400 dark:text-slate-555 font-bold mt-0.5">Sanction contract signed and bank transfer finalized.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions Panel */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 flex gap-3">
                <button
                  onClick={() => {
                    alert("Lead approved successfully!");
                    setSelectedQuickViewLead(null);
                  }}
                  className="flex-1 h-10 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-500 transition cursor-pointer shadow-sm"
                >
                  Approve Lead
                </button>
                <button
                  onClick={() => {
                    alert("Lead rejected!");
                    setSelectedQuickViewLead(null);
                  }}
                  className="flex-1 h-10 rounded-xl bg-rose-600 text-white text-xs font-black hover:bg-rose-505 transition cursor-pointer shadow-sm"
                >
                  Reject Lead
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Create Lead Slide-Over Panel */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateModalOpen(false)}
              className="fixed inset-0 bg-slate-950/60 z-40 backdrop-blur-sm"
            />

            {/* Slide-over Container */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 220 }}
              className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 p-6 flex flex-col justify-between overflow-y-auto"
            >
              <form onSubmit={handleCreateLead} className="h-full flex flex-col justify-between">
                <div className="space-y-6">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-955/30 text-indigo-650">
                        <UserPlus className="w-5 h-5" />
                      </span>
                      <div>
                        <h2 className="text-base font-black text-slate-800 dark:text-white leading-none">Create New Inbound Lead</h2>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-1">Register a new borrower application manually.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCreateModalOpen(false)}
                      className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Form Fields Grid */}
                  <div className="space-y-5 overflow-y-auto max-h-[calc(100vh-200px)] pr-2">
                    {/* Section 1: Applicant Info */}
                    <div className="space-y-3">
                      <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Applicant Personal Info</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Full Name *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Rahul Sharma"
                            value={createForm.name}
                            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Mobile Phone (10 digits) *</label>
                          <input
                            type="text"
                            required
                            maxLength={10}
                            placeholder="e.g. 9876543210"
                            value={createForm.phone}
                            onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value.replace(/\D/g, "") })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Personal Email</label>
                          <input
                            type="email"
                            placeholder="e.g. rahul@example.com"
                            value={createForm.email}
                            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Date of Birth</label>
                          <input
                            type="date"
                            value={createForm.dateOfBirth}
                            onChange={(e) => setCreateForm({ ...createForm, dateOfBirth: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">PAN Card</label>
                          <input
                            type="text"
                            maxLength={10}
                            placeholder="e.g. ABCDE1234F"
                            value={createForm.panNumber}
                            onChange={(e) => setCreateForm({ ...createForm, panNumber: e.target.value.toUpperCase() })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-505 transition text-slate-800 dark:text-white uppercase"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Aadhaar Card (12 digits)</label>
                          <input
                            type="text"
                            maxLength={12}
                            placeholder="e.g. 123456789012"
                            value={createForm.aadhaarNumber}
                            onChange={(e) => setCreateForm({ ...createForm, aadhaarNumber: e.target.value.replace(/\D/g, "") })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Employment Status</label>
                          <select
                            value={createForm.employmentStatus}
                            onChange={(e) => setCreateForm({ ...createForm, employmentStatus: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white cursor-pointer"
                          >
                            <option value="salaried">Salaried</option>
                            <option value="self">Self Employed</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Lead Source *</label>
                          <select
                            value={createForm.source}
                            onChange={(e) => setCreateForm({ ...createForm, source: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white cursor-pointer"
                          >
                            <option value="Admin Panel">Admin Panel</option>
                            <option value="Website">Website</option>
                            <option value="Mobile App">Mobile App</option>
                            <option value="Partner API">Partner API</option>
                            <option value="Direct Telecall">Direct Telecall</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Loan & Financial Info */}
                    <div className="space-y-3">
                      <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Loan & Financial Details</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Loan Amount Required *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. 25000"
                            value={createForm.loanAmount}
                            onChange={(e) => setCreateForm({ ...createForm, loanAmount: e.target.value.replace(/[^0-9.]/g, "") })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Monthly Salary / Income</label>
                          <input
                            type="text"
                            placeholder="e.g. 45000"
                            value={createForm.monthlyIncome}
                            onChange={(e) => setCreateForm({ ...createForm, monthlyIncome: e.target.value.replace(/[^0-9.]/g, "") })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Employer / Company Name</label>
                          <input
                            type="text"
                            placeholder="e.g. Tata Consultancy Services"
                            value={createForm.companyName}
                            onChange={(e) => setCreateForm({ ...createForm, companyName: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Designation</label>
                          <input
                            type="text"
                            placeholder="e.g. Software Engineer"
                            value={createForm.designation}
                            onChange={(e) => setCreateForm({ ...createForm, designation: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Loan Purpose</label>
                          <input
                            type="text"
                            placeholder="e.g. Medical emergency, Salary advance"
                            value={createForm.loanPurpose}
                            onChange={(e) => setCreateForm({ ...createForm, loanPurpose: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-505 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">City</label>
                          <input
                            type="text"
                            placeholder="e.g. Mumbai"
                            value={createForm.city}
                            onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">State</label>
                          <input
                            type="text"
                            placeholder="e.g. Maharashtra"
                            value={createForm.state}
                            onChange={(e) => setCreateForm({ ...createForm, state: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Pincode</label>
                          <input
                            type="text"
                            maxLength={6}
                            placeholder="e.g. 400001"
                            value={createForm.pincode}
                            onChange={(e) => setCreateForm({ ...createForm, pincode: e.target.value.replace(/\D/g, "") })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Section 3: Bank Details */}
                    <div className="space-y-3">
                      <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Bank Account Details</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Bank Name</label>
                          <input
                            type="text"
                            placeholder="e.g. HDFC Bank"
                            value={createForm.bankName}
                            onChange={(e) => setCreateForm({ ...createForm, bankName: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Branch Name</label>
                          <input
                            type="text"
                            placeholder="e.g. Bandra West Branch"
                            value={createForm.branchName}
                            onChange={(e) => setCreateForm({ ...createForm, branchName: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Account Holder Name</label>
                          <input
                            type="text"
                            placeholder="e.g. Rahul Sharma"
                            value={createForm.accountHolder}
                            onChange={(e) => setCreateForm({ ...createForm, accountHolder: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Account Number</label>
                          <input
                            type="text"
                            placeholder="e.g. 501002938475"
                            value={createForm.accountNumber}
                            onChange={(e) => setCreateForm({ ...createForm, accountNumber: e.target.value.replace(/\D/g, "") })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">IFSC Code</label>
                          <input
                            type="text"
                            maxLength={11}
                            placeholder="e.g. HDFC0000001"
                            value={createForm.ifscCode}
                            onChange={(e) => setCreateForm({ ...createForm, ifscCode: e.target.value.toUpperCase() })}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white uppercase"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Section 4: References */}
                    <div className="space-y-3">
                      <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Reference Details</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Reference 1 */}
                        <div className="border border-slate-100 dark:border-slate-800/80 p-3.5 rounded-xl space-y-3">
                          <span className="text-[9px] font-black uppercase text-indigo-600 block">Primary Reference (1)</span>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Full Name</label>
                            <input
                              type="text"
                              placeholder="e.g. Amit Kumar"
                              value={createForm.reference1Name}
                              onChange={(e) => setCreateForm({ ...createForm, reference1Name: e.target.value })}
                              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Mobile Phone (10 digits)</label>
                            <input
                              type="text"
                              maxLength={10}
                              placeholder="e.g. 9876543210"
                              value={createForm.reference1Mobile}
                              onChange={(e) => setCreateForm({ ...createForm, reference1Mobile: e.target.value.replace(/\D/g, "") })}
                              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Relationship</label>
                            <input
                              type="text"
                              placeholder="e.g. Friend, Brother"
                              value={createForm.reference1Relation}
                              onChange={(e) => setCreateForm({ ...createForm, reference1Relation: e.target.value })}
                              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                            />
                          </div>
                        </div>

                        {/* Reference 2 */}
                        <div className="border border-slate-100 dark:border-slate-800/80 p-3.5 rounded-xl space-y-3">
                          <span className="text-[9px] font-black uppercase text-indigo-600 block">Secondary Reference (2)</span>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Full Name</label>
                            <input
                              type="text"
                              placeholder="e.g. Vijay Singh"
                              value={createForm.reference2Name}
                              onChange={(e) => setCreateForm({ ...createForm, reference2Name: e.target.value })}
                              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Mobile Phone (10 digits)</label>
                            <input
                              type="text"
                              maxLength={10}
                              placeholder="e.g. 8765432109"
                              value={createForm.reference2Mobile}
                              onChange={(e) => setCreateForm({ ...createForm, reference2Mobile: e.target.value.replace(/\D/g, "") })}
                              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Relationship</label>
                            <input
                              type="text"
                              placeholder="e.g. Father, Colleague"
                              value={createForm.reference2Relation}
                              onChange={(e) => setCreateForm({ ...createForm, reference2Relation: e.target.value })}
                              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit Action Block */}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-705 dark:text-slate-200 text-xs font-black hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black transition cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    {isCreating ? (
                      <>
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        <span>Creating Lead...</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span>Create Inbound Lead</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
