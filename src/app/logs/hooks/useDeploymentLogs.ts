"use client";

import { useQuery } from "@tanstack/react-query";
import type { DeploymentLogsResponse } from "../lib/types";

async function fetchDeploymentLogs(
  nightDate: string,
  operator: string | null,
): Promise<DeploymentLogsResponse> {
  const params = new URLSearchParams({ nightDate });
  if (operator) params.set("operator", operator);

  const res = await fetch(`/api/logs/changes?${params}`, {
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Failed to load logs");
  }

  return res.json() as Promise<DeploymentLogsResponse>;
}

export function useDeploymentLogs(nightDate: string, operator: string | null) {
  return useQuery({
    queryKey: ["deploymentLogs", nightDate, operator ?? ""],
    queryFn: () => fetchDeploymentLogs(nightDate, operator),
    staleTime: 1000 * 15,
    refetchOnWindowFocus: true,
  });
}