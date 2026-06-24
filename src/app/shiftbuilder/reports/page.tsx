"use client";

import dynamic from "next/dynamic";
import { QueryProvider } from "../providers";

const ReportsClient = dynamic(() => import("./ReportsClient"), {
  ssr: false,
  loading: () => null,
});

export default function ShiftBuilderReportsPage() {
  return (
    <QueryProvider>
      <ReportsClient />
    </QueryProvider>
  );
}