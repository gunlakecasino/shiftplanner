"use client";

import dynamic from "next/dynamic";
import { QueryProvider } from "@/app/shiftbuilder/providers";
import { BuilderLoadingShell } from "@/app/shiftbuilder/components/builderPrimitives";
import { OpsAuthProvider } from "@/lib/auth/opsAuth";

const TodayPageClient = dynamic(() => import("./components/TodayPageClient").then((m) => m.TodayPageClient), {
  ssr: false,
  loading: () => <BuilderLoadingShell label="Loading Today…" />,
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