import { LogoMark } from "./logo";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mb-4 flex justify-center">
            <LogoMark size={48} />
          </div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="card">{children}</div>
      </div>
    </main>
  );
}

export function FormMessage({ state }: { state?: { error?: string; ok?: string } }) {
  if (state?.error) return <p className="text-sm text-bad" role="alert">{state.error}</p>;
  if (state?.ok) return <p className="text-sm text-good" role="status">{state.ok}</p>;
  return null;
}
