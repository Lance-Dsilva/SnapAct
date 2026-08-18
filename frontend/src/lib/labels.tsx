import type { ComponentType, SVGProps } from "react";
import {
  IconBolt,
  IconBookmark,
  IconBox,
  IconBriefcase,
  IconBulb,
  IconCalendar,
  IconChat,
  IconCheckCircle,
  IconCompass,
  IconDoc,
  IconMedia,
  IconPerson,
  IconPhone,
  IconPin,
  IconQuote,
  IconReceipt,
} from "@/components/Icons";
import type { ContentType, IntentMode } from "@/types";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface TypeStyle {
  label: string;
  /** Plural, for filter chips and section headings. */
  plural: string;
  Icon: Icon;
  /** Category eyebrow on a card: text colour. */
  text: string;
  /** Tinted surface for icon badges. */
  tint: string;
}

/**
 * One place that decides how a content type looks. Colour carries meaning here —
 * the eyebrow on a card and its chip in the filter row always match.
 */
export const TYPE_STYLES: Record<ContentType, TypeStyle> = {
  event: { label: "Event", plural: "Events", Icon: IconCalendar, text: "#2563eb", tint: "#eff4ff" },
  place: { label: "Place", plural: "Places", Icon: IconPin, text: "#0d9488", tint: "#effcf9" },
  product: { label: "Product", plural: "Products", Icon: IconBox, text: "#c2410c", tint: "#fff4ed" },
  person: { label: "Person", plural: "People", Icon: IconPerson, text: "#be185d", tint: "#fdf2f8" },
  job: { label: "Job", plural: "Jobs", Icon: IconBriefcase, text: "#2563eb", tint: "#eff4ff" },
  quote: { label: "Quote", plural: "Quotes", Icon: IconQuote, text: "#b45309", tint: "#fffaeb" },
  knowledge: { label: "Knowledge", plural: "Knowledge", Icon: IconBulb, text: "#0369a1", tint: "#f0f8ff" },
  idea: { label: "Idea", plural: "Ideas", Icon: IconBulb, text: "#7c3aed", tint: "#f6f3ff" },
  task: { label: "To do", plural: "To do", Icon: IconCheckCircle, text: "#4338ca", tint: "#eef2ff" },
  message: { label: "Conversation", plural: "Conversations", Icon: IconChat, text: "#059669", tint: "#ecfdf5" },
  media: { label: "Media", plural: "Media", Icon: IconMedia, text: "#7c3aed", tint: "#f6f3ff" },
  document: { label: "Document", plural: "Documents", Icon: IconDoc, text: "#475569", tint: "#f4f6f9" },
  receipt: { label: "Receipt", plural: "Receipts", Icon: IconReceipt, text: "#475569", tint: "#f4f6f9" },
  app_ui: { label: "App screen", plural: "App screens", Icon: IconPhone, text: "#2563eb", tint: "#eff4ff" },
  other: { label: "Other", plural: "Other", Icon: IconDoc, text: "#64748b", tint: "#f4f6f9" },
};

export function typeStyle(type?: ContentType | string | null): TypeStyle {
  return TYPE_STYLES[(type as ContentType) ?? "other"] ?? TYPE_STYLES.other;
}

export function typeLabel(type?: ContentType | string | null) {
  return typeStyle(type).label;
}

export interface IntentStyle {
  label: string;
  Icon: Icon;
  className: string;
}

/** Sentence case, because these read as verbs to the user, not enum values. */
export const INTENT_STYLES: Record<IntentMode, IntentStyle> = {
  REMEMBER: {
    label: "Remember",
    Icon: IconBookmark,
    className: "bg-violet-50 text-violet-700",
  },
  EXPLORE: {
    label: "Explore",
    Icon: IconCompass,
    className: "bg-emerald-50 text-emerald-700",
  },
  ACT: {
    label: "Act",
    Icon: IconBolt,
    className: "bg-indigo-50 text-indigo-700",
  },
};

export function intentStyle(intent?: IntentMode | string | null): IntentStyle {
  return INTENT_STYLES[(intent as IntentMode) ?? "REMEMBER"] ?? INTENT_STYLES.REMEMBER;
}

/* ------------------------------------------------------------------- dates */

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysFromToday(ymd: string) {
  const target = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((startOfDay(target).getTime() - startOfDay(new Date()).getTime()) / 86400_000);
}

/** "today" / "in 3 days" / "2 days ago" — dates a person can act on. */
export function relativeDay(ymd?: string | null): string {
  if (!ymd) return "";
  const days = daysFromToday(ymd);
  if (days === null) return ymd;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days < -1) return `${Math.abs(days)} days ago`;
  if (days <= 10) return `in ${days} days`;
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function isOverdue(ymd?: string | null) {
  if (!ymd) return false;
  const days = daysFromToday(ymd);
  return days !== null && days < 0;
}

/** Split a date into the stacked badge the cards render. */
export function dateParts(ymd?: string | null) {
  if (!ymd) return null;
  const date = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return {
    month: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: date.getDate(),
    year: date.getFullYear(),
  };
}

/** "Yesterday · 4:12 PM" — matches how the cards timestamp a capture. */
export function savedAt(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const days = Math.round(
    (startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86400_000,
  );

  if (days === 0) return `Today · ${time}`;
  if (days === 1) return `Yesterday · ${time}`;
  if (days < 7) return `${date.toLocaleDateString("en-US", { weekday: "long" })} · ${time}`;
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${time}`;
}

export function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Deterministic monogram tile for a brand or vendor, standing in for an app icon
 * we do not have. Same title always yields the same colour.
 */
export function monogram(title?: string | null) {
  const clean = (title || "?").trim();
  const letters = clean
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  let hash = 0;
  for (let i = 0; i < clean.length; i += 1) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  const palettes = [
    ["#fff1e7", "#c2410c"],
    ["#eef2ff", "#4338ca"],
    ["#ecfdf5", "#047857"],
    ["#fdf2f8", "#be185d"],
    ["#f6f3ff", "#6d28d9"],
    ["#eff6ff", "#1d4ed8"],
  ];
  const [bg, fg] = palettes[hash % palettes.length];
  return { letters: letters || "?", bg, fg };
}

export const INTENT_ORDER: IntentMode[] = ["ACT", "EXPLORE", "REMEMBER"];

/**
 * Quote OCR usually arrives already wrapped in quotation marks and with the
 * attribution appended. The hero renders both of those itself, so strip them or
 * the card ends up reading ““…” — Rob Siltanen” — Rob Siltanen.
 */
export function cleanQuote(raw?: string | null): { text: string; attribution: string | null } {
  let text = (raw || "").trim();
  let attribution: string | null = null;

  const trailing = text.match(/[\n\s]*[—–-]{1,2}\s*([^\n—–]{2,60})\s*$/);
  if (trailing) {
    attribution = trailing[1].trim();
    text = text.slice(0, trailing.index).trim();
  }

  // Unwrap any number of nested quotation marks.
  let previous;
  do {
    previous = text;
    text = text.replace(/^["“”'']\s*/, "").replace(/\s*["“”'']$/, "").trim();
  } while (text !== previous);

  return { text, attribution };
}
