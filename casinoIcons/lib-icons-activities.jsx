/* Activities & Excursions — reasons a guest leaves the property (or doesn't). */

LIB_ICONS.push(
  {
    id: "golf",
    name: "Golf",
    category: "activities",
    keywords: ["golf", "tee time", "course", "links"],
    render: () => (<>
      <path d="M5 6c4 0 7 1 10 2.5"/>
      <path d="M10.5 7.5l-1.5 7"/>
      <path d="M3 21c2-2 6-2 9-2s7 0 9 2"/>
      <circle cx="11" cy="18" r="1.2"/>
    </>),
  },
  {
    id: "golf-flag",
    name: "Golf Hole",
    category: "activities",
    keywords: ["hole", "flag", "green", "pin"],
    render: () => (<>
      <path d="M8 3v18"/>
      <path d="M8 4l8 2-8 2"/>
      <path d="M3 21c2-2 6-2 9-2s7 0 9 2"/>
      <circle cx="13.5" cy="19" r="1.2"/>
    </>),
  },
  {
    id: "tennis",
    name: "Tennis",
    category: "activities",
    keywords: ["tennis", "racket", "court", "ball"],
    render: () => (<>
      <circle cx="11" cy="9" r="6"/>
      <path d="M11 3v12M5 9h12" opacity="0.5"/>
      <path d="M6.5 4.5l9 9M15.5 4.5l-9 9" opacity="0.5"/>
      <path d="M11 9l5.5-2.5"/>
      <path d="M15 13l5 7"/>
      <path d="M19 18l-2 2"/>
    </>),
  },
  {
    id: "pickleball",
    name: "Pickleball",
    category: "activities",
    keywords: ["pickleball", "paddle", "ball", "court"],
    render: () => (<>
      <ellipse cx="11" cy="9" rx="5.5" ry="6.5"/>
      <path d="M11 15.5L13 18.5"/>
      <rect x="13" y="17.5" width="3" height="4" rx="0.5" transform="rotate(-30 14.5 19.5)"/>
      <circle cx="9" cy="7" r="0.5" fill="currentColor" stroke="none"/>
      <circle cx="13" cy="9" r="0.5" fill="currentColor" stroke="none"/>
      <circle cx="11" cy="11" r="0.5" fill="currentColor" stroke="none"/>
      <circle cx="9" cy="10" r="0.5" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "bicycle",
    name: "Cycling",
    category: "activities",
    keywords: ["bike", "cycling", "bicycle", "rental"],
    render: () => (<>
      <circle cx="5.5" cy="16.5" r="3.5"/>
      <circle cx="18.5" cy="16.5" r="3.5"/>
      <path d="M5.5 16.5l4-7h5l3 7"/>
      <path d="M9.5 9.5h-2M14.5 9.5l-2 7" />
      <circle cx="12.5" cy="16.5" r="0.5" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "boating",
    name: "Boating",
    category: "activities",
    keywords: ["boat", "yacht", "charter", "marina", "sail"],
    render: () => (<>
      <path d="M3 16h18l-2 4H5z"/>
      <path d="M4.5 13l2-7h5l5 7z"/>
      <path d="M6.5 6V3"/>
      <path d="M3 16c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 1.5 1 2.5 0" opacity="0.5"/>
    </>),
  },
  {
    id: "fishing",
    name: "Fishing",
    category: "activities",
    keywords: ["fishing", "charter", "deep sea", "rod"],
    render: () => (<>
      <path d="M3 6l13 12"/>
      <circle cx="3" cy="6" r="0.8" fill="currentColor" stroke="none"/>
      <path d="M11 14c1-1 3-1.5 5-1.5s4 .5 5 2c-1 1.5-3 2.5-5 2.5s-4-1-5-2 0-1-1 0z"/>
      <circle cx="19" cy="14.5" r="0.4" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "hiking",
    name: "Hiking",
    category: "activities",
    keywords: ["hike", "trail", "trekking", "outdoors", "nature"],
    render: () => (<>
      <circle cx="13" cy="4.5" r="1.5"/>
      <path d="M13 6L11 10l3 2v6"/>
      <path d="M11 10L8 15"/>
      <path d="M14 12l3 1.5"/>
      <path d="M8 4l-2 16M6 8h2" opacity="0.7"/>
    </>),
  },
  {
    id: "equestrian",
    name: "Equestrian",
    category: "activities",
    keywords: ["horse", "equestrian", "riding", "stable"],
    render: () => (<>
      <path d="M5 18c0-2 1-3 2-3.5l1-2 3-2 2-3 3-3 2 1.5-1.5 2.5 1 2 .5 4.5-1 3.5"/>
      <path d="M14 6l1-1"/>
      <circle cx="16" cy="6.5" r="0.4" fill="currentColor" stroke="none"/>
      <path d="M9 18l-1 2M13 18l-1 2M17 18l1 2"/>
    </>),
  },
  {
    id: "diving",
    name: "Diving / Snorkel",
    category: "activities",
    keywords: ["diving", "snorkel", "scuba", "underwater"],
    render: () => (<>
      <path d="M6 6c1-1 2-1 3 0l1 1c.5.5 1 .5 1.5 0"/>
      <ellipse cx="9" cy="11" rx="3" ry="2.5"/>
      <ellipse cx="15" cy="11" rx="3" ry="2.5"/>
      <path d="M12 11h0" opacity="0.5"/>
      <path d="M18 11h2v3"/>
      <path d="M3 17c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/>
      <path d="M3 20c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/>
    </>),
  },
  {
    id: "amusement-park",
    name: "Amusement Park",
    category: "activities",
    keywords: ["ferris wheel", "amusement", "rides", "park", "family"],
    render: () => (<>
      <circle cx="12" cy="11" r="8"/>
      <circle cx="12" cy="11" r="1.2" fill="currentColor" stroke="none"/>
      <path d="M12 3v16M4 11h16M6.3 5.3l11.4 11.4M6.3 16.7L17.7 5.3"/>
      <path d="M3 19h18"/>
      <path d="M10 19v2M14 19v2"/>
    </>),
  },
  {
    id: "zoo-aquarium",
    name: "Zoo / Aquarium",
    category: "activities",
    keywords: ["zoo", "aquarium", "fish", "wildlife", "family"],
    render: () => (<>
      <path d="M3 12c2-3 5-5 9-5s5 2 6 4l3-1-1.5 3 1.5 2-3-1c-1 2-2 4-6 4s-7-2-9-5z"/>
      <circle cx="18" cy="11" r="0.5" fill="currentColor" stroke="none"/>
      <path d="M7 11c0 2 1.5 2 1.5 0M11 11c0 2 1.5 2 1.5 0" opacity="0.5"/>
    </>),
  },
  {
    id: "excursion",
    name: "Excursion",
    category: "activities",
    keywords: ["excursion", "tour", "adventure", "off-property", "explore"],
    render: () => (<>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/>
      <path d="M9 4v16M15 6v16"/>
      <circle cx="14.5" cy="12" r="1.5"/>
      <path d="M14.5 11l1 -1M14.5 13l-1 1" />
    </>),
  },
  {
    id: "wine-tour",
    name: "Wine Tour",
    category: "activities",
    keywords: ["wine tour", "vineyard", "tasting", "experience"],
    render: () => (<>
      <path d="M3 14c0-4 3-7 7-7M21 14c0-4-3-7-7-7"/>
      <path d="M3 14c0 2 1 3 2 3h14c1 0 2-1 2-3"/>
      <path d="M5 14c1.5 1 3 1.5 4 1.5"/>
      <path d="M19 14c-1.5 1-3 1.5-4 1.5" />
      <path d="M10 7V4l4-1v4"/>
      <path d="M12 17v3"/>
      <path d="M9 20h6"/>
    </>),
  },
);
