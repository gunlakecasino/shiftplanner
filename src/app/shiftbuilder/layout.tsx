"use client";

import { Suspense } from "react";
import { OpsAuthProvider } from "@/lib/auth/opsAuth";
import { OpsAuthGate } from "./components/OpsAuthGate";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { QueryProvider } from "./providers";
import SheetBuilderRouteContinuity from "./components/SheetBuilderRouteContinuity";
import { Toaster } from "sonner";
import "./authGate.css";

/**
 * Single QueryClient for the entire /shiftbuilder tree.
 * Pages must not wrap their own QueryProvider (duplicate clients break cache sharing).
 */
export default function ShiftBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
