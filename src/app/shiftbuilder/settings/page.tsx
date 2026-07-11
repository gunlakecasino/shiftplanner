"use client";

import dynamic from "next/dynamic";

const SettingsClient = dynamic(() => import("./SettingsClient"), {
  ssr: false,
  loading: () => null,
});

export default function ShiftBuilderSettingsPage() {
  return <SettingsClient />;
}