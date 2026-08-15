import type { ContentType, IntentMode } from "@/types";

export const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "event", label: "Events" },
  { id: "quote", label: "Quotes" },
  { id: "person_followup", label: "People" },
  { id: "place", label: "Places" },
  { id: "idea", label: "Ideas" },
  { id: "product", label: "Products" },
  { id: "knowledge", label: "Knowledge" },
] as const;

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

export function typeLabel(type?: ContentType | string | null) {
  if (!type) return "Other";
  if (type === "person_followup") return "People";
  return type.charAt(0).toUpperCase() + type.slice(1);
}
