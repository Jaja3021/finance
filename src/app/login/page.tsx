"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { AuthShell, FormMessage } from "@/components/auth-shell";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to Cash Hey">
      <form action={action} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <FormMessage state={state} />
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        <p className="text-center text-sm text-muted">
          New here? <Link className="text-link" href="/signup">Create an account</Link>
        </p>
      </form>
    </AuthShell>
  );
}
