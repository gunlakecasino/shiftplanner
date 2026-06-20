"use client";

import "./styles/todayKiosk.css";
import dynamic from "next/dynamic";
import { QueryProvider } from "@/app/shiftbuilder/providers";
import { TodayLoadingShell } from "./components/TodayLoadingShell";

const TodayPageClient = dynamic(() => import("./components/TodayPageClient").then((m) => m.TodayPageClient), {
  ssr: false,
  loading: () => <TodayLoadingShell />,
});

export default function TodayPage() {
  return (
    <QueryProvider>
      <TodayPageClient />
    </QueryProvider>
  );
}