/* =================================================================
 * Resort & Casino Icon Library — taxonomy + global registry
 *
 * RESEARCH NOTES — what a Four Diamond casino/resort actually needs
 * ------------------------------------------------------------------
 * AAA's Four Diamond classification covers ~5–6% of inspected hotels.
 * For a casino-resort property of this tier, the iconography has to
 * cover ELEVEN surfaces simultaneously:
 *
 *   1. Native guest app          (room, dining res, shows, map)
 *   2. In-room TV / cast UI      (channels, room service, controls)
 *   3. Property kiosks           (check-in, wayfinding, restaurants)
 *   4. Player's Club app + web   (points, offers, tier, host)
 *   5. Host CRM (back-of-house)  (player notes, comps, ratings)
 *   6. Casino floor systems      (pit, cage, surveillance, drop)
 *   7. Spa & salon booking       (treatment categories, time blocks)
 *   8. F&B reservations          (cuisine type, room features)
 *   9. Event/box-office          (show categories, seat sections)
 *   10. Signage CMS              (digital signage, wayfinding)
 *   11. Hotel ops dashboards     (housekeeping, engineering, valet)
 *
 * Looking across published guest apps + signage systems for upscale
 * resort-casinos, the icon needs cluster into eleven domains. This
 * library is built to that taxonomy — not to mimic any one brand,
 * but to be usable across every surface a property like this ships.
 *
 * DESIGN LAWS (apply to every icon)
 * ------------------------------------------------------------------
 *  • 24×24 viewBox, 1.5px default stroke (toggleable 1 / 1.5 / 2)
 *  • currentColor stroke and fill — never hard-coded color
 *  • Round caps + joins — luxury reads soft, not technical
 *  • Visual mass kept inside a 20×20 optical bound (2px outer pad)
 *  • One concept per icon — no compound metaphors
 *  • Casino glyphs lean concrete (a slot machine looks like one);
 *    hospitality glyphs lean refined (a bed is a silhouette, not a
 *    cartoon pillow)
 *  • No emoji, no gradients, no shadow — flat line + selective fill
 * ================================================================= */

const LIB_CATEGORIES = [
  {
    id: "gaming",
    label: "Gaming",
    serif: "The Floor",
    desc: "Slots, table games, the cage, the pit, and the people who watch over them. The visible language of the casino floor.",
  },
  {
    id: "hotel",
    label: "Hotel & Rooms",
    serif: "The Stay",
    desc: "Suites, key cards, housekeeping, in-room features. From arrival at the porte cochère to turn-down service.",
  },
  {
    id: "spa",
    label: "Spa & Wellness",
    serif: "The Spa",
    desc: "Treatments, pool, fitness, salon. The quiet half of the resort.",
  },
  {
    id: "dining",
    label: "Dining & Bar",
    serif: "The Table",
    desc: "Steakhouse to room service, sommelier to barista. Every glyph a F&B reservation system needs.",
  },
  {
    id: "entertainment",
    label: "Entertainment",
    serif: "The Showroom",
    desc: "Theater, nightclub, concerts, comedy. Tickets, sections, headliners.",
  },
  {
    id: "property",
    label: "Property & Wayfinding",
    serif: "The Property",
    desc: "Maps, elevators, restrooms, valet, transport. The signage and navigation layer.",
  },
  {
    id: "services",
    label: "Services & Guest",
    serif: "The Concierge",
    desc: "Wifi, business center, lost & found, gift shops. Everything the concierge desk can route.",
  },
  {
    id: "activities",
    label: "Activities & Excursions",
    serif: "The Day",
    desc: "Golf, tennis, beach, marina. The reasons a guest leaves the property — or doesn't.",
  },
  {
    id: "loyalty",
    label: "Loyalty & Rewards",
    serif: "The Card",
    desc: "Tier marks, points, free play, hosts, comps. The player's club system.",
  },
  {
    id: "compliance",
    label: "Compliance & Security",
    serif: "The Watch",
    desc: "Age verification, responsible gaming, surveillance, vault, drop count. The regulated half.",
  },
  {
    id: "system",
    label: "System & UI",
    serif: "The Chrome",
    desc: "Navigation, search, status, controls. The connective tissue between every other category.",
  },
];

/* Per-category accent — used sparingly for the section-header rule
   and the active filter pill. Not applied to the icons themselves. */
const CATEGORY_ACCENTS = {
  gaming:        "var(--house)",
  hotel:         "var(--gold-deep)",
  spa:           "var(--jade)",
  dining:        "var(--gold-deep)",
  entertainment: "var(--house)",
  property:      "var(--ink-700)",
  services:      "var(--ink-700)",
  activities:    "var(--jade)",
  loyalty:       "var(--gold-deep)",
  compliance:    "var(--ink-700)",
  system:        "var(--ink-700)",
};

/* The global registry. Each icon file pushes into this. Shape:
     { id, name, category, keywords:[], notes?, render: (s)=>JSX }
   `render` returns the INNER content of the SVG — the viewer wraps
   it with the right viewBox, stroke color, and stroke width. */
const LIB_ICONS = [];

Object.assign(window, { LIB_CATEGORIES, CATEGORY_ACCENTS, LIB_ICONS });
