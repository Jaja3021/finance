import os from "node:os";
import Link from "next/link";
import { headers } from "next/headers";
import { format } from "date-fns";
import { ArrowLeftIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { requireUser } from "@/lib/auth";
import { listApiTokens } from "@/lib/api-tokens";
import { revokeShortcutKey } from "@/app/actions/data";
import { PageHeader } from "@/components/ui";
import { CopyButton, CreateKeyForm } from "@/components/shortcut-keys";

function lanAddress(port: string) {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(i.address)) return `http://${i.address}:${port}`;
    }
  }
  return null;
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-ink">{n}</span>
      <div className="min-w-0 flex-1 pb-1">
        <div className="text-sm font-medium">{title}</div>
        {children && <div className="mt-1 space-y-1 text-sm text-ink-2">{children}</div>}
      </div>
    </li>
  );
}

function Code({ children }: { children: string }) {
  return (
    <span className="flex items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded bg-surface-2 px-2 py-1 text-xs text-ink">{children}</code>
      <CopyButton text={children} />
    </span>
  );
}

export default async function ShortcutsPage() {
  const user = await requireUser();
  const keys = listApiTokens(user.id);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const base = local ? lanAddress(host.split(":")[1] ?? "3000") ?? `${proto}://${host}` : `${proto}://${host}`;
  const auth = "Authorization: Bearer <your key>";

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="Phone shortcuts"
        description="Log a spend in three taps from your home screen: amount → category → account. You get a notification with the deduction and your new balance."
        action={
          <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-link">
            <ArrowLeftIcon size={14} weight="bold" aria-hidden /> Settings
          </Link>
        }
      />

      {local && (
        <div className="card border-warn text-sm">
          <p className="flex items-center gap-1.5 font-medium text-warn">
            <WarningIcon size={16} weight="bold" aria-hidden /> Your phone can&apos;t reach “localhost”
          </p>
          <p className="mt-1 text-ink-2">
            While the phone is on the same Wi-Fi, use <b>{base}</b> (your computer&apos;s address). To use it anywhere, and to get home-screen install and
            notifications on Android, the app needs HTTPS: deploy it, or run <code className="rounded bg-surface-2 px-1">cloudflared tunnel --url http://localhost:3000</code> for a
            temporary https:// address.
          </p>
        </div>
      )}

      <section className="card">
        <h2 className="card-title mb-1">1. Create a key</h2>
        <p className="mb-3 text-sm text-muted">Shortcuts use a personal key instead of your password. Make one per phone; revoke it here if the phone is lost.</p>
        <CreateKeyForm />
        {keys.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <b>{k.name}</b> <code className="text-xs text-muted">{k.prefix}…</code>
                  <span className="block text-xs text-muted">
                    Created {format(new Date(k.createdAt), "MMM d")} · {k.lastUsedAt ? `last used ${format(new Date(k.lastUsedAt), "MMM d, HH:mm")}` : "never used"}
                  </span>
                </span>
                <form action={revokeShortcutKey}>
                  <input type="hidden" name="id" value={k.id} />
                  <button className="text-xs text-bad">Revoke</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="card-title mb-1">2. iPhone: build the shortcut</h2>
        <p className="mb-4 text-sm text-muted">
          Open the <b>Shortcuts</b> app → <b>+</b> → name it “Log expense”. Add these actions in order (search for each name):
        </p>
        <ol className="space-y-4">
          <Step n={1} title="Ask for Input">Input type <b>Number</b>, prompt “How much?”.</Step>
          <Step n={2} title="Get Contents of URL">
            <Code>{`${base}/api/shortcut/categories`}</Code>
            <span className="block">
              Tap <b>Show More</b> → <b>Headers</b> → add <code>Authorization</code> with value <code>Bearer &lt;your key&gt;</code>.
            </span>
          </Step>
          <Step n={3} title="Choose from List">Prompt “Category”. Then add <b>Set Variable</b> → name it <code>Category</code>.</Step>
          <Step n={4} title="Get Contents of URL">
            <Code>{`${base}/api/shortcut/accounts`}</Code>
            <span className="block">Same Authorization header as step 2.</span>
          </Step>
          <Step n={5} title="Choose from List">Prompt “Account”. Then <b>Set Variable</b> → <code>Account</code>.</Step>
          <Step n={6} title="Get Contents of URL">
            <Code>{`${base}/api/shortcut/log`}</Code>
            <span className="block">
              Method <b>POST</b>, same Authorization header. Request Body <b>JSON</b> with three Text fields: <code>amount</code> = <i>Provided Input</i>,{" "}
              <code>category</code> = <i>Category</i>, <code>account</code> = <i>Account</i>.
            </span>
          </Step>
          <Step n={7} title="Get Dictionary Value">Key <code>notification</code>.</Step>
          <Step n={8} title="Show Notification">Body: <i>Dictionary Value</i>. You&apos;ll see e.g. “−₱250.00 from GCash · 🍜 Food & Dining · GCash balance ₱2,775.00”.</Step>
        </ol>
        <p className="mt-4 text-sm text-ink-2">
          Then tap the shortcut&apos;s <b>ⓘ</b> → <b>Add to Home Screen</b>. You can also say “Hey Siri, log expense”, or set it on <b>Back Tap</b> (Settings → Accessibility → Touch → Back Tap).
        </p>

        <details className="mt-4 rounded-xl bg-surface-2 p-3 text-sm">
          <summary className="cursor-pointer font-medium">Optional: “Say it” shortcut (Siri / dictation)</summary>
          <ol className="mt-3 space-y-3">
            <Step n={1} title="Dictate Text" />
            <Step n={2} title="Get Contents of URL">
              <Code>{`${base}/api/shortcut/log`}</Code>
              <span className="block">POST, Authorization header, JSON body with one field <code>text</code> = <i>Dictated Text</i>.</span>
            </Step>
            <Step n={3} title="Get Dictionary Value → Show Notification">Key <code>notification</code>, as above.</Step>
          </ol>
          <p className="mt-2 text-ink-2">Then just say “lunch 250 gcash” or “paid credit card 5k”.</p>
        </details>
      </section>

      <section className="card">
        <h2 className="card-title mb-1">3. Android</h2>
        <ol className="mt-3 space-y-4">
          <Step n={1} title="Install the app on your home screen">
            Open {base} in <b>Chrome</b> → menu <b>⋮</b> → <b>Add to Home screen</b> / <b>Install app</b>.
          </Step>
          <Step n={2} title="Long-press the app icon → “Log expense”">
            Drag that shortcut onto your home screen for one-tap access. It opens the same amount → category → account flow, and shows a notification when
            it&apos;s saved (allow notifications the first time).
          </Step>
        </ol>
        <p className="mt-4 text-sm text-muted">
          Prefer a native widget? Apps like <b>HTTP Shortcuts</b> or <b>Tasker</b> can call the same endpoints: <code>GET /api/shortcut/categories</code>,{" "}
          <code>GET /api/shortcut/accounts</code>, and <code>POST /api/shortcut/log</code> with header <code>{auth}</code> and JSON{" "}
          <code>{`{"amount":"250","category":"Food","account":"GCash"}`}</code>. The reply&apos;s <code>notification</code> field is the text to show.
        </p>
      </section>

      <section className="card text-sm">
        <h2 className="card-title mb-1">In the browser</h2>
        <p className="text-ink-2">
          The same three-tap logger is at <Link className="text-link" href="/quick">/quick</Link> (the big + button on phones).
        </p>
      </section>
    </div>
  );
}
