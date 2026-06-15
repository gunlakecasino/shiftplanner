Rebuild base for premium smoothness (non-print) - Sun Jun 14 17:16:02 EDT 2026

2026-06-15 builder stabilization sync:
- useShiftData.ts: added React ref + useMemo stabilizers for effectiveCardBorders, effective*Sets (fullGrave etc), rosters, assignments, recentZoneHistory. sigOf helper to detect real content change vs fresh object literals from query ?? {} / new Set().
- useZoom.ts: hoisted zoomModeRef/fitScaleRef/stepsRef before recomputeScale definition; added epsilon (0.001) + fitScaleRef check before every setFitScale(proposed) inside recomputeScale. Prevents micro-delta loops from ResizeObserver/RAF/measurements when builderFitEnabled (content height thrash on aux/assignments).
- ShiftBuilderClient.tsx: tightened cardBorders sync effect (ref identity first then stringify bail); switched the scheduledTmIds + recentZoneHistory hydration effects to depend on + read from the now-stable effective* values instead of raw currentNight.* .
- usePlacementFitMap.ts: added lastHistoriesSigRef + guarded setHistories({}) / nextH to avoid churn from effect.
All changes strictly builder-view (isBuilderDeployment paths, no isPrintPreview or print/ files touched or referenced in edits). Rebuild context in archive maintained.
