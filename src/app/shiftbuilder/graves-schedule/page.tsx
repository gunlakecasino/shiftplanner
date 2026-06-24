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
    loading: () => null,
  },
);

export default function GravesScheduleRoute() {
  return (
    <QueryProvider>
      <GravesDefaultSchedulePage />
    </QueryProvider>
  );
}