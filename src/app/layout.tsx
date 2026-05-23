import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Atkinson_Hyperlegible } from "next/font/google";
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
      className={`${geistSans.variable} ${geistMono.variable} ${atkinson.variable} h-full antialiased`}
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
      </head>
      <body className="min-h-full bg-[#F8F8F9] text-[#1C1C1E] dark:bg-[#111113] dark:text-[#F2F2F4]">
        {children}
      </body>
    </html>
  );
}
