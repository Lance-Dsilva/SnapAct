"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AgentSteps, SourcesList } from "@/components/Cards";
import { Header } from "@/components/Header";
import { getMemory } from "@/lib/api";
import { intentColor, typeLabel } from "@/lib/labels";
import type { MemoryDetail } from "@/types";
import { activitySteps } from "@/types";

export default function MemoryClient({ memoryId }: { memoryId: string }) {
  const [memory, setMemory] = useState<MemoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMemory(memoryId)
      .then(setMemory)
      .catch((e) => setError(e instanceof Error ? e.message : "Not found"));
  }, [memoryId]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Header compact />
        <p className="mt-6 text-red-700">{error}</p>
      </div>
    );
  }

  if (!memory) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Header compact />
        <p className="mt-6 text-sm text-[var(--muted)]">Loading memory…</p>
      </div>
    );
  }

  const analysis = memory.analysis;
  const event = analysis?.event as Record<string, string | null> | undefined;
  const place = analysis?.place as Record<string, string | null> | undefined;
  const person = analysis?.person_followup as Record<string, string | null> | undefined;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <Header compact />

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow)]">
        {memory.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={memory.image_url}
            alt=""
            className="max-h-96 w-full object-contain bg-slate-50"
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          {typeLabel(memory.content_type)}
        </span>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${intentColor(memory.intent_mode)}`}
        >
          {memory.intent_mode}
        </span>
        {memory.demo_seed ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
            Demo seed (not a live capture)
          </span>
        ) : null}
      </div>

      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
        {memory.title}
      </h1>
      <p className="text-[var(--muted)] leading-relaxed">
        {analysis?.description || memory.description}
      </p>

      {analysis?.intent_summary ? (
        <p className="text-sm text-[var(--ink)]">
          <span className="font-semibold">Why: </span>
          {analysis.intent_summary}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {event?.date ? <Info label="Date" value={String(event.date)} /> : null}
        {event?.location ? <Info label="Location" value={String(event.location)} /> : null}
        {place?.name ? <Info label="Place" value={String(place.name)} /> : null}
        {person?.person_name ? (
          <Info
            label="Follow-up"
            value={`${person.person_name}${person.topic ? ` · ${person.topic}` : ""}`}
          />
        ) : null}
        {memory.source ? <Info label="Source" value={String(memory.source)} /> : null}
        {memory.captured_at ? <Info label="Captured" value={String(memory.captured_at)} /> : null}
      </div>

      {memory.tags?.length ? (
        <div className="flex flex-wrap gap-2">
          {memory.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}

      {(memory.question || analysis?.answer) && (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
          {memory.question ? (
            <p className="text-sm text-[var(--muted)]">Q: {memory.question}</p>
          ) : null}
          {analysis?.answer ? (
            <p className="mt-2 text-[var(--ink)]">{analysis.answer}</p>
          ) : null}
        </div>
      )}

      {analysis?.suggested_actions?.length ? (
        <div className="flex flex-wrap gap-2">
          {analysis.suggested_actions.map((a) =>
            a.url ? (
              <a
                key={`${a.type}-${a.label}`}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-teal-600 px-4 py-2 text-sm font-medium text-white"
              >
                {a.label}
              </a>
            ) : (
              <span
                key={`${a.type}-${a.label}`}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm"
              >
                {a.label}
              </span>
            ),
          )}
        </div>
      ) : null}

      {analysis?.agent_activity ? (
        <AgentSteps
          steps={activitySteps(analysis.agent_activity)}
          web={analysis.web_search_used}
          liveFailed={analysis.live_verification_failed}
        />
      ) : null}

      <SourcesList citations={analysis?.citations || []} />

      <Link href="/" className="text-sm text-teal-700 hover:underline">
        ← Back home
      </Link>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <p className="mt-1 text-sm font-medium text-[var(--ink)]">{value}</p>
    </div>
  );
}
