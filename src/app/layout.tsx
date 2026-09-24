import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Cash Hey", template: "%s · Cash Hey" },
  description: "Track money, budgets, bills and investments in one place.",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/app-icon/180" },
  appleWebApp: { capable: true, title: "Cash Hey", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f2" },
    { media: "(prefers-color-scheme: dark)", color: "#111318" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set by the inline script below before paint, so React must not complain about it.
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        {/*
          Runs synchronously before the browser paints anything below it, so the
          right theme applies with no flash. Kept as the first child of <body>
          (not inside a manually-authored <head>) so it never sits among the
          metadata tags Next/React hoist into the real <head>, which is what
          triggered a "script tag" hydration warning when it lived there.
        */}
        <script id="theme-init" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
