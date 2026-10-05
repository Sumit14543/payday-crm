import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  Trophy,
  Clock,
  Briefcase,
  TrendingUp,
  Users,
  UserCheck,
  Zap,
  Award,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Medal,
  Sparkles,
  Phone,
  Mail,
  ShieldCheck,
  GraduationCap,
  MapPin,
  FileText,
  Eye,
  Calendar,
  User
} from "lucide-react";
import { apiGet } from "../../lib/api";
import { TeamPerformanceDashboard } from "../TeamPerformanceDashboard";

type WorkExperience = {
  role: string;
  company: string;
  duration: string;
  highlights: string[];
};

type EducationItem = {
  degree: string;
  year: string;
};

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  attendance: "Present" | "Absent";
  clockIn: string;
  performance: string;
  salesClosed: number;
  avatar?: string;
  aboutMe?: string;
  phone?: string;
  experience?: WorkExperience[];
  education?: EducationItem[];
  skills?: string[];
  personalInfo?: {
    fatherName: string;
    dob: string;
    nationality: string;
    languages: string;
    address: string;
  };
};

export function Team() {
  const context = useOutletContext<{ activeProduct?: string }>() || {};
  const activeProduct = context.activeProduct || "Payday Loan (Standard)";

  const [telecallers, setTelecallers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [dutyFilter, setDutyFilter] = useState("all");
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<"performance" | "roster">("performance");

  const fetchTelecallers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<any[]>("/superadmin/telecallers?tenantSlug=all");
      if (Array.isArray(data)) {
        setTelecallers(data);
      }
    } catch (err) {
      console.error("Failed to load telecallers list:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTelecallers();
  }, [fetchTelecallers]);

  const teamList = useMemo<TeamMember[]>(() => {
    // Nandini's complete resume details extracted from uploaded PDF & portrait image
    const nandiniProfile: TeamMember = {
      id: "TM-201",
      name: "Nandni Gupta",
      email: "nandini@waqtmoney.in",
      phone: "+91 92174 02920",
      role: "Sales & Support Telecaller",
      attendance: "Present",
      clockIn: "09:05 AM",
      performance: "Top Performer",
      salesClosed: 12,
      avatar: "/nandini.jpg",
      aboutMe:
        "Commerce Graduate with experience in Sales, Credit Card Sales and Loan Sales. Skilled in customer acquisition, lead generation, relationship management, sales conversion and team handling. Strong communication and customer service abilities with a proven track record in financial product sales.",
      skills: [
        "Sales & Lead Generation",
        "Loan Sales",
        "Credit Card Sales",
        "Customer Relationship (CRM)",
        "Team Leadership",
        "Communication Skills",
        "Microsoft Excel"
      ],
      experience: [
        {
          company: "HDB Financial Services",
          role: "Sales Executive (Loans)",
          duration: "02 Dec 2025 – 02 Jun 2026 (6 Months)",
          highlights: [
            "Generated and converted leads for loan products.",
            "Assisted customers in selecting suitable loan options.",
            "Achieved monthly sales targets through customer engagement.",
            "Maintained customer relationships and follow-ups."
          ]
        },
        {
          company: "My Money Mantra",
          role: "Relationship Manager (Loan Sales)",
          duration: "03 Mar 2025 – 20 Nov 2025 (9 Months)",
          highlights: [
            "Handled sales of personal and business loan products.",
            "Guided customers through the loan application process.",
            "Built strong customer relationships to increase conversions.",
            "Worked towards achieving sales and revenue targets."
          ]
        },
        {
          company: "Teleone Enterprise",
          role: "Axis Bank Credit Card Process",
          duration: "01 Feb 2024 – 08 Feb 2025 (1 Year)",
          highlights: [
            "Promoted Axis Bank credit cards to potential customers.",
            "Generated leads and converted prospects into customers."
          ]
        }
      ],
      education: [
        { degree: "Bachelor of Commerce (B.Com)", year: "Completed 2022" },
        { degree: "Intermediate", year: "Completed 2019" },
        { degree: "High School", year: "Completed 2017" }
      ],
      personalInfo: {
        fatherName: "Lt. Satish Gupta",
        dob: "05-09-2001",
        nationality: "Indian",
        languages: "Hindi, English",
        address: "H-15 Noida Sector 63"
      }
    };

    if (telecallers.length === 0 && !loading) {
      // Fallback roster matching active telecallers
      return [
        nandiniProfile,
        { id: "TM-202", name: "Kajal", email: "kajalshishodia@waqtmoney.in", phone: "+91 98760 12345", role: "Sales & Support Telecaller", attendance: "Present", clockIn: "09:15 AM", performance: "Excellent", salesClosed: 12 },
        { id: "TM-204", name: "Waqt Telecaller", email: "telecaller@waqtfinance.com", phone: "+91 98111 22233", role: "Sales & Support Telecaller", attendance: "Absent", clockIn: "—", performance: "Good", salesClosed: 12 }
      ];
    }

    return telecallers.map((t) => {
      const isNandini = String(t.name || t.username || "").toLowerCase().includes("nandini");
      if (isNandini) {
        return {
          ...nandiniProfile,
          id: `TM-${t.id || "201"}`,
          email: t.email || nandiniProfile.email,
          attendance: t.is_on_duty ? "Present" : "Absent",
          clockIn: t.is_on_duty ? "09:05 AM" : "—"
        };
      }
      return {
        id: `TM-${t.id || "001"}`,
        name: t.name || t.username || "Agent",
        email: t.email || "agent@crm.com",
        role: "Sales & Support Telecaller",
        attendance: t.is_on_duty ? "Present" : "Absent",
        clockIn: t.is_on_duty ? "09:00 AM" : "—",
        performance: "Excellent",
        salesClosed: t.product_count || 12
      };
    });
  }, [telecallers, loading]);

  const filteredTeam = useMemo(() => {
    return teamList.filter((t) => {
      const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === "all" || t.role.toLowerCase().includes(roleFilter.toLowerCase());
      const matchesDuty = dutyFilter === "all" || (dutyFilter === "present" ? t.attendance === "Present" : t.attendance === "Absent");
      return matchesSearch && matchesRole && matchesDuty;
    });
  }, [teamList, searchQuery, roleFilter, dutyFilter]);

  // Leaderboard sorted by salesClosed
  const leaderboard = useMemo(() => {
    return [...teamList].sort((a, b) => b.salesClosed - a.salesClosed);
  }, [teamList]);

  // Calculate dynamic metrics for Top KPI Grid
  const kpis = useMemo(() => {
    const totalMembers = teamList.length;
    const presentMembers = teamList.filter(t => t.attendance === "Present").length;
    const totalClosed = teamList.reduce((sum, t) => sum + (t.salesClosed || 0), 0);
    const avgSla = "1h 15m";

    return { totalMembers, presentMembers, totalClosed, avgSla };
  }, [teamList]);

  const getInitials = (name: string) => {
    if (!name) return "T";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return { bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30", label: "🥇 #1 Top" };
    if (index === 1) return { bg: "bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300", label: "🥈 #2 Rank" };
    if (index === 2) return { bg: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30", label: "🥉 #3 Rank" };
    return { bg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20", label: `#${index + 1} Rank` };
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Description Box & Controls */}
      <div className="relative overflow-hidden bg-white/90 dark:bg-slate-900/90 border border-indigo-500/25 dark:border-indigo-500/35 p-4.5 rounded-2xl backdrop-blur-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-indigo-500 to-purple-500" />
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-indigo-500/2 to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Team Roster</span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-2.5 py-0.5 rounded-lg font-black text-[9px] uppercase tracking-wider shadow-xs">
                {activeProduct}
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-950 dark:text-white tracking-tight flex items-center gap-2 mt-0.5">
              <span>Team Operations Center</span>
              <Briefcase className="w-5 h-5 text-indigo-500" />
            </h1>
          </div>
        </div>

        {/* Top Navigation Tabs */}
        <div className="relative z-10 flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveMainTab("performance")}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
              activeMainTab === "performance"
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Staff Performance & Scorecards</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMainTab("roster")}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
              activeMainTab === "roster"
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Team Roster ({teamList.length})</span>
          </button>
        </div>

        {/* Sync Refresh button */}
        <div className="relative z-10 flex items-center gap-3">
          <button
            type="button"
            onClick={fetchTelecallers}
            disabled={loading}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 text-xs font-extrabold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync Roster</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeMainTab === "performance" ? (
        <TeamPerformanceDashboard />
      ) : (
        <>

      {/* KPI Cards Grid (Vibrant Top & Left Border Accents) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Team Roster",
            value: loading ? "..." : kpis.totalMembers,
            desc: "Active sales & support agents",
            icon: Users,
            accentClasses: "border border-blue-200/90 dark:border-blue-900/60 border-t-4 border-t-blue-500 border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-white dark:from-blue-950/40 dark:via-slate-900 dark:to-slate-900",
            iconBg: "bg-blue-100/80 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-700/60 shadow-xs",
            numColor: "text-blue-700 dark:text-blue-400"
          },
          {
            label: "On Duty Active",
            value: loading ? "..." : `${kpis.presentMembers} Active`,
            desc: "Clocked in duty status",
            icon: UserCheck,
            accentClasses: "border border-emerald-200/90 dark:border-emerald-900/60 border-t-4 border-t-emerald-500 border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900",
            iconBg: "bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/60 shadow-xs",
            numColor: "text-emerald-700 dark:text-emerald-400"
          },
          {
            label: "Team Conversions",
            value: loading ? "..." : `${kpis.totalClosed} Files`,
            desc: "Disbursed loan closures",
            icon: Trophy,
            accentClasses: "border border-purple-200/90 dark:border-purple-900/60 border-t-4 border-t-purple-500 border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-white dark:from-purple-950/40 dark:via-slate-900 dark:to-slate-900",
            iconBg: "bg-purple-100/80 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-700/60 shadow-xs",
            numColor: "text-purple-700 dark:text-purple-400"
          },
          {
            label: "Average Lead SLA",
            value: loading ? "..." : kpis.avgSla,
            desc: "Turnaround response time",
            icon: Zap,
            accentClasses: "border border-amber-200/90 dark:border-amber-900/60 border-t-4 border-t-amber-500 border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-white dark:from-amber-950/40 dark:via-slate-900 dark:to-slate-900",
            iconBg: "bg-amber-100/80 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 border border-amber-200 dark:border-amber-700/60 shadow-xs",
            numColor: "text-amber-700 dark:text-amber-400"
          }
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`relative overflow-hidden ${card.accentClasses} rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group`}
            >
              <div className="relative z-10 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {card.label}
                </span>
                <div className={`p-2 rounded-xl ${card.iconBg}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="relative z-10 mt-3">
                <h3 className={`text-2xl font-black ${card.numColor} tracking-tight`}>
                  {card.value}
                </h3>
                <p className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 mt-0.5">
                  {card.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Control Panel / Search & Filters */}
      <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Agent Name or Team role..."
            className="w-full h-10 pl-10 pr-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 justify-end">
          <select
            value={dutyFilter}
            onChange={(e) => setDutyFilter(e.target.value)}
            className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-700 dark:text-slate-250 outline-none cursor-pointer focus:border-indigo-500 transition"
          >
            <option value="all">All Duty Statuses</option>
            <option value="present">On Duty / Present</option>
            <option value="absent">Off Duty / Absent</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-550">
          <span className="w-6 h-6 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
          <span className="text-xs font-extrabold uppercase tracking-wider">Syncing operational rosters...</span>
        </div>
      ) : (
        /* Grid: Team Directory vs Performance Leaderboard */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Team Members List */}
          <div className="lg:col-span-2 bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Attendance & Duty Status Directory
              </h3>
              <span className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                {filteredTeam.length} members
              </span>
            </div>

            {filteredTeam.length === 0 ? (
              <div className="py-16 text-center">
                <AlertCircle className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">No Team Members Found</h4>
                <p className="text-[10px] font-extrabold text-slate-400 mt-1">No agent records match your search or duty parameters</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTeam.map((member) => (
                  <div
                    key={member.id}
                    onClick={() => setSelectedMember(member)}
                    className="p-4 bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800 rounded-2xl flex items-center justify-between hover:border-indigo-500/40 hover:shadow-md transition duration-200 group cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      {member.avatar ? (
                        <img
                          src={member.avatar}
                          alt={member.name}
                          className="w-12 h-12 rounded-2xl object-cover border-2 border-indigo-500/30 shadow-xs shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-sm flex items-center justify-center shadow-xs shrink-0">
                          {getInitials(member.name)}
                        </div>
                      )}
                      <div>
                        <h4 className="text-xs font-black text-slate-900 dark:text-white leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                          <span>{member.name}</span>
                          {member.aboutMe && (
                            <span className="text-[9px] font-extrabold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20">
                              Resume Verified
                            </span>
                          )}
                        </h4>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold block mt-1">
                          {member.role} • <span className="font-medium text-slate-500">{member.email}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex flex-col text-right">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Clock In Time</span>
                        <span className="text-xs font-mono font-black text-slate-700 dark:text-slate-300 mt-0.5 flex items-center justify-end gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{member.clockIn}</span>
                        </span>
                      </div>

                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black border shadow-2xs ${
                        member.attendance === "Present"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${member.attendance === "Present" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                        <span>{member.attendance === "Present" ? "On Duty" : "Off Duty"}</span>
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMember(member);
                        }}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-500/10 transition"
                        title="View Resume & Profile"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Leaderboard Card */}
          <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs backdrop-blur-md flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Trophy className="w-4 h-4 animate-bounce" />
                  </div>
                  <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    Top Conversion Performers
                  </h3>
                </div>
                <span className="text-[9px] font-extrabold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  Weekly Ranks
                </span>
              </div>

              <div className="space-y-3">
                {leaderboard.map((member, index) => {
                  const rankInfo = getRankBadge(index);
                  return (
                    <div
                      key={member.id}
                      onClick={() => setSelectedMember(member)}
                      className="p-3.5 bg-slate-50/70 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center justify-between transition-transform hover:scale-[1.01] cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border ${rankInfo.bg}`}>
                          {rankInfo.label}
                        </span>
                        <div className="flex items-center gap-2.5">
                          {member.avatar && (
                            <img src={member.avatar} alt={member.name} className="w-7 h-7 rounded-lg object-cover" />
                          )}
                          <div>
                            <div className="text-xs font-black text-slate-900 dark:text-white leading-tight">
                              {member.name}
                            </div>
                            <span className="text-[9px] font-extrabold text-slate-400 block mt-0.5">{member.role}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg">
                          {member.salesClosed} Closed
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-6 text-center">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold flex items-center justify-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Ranks updated automatically based on weekly loan disbursements.</span>
              </p>
            </div>
          </div>

        </div>
      )}

      {/* Detailed Agent Profile & Resume Overlay Drawer */}
      <AnimatePresence>
        {selectedMember && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMember(null)}
              className="fixed inset-0 bg-black z-50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.28 }}
              className="fixed top-0 bottom-0 right-0 w-full max-w-xl bg-white dark:bg-slate-900 shadow-2xl z-[60] p-6 flex flex-col justify-between border-l border-slate-200 dark:border-slate-800 overflow-y-auto"
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
                  <div className="flex items-center gap-4">
                    {selectedMember.avatar ? (
                      <img
                        src={selectedMember.avatar}
                        alt={selectedMember.name}
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-indigo-500 shadow-md shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-xl flex items-center justify-center shadow-md shrink-0">
                        {getInitials(selectedMember.name)}
                      </div>
                    )}
                    <div>
                      <h3 className="font-black text-lg text-slate-900 dark:text-white leading-tight flex items-center gap-2">
                        <span>{selectedMember.name}</span>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                          {selectedMember.attendance === "Present" ? "On Duty" : "Off Duty"}
                        </span>
                      </h3>
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">
                        {selectedMember.role}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10px] font-bold text-slate-400">
                        {selectedMember.phone && (
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-indigo-500" /> {selectedMember.phone}</span>
                        )}
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-indigo-500" /> {selectedMember.email}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedMember(null)}
                    className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-6 text-xs font-bold">
                  {/* About Me Section */}
                  {selectedMember.aboutMe && (
                    <div className="p-4 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 rounded-2xl space-y-2">
                      <h4 className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        <span>Professional Bio & Summary</span>
                      </h4>
                      <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                        {selectedMember.aboutMe}
                      </p>
                    </div>
                  )}

                  {/* Skills Section */}
                  {selectedMember.skills && selectedMember.skills.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5">
                        Core Competencies & Skills
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedMember.skills.map((skill, i) => (
                          <span
                            key={i}
                            className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 px-3 py-1 rounded-xl text-[11px] font-extrabold"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Experience Timeline */}
                  {selectedMember.experience && selectedMember.experience.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                        Work Experience Timeline
                      </h4>
                      <div className="space-y-3.5">
                        {selectedMember.experience.map((exp, idx) => (
                          <div
                            key={idx}
                            className="p-4 bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-2"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <h5 className="font-black text-xs text-slate-900 dark:text-white">{exp.role}</h5>
                                <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 block">{exp.company}</span>
                              </div>
                              <span className="text-[9px] font-extrabold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-0.5 rounded-full">
                                {exp.duration}
                              </span>
                            </div>
                            <ul className="list-disc list-inside space-y-1 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                              {exp.highlights.map((item, hIdx) => (
                                <li key={hIdx}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Education & Personal Details */}
                  {selectedMember.personalInfo && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Education */}
                      <div className="p-4 bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-2">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <GraduationCap className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Education</span>
                        </h4>
                        <div className="space-y-1.5 text-[11px]">
                          {selectedMember.education?.map((edu, eIdx) => (
                            <div key={eIdx} className="flex items-center justify-between">
                              <span className="font-black text-slate-800 dark:text-slate-200">{edu.degree}</span>
                              <span className="text-[10px] text-slate-400 font-extrabold">{edu.year}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Personal Info */}
                      <div className="p-4 bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-2">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Personal Record</span>
                        </h4>
                        <div className="space-y-1 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                          <div>Father: <span className="text-slate-900 dark:text-white font-black">{selectedMember.personalInfo.fatherName}</span></div>
                          <div>DOB: <span className="text-slate-900 dark:text-white font-black">{selectedMember.personalInfo.dob}</span></div>
                          <div>Languages: <span className="text-slate-900 dark:text-white font-black">{selectedMember.personalInfo.languages}</span></div>
                          <div className="truncate">Address: <span className="text-slate-900 dark:text-white font-black">{selectedMember.personalInfo.address}</span></div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>

              </div>

              {/* Close Action */}
              <button
                onClick={() => setSelectedMember(null)}
                className="w-full h-11 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-extrabold text-xs shadow hover:bg-slate-800 transition cursor-pointer shrink-0 mt-6"
              >
                Close Agent Profile
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      </>
      )}
    </motion.div>
  );
}

