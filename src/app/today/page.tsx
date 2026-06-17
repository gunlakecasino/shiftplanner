"use client";

import dynamic from "next/dynamic";
import { QueryProvider } from "@/app/shiftbuilder/providers";
import { OpsAuthProvider } from "@/lib/auth/opsAuth";
import { TodayLoadingShell } from "./components/TodayLoadingShell";

const TodayPageClient = dynamic(() => import("./components/TodayPageClient").then((m) => m.TodayPageClient), {
  ssr: false,
  loading: () => <TodayLoadingShell />,
});

export default function TodayPage() {
  return (
    <OpsAuthProvider>
      <QueryProvider>
        <TodayPageClient />
      </QueryProvider>
    </OpsAuthProvider>
  );
}