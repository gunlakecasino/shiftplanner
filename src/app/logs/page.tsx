"use client";

import dynamic from "next/dynamic";
import { QueryProvider } from "@/app/shiftbuilder/providers";
import { BuilderLoadingShell } from "@/app/shiftbuilder/components/builderPrimitives";

const LogsPageClient = dynamic(
  () => import("./components/LogsPageClient").then((m) => m.LogsPageClient),
  {
    ssr: false,
    loading: () => <BuilderLoadingShell label="Loading change log…" />,
  },
);

export default function LogsPage() {
  return (
    <QueryProvider>
      <LogsPageClient />
    </QueryProvider>
  );
}