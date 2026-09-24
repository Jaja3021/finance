import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cash Hey",
    short_name: "Cash Hey",
    description: "Track money, budgets, bills and investments.",
    start_url: "/",
    display: "standalone",
    background_color: "#111110",
    theme_color: "#2563eb",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the home-screen icon (Android) to jump straight in.
    shortcuts: [
      { name: "Log expense", short_name: "Log", url: "/quick", icons: [{ src: "/app-icon/96", sizes: "96x96" }] },
      { name: "Log income", short_name: "Income", url: "/quick?type=income", icons: [{ src: "/app-icon/96", sizes: "96x96" }] },
      { name: "Assistant", url: "/assistant", icons: [{ src: "/app-icon/96", sizes: "96x96" }] },
    ],
  };
}
