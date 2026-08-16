function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseNow(capturedAt?: string | null) {
  if (capturedAt) {
    const m = capturedAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    const d = new Date(capturedAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function addDaysYmd(capturedAt: string | null | undefined, days: number) {
  const d = parseNow(capturedAt);
  d.setDate(d.getDate() + days);
  return ymdLocal(d);
}

export function inferDueAt(note: string, capturedAt?: string | null) {
  const q = note.toLowerCase();
  if (/\btomorrow\b/.test(q)) return addDaysYmd(capturedAt, 1);
  if (/\btoday\b/.test(q)) return addDaysYmd(capturedAt, 0);
  if (/\bnext week\b/.test(q)) return addDaysYmd(capturedAt, 7);
  return null;
}

export function isYmd(value: unknown, targetYmd: string) {
  return String(value || "").slice(0, 10) === targetYmd;
}

export function dueAtFromMemory(mem: {
  analysis?: { temporal?: Record<string, unknown> | null; suggested_actions?: Array<{ due_at?: string | null }> } | null;
  metadata?: Record<string, unknown>;
  description?: string;
}) {
  const temporal = (mem.analysis?.temporal || mem.metadata?.temporal) as Record<string, unknown> | undefined;
  const fromTemporal = temporal?.due_at || temporal?.date;
  if (fromTemporal) return String(fromTemporal).slice(0, 10);
  const actionDue = mem.analysis?.suggested_actions?.find((a) => a.due_at)?.due_at;
  if (actionDue) return String(actionDue).slice(0, 10);
  const blob = `${mem.description || ""} ${JSON.stringify(mem.metadata || {})} ${JSON.stringify(mem.analysis || {})}`;
  const m = blob.match(/Due date:\s*(\d{4}-\d{2}-\d{2})/i);
  return m ? m[1] : "";
}

function dueLabel(note: string, due: string) {
  const q = note.toLowerCase();
  if (/\btomorrow\b/.test(q)) return "tomorrow";
  if (/\btoday\b/.test(q)) return "today";
  if (/\bnext week\b/.test(q)) return "next week";
  return due;
}

export function applyUserNoteTiming<
  T extends {
    temporal?: Record<string, unknown> | null;
    searchable_text: string;
    description: string;
    intent_mode: string;
    intent_summary?: string;
    actionable: boolean;
    urgency: string;
    suggested_actions: Array<{
      type: string;
      label: string;
      due_at?: string | null;
      reason?: string | null;
    }>;
    agent_activity?: string[];
    short_message?: string | null;
  },
>(analysis: T, note: string | null | undefined, capturedAt?: string | null): T {
  const trimmed = note?.trim();
  if (!trimmed) return analysis;

  const due = inferDueAt(trimmed, capturedAt) || String(analysis.temporal?.due_at || "").slice(0, 10) || null;
  if (trimmed && !analysis.description.toLowerCase().includes(trimmed.toLowerCase().slice(0, 40))) {
    analysis.description = `${trimmed.replace(/^remember this screenshot as\s+/i, "Remember: ")} ${analysis.description}`.trim();
  }

  if (!due) return analysis;

  const label = dueLabel(trimmed, due);
  analysis.temporal = {
    ...(analysis.temporal || {}),
    due_at: due,
    due_label: label,
    reminder: true,
  };
  analysis.actionable = true;
  analysis.intent_mode = "ACT";
  if (analysis.urgency === "none") analysis.urgency = "medium";
  if (analysis.intent_summary && !/tomorrow|today|due/i.test(analysis.intent_summary)) {
    analysis.intent_summary = `${analysis.intent_summary} Follow up ${label} (${due}).`;
  }
  if (!analysis.searchable_text.includes(due)) {
    analysis.searchable_text = `${analysis.searchable_text} Due date: ${due}. Things to do ${label}.`.trim();
  }
  if (!analysis.suggested_actions.some((a) => a.due_at === due)) {
    analysis.suggested_actions = [
      {
        type: "research",
        label: `Research this ${label}`,
        due_at: due,
        reason: trimmed,
      },
      ...analysis.suggested_actions,
    ];
  }
  if (analysis.agent_activity && !analysis.agent_activity.some((s) => /due date/i.test(s))) {
    analysis.agent_activity = [...analysis.agent_activity, `Due date set for ${due}`];
  }
  if (analysis.short_message && !analysis.short_message.includes(due)) {
    analysis.short_message = `${analysis.short_message} Due ${label} (${due}).`.slice(0, 500);
  }
  return analysis;
}
