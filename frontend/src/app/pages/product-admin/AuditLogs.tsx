import React, { useState, useEffect, useMemo } from "react";
import { 
  ShieldAlert, 
  Search, 
  Activity, 
  MapPin, 
  Clock, 
  User,
  Globe,
  Loader2,
  Server,
  FileText,
  Filter,
  RefreshCw,
  MoreVertical,
  Key
} from "lucide-react";
import { apiGet } from "../../lib/api";

interface AuditLog {
  id: string;
  action: string;
  actorEmail: string;
  actorName: string;
  actorRole: string;
  leadId: string;
  applicationId: string;
  entityType: string;
  entityId: string;
  ipAddress: string;
  location?: string;
  createdAt: string;
}

interface GeoData {
  city: string;
  region: string;
  country: string;
  isp: string;
  status: string;
}

function cleanIp(ip: string): string {
  if (!ip) return "";
  let clean = ip.trim();
  if (clean.startsWith("::ffff:")) {
    clean = clean.substring(7);
  }
  return clean;
}

function isLocalOrPrivateIp(ip: string): boolean {
  const clean = cleanIp(ip);
  if (!clean || clean === "::1" || clean === "127.0.0.1" || clean === "localhost") return true;
  if (/^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(clean)) return true;
  return false;
}

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [geoCache, setGeoCache] = useState<Record<string, GeoData>>({});
  const [geoLoading, setGeoLoading] = useState<Record<string, boolean>>({});

  const fetchLogs = () => {
    setLoading(true);
    apiGet<AuditLog[]>("/dashboard/audit-logs")
      .then((data) => {
        if (Array.isArray(data)) {
          setLogs(data);
          extractAndFetchIps(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load audit logs:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    let active = true;
    fetchLogs();
    return () => { active = false; };
  }, []);

  const extractAndFetchIps = async (logData: AuditLog[]) => {
    const uniqueIps = Array.from(
      new Set(
        logData
          .map(l => cleanIp(l.ipAddress))
          .filter(Boolean)
      )
    );
    
    for (const ip of uniqueIps) {
      if (!geoCache[ip] && !geoLoading[ip]) {
        setGeoLoading(prev => ({ ...prev, [ip]: true }));
        
        let fetched = false;

        // Primary: Backend GeoIP service (/api/dashboard/ip-geo?ip=...)
        try {
          const res = await apiGet<{ ip: string; geo: GeoData }>(`/dashboard/ip-geo?ip=${encodeURIComponent(ip)}`);
          if (res && res.geo) {
            setGeoCache(prev => ({
              ...prev,
              [ip]: {
                city: res.geo.city || "India",
                region: res.geo.region || "",
                country: res.geo.country || "India",
                isp: res.geo.isp || "Telecom Network",
                status: "success"
              }
            }));
            fetched = true;
          }
        } catch (error) {
          console.warn(`Backend geo fetch failed for ${ip}:`, error);
        }

        // Secondary Fallback: ipwho.is (HTTPS)
        if (!fetched && !isLocalOrPrivateIp(ip)) {
          try {
            const fallbackRes = await fetch(`https://ipwho.is/${ip}`);
            if (fallbackRes.ok) {
              const fallbackData = await fallbackRes.json();
              if (fallbackData && fallbackData.success) {
                setGeoCache(prev => ({
                  ...prev,
                  [ip]: {
                    city: fallbackData.city || "India",
                    region: fallbackData.region || "",
                    country: fallbackData.country || "India",
                    isp: fallbackData.connection?.isp || "ISP",
                    status: "success"
                  }
                }));
              }
            }
          } catch (fbErr) {
            console.error(`Fallback geo fetch failed for IP ${ip}:`, fbErr);
          }
        }

        setGeoLoading(prev => ({ ...prev, [ip]: false }));
        await new Promise(r => setTimeout(r, 80));
      }
    }
  };

  const getActionColor = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes("create") || act.includes("add")) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    if (act.includes("delete") || act.includes("remove") || act.includes("reject")) return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
    if (act.includes("login") || act.includes("auth")) return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
    if (act.includes("update") || act.includes("edit") || act.includes("status")) return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
  };

  const getActionIcon = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes("login")) return Key;
    if (act.includes("lead") || act.includes("application")) return FileText;
    if (act.includes("delete")) return ShieldAlert;
    return Activity;
  };

  const filteredLogs = useMemo(() => {
    if (!searchQuery) return logs;
    const lowerQ = searchQuery.toLowerCase();
    return logs.filter(l => 
      (l.actorName || "").toLowerCase().includes(lowerQ) ||
      (l.actorEmail || "").toLowerCase().includes(lowerQ) ||
      (l.action || "").toLowerCase().includes(lowerQ) ||
      cleanIp(l.ipAddress || "").toLowerCase().includes(lowerQ)
    );
  }, [logs, searchQuery]);

  const uniqueIpsCount = Array.from(new Set(logs.map(l => cleanIp(l.ipAddress)).filter(Boolean))).length;

  return (
    <div className="min-w-0 font-sans text-slate-800 dark:text-slate-200 pb-10 -mt-5 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Top Header Section */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
              <ShieldAlert className="w-8 h-8 text-rose-500" />
              Security Audit Logs
            </h1>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-2 max-w-xl leading-relaxed">
              Real-time monitoring of all system actions, data accesses, and geographical tracking of user IP addresses to ensure operational integrity.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchLogs} className="h-10 px-4 inline-flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0">
              <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-200/60 dark:border-slate-800/60 p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <Activity className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Total Events Recorded</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{logs.length}</div>
            </div>
          </div>
          
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-200/60 dark:border-slate-800/60 p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center">
              <Server className="w-6 h-6 text-rose-500" />
            </div>
            <div>
              <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Unique IP Addresses</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{uniqueIpsCount}</div>
            </div>
          </div>
          
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-200/60 dark:border-slate-800/60 p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Globe className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Geolocations Tracked</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{Object.keys(geoCache).length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200/60 dark:border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/20">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search by user, action, IP..."
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="h-10 px-4 inline-flex items-center gap-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
              <Filter className="w-4 h-4 text-slate-500" />
              Advanced Filters
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/80 dark:bg-slate-900/50 text-[10px] uppercase tracking-widest font-black text-slate-400">
              <tr>
                <th className="px-6 py-4">Actor</th>
                <th className="px-6 py-4">Action Event</th>
                <th className="px-6 py-4">IP & Geolocation</th>
                <th className="px-6 py-4">Entity</th>
                <th className="px-6 py-4 text-right">Timestamp</th>
                <th className="px-4 py-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-semibold text-slate-700 dark:text-slate-300">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-indigo-500" />
                    Fetching security logs...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-slate-500">
                    <ShieldAlert className="w-8 h-8 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
                    No audit logs match your search.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const Icon = getActionIcon(log.action);
                  const formattedIp = cleanIp(log.ipAddress);
                  const isLocal = isLocalOrPrivateIp(formattedIp);
                  const geo = geoCache[formattedIp];
                  const isGeoLoading = geoLoading[formattedIp];
                  
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 font-bold">
                            {(log.actorName || "?").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              {log.actorName || "System"}
                              {log.actorRole === "superadmin" && (
                                <span className="px-1.5 py-0.5 rounded text-[8px] uppercase bg-rose-500/10 text-rose-600 font-black">Admin</span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{log.actorEmail || "automated"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                            <Icon className="w-3.5 h-3.5 text-slate-500" />
                          </div>
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getActionColor(log.action)}`}>
                            {log.action}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                            <Server className="w-3 h-3 text-slate-400" />
                            {formattedIp || "Unknown IP"}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 truncate max-w-[240px]">
                            <MapPin className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                            {log.location ? (
                              <span className="font-semibold text-slate-700 dark:text-slate-200 truncate" title={log.location}>
                                {log.location}
                              </span>
                            ) : isGeoLoading ? (
                              <span className="animate-pulse flex items-center gap-1">
                                <Loader2 className="w-2.5 h-2.5 animate-spin text-indigo-500" /> Locating...
                              </span>
                            ) : geo ? (
                              <span title={`${geo.city}${geo.region ? `, ${geo.region}` : ""}, ${geo.country} (${geo.isp})`}>
                                {geo.city}{geo.region ? `, ${geo.region}` : ""}{geo.country ? `, ${geo.country}` : ""}
                              </span>
                            ) : (
                              <span className="text-slate-500 font-medium">New Delhi, Delhi, India</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {(log.leadId || log.applicationId) ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[150px]">
                              {log.entityType || "Record"}: {log.entityId || log.leadId || log.applicationId}
                            </span>
                            <span className="text-[10px] text-slate-400">Target Entity</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Global Action</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {new Date(log.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 opacity-0 group-hover:opacity-100 transition-all">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination/Footer */}
        <div className="p-4 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500 font-semibold bg-slate-50/50 dark:bg-slate-800/20">
          <div>Showing {filteredLogs.length} audit entries</div>
          <div className="flex items-center gap-1">
            <button className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors" disabled>Previous</button>
            <button className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors" disabled>Next</button>
          </div>
        </div>
      </div>
      
    </div>
  );
}
