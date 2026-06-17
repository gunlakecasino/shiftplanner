// Re-export from canonical location in src/lib/shiftbuilder for single source of truth.
// This file is kept for backward compat during the production hardening pass.
export {
  getSlotAccentColor,
  getSlotCoverageLabel,
  expandCoverageToKeys,
  buildCoveredByIndex,
  formatCoveredByNames,
} from "@/lib/shiftbuilder/coverageHelpers";