// Category icons are Phosphor icons, referred to by key ("ForkKnife").
// Stored `categories.icon` values can be a legacy emoji ("🍜") or "ph:Key";
// this module resolves either (plus the category name as a hint) to a key.
// Pure data: safe to import from server and client code.

export const ICON_KEYS = [
  // Expenses
  "ForkKnife", "Hamburger", "Coffee", "BeerBottle", "ShoppingCart", "Bus", "Car", "Taxi", "Motorcycle", "Train", "GasPump",
  "Airplane", "Lightbulb", "Lightning", "Drop", "WifiHigh", "DeviceMobile", "Television", "ArrowsClockwise", "House", "Wrench",
  "Hammer", "ShoppingBag", "TShirt", "Pill", "Stethoscope", "Heart", "Barbell", "GraduationCap", "Book", "FilmSlate",
  "GameController", "MusicNotes", "Scissors", "Sparkle", "Gift", "Cake", "Baby", "PawPrint", "Plant", "Church", "HandHeart",
  "Bank", "CreditCard", "Receipt", "Package",
  // Income
  "Briefcase", "Storefront", "Laptop", "Handshake", "TrendUp", "PiggyBank", "Confetti", "ArrowUUpLeft", "Coins", "Wallet", "Tag",
] as const;
export type IconKey = (typeof ICON_KEYS)[number];

// Built-in categories (see DEFAULT_CATEGORIES) by name.
const BY_NAME: Record<string, IconKey> = {
  "food & dining": "ForkKnife",
  groceries: "ShoppingCart",
  transport: "Bus",
  "bills & utilities": "Lightbulb",
  subscriptions: "ArrowsClockwise",
  housing: "House",
  shopping: "ShoppingBag",
  health: "Pill",
  education: "GraduationCap",
  entertainment: "FilmSlate",
  travel: "Airplane",
  "personal care": "Scissors",
  "family & gifts": "Gift",
  "fees & interest": "Bank",
  other: "Package",
  salary: "Briefcase",
  business: "Storefront",
  freelance: "Laptop",
  "interest & dividends": "TrendUp",
  "gifts received": "Confetti",
  refunds: "ArrowUUpLeft",
  "other income": "Coins",
};

// Legacy emoji picked for custom categories before icons were Phosphor.
const BY_EMOJI: Record<string, IconKey> = {
  "🍜": "ForkKnife", "🍔": "Hamburger", "☕": "Coffee", "🍺": "BeerBottle", "🛒": "ShoppingCart", "🚌": "Bus", "🚗": "Car",
  "🚕": "Taxi", "🏍️": "Motorcycle", "🚆": "Train", "⛽": "GasPump", "✈️": "Airplane", "💡": "Lightbulb", "⚡": "Lightning",
  "💧": "Drop", "📶": "WifiHigh", "📱": "DeviceMobile", "📺": "Television", "🔁": "ArrowsClockwise", "🏠": "House",
  "🔧": "Wrench", "🛍️": "ShoppingBag", "👕": "TShirt", "💊": "Pill", "🩺": "Stethoscope", "❤️": "Heart", "🏋️": "Barbell",
  "🎓": "GraduationCap", "📚": "GraduationCap", "📖": "Book", "🎬": "FilmSlate", "🎮": "GameController", "🎵": "MusicNotes",
  "💇": "Scissors", "✨": "Sparkle", "🎁": "Gift", "🎂": "Cake", "👶": "Baby", "🐶": "PawPrint", "🐱": "PawPrint", "🌱": "Plant",
  "⛪": "Church", "🙏": "HandHeart", "🏦": "Bank", "💳": "CreditCard", "🧾": "Receipt", "📦": "Package", "💼": "Briefcase",
  "🏪": "Storefront", "💻": "Laptop", "🤝": "Handshake", "📈": "TrendUp", "🐷": "PiggyBank", "🎉": "Confetti", "↩️": "ArrowUUpLeft",
  "💰": "Coins", "👛": "Wallet",
};

// Last resort for custom categories: guess from the name.
const BY_KEYWORD: [RegExp, IconKey][] = [
  [/pet|dog|cat|vet/, "PawPrint"],
  [/car|auto|parking|toll/, "Car"],
  [/gas|fuel/, "GasPump"],
  [/coffee|cafe/, "Coffee"],
  [/drink|bar|beer|alcohol/, "BeerBottle"],
  [/baby|kid|child|school/, "Baby"],
  [/gym|fitness|sport/, "Barbell"],
  [/game/, "GameController"],
  [/music|concert/, "MusicNotes"],
  [/phone|load|mobile/, "DeviceMobile"],
  [/internet|wifi/, "WifiHigh"],
  [/water/, "Drop"],
  [/electric|power/, "Lightning"],
  [/cloth|apparel|fashion/, "TShirt"],
  [/church|tithe|donat|charity/, "HandHeart"],
  [/saving|invest/, "PiggyBank"],
  [/card|loan|debt/, "CreditCard"],
  [/repair|maint/, "Wrench"],
  [/plant|garden/, "Plant"],
  [/birthday|party/, "Cake"],
  [/beauty|salon|spa/, "Sparkle"],
  [/doctor|medical|dental/, "Stethoscope"],
  [/tax|fee/, "Receipt"],
  [/food|eat|meal|lunch|dinner/, "ForkKnife"],
  [/rent|home/, "House"],
];

export function categoryIconKey(name: string | null | undefined, icon: string | null | undefined): IconKey {
  if (icon?.startsWith("ph:")) {
    const k = icon.slice(3) as IconKey;
    if (ICON_KEYS.includes(k)) return k;
  }
  const n = (name ?? "").trim().toLowerCase();
  if (BY_NAME[n]) return BY_NAME[n];
  if (icon && BY_EMOJI[icon]) return BY_EMOJI[icon];
  for (const [re, k] of BY_KEYWORD) if (re.test(n)) return k;
  return "Tag";
}

/** The icon as plain text (for notifications, shortcut menus): emoji only. */
export function iconText(icon: string | null | undefined): string {
  return icon && !icon.startsWith("ph:") ? icon : "";
}
