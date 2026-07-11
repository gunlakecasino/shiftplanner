"use client";

import dynamic from "next/dynamic";

const ReportsClient = dynamic(() => import("./ReportsClient"), {
  ssr: false,
  loading: () => null,
});

export default function ShiftBuilderReportsPage() {
  return <ReportsClient />;
}