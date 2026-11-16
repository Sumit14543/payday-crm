import { useEffect, useState } from "react";
import { Building2, Camera, CreditCard, Download, Eye, FileText, Loader2, RefreshCw } from "lucide-react";
import { apiGet, apiGetDocumentBlob } from "../../lib/api";
import { CollectionAaStatements } from "./CollectionAaStatements";

type CollectionDocument = {
  id: number | string;
  documentKey: string;
  label: string;
  originalFileName: string;
  uploadedFile: string;
  mimeType?: string;
  uploadedAt?: string | null;
};

function DocumentPreview({ file }: { file: CollectionDocument }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setUrl("");
    setFailed(false);
    apiGetDocumentBlob(file.uploadedFile).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => {
      // Source websites may allow images to display without enabling CORS.
      if (active && /^https?:\/\//i.test(file.uploadedFile)) setUrl(file.uploadedFile);
      else if (active) setFailed(true);
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file.uploadedFile]);

  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
      {failed ? <FileText className="h-6 w-6 text-slate-400" /> : url ? <img src={url} alt={file.documentKey === "selfie" ? "Customer selfie" : `${file.label} preview`} referrerPolicy="no-referrer" className="h-full w-full object-contain" onError={() => setFailed(true)} /> : <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
    </div>
  );
}

const groups = [
  { title: "Bank statements", keys: ["bank_statement_last_6_months", "bank_statement_6_months"], Icon: Building2 },
  { title: "Company ID card", keys: ["company_id_card"], Icon: CreditCard },
  { title: "Customer selfie", keys: ["selfie"], Icon: Camera },
];

export function CollectionDocuments({ caseId }: { caseId: string }) {
  const [documents, setDocuments] = useState<CollectionDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [downloading, setDownloading] = useState<CollectionDocument["id"] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setDocuments([]);
    setError("");
    setLoading(true);
    apiGet<CollectionDocument[]>(`/collections/${encodeURIComponent(caseId)}/documents`, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setDocuments(data || []); })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load customer documents."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [caseId, refresh]);

  const viewDocument = async (file: CollectionDocument) => {
    setError("");
    try {
      const blob = await apiGetDocumentBlob(file.uploadedFile);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      if (/^https?:\/\//i.test(file.uploadedFile)) window.open(file.uploadedFile, "_blank", "noopener,noreferrer");
      else setError("Unable to open the document. Please try again.");
    }
  };

  const downloadDocument = async (file: CollectionDocument) => {
    setDownloading(file.id);
    setError("");
    try {
      const blob = await apiGetDocumentBlob(file.uploadedFile);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.originalFileName || "customer-document";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to download the document. Please try View to open it.");
    } finally { setDownloading(null); }
  };

  return (
    <section aria-label="Customer documents" className="rounded-xl border border-blue-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Customer documents</h3>
        <button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading} aria-label="Reload customer documents" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <CollectionAaStatements key={caseId} caseId={caseId} refresh={refresh} />
      {error && <p role="alert" className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {loading ? <p role="status" className="flex items-center gap-2 py-3 text-xs text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading customer documents...</p> : (
        <div className="space-y-5">
          {groups.map(({ title, keys, Icon }) => {
            const files = documents.filter((file) => keys.includes(file.documentKey));
            return (
              <div key={title}>
                <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200"><Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />{title}{files.length > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300">{files.length}</span>}</h4>
                <div className="space-y-2">
                  {files.map((file) => {
                    const date = file.uploadedAt ? new Date(file.uploadedAt) : null;
                    const isImage = file.mimeType?.startsWith("image/") || /^data:image\//i.test(file.uploadedFile) || /\.(jpe?g|png|webp)(?:$|[?#])/i.test(file.uploadedFile);
                    return (
                      <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-0">
                          {isImage ? <DocumentPreview file={file} /> : <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950 dark:text-blue-400"><FileText className="h-5 w-5" /></div>}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100" title={file.originalFileName}>{file.originalFileName || file.label}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{file.label}{date && !Number.isNaN(date.getTime()) ? ` · ${date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}</p>
                          </div>
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-2">
                          <button type="button" aria-label={`View ${file.label}`} onClick={() => void viewDocument(file)} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950"><Eye className="h-3.5 w-3.5" />View</button>
                          <button type="button" aria-label={`Download ${file.label}`} onClick={() => void downloadDocument(file)} disabled={downloading !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{downloading === file.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Download</button>
                        </div>
                      </div>
                    );
                  })}
                  {!files.length && !error && <p className="text-xs text-slate-500 dark:text-slate-400">No {title.toLowerCase()} uploaded for this customer.</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
