/** Fetch published night_date values for the /today nav calendar + strip. */
export async function fetchPublishedDates(from: string, to: string): Promise<Set<string>> {
  const res = await fetch(
    `/api/today/published-dates?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { credentials: "same-origin", cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`Published dates unavailable (${res.status})`);
  }
  const json = (await res.json()) as { dates?: string[] };
  return new Set(json.dates ?? []);
}