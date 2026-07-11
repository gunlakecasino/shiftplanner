"use client";

import dynamic from "next/dynamic";

const TeamClient = dynamic(() => import("./TeamClient"), {
  ssr: false,
  loading: () => null,
});

export default function ShiftBuilderTeamPage() {
  return <TeamClient />;
}
