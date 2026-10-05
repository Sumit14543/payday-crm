import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, LogOut, Trash2, X, ShieldAlert, Loader2 } from "lucide-react";

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  iconType?: "logout" | "delete" | "warning" | "shield";
  isLoading?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  iconType = "warning",
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const handleConfirm = async () => {
    await onConfirm();
  };

  const getIcon = () => {
    switch (iconType) {
      case "logout":
        return <LogOut className="w-6 h-6 text-red-500" />;
      case "delete":
        return <Trash2 className="w-6 h-6 text-red-500" />;
      case "shield":
        return <ShieldAlert className="w-6 h-6 text-amber-500" />;
      default:
        return <AlertTriangle className="w-6 h-6 text-amber-500" />;
    }
  };

  const getHeaderBg = () => {
    switch (variant) {
      case "danger":
        return "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400";
      case "warning":
        return "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400";
      default:
        return "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400";
    }
  };

  const getConfirmBtnStyle = () => {
    switch (variant) {
      case "danger":
        return "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-md shadow-red-500/25";
      case "warning":
        return "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-md shadow-amber-500/25";
      default:
        return "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-md shadow-indigo-500/25";
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", duration: 0.25 }}
          className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-10"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            disabled={isLoading}
            className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl border ${getHeaderBg()} shrink-0`}>
                {getIcon()}
              </div>
              <div className="space-y-1 pr-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                  {title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {description}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isLoading}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-1.5 ${getConfirmBtnStyle()} ${
                  isLoading ? "opacity-75 cursor-not-allowed" : ""
                }`}
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {confirmText}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
