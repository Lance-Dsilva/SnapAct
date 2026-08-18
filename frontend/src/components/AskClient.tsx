"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { EmptyState, ResultCard } from "@/components/Cards";
import { Header } from "@/components/Header";
import { MarkdownAnswer } from "@/components/MarkdownAnswer";
import { streamAsk } from "@/lib/api";
import type { RetrievedMemory } from "@/types";

const EXAMPLES = [
  "What should I act on this week?",
  "What events have I saved?",
  "Who did I mean to follow up with?",
  "What places was I considering?",
];

function AskInner() {
  const params = useSearchParams();
  const initial = params.get("q") || "";

  const [question, setQuestion] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [memories, setMemories] = useState<RetrievedMemory[]>([]);
  const [considered, setConsidered] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const lastRun = useRef("");

  async function run(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setAsked(true);
    setError(null);
    setAnswer("");
    setMemories([]);
    setConsidered(0);
    setStatus("Searching your screenshots");

    try {
      const result = await streamAsk(trimmed, {
        onStatus: setStatus,
        onMemories: (found, total) => {
          setMemories(found);
          setConsidered(total);
        },
        onText: (text) => {
          setStatus(null);
          setAnswer(text);
        },
      });
      setAnswer(result.answer);
      setMemories(result.memories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ask failed");
    } finally {
      setLoading(false);
      setStatus(null);
    }
  }

  useEffect(() => {
    if (initial && lastRun.current !== initial) {
      lastRun.current = initial;
      void run(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(question);
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8 sm:px-8">
      <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[var(--ink)]">
        Ask your screenshots
      </h1>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What events have I saved?"
          className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-[14px] outline-none transition focus:border-indigo-300 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.1)]"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl px-5 py-3 text-[13px] font-medium text-white transition disabled:opacity-60"
          style={{ background: "var(--gradient)" }}
        >
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      {!asked ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setQuestion(example);
                void run(example);
              }}
              className="rounded-full border border-[var(--border)] bg-white px-3.5 py-2 text-[12.5px] text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--ink)]"
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {status ? <p className="text-sm text-[var(--muted)]">{status}…</p> : null}

      {answer ? (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow)]">
          <MarkdownAnswer text={answer} />
        </div>
      ) : null}

      {memories.length ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-[var(--ink)]">
            From your screenshots
          </h2>
          <div className="space-y-2">
            {memories.map((memory) => (
              <ResultCard key={memory.id} memory={memory} />
            ))}
          </div>
          {/* Being explicit about the search scope is how the user learns to trust the answer. */}
          {considered > memories.length ? (
            <p className="mt-3 text-xs text-[var(--muted)]">
              Checked {considered} screenshots, kept the {memories.length} that were relevant.
            </p>
          ) : null}
        </div>
      ) : null}

      {asked && !loading && !memories.length && !error ? (
        <EmptyState
          title="Nothing saved about that"
          body="SnapAct only answers from screenshots you've actually saved, so it won't guess when it has nothing to go on."
        />
      ) : null}
      </main>
    </>
  );
}

export default function AskClient() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[var(--muted)]">Loading…</div>}>
      <AskInner />
    </Suspense>
  );
}
