// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
// PRODUCTION-READY — ShiftBuilder v1.0.0 floor release (June 24, 2026)
// UI frozen. Hardening only: security headers, structured logging, audit API, route aliases, UX transitions.
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  Atkinson_Hyperlegible,
  Bricolage_Grotesque,
  Inter_Tight,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";

export { viewport } from "./viewport";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Atkinson Hyperlegible — the exact font family used in the ZDS Golden PDF
const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

// Bricolage Grotesque — Velvet display font (logo, large headings, date numerals)
// Uses the variable font axis so we can pass `axes: ["opsz"]` for optical sizing
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
});

// Inter Tight — Velvet UI body font (top bar, labels, buttons, roster)
const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// JetBrains Mono — Velvet mono font (time codes, slot keys, counts, kbd hints)
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SheetBuilder — GLCR Grave Deployment",
  description: "SheetBuilder — grave shift zone deployment, assignments, and print for Gun Lake Casino Resort operations.",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
  // PWA foundation (Phase 0 — will become critical in Phase 3)
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SheetBuilder",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${atkinson.variable} ${bricolage.variable} ${interTight.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* Runs before React hydration — prevents flash of wrong theme on load.
          Reads localStorage('oms-theme') first; falls back to system preference. */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('oms-theme');var s=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t!=='light'&&s)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
        {/* === Service Worker: pre-hydration DEV cleanup only ===
            Production registration + the update/reload lifecycle live in
            <PwaRegister/> (src/app/shiftbuilder/components/PwaRegister.tsx) — a single
            registrar avoids two workers racing on the same page. This early inline script
            only handles the dev side: it must run before hydration to unregister any stale
            SW and clear caches, otherwise aggressive caching of /_next/static chunks breaks
            Turbopack HMR ("module factory is not available").
            We deliberately avoid process.env here to prevent "Can't find variable: process"
            crashes on iPad Safari simulator and certain Turbopack dev loads. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  var isDev =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname.endsWith('.local') ||
    location.port === '3000' ||
    location.port === '3001';
  if (!isDev) return;

  // Dev: aggressively clean SWs and caches so Turbopack HMR stays healthy.
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    registrations.forEach(function(registration) { registration.unregister(); });
  });
  if ('caches' in window) {
    caches.keys().then(function(keys) { keys.forEach(function(k){caches.delete(k);}); });
  }

  // If a stale SW (from before our self-destruct logic) sends us a message, force reload.
  navigator.serviceWorker.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'SW_SELF_DESTRUCTED_IN_DEV') {
      setTimeout(() => { try { location.reload(); } catch {} }, 30);
    }
  });
})();
            `.trim(),
          }}
        />
      </head>
      <body className="min-h-full bg-[#F8F8F9] text-[#1C1C1E] dark:bg-[#111113] dark:text-[#F2F2F4]">
        {children}
      </body>
    </html>
  );
}
