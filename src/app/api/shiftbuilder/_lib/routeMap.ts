// v1.0 Release-Ready — Final Debug Pass + Full Audit Trail — UI frozen June 24 2026

/**
 * ShiftBuilder API route consolidation map.
 * Legacy URLs remain valid aliases — no client changes required for v1.0 floor release.
 */
export const SHIFTBUILDER_ROUTE_MAP = {
  canonical: {
    night: "GET /api/shiftbuilder/night?date=&layer=core|secondary",
    roster: "GET /api/shiftbuilder/roster?date=&night_id=",
    config: "GET /api/shiftbuilder/config?resource=slot-defaults|graves-schedule|on-call",
    actions: "POST /api/shiftbuilder/actions?op=mutations|audit|refresh|histories|rotation-report|engine-insight|on-call|aux-layout|graves-schedule",
    adminOpsLogs: "GET /api/admin/ops-logs (sudo_admin only)",
  },
  aliases: {
    "/api/shiftbuilder/night-core": "/api/shiftbuilder/night?layer=core",
    "/api/shiftbuilder/night-secondary": "/api/shiftbuilder/night?layer=secondary",
    "/api/shiftbuilder/scheduled-roster": "/api/shiftbuilder/roster",
    "/api/shiftbuilder/log-change": "/api/shiftbuilder/actions?op=audit",
    "/api/shiftbuilder/mutations": "/api/shiftbuilder/actions?op=mutations",
    "/api/shiftbuilder/refresh-day": "/api/shiftbuilder/actions?op=refresh",
    "/api/shiftbuilder/placement-histories": "/api/shiftbuilder/actions?op=histories",
    "/api/shiftbuilder/rotation-report": "/api/shiftbuilder/actions?op=rotation-report",
    "/api/shiftbuilder/engine-insight": "/api/shiftbuilder/actions?op=engine-insight",
    "/api/shiftbuilder/night-on-call": "/api/shiftbuilder/actions?op=on-call (POST) or config?resource=on-call (GET)",
    "/api/shiftbuilder/aux-layout": "/api/shiftbuilder/actions?op=aux-layout",
    "/api/shiftbuilder/slot-defaults": "/api/shiftbuilder/config?resource=slot-defaults",
    "/api/shiftbuilder/graves-default-schedule":
      "/api/shiftbuilder/config?resource=graves-schedule (GET) or actions?op=graves-schedule (POST/PUT/DELETE)",
    "/api/logs/changes": "/api/admin/ops-logs (sudo_admin; richer filters + all operators)",
  },
} as const;