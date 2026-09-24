import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

// Money is stored as integer minor units (e.g. centavos) in the currency of the
// row it belongs to. Dates the user picks are "YYYY-MM-DD" text; timestamps are
// epoch milliseconds.

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now());

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  homeCurrency: text("home_currency").notNull().default("PHP"),
  pinHash: text("pin_hash"),
  lockAfterMinutes: integer("lock_after_minutes").notNull().default(5),
  // UI language (a key of LOCALES in src/i18n).
  locale: text("locale").notNull().default("en"),
  // Total spending plan for a month, home currency. Null = sum of category budgets.
  monthlyPlan: integer("monthly_plan"),
  createdAt: createdAt(),
});

export const households = sqliteTable("households", {
  id: id(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: createdAt(),
});

export const householdMembers = sqliteTable(
  "household_members",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: createdAt(),
  },
  (t) => [uniqueIndex("household_member_uq").on(t.householdId, t.userId)],
);

export const ACCOUNT_TYPES = [
  "cash",
  "bank",
  "ewallet",
  "credit_card",
  "loan",
  "other",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const accounts = sqliteTable("accounts", {
  id: id(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // When set, every member of the household can see and log to this account.
  householdId: text("household_id").references(() => households.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  type: text("type").$type<AccountType>().notNull(),
  institution: text("institution"),
  currency: text("currency").notNull(),
  openingBalance: integer("opening_balance").notNull().default(0),
  creditLimit: integer("credit_limit"),
  interestRate: real("interest_rate"),
  color: text("color"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").$type<"income" | "expense">().notNull(),
    icon: text("icon"),
  },
  (t) => [uniqueIndex("category_user_name_uq").on(t.userId, t.kind, t.name)],
);

export const TX_TYPES = ["income", "expense", "transfer"] as const;
export type TxType = (typeof TX_TYPES)[number];

export const transactions = sqliteTable(
  "transactions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    type: text("type").$type<TxType>().notNull(),
    // Always positive, in the source account's currency.
    amount: integer("amount").notNull(),
    // For transfers: destination account and the amount it receives (its currency).
    toAccountId: text("to_account_id").references(() => accounts.id, {
      onDelete: "cascade",
    }),
    toAmount: integer("to_amount"),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    categorySource: text("category_source")
      .$type<"user" | "auto" | "ai">()
      .notNull()
      .default("user"),
    date: text("date").notNull(),
    payee: text("payee"),
    note: text("note"),
    billId: text("bill_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("tx_account_date").on(t.accountId, t.date),
    index("tx_user_date").on(t.userId, t.date),
  ],
);

// One row per person sharing an expense. The logging user's own share is the
// transaction amount minus the sum of these rows.
export const splits = sqliteTable("splits", {
  id: id(),
  transactionId: text("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  person: text("person").notNull(),
  amount: integer("amount").notNull(),
  settled: integer("settled", { mode: "boolean" }).notNull().default(false),
});

export const budgets = sqliteTable(
  "budgets",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    // Monthly limit in the user's home currency.
    monthlyLimit: integer("monthly_limit").notNull(),
    alertAt: real("alert_at").notNull().default(0.8),
  },
  (t) => [uniqueIndex("budget_user_cat_uq").on(t.userId, t.categoryId)],
);

export const BILL_FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
export type BillFrequency = (typeof BILL_FREQUENCIES)[number];

export const bills = sqliteTable("bills", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  categoryId: text("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  frequency: text("frequency").$type<BillFrequency>().notNull(),
  // "income" for recurring money in (salary, rent received); "expense" for bills.
  type: text("type").$type<"expense" | "income">().notNull().default("expense"),
  nextDue: text("next_due").notNull(),
  remindDaysBefore: integer("remind_days_before").notNull().default(3),
  // Normalized payee used to match detected recurring transactions.
  matchKey: text("match_key"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

// Recurring patterns the user said "no" to, so we stop suggesting them.
export const dismissedRecurring = sqliteTable(
  "dismissed_recurring",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    matchKey: text("match_key").notNull(),
  },
  (t) => [uniqueIndex("dismissed_recurring_uq").on(t.userId, t.matchKey)],
);

export const holdings = sqliteTable("holdings", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"stock" | "crypto">().notNull(),
  // Ticker for stocks (Yahoo symbol, e.g. "AAPL", "JFC.PS"), CoinGecko id for crypto.
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  quantity: real("quantity").notNull(),
  // Total amount paid, in the quote currency's minor units (optional).
  costBasis: integer("cost_basis"),
  // Used when live prices are off or unavailable (major units, manualCurrency).
  manualPrice: real("manual_price"),
  manualCurrency: text("manual_currency"),
  createdAt: createdAt(),
});

// Daily closes, keyed by instrument ("stock:AAPL" / "crypto:bitcoin"), quoted in `currency`.
export const prices = sqliteTable(
  "prices",
  {
    key: text("key").notNull(),
    date: text("date").notNull(),
    close: real("close").notNull(),
    currency: text("currency").notNull(),
    fetchedAt: integer("fetched_at").notNull(),
  },
  (t) => [uniqueIndex("prices_key_date_uq").on(t.key, t.date)],
);

export const fxRates = sqliteTable(
  "fx_rates",
  {
    base: text("base").notNull(),
    quote: text("quote").notNull(),
    date: text("date").notNull(),
    rate: real("rate").notNull(),
  },
  (t) => [uniqueIndex("fx_uq").on(t.base, t.quote, t.date)],
);

export const badges = sqliteTable(
  "badges",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    badge: text("badge").notNull(),
    earnedAt: createdAt(),
  },
  (t) => [uniqueIndex("badge_uq").on(t.userId, t.badge)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    // Prevents the same reminder from being created twice.
    dedupeKey: text("dedupe_key").notNull(),
    readAt: integer("read_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("notification_dedupe_uq").on(t.userId, t.dedupeKey)],
);

export const coachTips = sqliteTable("coach_tips", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category"),
  source: text("source").$type<"ai" | "rules">().notNull(),
  // User feedback feeds back into later coaching runs.
  feedback: text("feedback").$type<"helpful" | "not_helpful">(),
  createdAt: createdAt(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").$type<"user" | "assistant">().notNull(),
  content: text("content").notNull(),
  createdAt: createdAt(),
});


// WebAuthn credentials (fingerprint / Face ID / Windows Hello) used to unlock
// the app instead of typing the PIN.
export const passkeys = sqliteTable("passkeys", {
  id: text("id").primaryKey(), // base64url credential id
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(), // base64url
  counter: integer("counter").notNull().default(0),
  transports: text("transports"),
  label: text("label"),
  createdAt: createdAt(),
});

// Personal API keys for phone shortcuts (iOS Shortcuts, Android HTTP Shortcuts).
// Only a SHA-256 hash is stored; the key itself is shown once when created.
export const apiTokens = sqliteTable("api_tokens", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  lastUsedAt: integer("last_used_at"),
  createdAt: createdAt(),
});

// Savings goals ("Emergency fund: ₱100,000 by December").
export const goals = sqliteTable("goals", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon: text("icon"), // "ph:<Key>", see src/lib/category-icons.ts
  targetAmount: integer("target_amount").notNull(), // home-currency minor units
  targetDate: text("target_date"), // YYYY-MM-DD, optional
  // Money set aside is tracked as contributions, not a linked account balance,
  // so a goal can be "conceptual" (no account required) or funded from any account.
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export const goalContributions = sqliteTable("goal_contributions", {
  id: id(),
  goalId: text("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  // Negative = withdrawn from the goal. Home-currency minor units.
  amount: integer("amount").notNull(),
  date: text("date").notNull(),
  note: text("note"),
  createdAt: createdAt(),
});

// A photographed receipt attached to a transaction. Stored on disk under
// data/receipts/, never uploaded anywhere; this row is just the pointer.
export const receipts = sqliteTable("receipts", {
  id: id(),
  transactionId: text("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  file: text("file").notNull(), // filename under data/receipts/
  contentType: text("content_type").notNull(),
  createdAt: createdAt(),
});

// Opt-in online features, off by default (see [[cash-hey-local-first]]).
export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  aiAssistantEnabled: integer("ai_assistant_enabled", { mode: "boolean" }).notNull().default(false),
  livePricesEnabled: integer("live_prices_enabled", { mode: "boolean" }).notNull().default(false),
  autoBackupEnabled: integer("auto_backup_enabled", { mode: "boolean" }).notNull().default(false),
});

// Personal debts/IOUs with another person — separate from account-based
// transactions. Direction: "owe" = I owe them; "owed" = they owe me.
export const PAYMENT_METHODS = ["gcash", "cash", "bank_transfer", "maya", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const DEBT_STATUSES = ["pending", "partial", "paid"] as const;
export type DebtStatus = (typeof DEBT_STATUSES)[number];

export const debts = sqliteTable(
  "debts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    person: text("person").notNull(),
    direction: text("direction").$type<"owe" | "owed">().notNull(),
    amount: integer("amount").notNull(), // home-currency minor units, original debt amount
    date: text("date").notNull(), // YYYY-MM-DD
    time: text("time"), // HH:mm, optional
    dueDate: text("due_date"), // YYYY-MM-DD, optional
    paymentMethod: text("payment_method").$type<PaymentMethod>().notNull().default("cash"),
    paymentMethodOther: text("payment_method_other"), // free text when paymentMethod = "other"
    note: text("note"),
    status: text("status").$type<DebtStatus>().notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [index("debt_user_status").on(t.userId, t.status)],
);

export const debtPayments = sqliteTable("debt_payments", {
  id: id(),
  debtId: text("debt_id")
    .notNull()
    .references(() => debts.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(), // home-currency minor units
  date: text("date").notNull(),
  paymentMethod: text("payment_method").$type<PaymentMethod>().notNull().default("cash"),
  paymentMethodOther: text("payment_method_other"),
  proofFile: text("proof_file"), // filename under data/receipts/, reusing the receipts store
  note: text("note"),
  createdAt: createdAt(),
});

// Proof-of-payment image attached directly to a debt at creation time
// (before any partial payment exists), reusing the same file store.
export const debtProofs = sqliteTable("debt_proofs", {
  id: id(),
  debtId: text("debt_id")
    .notNull()
    .references(() => debts.id, { onDelete: "cascade" }),
  file: text("file").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: createdAt(),
});
