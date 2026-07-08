"use client";

import { OpsAuthProvider } from "@/lib/auth/opsAuth";
import { OpsAuthGate } from "./components/OpsAuthGate";
import { ConfirmProvider } from "./components/ConfirmDialog";
import "./authGate.css";

export default function ShiftBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OpsAuthProvider>
      <OpsAuthGate loadingSublabel="Preparing computer context">
        <ConfirmProvider>{children}</ConfirmProvider>
      </OpsAuthGate>
    </OpsAuthProvider>
  );
}