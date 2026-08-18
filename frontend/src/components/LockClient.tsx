"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Keypad } from "@/components/Keypad";

function LockInner() {
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockedOut, setLockedOut] = useState(false);

  async function unlock(passcode: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });

      if (res.ok) {
        // Full navigation so middleware re-evaluates with the new cookie.
        window.location.href = next.startsWith("/") ? next : "/";
        return;
      }

      const body = await res.json().catch(() => ({}));
      setError(body.error || "Wrong passcode.");
      setLockedOut(Boolean(body.locked));
    } catch {
      setError("Could not reach SnapAct.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <Keypad
        title="SnapAct is locked"
        subtitle="Enter your passcode to continue"
        onSubmit={unlock}
        error={error}
        busy={busy}
        disabled={lockedOut}
      />
    </main>
  );
}

export default function LockClient() {
  return (
    <Suspense fallback={null}>
      <LockInner />
    </Suspense>
  );
}
