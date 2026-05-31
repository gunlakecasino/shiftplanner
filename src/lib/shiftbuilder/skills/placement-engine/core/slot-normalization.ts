/**
 * Slot normalization — sacred canonicalization.
 * Every piece of the engine (deterministic + Grok) must use these.
 */

export function normalizeSlotId(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '');
}

export function isValidSlotId(id: string): boolean {
  return /^[A-Z0-9-]+$/.test(id) && id.length > 1;
}
