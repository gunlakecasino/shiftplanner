"use client";

import dynamic from "next/dynamic";
import { QueryProvider } from "../providers";

const GravesDefaultSchedulePage = dynamic(
  () =>
    import("../components/GravesDefaultSchedulePage").then((m) => ({
      default: m.GravesDefaultSchedulePage,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center text-neutral-500 text-sm">
        Loading Graves Default Schedule…
      </div>
    ),
  },
);

export default function GravesScheduleRoute() {
  return (
    <QueryProvider>
      <GravesDefaultSchedulePage />
    </QueryProvider>
  );
}