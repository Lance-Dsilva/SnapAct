"use client";

import { useCallback, useEffect, useState } from "react";
import { IconSparkle } from "@/components/Icons";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

/**
 * Numeric keypad.
 *
 * Deliberately dumb: it collects digits and hands them to the server. Nothing
 * here knows the passcode, so reading this file — or the bundle — reveals
 * nothing, and there is no client-side check to bypass.
 */
export function Keypad({
  length = 4,
  onSubmit,
  error,
  busy,
  disabled,
  title,
  subtitle,
}: {
  length?: number;
  onSubmit: (passcode: string) => void;
  error?: string | null;
  busy?: boolean;
  disabled?: boolean;
  title: string;
  subtitle?: string;
}) {
  const [digits, setDigits] = useState("");

  // Clearing the entry when a new error arrives is a render-phase adjustment,
  // not a side effect — doing it in useEffect would cause a second render pass.
  const [seenError, setSeenError] = useState(error);
  if (error !== seenError) {
    setSeenError(error);
    if (error) setDigits("");
  }

  const press = useCallback(
    (key: string) => {
      if (busy || disabled) return;
      if (key === "⌫") {
        setDigits((value) => value.slice(0, -1));
        return;
      }
      if (!/^\d$/.test(key)) return;

      setDigits((value) => {
        if (value.length >= length) return value;
        const next = value + key;
        // Submit as soon as the code is complete — no confirm button to hunt for.
        if (next.length === length) setTimeout(() => onSubmit(next), 90);
        return next;
      });
    },
    [busy, disabled, length, onSubmit],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Backspace") press("⌫");
      else if (/^\d$/.test(event.key)) press(event.key);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <div className="w-full max-w-[300px]">
      <div className="flex flex-col items-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-2xl text-white"
          style={{ background: "var(--gradient)" }}
        >
          <IconSparkle className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-[19px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-center text-[13.5px] text-[var(--muted)]">{subtitle}</p>
        ) : null}
      </div>

      {/* Keying on the error restarts the shake for each new failure. */}
      <div
        key={error ?? "ok"}
        className={`mt-7 flex justify-center gap-3.5 ${error ? "animate-[shake_0.4s]" : ""}`}
        aria-label={`${digits.length} of ${length} digits entered`}
      >
        {Array.from({ length }).map((_, index) => (
          <span
            key={index}
            className={`h-3.5 w-3.5 rounded-full transition ${
              index < digits.length
                ? "scale-110 bg-[var(--ink)]"
                : "bg-[var(--border-strong)]"
            }`}
          />
        ))}
      </div>

      <p
        className={`mt-4 min-h-[20px] text-center text-[13px] ${
          error ? "text-rose-600" : "text-transparent"
        }`}
        role={error ? "alert" : undefined}
      >
        {error || "placeholder"}
      </p>

      <div className="mt-2 grid grid-cols-3 gap-3">
        {KEYS.map((key, index) =>
          key === "" ? (
            <span key={index} />
          ) : (
            <button
              key={index}
              type="button"
              onClick={() => press(key)}
              disabled={busy || disabled}
              aria-label={key === "⌫" ? "Delete" : key}
              className={`flex h-[68px] items-center justify-center rounded-2xl text-[24px] font-medium transition active:scale-95 disabled:opacity-40 ${
                key === "⌫"
                  ? "text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                  : "border border-[var(--border)] bg-white text-[var(--ink)] shadow-[var(--shadow-sm)] hover:border-[var(--border-strong)]"
              }`}
            >
              {key}
            </button>
          ),
        )}
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          20%,
          60% {
            transform: translateX(-7px);
          }
          40%,
          80% {
            transform: translateX(7px);
          }
        }
      `}</style>
    </div>
  );
}
