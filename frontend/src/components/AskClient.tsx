"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { SourcesList } from "@/components/Cards";
import { Header } from "@/components/Header";
import { askSnapAct } from "@/lib/api";
import type { AskResponse, SearchResultItem } from "@/types";

function AskInner() {
  const params = useSearchParams();
  const initial = params.get("q") || "";
  const [question, setQuestion] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [searchHits, setSearchHits] = useState<SearchResultItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const ask = await askSnapAct(q.trim());
      setAnswer(ask);
      setSearchHits(ask.memories || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ask failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initial) void run(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(question);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <Header compact />
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
        Ask SnapAct
      </h1>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What AI events have I saved?"
          className="min-w-0 flex-1 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 outline-none focus:border-teal-400"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-2xl bg-[var(--ink)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2 text-xs">
        {[
          "What should I act on today?",
          "What AI events have I saved?",
          "Who did I want to contact?",
          "What restaurants was I considering?",
        ].map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setQuestion(ex);
              void run(ex);
            }}
            className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[var(--muted)] hover:text-[var(--ink)]"
          >
            {ex}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {answer ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow)]">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Answer</h2>
            <p className="mt-2 leading-relaxed text-[var(--ink)]">{answer.answer}</p>
          </div>
          <SourcesList citations={answer.citations || []} />
          <div>
            <h2 className="mb-3 text-sm font-semibold text-[var(--ink)]">Supporting memories</h2>
            <div className="space-y-2">
              {(answer.memories.length ? answer.memories : searchHits).map((m) => (
                <Link
                  key={m.memory_id}
                  href={`/memory/${m.memory_id}`}
                  className="flex gap-3 rounded-2xl border border-[var(--border)] bg-white p-3 hover:border-teal-300"
                >
                  {m.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.image_url}
                      alt=""
                      className="h-16 w-16 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-xl bg-slate-100" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--ink)]">{m.title}</div>
                    <p className="line-clamp-2 text-sm text-[var(--muted)]">{m.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AskClient() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[var(--muted)]">Loading…</div>}>
      <AskInner />
    </Suspense>
  );
}
