function isUsefulName(value: string | null | undefined): value is string {
  const name = value?.trim();
  return Boolean(name && name !== "-");
}

function friendlyNameFromTmId(tmId: string | null | undefined): string | null {
  const raw = tmId?.trim();
  if (!raw) return null;

  const withoutPrefix = raw.replace(/^tm[_-]/i, "");
  if (!withoutPrefix || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(withoutPrefix)) {
    return raw;
  }

  return withoutPrefix
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Print should never render a bare dash for an assigned TM. A dash is only an
 * empty-slot marker; if a tmId exists, recover the best readable label.
 */
export function printAssigneeName(
  tmName: string | null | undefined,
  tmId: string | null | undefined,
): string | null {
  if (isUsefulName(tmName)) return tmName.trim();
  return friendlyNameFromTmId(tmId);
}

export function hasPrintAssigneeName(
  tmName: string | null | undefined,
  tmId: string | null | undefined,
): boolean {
  return Boolean(printAssigneeName(tmName, tmId));
}
