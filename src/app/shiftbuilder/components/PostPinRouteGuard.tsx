"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import {
  guardAuthenticatedRoute,
  resolveOpsSurface,
  type OpsSurface,
} from "@/lib/auth/postPinRoute";
import { BuilderLoadingShell } from "./builderPrimitives";

/**
 * Enforces sudo / admin / team route boundaries after PIN authentication.
 * - Team (Viewer): canvas only — published nights, no settings or reports
 * - Admin: canvas (viewer rules) + reports — no settings
 * - Sudo: full access
 */
export function PostPinRouteGuard({
  children,
  onSurfaceResolved,
}: {
  children: React.ReactNode;
  onSurfaceResolved?: (surface: OpsSurface) => void;
}) {
  const { isAuthenticated, permissions } = useOpsAuth();
  const pathname = usePathname();
  const router = useRouter();

  const surface = resolveOpsSurface(permissions);
  const redirect =
    isAuthenticated ? guardAuthenticatedRoute(pathname, surface) : null;

  useEffect(() => {
    onSurfaceResolved?.(surface);
  }, [surface, onSurfaceResolved]);

  useEffect(() => {
    if (!redirect) return;
    router.replace(redirect);
  }, [redirect, router]);

  if (redirect) {
    return (
      <BuilderLoadingShell
        label="REDIRECTING"
        sublabel={
          surface === "reports"
            ? "Reports access only"
            : surface === "admin"
              ? "Settings are not available for your role"
              : "This area is not available for your role"
        }
      />
    );
  }

  return <>{children}</>;
}