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
        {/* Material Symbols Rounded — variable icon font used throughout the app */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('oms-theme');var s=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t!=='light'&&s)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full bg-[#F8F8F9] text-[#1C1C1E] dark:bg-[#111113] dark:text-[#F2F2F4]">
        {children}
      </body>
    </html>
  );
}
