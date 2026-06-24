"use client";

import dynamic from "next/dynamic";
import { QueryProvider } from "../providers";
const SettingsClient = dynamic(() => import("./SettingsClient"), {
  ssr: false,
  loading: () => null,
});

export default function ShiftBuilderSettingsPage() {
  return (
    <QueryProvider>
      <SettingsClient />
    </QueryProvider>
  );
}