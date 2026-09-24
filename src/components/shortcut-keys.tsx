"use client";

import { useActionState, useState } from "react";
import { CopyIcon as Copy, CheckIcon as Check } from "@phosphor-icons/react/ssr";
import { createShortcutKey } from "@/app/actions/data";
import { FormMessage } from "./auth-shell";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost shrink-0 px-2 py-1 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />} {done ? "Copied" : label}
    </button>
  );
}

export function CreateKeyForm({ onToken }: { onToken?: (t: string) => void }) {
  const [state, action, pending] = useActionState(async (prev: Parameters<typeof createShortcutKey>[0], fd: FormData) => {
    const r = await createShortcutKey(prev, fd);
    if (r.token) onToken?.(r.token);
    return r;
  }, undefined);
  return (
    <form action={action} className="space-y-2">
      <label className="label" htmlFor="key-name">Name this key (which phone is it for?)</label>
      <div className="flex gap-2">
        <input className="input" id="key-name" name="name" placeholder="My iPhone" />
        <button className="btn-primary shrink-0" disabled={pending}>Create key</button>
      </div>
      <FormMessage state={state} />
      {state?.token && (
        <div className="rounded-xl border border-accent p-3">
          <div className="mb-1 text-xs text-muted">Your key (shown once):</div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-surface-2 px-2 py-1 text-sm">{state.token}</code>
            <CopyButton text={state.token} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-surface-2 px-2 py-1 text-xs">Bearer {state.token}</code>
            <CopyButton text={`Bearer ${state.token}`} label="Copy header value" />
          </div>
        </div>
      )}
    </form>
  );
}
