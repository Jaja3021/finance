"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { logout, unlockWithPin } from "@/app/actions/auth";
import { FormMessage } from "@/components/auth-shell";

export function LockForm({ hasBiometric }: { hasBiometric: boolean }) {
  const [state, action, pending] = useActionState(unlockWithPin, undefined);
  const [bioError, setBioError] = useState<string | null>(null);
  const router = useRouter();
  const bioButton = useRef<HTMLButtonElement>(null);

  async function unlockWithBiometric() {
    try {
      const options = await fetch("/api/webauthn/unlock").then((r) => r.json());
      if (options.error) throw new Error(options.error);
      const assertion = await startAuthentication({ optionsJSON: options });
      const res = await fetch("/api/webauthn/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assertion),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      router.replace("/");
      router.refresh();
    } catch (err) {
      setBioError((err as Error).name === "NotAllowedError" ? "Cancelled. Use your PIN instead." : (err as Error).message);
    }
  }

  useEffect(() => {
    // Offer the biometric prompt straight away, like a phone lock screen.
    bioButton.current?.click();
  }, []);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input
          className="input text-center text-2xl tracking-[0.5em]"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{4,8}"
          autoComplete="off"
          aria-label="PIN"
          autoFocus
          required
        />
        <FormMessage state={state} />
        <button className="btn-primary w-full" disabled={pending}>Unlock</button>
      </form>
      {hasBiometric && (
        <button
          ref={bioButton}
          type="button"
          className="btn-ghost w-full"
          onClick={() => {
            setBioError(null);
            void unlockWithBiometric();
          }}
        >
          Use fingerprint / face
        </button>
      )}
      {bioError && <p className="text-sm text-muted">{bioError}</p>}
      <form action={logout}>
        <button className="w-full text-sm text-muted hover:text-ink">Sign out</button>
      </form>
    </div>
  );
}
