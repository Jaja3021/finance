"use client";

/** Registers the service worker once. Safe to call repeatedly. */
export async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
  } catch {
    return null;
  }
}

/**
 * Shows a system notification. Asks for permission the first time (call it
 * from a tap). Returns false when the browser can't or won't show one, so
 * the caller can rely on its on-screen confirmation instead.
 */
export async function showSystemNotification(title: string, body: string, url = "/transactions") {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "default") await Notification.requestPermission();
  if (Notification.permission !== "granted") return false;
  const reg = await ensureServiceWorker();
  try {
    if (reg) await reg.showNotification(title, { body, icon: "/app-icon/192", badge: "/app-icon/96", data: { url }, tag: `ft-${Date.now()}` });
    else new Notification(title, { body, icon: "/app-icon/192" });
    return true;
  } catch {
    return false;
  }
}
