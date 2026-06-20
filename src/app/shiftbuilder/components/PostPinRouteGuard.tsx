"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import {
  guardAuthenticatedRoute,
  resolveOpsSurface,
  type OpsSurface,
} from "@/lib/auth/postPinRoute";

/**
 * Enforces admin vs team route boundaries after PIN authentication.
 * Team operators cannot remain on /shiftbuilder/settings.
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

  useEffect(() => {
    onSurfaceResolved?.(surface);
  }, [surface, onSurfaceResolved]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const redirect = guardAuthenticatedRoute(pathname, surface);
    if (redirect) router.replace(redirect);
  }, [isAuthenticated, pathname, router, surface]);

  return <>{children}</>;
}