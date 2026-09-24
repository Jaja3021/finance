# Cash Hey

A personal and household finance app: accounts, transactions, budgets, bills, investments, an AI assistant, and reports. Built with Next.js 16, SQLite (Drizzle ORM), and Tailwind CSS.

## Getting started

```bash
npm install
cp .env.example .env.local     # then set SESSION_SECRET (and optionally GEMINI_API_KEY)
npm run dev                    # http://localhost:3000
```

The database is created and migrated automatically on first run in `./data/finance.db`.

To try it with sample data:

```bash
npm run seed:demo              # login: demo@example.com / demo12345
```

## Features

| Area | What it does | Where |
| --- | --- | --- |
| **Accounts** | Cash, banks, e-wallets, credit cards, loans, in any currency. One-tap templates for Philippine banks and e-wallets (BDO, BPI, GCash, Maya…). | `/accounts`, `src/lib/templates.ts` |
| **Net worth** | Cash + bank + investments − debts, converted to your home currency. | Dashboard |
| **Investments** | Stocks/ETFs (Yahoo Finance, Alpha Vantage fallback) and crypto (CoinGecko), priced automatically. Portfolio value, 30-day change split into *price* vs *exchange-rate* effect, stocks vs crypto. | `/investments`, `src/lib/market.ts`, `src/lib/fx.ts` |
| **Quick log & phone shortcuts** | Three taps (amount → category → account), then a notification with the deduction, new balance and any budget warning. Built-in at `/quick` (the + button; Android: long-press the installed app icon). On iPhone, an Apple Shortcuts shortcut calls the API with a personal key; you can also say “Hey Siri, log expense”. | `/quick`, Settings → Phone shortcuts, `src/app/api/shortcut/*`, `src/lib/quick-log.ts` |
| **AI assistant** | Type or speak (“paid credit card 5k yesterday”, “split dinner 1,800 with Ana and Ben”) and it's recorded, with undo. Uses Google Gemini when `GEMINI_API_KEY` is set, a rule-based parser otherwise. | `/assistant`, dashboard quick-log, `src/lib/ai.ts`, `src/lib/nlp.ts` |
| **Coach** | 2–4 short tips from your own data: fast-rising categories, budgets near their limit, budgets with room to trim. Tips get more specific as history builds, and 👍/👎 feedback steers later tips. | Dashboard, `src/lib/ai.ts` |
| **Auto-categorize** | New entries get a category from your past entries for the same merchant. Your corrections count triple, so it learns. | `src/lib/categorize.ts` |
| **Recurring detection** | Finds payments with a steady amount on a weekly/monthly schedule and offers to track them as bills. | `/bills`, `src/lib/recurring.ts` |
| **Budgets & alerts** | Monthly limits per category, with alerts at a threshold you choose and when exceeded. Split expenses count only your share. | `/budgets` |
| **Bill reminders** | Reminders N days before each due date. “Mark paid” logs the payment and rolls the date forward. | `/bills` |
| **Streaks & badges** | Daily logging streak (missing a day resets it), evening nudge, badges at 1/3/7/30/100 days and more. | `/achievements`, `src/lib/engagement.ts` |
| **Reports** | Daily summary, income/expense statement for any date range (CSV export, print/PDF), debt payoff calculator. | `/reports` |
| **Split expenses** | Split one expense across people; track who still owes you and mark shares as paid back. | Add-transaction form, `/shared` |
| **Shared accounts** | Create a household, invite with a code, share accounts. Everyone can log to them and balances stay in sync. | `/shared`, account edit dialog |
| **Security** | Optional PIN lock with idle auto-lock (locked when the browser closes, signed out after 5 wrong PINs), plus fingerprint/face unlock via WebAuthn. | `/settings`, `src/proxy.ts` |
| **Backups** | Automatic daily SQLite snapshot (keeps 14), manual snapshot, per-user JSON export and restore (takes a snapshot before restoring). | `/settings`, `src/lib/backup.ts` |

## How it fits together

- `src/db/schema.ts`: the data model. Money is stored as integer minor units in the currency of the row's account.
- `src/lib/*`: all domain logic, server-only. Pages and server actions stay thin.
- `src/app/actions/*`: server actions. Every one re-checks the session and ownership.
- `src/proxy.ts`: fast redirects for signed-out or locked sessions, and slides the PIN idle timer.
- `src/instrumentation.ts` → `src/lib/scheduler.ts`: every 30 minutes, runs the daily backup and creates reminders/alerts for all users.

Logos: `node scripts/fetch-logos.mjs` downloads each institution's icon from its official site into `public/logos/` and regenerates `src/lib/logos.generated.ts`. Add a key and domain to `LOGO_DOMAINS` in that script for a new bank. Institutions without a logo get a lettered badge. The logos are their owners' trademarks; they're here to help you recognize your own accounts.

Schema changes: edit `src/db/schema.ts`, run `npm run db:generate`, and the migration is applied on next start.

## Notes and limits

- **Notifications** appear under the bell, and as browser pop-ups if allowed, **while the app is open**. Push notifications to a closed browser or phone would need a service worker and a push service (VAPID). They aren't set up.
- **Exchange rates** come from the ECB via Frankfurter (about 30 major currencies, business days). Balances in an unsupported currency are listed as “not included” rather than guessed.
- **Stock prices** use Yahoo Finance's public endpoint, which is unofficial and can change. Set `ALPHA_VANTAGE_KEY` for a fallback.
- **Voice input** uses the browser's Web Speech API (Chrome, Edge, Safari).
- **Biometric unlock** needs HTTPS in production (localhost works for development). Set `WEBAUTHN_ORIGIN` to your public URL.
- **Portfolio history** values each past day using your *current* units, since buys and sells aren't tracked as separate trades.
- Streak days and "today" follow the server's time zone.
