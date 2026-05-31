import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  Atkinson_Hyperlegible,
  Bricolage_Grotesque,
  Inter_Tight,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";

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
  title: "OMS — Operations Management System",
  description: "ZDS Forge • Shift Builder — Operational planning for ZDS.",
  icons: {
    icon: "/favicon.ico",
  },
  // PWA foundation (Phase 0 — will become critical in Phase 3)
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ShiftForge",
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
        {/* === VELVET PERFORMANCE: Service Worker registration ===
            - ONLY registers in production (secure contexts).
            - In development (localhost / .local / common dev ports) we explicitly
              unregister any existing SW + skip registration.
            - This is critical for Turbopack HMR. Aggressive caching of /_next/static chunks
              during dev causes "module factory is not available" errors.
            - The SW itself (public/sw.js) also has a localhost early-exit as defense-in-depth.
            - We deliberately avoid process.env here to prevent "Can't find variable: process"
              crashes on iPad Safari simulator and certain Turbopack dev loads.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  // === PROPER GUARD: Never register SW during development ===
  // We use a pure runtime hostname/port check (no process.env) because this runs
  // inside dangerouslySetInnerHTML. Bare "process" references cause hard crashes
  // ("Can't find variable: process") on iPad Safari simulator + Turbopack dev.
  if (
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname.endsWith('.local') ||
    location.port === '3000' ||
    location.port === '3001'
  ) {
    // Dev: aggressively clean SWs and caches so Turbopack HMR stays healthy.
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      registrations.forEach(function(registration) { registration.unregister(); });
    });
    if ('caches' in window) {
      caches.keys().then(function(keys) { keys.forEach(function(k){caches.delete(k);}); });
    }
    return;
  }

  // Production only: register on secure contexts
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;

  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(function(reg) {
        // Optional: expose version for Sudo debugging
        if (reg.active) {
          const ch = new MessageChannel();
          ch.port1.onmessage = function(e) { console.log('[Velvet SW] version', e.data.version); };
          reg.active.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
        }
        console.log('[Velvet] Service Worker registered');
      })
      .catch(function(err) {
        console.warn('[Velvet] SW registration failed (non-fatal):', err?.message);
      });
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
