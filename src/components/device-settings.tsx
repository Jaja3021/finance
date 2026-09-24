"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "@phosphor-icons/react/ssr";
import { startRegistration, browserSupportsWebAuthn, platformAuthenticatorIsAvailable } from "@simplewebauthn/browser";

const noop = () => () => {};

export function BiometricSetup({ enabled, devices }: { enabled: boolean; devices: { id: string; label: string; createdAt: number }[] }) {
  const router = useRouter();
  const supported = useSyncExternalStore(noop, () => browserSupportsWebAuthn(), () => true);
  const [platform, setPlatform] = useState<boolean | null>(null);
  const available = supported ? platform : false;
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (supported) platformAuthenticatorIsAvailable().then(setPlatform, () => setPlatform(false));
  }, [supported]);

  async function register() {
    setMsg(null);
    try {
      const options = await fetch("/api/webauthn/register").then((r) => r.json());
      if (options.error) throw new Error(options.error);
      const response = await startRegistration({ optionsJSON: options });
      const label = /iPhone|iPad/.test(navigator.userAgent) ? "iPhone/iPad" : /Android/.test(navigator.userAgent) ? "Android" : /Mac/.test(navigator.userAgent) ? "Mac" : /Windows/.test(navigator.userAgent) ? "Windows PC" : "This device";
      const res = await fetch("/api/webauthn/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, label }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setMsg("Biometric unlock is on for this device.");
      router.refresh();
    } catch (err) {
      setMsg((err as Error).name === "NotAllowedError" ? "Cancelled." : (err as Error).message);
    }
  }

  if (!enabled) return <p className="text-sm text-muted">Turn on the PIN lock first.</p>;
  return (
    <div className="space-y-2">
      {devices.length > 0 && (
        <ul className="text-sm">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center gap-1.5">
              <CheckIcon size={14} weight="bold" className="text-good" aria-hidden /> {d.label}{" "}
              <span className="text-xs text-muted">added {new Date(d.createdAt).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
      {available === false ? (
        <p className="text-sm text-muted">This browser or device doesn&apos;t offer built-in biometrics. Biometric unlock also needs HTTPS (or localhost).</p>
      ) : (
        <button className="btn-ghost" onClick={register} disabled={available === null}>
          Set up on this device
        </button>
      )}
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}

export function NotificationPermission() {
  const current = useSyncExternalStore(
    noop,
    () => ("Notification" in window ? Notification.permission : "unsupported"),
    () => null,
  );
  const [asked, setPerm] = useState<NotificationPermission | null>(null);
  const perm = asked ?? current;
  if (perm === null) return null;
  if (perm === "unsupported") return <p className="text-sm text-muted">This browser doesn&apos;t support notifications.</p>;
  if (perm === "granted")
    return (
      <p className="flex items-center gap-1.5 text-sm text-good">
        <CheckIcon size={14} weight="bold" aria-hidden /> Browser notifications are on.
      </p>
    );
  if (perm === "denied") return <p className="text-sm text-muted">Notifications are blocked. Allow them in your browser&apos;s site settings.</p>;
  return (
    <button className="btn-ghost" onClick={() => Notification.requestPermission().then(setPerm)}>
      Allow browser notifications
    </button>
  );
}
