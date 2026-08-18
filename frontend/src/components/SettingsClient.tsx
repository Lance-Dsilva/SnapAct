"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { IconCheckCircle } from "@/components/Icons";

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-[var(--shadow)]">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--ink)]">{title}</h2>
      <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--muted)]">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 text-[14px] tracking-[0.3em] outline-none transition focus:border-indigo-300 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.1)]";

export default function SettingsClient() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passcodeMsg, setPasscodeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingPasscode, setSavingPasscode] = useState(false);

  const [key, setKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/shortcut-key")
      .then((r) => r.json())
      .then((d) => !cancelled && setKey(d.key ?? null))
      .catch(() => !cancelled && setKey(null));
    return () => {
      cancelled = true;
    };
  }, []);

  async function savePasscode(event: React.FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      setPasscodeMsg({ ok: false, text: "The two new passcodes do not match." });
      return;
    }
    setSavingPasscode(true);
    setPasscodeMsg(null);
    try {
      const res = await fetch("/api/auth/passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setPasscodeMsg({ ok: true, text: "Passcode updated." });
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        setPasscodeMsg({ ok: false, text: body.error || "Could not update the passcode." });
      }
    } finally {
      setSavingPasscode(false);
    }
  }

  async function rotate() {
    if (!window.confirm("Rotate the key? Your iPhone Shortcut will stop working until you paste the new one in.")) {
      return;
    }
    setRotating(true);
    try {
      const res = await fetch("/api/auth/shortcut-key", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (body.key) {
        setKey(body.key);
        setRevealed(true);
      }
    } finally {
      setRotating(false);
    }
  }

  async function copyKey() {
    if (!key) return;
    await navigator.clipboard.writeText(key).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function lockNow() {
    await fetch("/api/auth/lock", { method: "POST" });
    router.push("/lock");
    router.refresh();
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-8 sm:px-8">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[var(--ink)]">Settings</h1>
          <p className="mt-1 text-[14px] text-[var(--muted)]">
            Security for the website and the iPhone Shortcut.
          </p>
        </div>

        <Card
          title="Website passcode"
          description="Asked for on every device that opens SnapAct. Checked on the server, and locked out after five wrong tries."
        >
          <form onSubmit={savePasscode} className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[var(--muted)]">Current</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ""))}
                maxLength={12}
                className={inputClass}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[var(--muted)]">New</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value.replace(/\D/g, ""))}
                maxLength={12}
                className={inputClass}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[var(--muted)]">Confirm</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
                maxLength={12}
                className={inputClass}
                required
              />
            </label>

            <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={savingPasscode}
                className="rounded-xl bg-[var(--ink)] px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-60"
              >
                {savingPasscode ? "Saving…" : "Update passcode"}
              </button>
              <p className="text-[12.5px] text-[var(--muted)]">4–12 digits.</p>
              {passcodeMsg ? (
                <span
                  className={`inline-flex items-center gap-1.5 text-[13px] ${
                    passcodeMsg.ok ? "text-emerald-700" : "text-rose-600"
                  }`}
                >
                  {passcodeMsg.ok ? <IconCheckCircle className="h-4 w-4" /> : null}
                  {passcodeMsg.text}
                </span>
              ) : null}
            </div>
          </form>
        </Card>

        <Card
          title="iPhone Shortcut key"
          description="Send this as an X-SnapAct-Key header from your Shortcut. Without it the capture endpoints reject the request."
        >
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3.5 py-2.5 font-mono text-[13px] text-[var(--ink)]">
              {key ? (revealed ? key : "•".repeat(28)) : "Loading…"}
            </code>
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 text-[13px] font-medium text-[var(--ink-soft)]"
            >
              {revealed ? "Hide" : "Reveal"}
            </button>
            <button
              type="button"
              onClick={() => void copyKey()}
              disabled={!key}
              className="rounded-xl bg-[var(--ink)] px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-60"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => void rotate()}
            disabled={rotating}
            className="mt-3 text-[13px] font-medium text-rose-600 underline underline-offset-2 disabled:opacity-60"
          >
            {rotating ? "Rotating…" : "Rotate key"}
          </button>

          <div className="mt-5 rounded-xl bg-[var(--surface-soft)] p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
              In your Shortcut
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-[13.5px] leading-relaxed text-[var(--ink-soft)]">
              <li>Open each “Get Contents of URL” action.</li>
              <li>Tap <strong>Headers</strong> → <strong>Add new header</strong>.</li>
              <li>
                Key <code className="font-mono">X-SnapAct-Key</code>, value the key above.
              </li>
            </ol>
          </div>
        </Card>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void lockNow()}
            className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-[13px] font-medium text-[var(--ink-soft)]"
          >
            Lock SnapAct now
          </button>
          <Link
            href="/"
            className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-[13px] font-medium text-[var(--muted)]"
          >
            Back home
          </Link>
        </div>
      </main>
    </>
  );
}
