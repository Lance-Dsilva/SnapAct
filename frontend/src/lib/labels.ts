import type { ContentType, IntentMode } from "@/types";

/** Filter chips, in the order they appear on Home. */
export const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "event", label: "Events" },
  { id: "task", label: "To do" },
  { id: "place", label: "Places" },
  { id: "product", label: "Products" },
  { id: "person", label: "People" },
  { id: "quote", label: "Quotes" },
  { id: "knowledge", label: "Knowledge" },
  { id: "idea", label: "Ideas" },
  { id: "media", label: "Media" },
  { id: "message", label: "Conversations" },
  { id: "job", label: "Jobs" },
  { id: "document", label: "Documents" },
  { id: "receipt", label: "Receipts" },
  { id: "app_ui", label: "App screens" },
  { id: "other", label: "Other" },
];

const LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
);

export function typeLabel(type?: ContentType | string | null) {
  if (!type) return "Other";
  return LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

export function intentColor(intent?: IntentMode | string | null) {
  switch (intent) {
    case "ACT":
      return "bg-teal-50 text-teal-800 border-teal-200";
    case "EXPLORE":
      return "bg-sky-50 text-sky-800 border-sky-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

export function urgencyColor(urgency?: string | null) {
  switch (urgency) {
    case "high":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "medium":
      return "bg-amber-50 text-amber-800 border-amber-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

/** "Overdue by 2 days" / "Due today" / "in 3 days" — dates users can act on. */
export function relativeDay(ymd?: string | null): string {
  if (!ymd) return "";
  const target = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(target.getTime())) return ymd;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400_000);

  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days < -1) return `${Math.abs(days)} days ago`;
  if (days <= 7) return `in ${days} days`;
  return target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
