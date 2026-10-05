import { type ReactNode } from "react";
import { CheckCircle2, Clock3, FileText, Phone, UserCircle2 } from "lucide-react";

type Tone = "default" | "info" | "success" | "warning" | "danger" | "muted" | "purple" | "teal";

const toneClasses: Record<Tone, string> = {
  danger: "crm-tone-danger",
  default: "crm-tone-default",
  info: "crm-tone-info",
  muted: "crm-tone-muted",
  purple: "crm-tone-purple",
  success: "crm-tone-success",
  teal: "crm-tone-teal",
  warning: "crm-tone-warning",
};

export function Sparkline({ tone = "info" }: { tone?: Tone }) {
  return (
    <svg viewBox="0 0 120 32" className={`h-8 w-24 ${toneClasses[tone]}`} aria-hidden="true">
      <path
        d="M2 24 C16 18 22 21 34 14 C48 6 58 18 70 11 C82 5 91 13 101 8 C109 4 115 5 118 3"
        className="sparkline-path"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

export function MetricCard({
  accent = "info",
  children,
  metric,
  note,
  title,
  trend,
}: {
  accent?: Tone;
  children?: ReactNode;
  metric: ReactNode;
  note?: string;
  title: string;
  trend?: string;
}) {
  return (
    <section className={`crm-metric-card group relative overflow-hidden ${toneClasses[accent]}`}>
      {/* Top-Right Soft Warm Golden Aura Glow */}
      <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br from-amber-200/60 via-purple-200/35 to-transparent dark:from-amber-500/20 dark:via-purple-600/20 blur-xl pointer-events-none group-hover:scale-125 transition-transform duration-500" />
      <div className="relative z-10 min-w-0">
        <p className="crm-meta">{title}</p>
        <div className="mt-1.5 text-2xl font-semibold tracking-normal text-foreground">{metric}</div>
        {note && <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{note}</p>}
      </div>
      <div className="relative z-10 mt-3 flex items-center justify-between gap-3">
        {trend && <span className="crm-trend">{trend}</span>}
        {children}
      </div>
    </section>
  );
}

export function InsightCard({
  icon,
  label,
  tone = "info",
}: {
  icon?: ReactNode;
  label: string;
  tone?: Tone;
}) {
  return (
    <div className={`crm-insight-card ${toneClasses[tone]}`}>
      <span className="crm-insight-icon">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

export function StatusBadge({ children, tone = "default" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`crm-badge ${toneClasses[tone]}`}>{children}</span>;
}

export function PriorityBadge({ priority }: { priority?: string }) {
  const value = String(priority || "Low");
  const tone: Tone = value === "High" || value === "Urgent" ? "danger" : value === "Medium" ? "warning" : "success";
  return <StatusBadge tone={tone}>{value}</StatusBadge>;
}

export function ProgressIndicator({
  label,
  total,
  value,
}: {
  label?: string;
  total: number;
  value: number;
}) {
  const percent = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  const tone: Tone = total > 0 && value >= total ? "success" : value > 0 ? "warning" : "danger";

  return (
    <div className="min-w-[96px]">
      <div className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
        <span>{value}/{total}</span>
        {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-muted">
        <div className={`h-full rounded-full ${toneClasses[tone]}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function FilterChip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <button type="button" onClick={onRemove} className="crm-filter-chip">
      <span>{children}</span>
      <span aria-hidden="true">x</span>
    </button>
  );
}

export function EmptyState({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileText className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SkeletonLoader({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} />;
}

export function Avatar({ imageUrl, name, size = "md" }: { imageUrl?: string; name?: string; size?: "sm" | "md" }) {
  const initials = String(name || "NA")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "NA";

  return (
    <span className={`crm-avatar overflow-hidden ${size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs"}`}>
      {imageUrl ? (
        <img src={imageUrl} alt={name ? `${name} profile` : "Profile"} className="h-full w-full object-cover" />
      ) : initials}
    </span>
  );
}

export function ActivityTimeline({
  items,
}: {
  items: Array<{ detail: string; icon?: ReactNode; title: string }>;
}) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={`${item.title}-${index}`} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
              {item.icon || <Clock3 className="h-4 w-4" />}
            </div>
            {index < items.length - 1 && <div className="mt-2 h-full w-px bg-border" />}
          </div>
          <div className="min-w-0 pb-2">
            <p className="text-sm font-semibold text-foreground">{item.title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export const timelineIcons = {
  call: <Phone className="h-4 w-4" />,
  check: <CheckCircle2 className="h-4 w-4" />,
  user: <UserCircle2 className="h-4 w-4" />,
};
