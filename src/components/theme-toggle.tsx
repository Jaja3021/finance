"use client";

import { useSyncExternalStore } from "react";
import { MonitorIcon as Monitor, MoonIcon as Moon, SunIcon as Sun } from "@phosphor-icons/react/ssr";
import { THEME_COOKIE, type ThemePref } from "@/lib/theme";

// Reads the theme straight from <html> (set by the head script), so every
// toggle on the page stays in sync without extra state.
function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-theme-pref"] });
  return () => obs.disconnect();
}
const snapshot = () => `${document.documentElement.dataset.themePref ?? "system"}|${document.documentElement.dataset.theme ?? "light"}`;

function useTheme() {
  const [pref, resolved] = useSyncExternalStore(subscribe, snapshot, () => "system|light").split("|") as [ThemePref, "light" | "dark"];
  const set = (p: ThemePref) => {
    document.cookie = `${THEME_COOKIE}=${p}; path=/; max-age=31536000; samesite=lax`;
    (window as unknown as { __applyTheme?: () => void }).__applyTheme?.();
  };
  return { pref, resolved, set };
}

/** One-tap light/dark switch for the top bar. */
export function ThemeToggle() {
  const { resolved, set } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button className="icon-btn" onClick={() => set(next)} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      {resolved === "dark" ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}

/** Light / Dark / System picker for Settings. */
export function ThemeSelect() {
  const { pref, set } = useTheme();
  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Theme">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={pref === value}
          onClick={() => set(value)}
          className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm ${pref === value ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
        >
          <Icon size={16} /> {label}
        </button>
      ))}
    </div>
  );
}
