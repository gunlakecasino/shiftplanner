/**
 * ShiftBuilder UI version (sheet footer).
 * Bump +0.001 on routine ships; major releases use explicit semver (e.g. 1.0.0).
 */
export const SHIFTBUILDER_VERSION = "1.0.10";

export function shiftBuilderVersionLabel(): string {
  return `v${SHIFTBUILDER_VERSION}`;
}