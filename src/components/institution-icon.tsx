import Image from "next/image";
import { logoFor } from "@/lib/templates";

// An account's logo: the institution's icon when we have one, otherwise a
// monogram on the account's color (cash, custom accounts, missing logos).
export function InstitutionIcon({
  institution,
  name,
  color,
  size = 32,
}: {
  institution: string | null | undefined;
  name: string;
  color?: string | null;
  size?: number;
}) {
  const logo = institution === "cash" ? null : logoFor(institution);
  const radius = Math.round(size * 0.28);
  if (logo) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-line"
        style={{ width: size, height: size, borderRadius: radius }}
        aria-hidden
      >
        {/* Favicons are already tiny; skip the image optimizer (it can't read .ico). */}
        <Image src={logo} alt="" width={size} height={size} unoptimized className="h-full w-full object-contain" />
      </span>
    );
  }
  const initials =
    institution === "cash"
      ? "₱"
      : name
          .replace(/\(.*?\)/g, "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0]!.toUpperCase())
          .join("");
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center font-semibold text-white"
      style={{ width: size, height: size, borderRadius: radius, background: color ?? "var(--muted)", fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
