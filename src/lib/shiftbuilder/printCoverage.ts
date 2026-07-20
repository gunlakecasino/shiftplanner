import type { CoveredByEntry } from "./coverageHelpers";

/** Break pills are ambiguous when two source cards jointly cover one target. */
export function multiPersonCoverageSourceKeys(
  coveredByIndex: Record<string, CoveredByEntry[]>,
): Set<string> {
  const keys = new Set<string>();
  for (const entries of Object.values(coveredByIndex)) {
    if (entries.length < 2) continue;
    for (const entry of entries) keys.add(entry.sourceKey);
  }
  return keys;
}
