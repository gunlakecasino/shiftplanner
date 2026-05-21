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
    >
      <body className="min-h-full bg-[#F8F8F9] text-[#1C1C1E] dark:bg-[#0A0A0B] dark:text-[#F2F2F4]">
        {children}
      </body>
    </html>
  );
}
