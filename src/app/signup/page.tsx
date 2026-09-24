"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup } from "@/app/actions/auth";
import { AuthShell, FormMessage } from "@/components/auth-shell";
import { COMMON_CURRENCIES } from "@/lib/money";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, undefined);
  return (
    <AuthShell title="Create your account" subtitle="Everything stays on your own server">
      <form action={action} className="space-y-4">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input className="input" id="name" name="name" autoComplete="name" required />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div>
          <label className="label" htmlFor="homeCurrency">Home currency</label>
          <select className="input" id="homeCurrency" name="homeCurrency" defaultValue="PHP">
            {COMMON_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted">Net worth and reports are shown in this currency.</p>
        </div>
        <FormMessage state={state} />
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
        <p className="text-center text-sm text-muted">
          Have an account? <Link className="text-link" href="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
