/** Shared card population enter — uses `.sb-card-populate` in authGate.css */
export const CARD_POPULATION_BASE = "sb-card-populate";

const MAX_STAGGER_INDEX = 8;

/** Subtle staggered enter class for populated assignment cards. */
export function cardPopulationClass(index = 0): string {
  const clamped = Math.max(0, Math.min(index, MAX_STAGGER_INDEX));
  return `${CARD_POPULATION_BASE} ${CARD_POPULATION_BASE}--d${clamped}`;
}

/** Merge population class with an existing card className. */
export function withCardPopulation(
  className: string,
  index = 0,
  active = true,
): string {
  if (!active) return className;
  const pop = cardPopulationClass(index);
  return className ? `${className} ${pop}` : pop;
}