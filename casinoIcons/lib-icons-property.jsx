/* Property & Wayfinding — signage and navigation. */

LIB_ICONS.push(
  {
    id: "map",
    name: "Property Map",
    category: "property",
    keywords: ["map", "property", "directory", "wayfinding"],
    render: () => (<>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/>
      <path d="M9 4v16M15 6v16"/>
    </>),
  },
  {
    id: "compass",
    name: "Compass",
    category: "property",
    keywords: ["compass", "direction", "north", "orient"],
    render: () => (<>
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 6.5l2 5.5-2 5.5-2-5.5z" fill="currentColor" stroke="none" opacity="0.2"/>
      <path d="M12 6.5l2 5.5-2 5.5-2-5.5z"/>
      <path d="M12 3.5V5M12 19v1.5M3.5 12H5M19 12h1.5"/>
    </>),
  },
  {
    id: "pin",
    name: "Location Pin",
    category: "property",
    keywords: ["pin", "location", "marker", "place"],
    render: () => (<>
      <path d="M12 21s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z"/>
      <circle cx="12" cy="9" r="2.5"/>
    </>),
  },
  {
    id: "you-are-here",
    name: "You Are Here",
    category: "property",
    keywords: ["you are here", "current location", "now", "directory"],
    render: () => (<>
      <circle cx="12" cy="12" r="3"/>
      <circle cx="12" cy="12" r="7" opacity="0.5"/>
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>
    </>),
  },
  {
    id: "floor-plan",
    name: "Floor Plan",
    category: "property",
    keywords: ["floor plan", "layout", "level", "schematic"],
    render: () => (<>
      <rect x="3" y="3" width="18" height="18" rx="1"/>
      <path d="M3 12h7v-9M10 12h11M14 12v9"/>
      <path d="M6 7.5h1.5"/>
      <path d="M16.5 8.5v2"/>
    </>),
  },
  {
    id: "elevator",
    name: "Elevator",
    category: "property",
    keywords: ["elevator", "lift", "vertical", "between floors"],
    render: () => (<>
      <rect x="4" y="3" width="16" height="18" rx="1"/>
      <path d="M12 3v18"/>
      <path d="M8 9l-1.5 2L8 13" />
      <path d="M16 11l-1.5-2L13 11" />
      <path d="M13 13l1.5 2L16 13" />
      <path d="M7 17h3M14 17h3" opacity="0.6"/>
    </>),
  },
  {
    id: "escalator",
    name: "Escalator",
    category: "property",
    keywords: ["escalator", "moving stairs", "up", "down"],
    render: () => (<>
      <path d="M3 20l8-7h3a3 3 0 0 0 3-3V4"/>
      <path d="M17 4l-1.5-1.5M17 4l1.5-1.5"/>
      <path d="M7 14h-2M11 10h-2M15 6h-2" opacity="0.55"/>
    </>),
  },
  {
    id: "stairs",
    name: "Stairs",
    category: "property",
    keywords: ["stairs", "steps", "staircase"],
    render: () => (<>
      <path d="M3 20h4v-3h4v-3h4v-3h4V8h4"/>
      <path d="M3 20v1h18"/>
    </>),
  },
  {
    id: "restroom",
    name: "Restroom",
    category: "property",
    keywords: ["restroom", "bathroom", "toilet", "wc", "unisex"],
    render: () => (<>
      <circle cx="7.5" cy="5.5" r="1.8"/>
      <path d="M5 14v-4c0-1.5 1-2.5 2.5-2.5S10 8.5 10 10v4"/>
      <path d="M6.5 11v9M8.5 11v9"/>
      <circle cx="16.5" cy="5.5" r="1.8"/>
      <path d="M14 14l1.5-5c.3-1 .8-1.5 2-1.5s1.7.5 2 1.5L21 14"/>
      <path d="M15 14h3v6M16.5 14v6"/>
    </>),
  },
  {
    id: "restroom-men",
    name: "Men's Restroom",
    category: "property",
    keywords: ["mens", "men", "restroom", "male", "wc"],
    render: () => (<>
      <circle cx="12" cy="5" r="2"/>
      <path d="M8 15v-5c0-1.5 1.2-2.5 2.5-2.5h3c1.3 0 2.5 1 2.5 2.5v5"/>
      <path d="M10 11v9M14 11v9"/>
    </>),
  },
  {
    id: "restroom-women",
    name: "Women's Restroom",
    category: "property",
    keywords: ["womens", "women", "restroom", "female", "wc"],
    render: () => (<>
      <circle cx="12" cy="5" r="2"/>
      <path d="M8 15l2-5.5c.3-.9.8-1.5 2-1.5s1.7.6 2 1.5L16 15"/>
      <path d="M9 15h6v5M12 15v5"/>
    </>),
  },
  {
    id: "family-restroom",
    name: "Family Restroom",
    category: "property",
    keywords: ["family", "restroom", "infant", "changing", "all gender"],
    render: () => (<>
      <circle cx="8" cy="5" r="1.6"/>
      <path d="M5.5 13v-3c0-1.2.9-2 2-2H9c1.1 0 2 .8 2 2v3"/>
      <path d="M6.5 10v10M9.5 10v10"/>
      <circle cx="16" cy="6.5" r="1.4"/>
      <path d="M14 13.5l1.5-4c.2-.7.7-1 1.5-1s1.3.3 1.5 1L20 13.5"/>
      <path d="M15 13.5h3v6M16.5 13.5v6"/>
    </>),
  },
  {
    id: "accessibility",
    name: "Accessibility",
    category: "property",
    keywords: ["accessibility", "ada", "wheelchair", "accessible"],
    render: () => (<>
      <circle cx="9" cy="4.5" r="1.5"/>
      <path d="M9 6.5V14"/>
      <path d="M9 9.5l4 1.5"/>
      <path d="M9 14h6l-2 4"/>
      <circle cx="11" cy="16.5" r="4"/>
    </>),
  },
  {
    id: "parking",
    name: "Parking",
    category: "property",
    keywords: ["parking", "park", "garage", "valet"],
    render: () => (<>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2"/>
      <path d="M9 17V7h4a3 3 0 0 1 0 6h-4"/>
    </>),
  },
  {
    id: "self-park",
    name: "Self Park",
    category: "property",
    keywords: ["self park", "garage", "park yourself", "parking lot"],
    render: () => (<>
      <path d="M3 13l2-5c.3-.8 1-1.5 2-1.5h10c1 0 1.7.7 2 1.5l2 5v6c0 .6-.4 1-1 1h-1.5c-.6 0-1-.4-1-1v-1H6.5v1c0 .6-.4 1-1 1H4c-.6 0-1-.4-1-1z"/>
      <path d="M3 13h18"/>
      <circle cx="7" cy="16" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="17" cy="16" r="0.8" fill="currentColor" stroke="none"/>
      <path d="M5 9.5h14" opacity="0.5"/>
    </>),
  },
  {
    id: "shuttle",
    name: "Shuttle",
    category: "property",
    keywords: ["shuttle", "bus", "transport", "transfer"],
    render: () => (<>
      <rect x="3" y="5" width="18" height="11" rx="1.5"/>
      <path d="M3 12h18"/>
      <path d="M6 8h5M13 8h5"/>
      <circle cx="7" cy="18.5" r="1.8"/>
      <circle cx="17" cy="18.5" r="1.8"/>
      <path d="M3 14h2v2H3zM19 14h2v2h-2z" fill="currentColor" stroke="none" opacity="0.4"/>
    </>),
  },
  {
    id: "limo",
    name: "Limousine",
    category: "property",
    keywords: ["limo", "limousine", "town car", "chauffeur", "vip transport"],
    render: () => (<>
      <path d="M2 16l2-4c.3-.7 1-1 2-1h12c1 0 1.7.3 2 1l2 4v3c0 .6-.4 1-1 1h-1.5c-.6 0-1-.4-1-1v-1H5.5v1c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z"/>
      <path d="M5 11l1-3c.3-1 1-1.5 2-1.5h8c1 0 1.7.5 2 1.5l1 3"/>
      <path d="M8 8h3M14 8h3"/>
      <circle cx="6" cy="16.5" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="18" cy="16.5" r="0.8" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "airport",
    name: "Airport Transfer",
    category: "property",
    keywords: ["airport", "plane", "flight", "transfer", "arrival"],
    render: () => (<>
      <path d="M2 14l8-3 1.5-7 2 .5-.5 5.5 6-2 1 2-6 3.5-1.5 6.5-2-.5.5-5z"/>
    </>),
  },
  {
    id: "helipad",
    name: "Helipad",
    category: "property",
    keywords: ["helipad", "helicopter", "vip arrival", "rooftop"],
    render: () => (<>
      <circle cx="12" cy="12" r="9"/>
      <path d="M9 7v10M15 7v10M9 12h6"/>
    </>),
  },
  {
    id: "marina",
    name: "Marina",
    category: "property",
    keywords: ["marina", "boat", "yacht", "dock", "anchor"],
    render: () => (<>
      <circle cx="12" cy="6" r="1.5"/>
      <path d="M12 7.5V18"/>
      <path d="M9 10h6"/>
      <path d="M4 14c0 4 4 6 8 6s8-2 8-6"/>
    </>),
  },
  {
    id: "beach",
    name: "Beach",
    category: "property",
    keywords: ["beach", "ocean", "sand", "umbrella"],
    render: () => (<>
      <path d="M13 5l1 5"/>
      <path d="M5 11c1-3 4-6 8-6 0 3-2 5-4 7"/>
      <path d="M13 7c2 1 5 1 8 2-1 2-3 3-5 3"/>
      <path d="M13 11l-2 9"/>
      <path d="M3 17c2-.5 3 .5 5 0s3 .5 5 0 3 .5 5 0 2 .5 3 0"/>
      <path d="M3 20c2-.5 3 .5 5 0s3 .5 5 0 3 .5 5 0 2 .5 3 0"/>
    </>),
  },
  {
    id: "lobby",
    name: "Lobby",
    category: "property",
    keywords: ["lobby", "atrium", "main", "entrance hall"],
    render: () => (<>
      <path d="M3 20V8l9-5 9 5v12"/>
      <path d="M3 20h18"/>
      <rect x="10" y="13" width="4" height="7"/>
      <rect x="6" y="11" width="2" height="3" rx="0.3"/>
      <rect x="16" y="11" width="2" height="3" rx="0.3"/>
    </>),
  },
  {
    id: "directions",
    name: "Directions",
    category: "property",
    keywords: ["directions", "wayfinding", "arrow sign", "signage"],
    render: () => (<>
      <path d="M3 8h12l3 2-3 2H3z"/>
      <path d="M9 12v8"/>
      <path d="M9 14h12l-3 2.5L21 19H9" opacity="0.7"/>
    </>),
  },
);
