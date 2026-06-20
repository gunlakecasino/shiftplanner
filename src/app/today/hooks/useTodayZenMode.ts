"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ZEN_IDLE_MS = 8000;

export function useTodayZenMode(enabled: boolean) {
  const [zenActive, setZenActive] = useState(false);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userPinnedRef = useRef(false);

  const clearIdle = useCallback(() => {
    if (idleRef.current) {
      clearTimeout(idleRef.current);
      idleRef.current = null;
    }
  }, []);

  const armIdle = useCallback(() => {
    if (!enabled || userPinnedRef.current) return;
    clearIdle();
    idleRef.current = setTimeout(() => setZenActive(true), ZEN_IDLE_MS);
  }, [enabled, clearIdle]);

  const exitZen = useCallback(() => {
    setZenActive(false);
    userPinnedRef.current = false;
    armIdle();
  }, [armIdle]);

  const toggleZen = useCallback(() => {
    setZenActive((prev) => {
      const next = !prev;
      userPinnedRef.current = next;
      if (!next) armIdle();
      else clearIdle();
      return next;
    });
  }, [armIdle, clearIdle]);

  const registerActivity = useCallback(() => {
    if (zenActive && !userPinnedRef.current) {
      setZenActive(false);
    }
    armIdle();
  }, [zenActive, armIdle]);

  useEffect(() => {
    if (!enabled) {
      clearIdle();
      setZenActive(false);
      return;
    }

    armIdle();
    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "wheel",
    ];
    const onActivity = () => registerActivity();
    for (const ev of events) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    return () => {
      clearIdle();
      for (const ev of events) {
        window.removeEventListener(ev, onActivity);
      }
    };
  }, [enabled, armIdle, clearIdle, registerActivity]);

  return { zenActive, toggleZen, exitZen, registerActivity };
}