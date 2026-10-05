import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileText,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  X,
  Sparkles,
  LayoutGrid,
  List
} from "lucide-react";

// Mock Documents Data
const initialDocs = [
  { id: "DOC-101", customerName: "Rahul Sharma", type: "PAN Card", file: "PAN Card Image", format: "image", ocrStatus: "Success", ocrConfidence: "98%", status: "Verified", date: "2026-07-15" },
  { id: "DOC-102", customerName: "Rahul Sharma", type: "Aadhaar Card Front", file: "Aadhaar Card Front Image", format: "image", ocrStatus: "Success", ocrConfidence: "95%", status: "Verified", date: "2026-07-15" },
  { id: "DOC-103", customerName: "Amit Patel", type: "Salary slip (June)", file: "Salary Slip PDF", format: "pdf", ocrStatus: "Pending", ocrConfidence: "N/A", status: "Pending", date: "2026-07-14" },
  { id: "DOC-104", customerName: "Pooja Hegde", type: "Bank Statement (3 Mos)", file: "Bank Statement PDF", format: "pdf", ocrStatus: "Success", ocrConfidence: "92%", status: "Pending", date: "2026-07-13" },
];

export function Documents() {
  const [docs, setDocs] = useState(initialDocs);
  const [viewMode, setViewMode] = useState<"gallery" | "list">("gallery");
  const [selectedDoc, setSelectedDoc] = useState<typeof initialDocs[0] | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleApprove = (id: string) => {
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: "Verified" } : d))
    );
    setSelectedDoc(null);
  };

  const handleReject = (id: string) => {
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: "Rejected" } : d))
    );
    setSelectedDoc(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Documents Verification Desk</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-1.5">Review OCR classifications, metadata, and verify file uploads.</p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-xl shrink-0">
          <button
            onClick={() => setViewMode("gallery")}
            className={`p-1.5 rounded-lg transition ${viewMode === "gallery" ? "bg-white dark:bg-slate-800 text-indigo-650 shadow-sm" : "text-slate-400"}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-lg transition ${viewMode === "list" ? "bg-white dark:bg-slate-800 text-indigo-650 shadow-sm" : "text-slate-400"}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid view */}
      {viewMode === "gallery" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {docs.map((doc) => (
            <div
              key={doc.id}
              onClick={() => {
                setSelectedDoc(doc);
                setZoom(1);
                setRotation(0);
              }}
              className="p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300 group cursor-pointer flex flex-col justify-between"
            >
              
              {/* Card visual mockup */}
              <div className="h-32 bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center justify-center relative overflow-hidden shrink-0">
                <FileText className="w-8 h-8 text-slate-400 group-hover:scale-110 transition-transform duration-300 animate-pulse" />
                <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {doc.format}
                </span>
              </div>

              {/* Card text details */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-[9px] font-black text-slate-400">
                  <span>{doc.id}</span>
                  <span className={`px-1.5 py-0.5 rounded-full ${
                    doc.status === "Verified" ? "bg-emerald-50 text-emerald-650 dark:bg-emerald-950/20" : "bg-amber-50 text-amber-600 dark:bg-amber-950/20"
                  }`}>
                    {doc.status}
                  </span>
                </div>
                <h4 className="text-[11px] font-black text-slate-800 dark:text-slate-200 mt-1 leading-none">{doc.type}</h4>
                <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold mt-1.5">{doc.customerName}</p>
              </div>

            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  <th className="px-5 py-4">ID</th>
                  <th className="px-5 py-4">Customer Name</th>
                  <th className="px-5 py-4">Document Type</th>
                  <th className="px-5 py-4">OCR Status</th>
                  <th className="px-5 py-4">Confidence</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800/50 transition">
                    <td className="px-5 py-4 text-xs font-black text-indigo-600 dark:text-indigo-400">{doc.id}</td>
                    <td className="px-5 py-4 text-xs font-bold text-slate-800 dark:text-slate-200">{doc.customerName}</td>
                    <td className="px-5 py-4 text-xs font-bold text-slate-700 dark:text-slate-300">{doc.type}</td>
                    <td className="px-5 py-4 text-xs font-semibold">{doc.ocrStatus}</td>
                    <td className="px-5 py-4 text-xs font-semibold">{doc.ocrConfidence}</td>
                    <td className="px-5 py-4">
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                        doc.status === "Verified" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20" : "bg-amber-50 text-amber-600 dark:bg-amber-950/20"
                      }`}>
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        onClick={() => setSelectedDoc(doc)}
                        className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-800 dark:hover:text-white transition"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Document Preview Drawer / Modal */}
      <AnimatePresence>
        {selectedDoc && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDoc(null)}
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="fixed inset-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl p-6 z-[60] flex flex-col justify-between"
            >
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-800 dark:text-white leading-none">{selectedDoc.type}</h3>
                  <span className="text-[10px] text-slate-400 font-bold mt-1.5 block">Uploaded for {selectedDoc.customerName} ({selectedDoc.id})</span>
                </div>
                
                {/* Control Toggles: Zoom In/Out, Rotate, Close */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setZoom((prev) => Math.min(prev + 0.2, 2.5))}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4.5 h-4.5" />
                  </button>
                  <button
                    onClick={() => setZoom((prev) => Math.max(prev - 0.2, 0.5))}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4.5 h-4.5" />
                  </button>
                  <button
                    onClick={() => setRotation((prev) => prev + 90)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    title="Rotate 90°"
                  >
                    <RotateCw className="w-4.5 h-4.5" />
                  </button>
                  <button onClick={() => setSelectedDoc(null)} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Visual Document Canvas area */}
              <div className="flex-1 my-6 bg-slate-50 dark:bg-slate-950/20 border border-slate-200/50 dark:border-slate-800 rounded-2xl overflow-hidden flex items-center justify-center relative">
                <motion.div
                  style={{ scale: zoom, rotate: rotation }}
                  className="w-72 h-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg flex flex-col items-center justify-center p-4 cursor-grab"
                >
                  <FileText className="w-12 h-12 text-indigo-500 mb-2 animate-pulse" />
                  <span className="text-[10px] font-black text-slate-550 dark:text-slate-350 uppercase tracking-widest leading-none">{selectedDoc.file}</span>
                  <span className="text-[8px] text-slate-400 mt-3 font-bold select-none leading-none">OCR CONFIDENCE: {selectedDoc.ocrConfidence}</span>
                </motion.div>
              </div>

              {/* Action operations: Approve / Reject / Download */}
              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4 shrink-0">
                <button className="inline-flex h-10 items-center gap-1.5 px-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer">
                  <Download className="w-4 h-4 text-slate-400" />
                  <span>Download file</span>
                </button>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReject(selectedDoc.id)}
                    className="inline-flex h-10 items-center gap-1.5 px-4 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-955/20 dark:text-rose-400 text-xs font-bold hover:bg-rose-100/50 transition cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject</span>
                  </button>
                  <button
                    onClick={() => handleApprove(selectedDoc.id)}
                    className="inline-flex h-10 items-center gap-1.5 px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 transition cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Approve Document</span>
                  </button>
                </div>
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
