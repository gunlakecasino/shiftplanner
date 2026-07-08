"use client";

import dynamic from "next/dynamic";
import { QueryProvider } from "../providers";

const TeamClient = dynamic(() => import("./TeamClient"), {
  ssr: false,
  loading: () => null,
});

export default function ShiftBuilderTeamPage() {
  return (
    <QueryProvider>
      <TeamClient />
    </QueryProvider>
  );
}
