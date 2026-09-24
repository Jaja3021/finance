import Image from "next/image";
import { APP_NAME, LOGO_SRC } from "@/lib/brand";

export function LogoMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src={LOGO_SRC}
      alt=""
      width={size}
      height={size}
      priority
      className={`shrink-0 rounded-[28%] ${className}`}
      aria-hidden
    />
  );
}

/** Mark + "Cash Hey" wordmark. */
export function Logo({ size = 36, hideTextOnMobile = false }: { size?: number; hideTextOnMobile?: boolean }) {
  const [first, ...rest] = APP_NAME.split(" ");
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className={`text-[18px] font-semibold tracking-tight text-ink ${hideTextOnMobile ? "max-sm:hidden" : ""}`}>
        {first} <span className="text-link">{rest.join(" ")}</span>
      </span>
    </span>
  );
}
