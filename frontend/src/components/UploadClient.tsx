"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Header } from "@/components/Header";
import { captureScreenshot } from "@/lib/api";

type Mode = "save" | "ask" | "describe";

export default function UploadClient() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("save");
  const [question, setQuestion] = useState("");
  const [userDescription, setUserDescription] = useState("");
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onFile(f: File | null) {
    setFile(f);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a PNG or JPEG screenshot.");
      return;
    }
    if (mode === "ask" && !question.trim()) {
      setError("Add a question for Ask mode.");
      return;
    }
    if (mode === "describe" && !userDescription.trim()) {
      setError("Add a short description for Describe & Save.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await captureScreenshot({
        file,
        mode,
        question: question.trim() || undefined,
        userDescription: userDescription.trim() || undefined,
        onPhase: setPhase,
      });
      sessionStorage.setItem(`snapact:capture:${result.memory_id}`, JSON.stringify(result));
      router.push(`/result/${result.memory_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPhase(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[430px] flex-col gap-6 px-5 py-4">
      <Header compact />
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-[#111827]">
          Upload Screenshot
        </h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          Judges can demo SnapAct here without the Apple Shortcut.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#bfdbfe] bg-[#f8fafc] px-6 py-10 text-center">
          <input
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] || null)}
          />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Preview" className="max-h-64 rounded-xl object-contain" />
          ) : (
            <>
              <span className="text-sm font-medium text-[var(--ink)]">
                Drop or choose a PNG / JPEG
              </span>
              <span className="mt-1 text-xs text-[var(--muted)]">Max ~12 MB</span>
            </>
          )}
        </label>

        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[var(--border)] bg-white p-2">
          {(
            [
              ["save", "Save"],
              ["ask", "Ask"],
              ["describe", "Describe & Save"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`rounded-xl px-2 py-3 text-sm font-medium ${
                mode === id ? "bg-[var(--accent)] text-white" : "text-[#6b7280]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "ask" ? (
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            placeholder="Are there similar events in Austin?"
            className="w-full rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 outline-none focus:border-[var(--accent)]"
          />
        ) : null}

        {mode === "describe" ? (
          <textarea
            value={userDescription}
            onChange={(e) => setUserDescription(e.target.value)}
            rows={3}
            placeholder="Potential restaurant for birthday dinner"
            className="w-full rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 outline-none focus:border-[var(--accent)]"
          />
        ) : null}

        {phase ? (
          <div className="rounded-2xl bg-[#eff6ff] px-4 py-3 text-sm text-[#1d4ed8]">
            {phase}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-[var(--accent)] px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy
            ? "Processing…"
            : mode === "ask"
              ? "Ask Grok"
              : mode === "describe"
                ? "Describe & Save"
                : "Save to SnapAct"}
        </button>
      </form>

      <Link href="/" className="text-sm font-medium text-[var(--accent)]">
        ← Back home
      </Link>
    </div>
  );
}
