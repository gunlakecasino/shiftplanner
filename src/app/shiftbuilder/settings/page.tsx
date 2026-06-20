"use client";

import dynamic from "next/dynamic";
import { QueryProvider } from "../providers";
import { BuilderLoadingShell } from "../components/builderPrimitives";

const SettingsClient = dynamic(() => import("./SettingsClient"), {
  ssr: false,
  loading: () => <BuilderLoadingShell label="LOADING SETTINGS" />,
});

export default function ShiftBuilderSettingsPage() {
  return (
    <QueryProvider>
      <SettingsClient />
    </QueryProvider>
  );
}