import Link from "next/link";
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import { ArrowRightIcon, DeviceMobileIcon } from "@phosphor-icons/react/ssr";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { BACKUP_DIR, listSnapshots } from "@/lib/backup";
import { aiEnabled } from "@/lib/ai";
import { PageHeader } from "@/components/ui";
import { BackupForms, PinForms, ProfileForm } from "@/components/simple-forms";
import { BiometricSetup, NotificationPermission } from "@/components/device-settings";
import { ThemeSelect } from "@/components/theme-toggle";
import { lockNow, logout } from "@/app/actions/auth";

export default async function SettingsPage() {
  const user = await requireUser();
  const passkeys = db.select().from(schema.passkeys).where(eq(schema.passkeys.userId, user.id)).all();
  const snapshots = listSnapshots().slice(0, 5);

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Settings" />

      <section className="card">
        <h2 className="card-title mb-3">Profile</h2>
        <ProfileForm name={user.name} homeCurrency={user.homeCurrency} />
      </section>

      <section className="card">
        <h2 className="card-title mb-1">Appearance</h2>
        <p className="mb-3 text-sm text-muted">“System” follows your device&apos;s light or dark setting. Your choice is remembered on this device.</p>
        <ThemeSelect />
      </section>

      <Link href="/settings/shortcuts" className="card flex items-center justify-between gap-3 hover:bg-surface-2">
        <span>
          <span className="flex items-center gap-2 font-medium">
            <DeviceMobileIcon size={18} weight="bold" className="text-link" aria-hidden /> Phone shortcuts
          </span>
          <span className="text-sm text-muted">Log a spend from your iPhone or Android home screen in three taps, with a notification.</span>
        </span>
        <ArrowRightIcon size={18} weight="bold" className="shrink-0 text-link" aria-hidden />
      </Link>

      <section className="card">
        <h2 className="card-title mb-1">App lock</h2>
        <p className="mb-3 text-sm text-muted">
          {user.pinHash
            ? `On. The app locks after ${user.lockAfterMinutes} minute(s) of inactivity and whenever the browser is closed.`
            : "Ask for a PIN when opening the app. After 5 wrong tries you're signed out."}
        </p>
        <PinForms hasPin={!!user.pinHash} minutes={user.lockAfterMinutes} />
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="text-sm font-medium">Fingerprint / face unlock</h3>
          <p className="mb-2 text-sm text-muted">Uses this device&apos;s built-in biometrics (Touch ID, Face ID, Windows Hello, Android). Your PIN still works as a fallback.</p>
          <BiometricSetup enabled={!!user.pinHash} devices={passkeys.map((p) => ({ id: p.id, label: p.label ?? "Device", createdAt: p.createdAt }))} />
        </div>
      </section>

      <section className="card">
        <h2 className="card-title mb-1">Notifications</h2>
        <p className="mb-3 text-sm text-muted">Bill reminders and budget alerts always appear under the bell. Allow browser notifications to also get them as pop-ups while the app is open.</p>
        <NotificationPermission />
      </section>

      <section className="card">
        <h2 className="card-title mb-1">Backups</h2>
        <p className="mb-3 text-sm text-muted">
          The whole database is copied automatically once a day, and the last 14 copies are kept in <code className="rounded bg-surface-2 px-1">{BACKUP_DIR}</code>.
          Set <code className="rounded bg-surface-2 px-1">BACKUP_DIR</code> to a synced folder (OneDrive, Google Drive, Dropbox) for an off-device copy.
        </p>
        <BackupForms />
        {snapshots.length > 0 && (
          <div className="mt-4 border-t border-line pt-4 text-sm">
            <div className="mb-1 text-xs text-muted">Recent server snapshots</div>
            <ul className="space-y-0.5">
              {snapshots.map((s) => (
                <li key={s.file} className="flex justify-between gap-2">
                  <span className="truncate font-mono text-xs">{s.file}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {format(new Date(s.mtime), "MMM d, HH:mm")} · {(s.size / 1024).toFixed(0)} KB
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card text-sm">
        <h2 className="card-title mb-1">AI assistant</h2>
        <p className="text-muted">
          {aiEnabled()
            ? "Connected to Google Gemini. Chat entries and coaching tips use the Gemini API."
            : "Not connected. The assistant and coach use built-in rules. Set GEMINI_API_KEY in .env.local and restart to enable Gemini."}
        </p>
      </section>
      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-medium">{user.email}</div>
          <div className="text-muted">Signed in on this device</div>
        </div>
        <div className="flex gap-2">
          {user.pinHash && (
            <form action={lockNow}>
              <button className="btn-ghost">Lock now</button>
            </form>
          )}
          <form action={logout}>
            <button className="btn-danger">Sign out</button>
          </form>
        </div>
      </section>
    </div>
  );
}
