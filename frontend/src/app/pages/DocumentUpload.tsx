import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { AlertCircle, Camera, CheckCircle2, Circle, Eye, FileText, FileUp, ImageIcon, Loader2, MessageCircle, Phone, RotateCcw, ShieldCheck, Square, Video, X } from "lucide-react";
import { apiGet, apiPostForm } from "../lib/api";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog";

type DocumentUploadItem = {
  id: number;
  documentKey: string;
  label: string;
  status: string;
  uploadedFile: string;
  originalFileName: string;
  uploadedAt: string | null;
};

type DocumentUploadRequest = {
  token: string;
  applicationId: string;
  customerName: string;
  phone: string;
  email: string;
  loanAmount: number;
  status: string;
  expired: boolean;
  completed: boolean;
  expiresAt: string;
  requests: DocumentUploadItem[];
};

type ImagePreview = {
  id: number;
  label: string;
  name: string;
  size: number;
  type: string;
  url: string;
};

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const isImageFile = (file?: File | null) => Boolean(file?.type.startsWith("image/"));
const isVideoFile = (file?: File | null) => Boolean(file?.type.startsWith("video/"));
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
  "application/pdf",
  "application/octet-stream",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);
const ALLOWED_UPLOAD_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "webp"]);
const supportPhone = String(import.meta.env.VITE_SUPPORT_PHONE || "+919217086608").trim();
const supportWhatsApp = String(import.meta.env.VITE_SUPPORT_WHATSAPP || supportPhone).replace(/\D/g, "");

const formatDate = (value?: string) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

export function DocumentUpload() {
  const { token } = useParams();
  const [request, setRequest] = useState<DocumentUploadRequest | null>(null);
  const [files, setFiles] = useState<Record<number, File | null>>({});
  const [activePreview, setActivePreview] = useState<ImagePreview | null>(null);
  const activePreviewUrlRef = useRef("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  // Video recording states and refs
  const [isRecordingMode, setIsRecordingMode] = useState(false);
  const [recordingItemId, setRecordingItemId] = useState<number | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string>("");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<number | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  const isWebcamSupported = useMemo(() => Boolean(
    navigator.mediaDevices && 
    navigator.mediaDevices.getUserMedia && 
    window.MediaRecorder
  ), []);

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const startCamera = async (itemId: number) => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true
      });
      setStream(mediaStream);
      setRecordingItemId(itemId);
      setIsRecordingMode(true);
      setRecordedBlobUrl("");
      setRecordedBlob(null);
      setIsRecording(false);
      setRecordingDuration(0);
    } catch (err) {
      console.error("Error accessing camera:", err);
      toast.error("Unable to access camera or microphone. Please check permissions or upload a video file instead.");
    }
  };

  const startRecording = () => {
    if (!stream) return;
    const chunks: Blob[] = [];
    
    let options = {};
    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) {
      options = { mimeType: "video/webm;codecs=vp8,opus" };
    } else if (MediaRecorder.isTypeSupported("video/mp4")) {
      options = { mimeType: "video/mp4" };
    }
    
    try {
      const recorder = new MediaRecorder(stream, options);
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedBlobUrl(url);
        setIsRecording(false);
        
        // Stop all tracks to turn off camera light
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
          setStream(null);
        }
      };
      
      setMediaRecorder(recorder);
      recorder.start(10);
      setIsRecording(true);
      setRecordingDuration(0);
      
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev >= 30) {
            recorder.stop();
            if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Error starting recorder:", err);
      toast.error("Failed to start recording. Please try uploading a video file.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
  };

  const closeRecorder = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    setIsRecordingMode(false);
    setRecordingItemId(null);
    setRecordedBlobUrl("");
    setRecordedBlob(null);
  };

  const saveRecordedVideo = () => {
    if (!recordedBlob || recordingItemId === null) return;
    const extension = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
    const file = new File([recordedBlob], `video_kyc.${extension}`, {
      type: recordedBlob.type || `video/${extension}`
    });
    setDocumentFile(recordingItemId, file);
    closeRecorder();
  };

  useEffect(() => {
    if (stream && videoPreviewRef.current && isRecordingMode && !recordedBlobUrl) {
      videoPreviewRef.current.srcObject = stream;
    }
  }, [stream, isRecordingMode, recordedBlobUrl]);

  useEffect(() => {
    return () => {
      if (recordedBlobUrl) {
        URL.revokeObjectURL(recordedBlobUrl);
      }
    };
  }, [recordedBlobUrl]);

  useEffect(() => {
    const root = document.getElementById("root");
    const previous = {
      bodyHeight: document.body.style.height,
      bodyOverflow: document.body.style.overflow,
      htmlHeight: document.documentElement.style.height,
      htmlOverflow: document.documentElement.style.overflow,
      rootHeight: root?.style.height || "",
      rootOverflow: root?.style.overflow || "",
    };

    document.documentElement.style.height = "auto";
    document.documentElement.style.overflow = "auto";
    document.body.style.height = "auto";
    document.body.style.overflow = "auto";
    if (root) {
      root.style.height = "auto";
      root.style.overflow = "visible";
    }

    return () => {
      document.documentElement.style.height = previous.htmlHeight;
      document.documentElement.style.overflow = previous.htmlOverflow;
      document.body.style.height = previous.bodyHeight;
      document.body.style.overflow = previous.bodyOverflow;
      if (root) {
        root.style.height = previous.rootHeight;
        root.style.overflow = previous.rootOverflow;
      }
    };
  }, []);

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    setIsLoading(true);
    setError("");

    apiGet<DocumentUploadRequest>(`/document-upload/${encodeURIComponent(token)}`, controller.signal)
      .then(setRequest)
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : "Unable to load document request");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [token]);

  useEffect(() => () => {
    if (activePreviewUrlRef.current) URL.revokeObjectURL(activePreviewUrlRef.current);
  }, []);

  const pendingRequests = useMemo(
    () => request?.requests.filter((item) => item.status !== "uploaded") || [],
    [request],
  );
  const selectedFilesCount = pendingRequests.filter((item) => Boolean(files[item.id])).length;
  const allPendingFilesSelected = pendingRequests.length > 0 && pendingRequests.every((item) => Boolean(files[item.id]));

  const validateFile = (file: File, documentKey?: string) => {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (documentKey === "video_kyc" || file.type.startsWith("video/")) {
      const allowedVideoTypes = new Set([
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "video/3gpp",
        "video/x-matroska",
        "video/ogg"
      ]);
      const allowedVideoExtensions = new Set(["mp4", "webm", "mov", "3gp", "mkv", "ogg"]);
      if (!allowedVideoTypes.has(file.type) && !allowedVideoExtensions.has(extension)) {
        return "Only MP4, WEBM, MOV, or 3GP video files are allowed.";
      }
    } else {
      if (!ALLOWED_UPLOAD_TYPES.has(file.type) && !ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
        return "Only PDF, PNG, JPG, JPEG, or WEBP files are allowed.";
      }
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return `${file.name} is ${formatBytes(file.size)}. Each file must be 10 MB or smaller.`;
    }
    return "";
  };

  const setDocumentFile = (id: number, file: File | null) => {
    if (file) {
      const item = request?.requests.find((r) => r.id === id);
      const validationError = validateFile(file, item?.documentKey);
      if (validationError) {
        setError(validationError);
        toast.error(validationError);
        return;
      }
    }

    setError("");
    setFiles((currentFiles) => ({ ...currentFiles, [id]: file }));
    if (activePreview?.id === id) {
      setActivePreview(null);
      if (activePreviewUrlRef.current) {
        URL.revokeObjectURL(activePreviewUrlRef.current);
        activePreviewUrlRef.current = "";
      }
    }
  };

  const openImagePreview = (item: DocumentUploadItem, file: File) => {
    if (activePreviewUrlRef.current) URL.revokeObjectURL(activePreviewUrlRef.current);
    const url = URL.createObjectURL(file);
    activePreviewUrlRef.current = url;
    setActivePreview({
      id: item.id,
      label: item.label,
      name: file.name,
      size: file.size,
      type: file.type || "image",
      url,
    });
  };

  const closeImagePreview = () => {
    setActivePreview(null);
    if (activePreviewUrlRef.current) {
      URL.revokeObjectURL(activePreviewUrlRef.current);
      activePreviewUrlRef.current = "";
    }
  };

  const submitUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !request || !allPendingFilesSelected) return;

    const invalidItem = pendingRequests.find((item) => {
      const file = files[item.id];
      return file && Boolean(validateFile(file, item.documentKey));
    });

    if (invalidItem) {
      const file = files[invalidItem.id]!;
      const validationError = validateFile(file, invalidItem.documentKey);
      setError(validationError);
      toast.error(validationError);
      return;
    }

    try {
      setIsUploading(true);
      setError("");
      const body = new FormData();
      pendingRequests.forEach((item) => {
        const file = files[item.id];
        if (file) {
          body.append(`document_${item.id}`, file);
        }
      });
      const updatedRequest = await apiPostForm<DocumentUploadRequest>(`/document-upload/${encodeURIComponent(token)}`, body);
      setRequest(updatedRequest);
      setFiles({});
      if (activePreviewUrlRef.current) URL.revokeObjectURL(activePreviewUrlRef.current);
      activePreviewUrlRef.current = "";
      setActivePreview(null);
      toast.success("Documents uploaded successfully");
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Unable to upload documents";
      setError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-dvh overflow-x-hidden bg-slate-50 px-3 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto min-w-0 max-w-full pb-4 sm:max-w-6xl">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                <FileUp className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-950 sm:text-xl">Upload Requested Documents</h1>
                <p className="text-sm text-slate-500">Secure document upload for your loan application</p>
              </div>
            </div>
            {request && !request.expired && !request.completed && (
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <span className="font-semibold text-slate-950">{selectedFilesCount}</span> of{" "}
                <span className="font-semibold text-slate-950">{pendingRequests.length}</span> selected
              </div>
            )}
          </div>

          <div className="p-4 sm:p-5">
            {isLoading && (
              <div className="flex items-center gap-2 rounded-md bg-slate-50 px-4 py-5 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading upload request...
              </div>
            )}

            {!isLoading && error && (
              <div className="mb-4 flex gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {!isLoading && request && (
              <div className="space-y-3">
                {request.expired || request.completed ? (
                  <div className={`rounded-lg border p-4 ${
                    request.completed ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
                  }`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                          request.completed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {request.completed ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                        </div>
                        <div>
                          <h2 className={`text-base font-semibold ${request.completed ? "text-green-950" : "text-amber-950"}`}>
                            {request.completed ? "Documents uploaded" : "Upload link expired"}
                          </h2>
                          <p className={`mt-1 text-sm ${request.completed ? "text-green-800" : "text-amber-800"}`}>
                            {request.completed
                              ? "All requested documents have been uploaded. This link is now closed."
                              : "Please ask the loan team for a fresh upload link."}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        {supportWhatsApp && (
                          <a
                            href={`https://wa.me/${supportWhatsApp}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700"
                          >
                            <MessageCircle className="h-4 w-4" />
                            WhatsApp
                          </a>
                        )}
                        {supportPhone && (
                          <a
                            href={`tel:${supportPhone}`}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Phone className="h-4 w-4" />
                            Call
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-slate-500">Applicant</p>
                    <p className="truncate text-sm font-semibold text-slate-950">{request.customerName || "Customer"}</p>
                    <p className="truncate text-xs text-slate-500">{request.phone || request.email || "Contact details not available"}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-slate-500">Application ID</p>
                    <p className="truncate text-sm font-semibold text-slate-950">{request.applicationId || "Not available"}</p>
                    <p className="truncate text-xs text-slate-500">Valid until {formatDate(request.expiresAt)}</p>
                  </div>
                  <div className="rounded-md bg-white px-3 py-2">
                    <p className="text-xs text-slate-500">Requested</p>
                    <p className="text-lg font-semibold text-slate-950">{request.requests.length}</p>
                  </div>
                  <div className="rounded-md bg-white px-3 py-2">
                    <p className="text-xs text-slate-500">Pending</p>
                    <p className="text-lg font-semibold text-slate-950">{pendingRequests.length}</p>
                  </div>
                </div>

                {!request.expired && !request.completed && (
                  <div className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-800 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Upload PDF or clear image files only. Each file can be up to 10 MB. This secure link closes after submission.</span>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <a
                        href={`https://wa.me/${supportWhatsApp}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-green-600 px-3 text-xs font-semibold text-white hover:bg-green-700"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
                      </a>
                      <a
                        href={`tel:${supportPhone}`}
                        className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        Call
                      </a>
                    </div>
                  </div>
                )}

                <main>
                  {request.expired || request.completed ? (
                    null
                  ) : (
                    <form onSubmit={submitUpload} className="space-y-3">
                      <div className="grid gap-3 xl:grid-cols-2">
                        {request.requests.map((item) => {
                          const selectedFile = files[item.id];
                          const canPreview = isImageFile(selectedFile) || isVideoFile(selectedFile);

                          return (
                            <div key={item.id} className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0 flex-1 basis-40">
                                  <p className="text-xs font-semibold uppercase text-slate-500">Requested document</p>
                                  <p className="mt-1 break-words font-semibold text-slate-950">{item.label}</p>
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  item.status === "uploaded" ? "bg-green-100 text-green-800" : selectedFile ? "bg-blue-100 text-blue-800" : "bg-yellow-100 text-yellow-800"
                                }`}>
                                  {item.status === "uploaded" ? "Uploaded" : selectedFile ? "Ready" : "Pending"}
                                </span>
                              </div>

                              {item.status === "uploaded" ? (
                                <div className="mt-3 flex items-center gap-3 rounded-md bg-green-50 px-3 py-2.5 text-sm text-green-800">
                                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                                  <span className="truncate">{item.originalFileName || "Document already uploaded"}</span>
                                </div>
                              ) : selectedFile ? (
                                <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
                                  <div className="flex min-w-0 gap-3 p-2.5">
                                    <button
                                      type="button"
                                      onClick={() => canPreview && openImagePreview(item, selectedFile)}
                                      disabled={!canPreview}
                                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-slate-100 disabled:cursor-default"
                                      aria-label={canPreview ? `Preview ${item.label}` : undefined}
                                    >
                                      {isImageFile(selectedFile) ? (
                                        <ImageIcon className="h-6 w-6 text-slate-500" />
                                      ) : isVideoFile(selectedFile) ? (
                                        <Video className="h-6 w-6 text-blue-600" />
                                      ) : (
                                        <FileText className="h-6 w-6 text-blue-600" />
                                      )}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                      <p className="break-all text-sm font-semibold leading-5 text-slate-950">{selectedFile.name}</p>
                                      <p className="mt-1 break-words text-xs text-slate-500">{formatBytes(selectedFile.size)} - {selectedFile.type || "Selected file"}</p>
                                      {canPreview && (
                                        <button
                                          type="button"
                                          onClick={() => openImagePreview(item, selectedFile)}
                                          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
                                        >
                                          <Eye className="h-3.5 w-3.5" />
                                          Preview
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => setDocumentFile(item.id, null)}
                                        className={`${canPreview ? "ml-3 mt-1" : "mt-2"} inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-red-600`}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-3 flex flex-col gap-2">
                                  {item.documentKey === "video_kyc" && isWebcamSupported && (
                                    <button
                                      type="button"
                                      onClick={() => startCamera(item.id)}
                                      className="flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition"
                                    >
                                      <Camera className="h-5 w-5" />
                                      Record Video KYC
                                    </button>
                                  )}
                                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center hover:border-blue-300 hover:bg-blue-50">
                                    <FileUp className="h-6 w-6 text-blue-600" />
                                    <span className="mt-2 text-sm font-semibold text-slate-950">
                                      {item.documentKey === "video_kyc" ? "Choose Video File" : "Choose file"}
                                    </span>
                                    <span className="mt-1 text-xs text-slate-500">
                                      {item.documentKey === "video_kyc"
                                        ? "MP4, WEBM, MOV or 3GP up to 10 MB"
                                        : "PDF, PNG, JPG or WEBP up to 10 MB"}
                                    </span>
                                    <input
                                      type="file"
                                      accept={item.documentKey === "video_kyc" ? "video/*" : "application/pdf,image/png,image/jpeg,image/jpg,image/webp"}
                                      onChange={(event) => setDocumentFile(item.id, event.target.files?.[0] || null)}
                                      className="sr-only"
                                    />
                                  </label>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                        <button
                          type="submit"
                          disabled={!allPendingFilesSelected || isUploading}
                          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
                          {isUploading ? "Uploading..." : `Upload ${pendingRequests.length} Document${pendingRequests.length === 1 ? "" : "s"}`}
                        </button>
                      </div>
                    </form>
                  )}
                </main>
              </div>
            )}
          </div>
        </div>
      </div>
      <Dialog open={Boolean(activePreview)} onOpenChange={(open) => !open && closeImagePreview()}>
        <DialogContent className="max-h-[92vh] max-w-[min(96vw,1100px)] gap-3 overflow-hidden border-slate-700 bg-slate-950 p-0 text-white sm:max-w-[min(96vw,1100px)]">
          <div className="border-b border-white/10 px-4 py-3 pr-12">
            <DialogTitle className="truncate text-base text-white">{activePreview?.label || "Image Preview"}</DialogTitle>
            <DialogDescription className="mt-1 truncate text-xs text-slate-300">
              {activePreview ? `${activePreview.name} - ${formatBytes(activePreview.size)} - ${activePreview.type}` : ""}
            </DialogDescription>
          </div>
          <div className="flex max-h-[calc(92vh-76px)] items-center justify-center overflow-auto bg-slate-950 p-3">
            {activePreview && (
              activePreview.type.startsWith("video/") ? (
                <video
                  src={activePreview.url}
                  controls
                  autoPlay
                  className="max-h-[calc(92vh-104px)] w-auto max-w-full rounded-md object-contain"
                />
              ) : (
                <img
                  src={activePreview.url}
                  alt={`${activePreview.label} full preview`}
                  className="max-h-[calc(92vh-104px)] w-auto max-w-full rounded-md object-contain"
                />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>

      {isRecordingMode && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white p-4">
          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-between py-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h2 className="text-lg font-semibold text-white">Video KYC Recorder</h2>
              <button
                type="button"
                onClick={closeRecorder}
                className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative my-6 flex flex-1 items-center justify-center overflow-hidden rounded-lg bg-black">
              {!recordedBlobUrl ? (
                <>
                  <video
                    ref={videoPreviewRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover transform -scale-x-100"
                  />
                  {isRecording && (
                    <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1.5 text-xs font-semibold tracking-wider">
                      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
                      REC {formatTime(recordingDuration)} / 00:30
                    </div>
                  )}
                  {!isRecording && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-4 text-center">
                      <p className="text-sm font-medium text-slate-200">
                        Position your face inside the screen. Speak clearly and show your original PAN Card and Aadhaar Card.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <video
                  src={recordedBlobUrl}
                  controls
                  playsInline
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            <div className="flex flex-col gap-4 border-t border-white/10 pt-4">
              {!recordedBlobUrl ? (
                <div className="flex justify-center gap-4">
                  {!isRecording ? (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700 active:scale-95 transition"
                      aria-label="Start recording"
                    >
                      <Circle className="h-6 w-6 fill-current animate-pulse text-white" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-red-600 shadow-lg hover:bg-slate-100 active:scale-95 transition"
                      aria-label="Stop recording"
                    >
                      <Square className="h-6 w-6 fill-current" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => startCamera(recordingItemId!)}
                    className="inline-flex h-11 items-center gap-2 rounded-md bg-white/10 px-4 text-sm font-semibold hover:bg-white/20 text-white"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retake
                  </button>
                  <button
                    type="button"
                    onClick={saveRecordedVideo}
                    className="inline-flex h-11 items-center gap-2 rounded-md bg-blue-600 px-6 text-sm font-semibold hover:bg-blue-700 text-white"
                  >
                    Use Video
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
