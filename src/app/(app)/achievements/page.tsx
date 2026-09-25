import { eq } from "drizzle-orm";
import { format, parseISO } from "date-fns";
import { FireIcon, WarningIcon, CheckIcon } from "@phosphor-icons/react/ssr";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { BADGES, checkBadges, streakFor } from "@/lib/engagement";
import { PageHeader } from "@/components/ui";
import { BADGE_ICONS } from "@/components/badge-icon";

export default async function AchievementsPage() {
  const user = await requireUser();
  await checkBadges(user.id);
  const s = await streakFor(user.id);
  const earned = new Map(
    (await db.select().from(schema.badges).where(eq(schema.badges.userId, user.id)).all()).map((b) => [b.badge, b.earnedAt]),
  );

  return (
    <div>
      <PageHeader title="Achievements" description="Log at least one transaction every day to build your streak. Missing a day resets it." />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[18rem_minmax(0,1fr)] [&>*]:min-w-0">
        <section className="card">
          <div className="text-center">
            <FireIcon size={48} weight="fill" className="mx-auto text-warn" aria-hidden />
            <div className="mt-2 text-4xl font-semibold">{s.current}</div>
            <div className="text-sm text-muted">day streak</div>
            <p className={`mt-2 inline-flex items-center gap-1 text-sm ${s.loggedToday ? "text-good" : "text-warn"}`}>
              {s.loggedToday ? (
                <>
                  <CheckIcon size={14} weight="bold" /> Logged today
                </>
              ) : s.current > 0 ? (
                <>
                  <WarningIcon size={14} weight="bold" /> Log something today to keep it going
                </>
              ) : (
                "Log a transaction to start a streak"
              )}
            </p>
            <p className="mt-1 text-xs text-muted">Longest: {s.longest} day{s.longest === 1 ? "" : "s"}</p>
          </div>
          <div className="mt-5">
            <div className="mb-2 text-xs text-muted">Last 4 weeks</div>
            <ol className="grid grid-cols-7 gap-1.5">
              {s.recent.map((d) => (
                <li
                  key={d.date}
                  className={`flex aspect-square items-center justify-center rounded-md text-[11px] font-medium tabular ${d.logged ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted"}`}
                  title={`${format(parseISO(d.date), "EEE, MMM d")}: ${d.logged ? "logged" : "missed"}`}
                  aria-label={`${format(parseISO(d.date), "MMM d")} ${d.logged ? "logged" : "not logged"}`}
                >
                  {format(parseISO(d.date), "d")}
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section className="card">
          <h2 className="card-title mb-3">Badges</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(BADGES).map(([key, b]) => {
              const at = earned.get(key);
              const Icon = BADGE_ICONS[key];
              return (
                <li key={key} className={`rounded-2xl border p-3 text-center ${at ? "border-accent" : "border-line opacity-50 grayscale"}`}>
                  <Icon size={32} weight={at ? "fill" : "regular"} className={`mx-auto ${at ? "text-accent" : "text-muted"}`} aria-hidden />
                  <div className="mt-1 text-sm font-medium">{b.label}</div>
                  <div className="text-xs text-muted">{b.description}</div>
                  <div className="mt-1 text-xs">{at ? <span className="text-good">Earned {format(new Date(at), "MMM d")}</span> : <span className="text-muted">Locked</span>}</div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
