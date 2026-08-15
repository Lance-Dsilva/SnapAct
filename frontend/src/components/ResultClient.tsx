"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AgentSteps, SourcesList } from "@/components/Cards";
import { Header } from "@/components/Header";
import { getMemory } from "@/lib/api";
import { intentColor, typeLabel } from "@/lib/labels";
import type { CaptureResponse, MemoryDetail } from "@/types";
import { activitySteps } from "@/types";

export default function ResultClient({ memoryId }: { memoryId: string }) {
  const [capture, setCapture] = useState<CaptureResponse | null>(null);
  const [memory, setMemory] = useState<MemoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`snapact:capture:${memoryId}`);
      if (raw) setCapture(JSON.parse(raw) as CaptureResponse);
    } catch {
      /* ignore */
    }
    getMemory(memoryId)
      .then(setMemory)
      .catch((e) => setError(e instanceof Error ? e.message : "Not found"));
  }, [memoryId]);

  const analysis = capture?.analysis || memory?.analysis;
  const imageUrl = capture?.image_url || memory?.image_url;
  const actions = capture?.suggested_actions || analysis?.suggested_actions || [];
  const citations = capture?.citations || analysis?.citations || [];
  const steps = activitySteps(capture?.agent_activity || analysis?.agent_activity);
  const webUsed =
    analysis?.web_search_used ||
    steps.some((s) => /research|search|web|external/i.test(s));
  const liveFailed = Boolean(analysis?.live_verification_failed);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <Header compact />

      {error && !analysis ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow)]">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="max-h-80 w-full object-contain bg-slate-50" />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-[var(--muted)]">
                Screenshot
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-teal-700">Grok analyzed this</p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
              {analysis?.title || memory?.title || "Memory"}
            </h1>
          </div>

          {capture?.warning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {capture.warning}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <Meta label="Type" value={typeLabel(analysis?.content_type || memory?.content_type)} />
            <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Intent</div>
              <span
                className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${intentColor(analysis?.intent_mode || memory?.intent_mode)}`}
              >
                {analysis?.intent_mode || memory?.intent_mode}
              </span>
            </div>
            <Meta label="Why" value={analysis?.intent_summary || memory?.description || ""} />
          </div>

          {(capture?.answer || analysis?.answer) && (
            <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow)]">
              <h2 className="text-sm font-semibold text-[var(--ink)]">Answer</h2>
              <p className="mt-2 text-[var(--ink)] leading-relaxed">
                {capture?.answer || analysis?.answer}
              </p>
              {capture?.short_message ? (
                <p className="mt-3 text-sm text-[var(--muted)]">
                  Shortcut message: {capture.short_message}
                </p>
              ) : null}
            </div>
          )}

          {steps.length ? (
            <AgentSteps
              steps={steps}
              web={webUsed}
              liveFailed={liveFailed}
            />
          ) : null}

          {actions.length ? (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) =>
                a.url ? (
                  <a
                    key={`${a.type}-${a.label}`}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
                  >
                    {a.label}
                  </a>
                ) : (
                  <span
                    key={`${a.type}-${a.label}`}
                    className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)]"
                  >
                    {a.label}
                  </span>
                ),
              )}
            </div>
          ) : null}

          <SourcesList citations={citations} />

          <div className="flex gap-3 text-sm">
            <Link href={`/memory/${memoryId}`} className="text-teal-700 hover:underline">
              Open memory detail
            </Link>
            <Link href="/" className="text-[var(--muted)] hover:text-[var(--ink)]">
              Home
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <p className="mt-2 text-sm font-medium text-[var(--ink)]">{value}</p>
    </div>
  );
}
