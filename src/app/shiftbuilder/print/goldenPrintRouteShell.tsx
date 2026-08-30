"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { GoldenPrintRouteClient } from "./goldenPrintRouteClient";
import type { GoldenPrintSheet } from "./goldenPrintRoute";

type Props = {
  date: string;
  sheets: GoldenPrintSheet[];
};

/**
 * Isolated QueryClient — no BuilderDataPrefetch / live-canvas storm.
 * Session cookie is already required on the server.
 */
export function GoldenPrintRouteShell({ date, sheets }: Props) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 0,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <GoldenPrintRouteClient date={date} sheets={sheets} />
    </QueryClientProvider>
  );
}
