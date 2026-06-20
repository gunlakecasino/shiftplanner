"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PULSE_MS = 420;

export function useAssignPulse() {
  const [pulseSlotKey, setPulseSlotKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPulse = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const triggerPulse = useCallback(
    (slotKey: string) => {
      clearPulse();
      setPulseSlotKey(slotKey);
      timerRef.current = setTimeout(() => {
        setPulseSlotKey(null);
        timerRef.current = null;
      }, PULSE_MS);
    },
    [clearPulse],
  );

  useEffect(() => () => clearPulse(), [clearPulse]);

  return { pulseSlotKey, triggerPulse };
}