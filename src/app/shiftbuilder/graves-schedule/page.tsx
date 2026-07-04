"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BuilderLoadingShell } from "../components/builderPrimitives";

/**
 * The graves default schedule now lives on the /team page (Graves Schedule tab).
 * Keep this route as a redirect so old links / bookmarks still resolve.
 */
export default function GravesScheduleRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/shiftbuilder/team?tab=schedule");
  }, [router]);

  return <BuilderLoadingShell label="REDIRECTING" sublabel="Graves schedule moved to Team" />;
}
