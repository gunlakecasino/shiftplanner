/** Fetch published night_date values for the /today nav calendar + strip. */
export async function fetchPublishedDates(from: string, to: string): Promise<Set<string>> {
  const res = await fetch(
    `/api/today/published-dates?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { credentials: "same-origin", cache: "no-store" },
  );
  const json = (await res.json()) as { dates?: string[]; error?: string };
  if (!res.ok || json.error) {
    throw new Error(json.error ?? `Published dates unavailable (${res.status})`);
  }
  return new Set(json.dates ?? []);
}