"use client";

import dynamic from "next/dynamic";
import { QueryProvider } from "../providers";
import { BuilderLoadingShell } from "../components/builderPrimitives";

const GravesDefaultSchedulePage = dynamic(
  () =>
    import("../components/GravesDefaultSchedulePage").then((m) => ({
      default: m.GravesDefaultSchedulePage,
    })),
  {
    ssr: false,
    loading: () => (
      <BuilderLoadingShell
        label="LOADING GRAVES SCHEDULE"
        sublabel="Fri–Thu default grid"
      />
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