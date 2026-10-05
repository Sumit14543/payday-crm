import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, AlertTriangle, ExternalLink, X, Search, Phone, Mail, FileText, User } from "lucide-react";
import { apiGet } from "../lib/api";

export type DuplicateMatch = {
  id: string;
  rawId: string;
  name: string;
  email: string;
  phone: string;
  panNumber: string;
  loanAmount: number;
  status: string;
  assignedTo: string;
  createdAt: string;
  matchedReasons: string[];
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  leadId: string | null;
  onFilterByPhone?: (phone: string) => void;
};

export function DuplicateLeadsModal({ isOpen, onClose, leadId, onFilterByPhone }: Props) {
  const [loading, setLoading] = useState(false);
  const [targetLead, setTargetLead] = useState<{ id: string; name: string; phone: string; panNumber: string } | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !leadId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadDuplicates = async () => {
      try {
        // Try dedicated duplicates endpoint first
        const res = await apiGet<{ target: any; duplicates: DuplicateMatch[] }>(`/leads/${encodeURIComponent(leadId)}/duplicates`);
        if (isMounted && res.success && res.data && Array.isArray(res.data.duplicates)) {
          setTargetLead(res.data.target);
          setDuplicates(res.data.duplicates);
          setLoading(false);
          return;
        }
      } catch {
        // Fallback to standard lead details + search
      }

      try {
        // Step 1: Fetch target lead details
        const targetRes = await apiGet<any>(`/leads/${encodeURIComponent(leadId)}`);
        const targetData = targetRes?.data || targetRes;
        if (!targetData || !isMounted) {
          if (isMounted) {
            setError("Failed to load lead details");
            setLoading(false);
          }
          return;
        }

        const phone = String(targetData.phone || targetData.mobile || "").trim();
        const pan = String(targetData.panNumber || targetData.pan_number || "").trim();
        const name = String(targetData.name || targetData.full_name || "").trim();
        const targetRawId = String(targetData.rawId || targetData.id || leadId);

        setTargetLead({
          id: String(targetData.id || leadId),
          name,
          phone,
          panNumber: pan,
        });

        // Step 2: Search for matching leads across Name, Phone, and PAN
        const searchQueries = Array.from(new Set([name, phone, pan].map((s) => s.trim()).filter(Boolean)));
        if (searchQueries.length === 0) {
          if (isMounted) {
            setDuplicates([]);
            setLoading(false);
          }
          return;
        }

        const itemMap = new Map<string, any>();
        for (const q of searchQueries) {
          try {
            const listRes = await apiGet<any>(`/leads?search=${encodeURIComponent(q)}&includeAllLeads=true&duplicateLookup=true`);
            let items: any[] = [];
            if (Array.isArray(listRes?.data)) items = listRes.data;
            else if (Array.isArray(listRes?.data?.items)) items = listRes.data.items;
            else if (Array.isArray(listRes)) items = listRes;

            items.forEach((it) => {
              const k = String(it.rawId || it.id || "");
              if (k) itemMap.set(k, it);
            });
          } catch {
            try {
              const wbRes = await apiGet<any>(`/leads/telecaller-workbench-v2?search=${encodeURIComponent(q)}`);
              const items = wbRes?.data?.items || [];
              items.forEach((it: any) => {
                const k = String(it.rawId || it.id || "");
                if (k) itemMap.set(k, it);
              });
            } catch {
              // ignore query errors
            }
          }
        }

        const searchItems = Array.from(itemMap.values());
        const matchedDuplicates: DuplicateMatch[] = [];
        const normName = name.toLowerCase();


        for (const item of searchItems) {
          const itemRawId = String(item.rawId || item.id || "");
          if (!itemRawId || itemRawId === targetRawId || item.id === targetData.id) continue;

          const itemPhone = String(item.phone || item.mobile || "").trim();
          const itemPan = String(item.panNumber || item.pan_number || "").trim();
          const itemName = String(item.name || item.full_name || "").trim().toLowerCase();

          const reasons: string[] = [];
          if (phone && itemPhone && itemPhone === phone) reasons.push("Same Mobile");
          if (pan && itemPan && itemPan === pan) reasons.push("Same PAN");
          if (name && itemName && itemName === normName) reasons.push("Same Name");

          if (reasons.length > 0) {
            matchedDuplicates.push({
              id: String(item.id || item.applicationId || `APP-${itemRawId}`),
              rawId: itemRawId,
              name: String(item.name || item.full_name || "Applicant"),
              email: String(item.email || ""),
              phone: itemPhone,
              panNumber: itemPan,
              loanAmount: Number(item.loanAmount || item.principal || 0),
              status: String(item.status || "New"),
              assignedTo: String(item.assignedTo || "Unassigned"),
              createdAt: String(item.createdAt || item.createdDate || ""),
              matchedReasons: reasons,
            });
          }
        }

        if (isMounted) {
          setDuplicates(matchedDuplicates);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load duplicate records");
          setLoading(false);
        }
      }
    };

    loadDuplicates();

    return () => {
      isMounted = false;
    };
  }, [isOpen, leadId]);


  if (!isOpen) return null;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);

  const formatDate = (val: string) => {
    if (!val) return "N/A";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return val;
    return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-amber-200 dark:border-amber-900/50 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md">
              <Copy className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                Duplicate Lead Records
                {!loading && (
                  <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-300">
                    {duplicates.length} {duplicates.length === 1 ? "Match" : "Matches"} Found
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                The CRM detected matching applicant information across multiple applications.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="max-h-[70vh] overflow-y-auto p-6 space-y-5">
          {/* Target Lead Info Summary */}
          {targetLead && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Selected Application Reference
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="font-semibold text-slate-900 dark:text-white truncate">{targetLead.name || "N/A"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="font-semibold text-slate-900 dark:text-white">{targetLead.phone || "N/A"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="font-semibold text-slate-900 dark:text-white">PAN: {targetLead.panNumber || "N/A"}</span>
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="py-12 text-center text-slate-500">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent mb-3" />
              <p className="text-sm font-medium">Scanning CRM for matching duplicate applications...</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertTriangle className="h-5 w-5 mb-1 text-rose-600 inline mr-2" />
              {error}
            </div>
          )}

          {!loading && !error && duplicates.length === 0 && (
            <div className="py-8 text-center text-slate-500">
              <p className="text-sm font-semibold">No other matching applications found in CRM.</p>
            </div>
          )}

          {!loading && duplicates.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Matching Duplicate Records ({duplicates.length})
              </p>

              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900 overflow-hidden shadow-xs">
                {duplicates.map((dup) => (
                  <div key={dup.rawId || dup.id} className="p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/leads/${encodeURIComponent(dup.id)}`}
                            onClick={onClose}
                            className="font-bold text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 text-sm"
                          >
                            {dup.id}
                          </Link>
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300 capitalize">
                            Status: {dup.status || "New"}
                          </span>
                          <span className="rounded-full bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                            Assigned: {dup.assignedTo || "Unassigned"}
                          </span>
                          {dup.matchedReasons.map((reason) => (
                            <span
                              key={reason}
                              className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-300 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-300"
                            >
                              <Copy className="h-2.5 w-2.5 text-amber-600" />
                              {reason}
                            </span>
                          ))}
                        </div>

                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-white">{dup.name}</span>
                            {dup.phone && <span className="ml-2">({dup.phone})</span>}
                          </div>
                          <div>
                            <Mail className="h-3 w-3 inline mr-1 text-slate-400" />
                            {dup.email || "No email"}
                          </div>
                          <div>
                            <span className="text-slate-400">PAN:</span> {dup.panNumber || "N/A"}
                          </div>
                          <div>
                            <span className="text-slate-400">Assigned To:</span> {dup.assignedTo || "Unassigned"}
                          </div>
                        </div>

                        <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                          <span>
                            Amount: <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(dup.loanAmount)}</strong>
                          </span>
                          <span>
                            Created: <strong className="text-slate-800 dark:text-slate-200">{formatDate(dup.createdAt)}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          to={`/leads/${encodeURIComponent(dup.id)}`}
                          onClick={onClose}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition shadow-xs"
                        >
                          View Details
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5 dark:border-slate-800 dark:bg-slate-900/80">
          {targetLead?.phone && onFilterByPhone ? (
            <button
              type="button"
              onClick={() => {
                onFilterByPhone(targetLead.phone);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 hover:underline"
            >
              <Search className="h-3.5 w-3.5" />
              Filter Workbench by Phone ({targetLead.phone})
            </button>
          ) : <div />}

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
