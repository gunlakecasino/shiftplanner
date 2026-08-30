"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { OpsAuthProvider } from "@/lib/auth/opsAuth";
import { OpsAuthGate } from "./components/OpsAuthGate";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { QueryProvider } from "./providers";
import SheetBuilderRouteContinuity from "./components/SheetBuilderRouteContinuity";
import { isGoldenPrintPathname } from "./print/goldenPrintRoute";
import { Toaster } from "sonner";
import "./authGate.css";

/**
 * Single QueryClient for the entire /shiftbuilder tree.
 * Pages must not wrap their own QueryProvider (duplicate clients break cache sharing).
 *
 * /print/golden is a headless Chrome target: session cookie already required,
 * no sign-in form, no live-canvas prefetch.
 */
export default function ShiftBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (isGoldenPrintPathname(pathname ?? "")) {
    return <>{children}</>;
  }

  return (
    <OpsAuthProvider>
      <OpsAuthGate loadingSublabel="Preparing computer context">
        <ConfirmProvider>
          <QueryProvider>
            <Suspense fallback={null}>
              <SheetBuilderRouteContinuity>{children}</SheetBuilderRouteContinuity>
            </Suspense>
          </QueryProvider>
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            toastOptions={{ duration: 5000 }}
          />
        </ConfirmProvider>
      </OpsAuthGate>
    </OpsAuthProvider>
  );
}
