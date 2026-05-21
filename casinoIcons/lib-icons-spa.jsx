/* Spa & Wellness — the quiet half of the resort. */

LIB_ICONS.push(
  {
    id: "spa-lotus",
    name: "Spa",
    category: "spa",
    keywords: ["spa", "lotus", "wellness", "treatment", "zen"],
    notes: "Lotus mark — the universal spa glyph.",
    render: () => (<>
      <path d="M12 18s-3-1-3-4 3-7 3-7 3 4 3 7-3 4-3 4z"/>
      <path d="M12 18c0-2-3-3-5-3.5 0-2 2-4 4-4"/>
      <path d="M12 18c0-2 3-3 5-3.5 0-2-2-4-4-4"/>
      <path d="M5 19h14"/>
    </>),
  },
  {
    id: "massage",
    name: "Massage",
    category: "spa",
    keywords: ["massage", "therapy", "hands", "swedish", "deep tissue"],
    render: () => (<>
      <path d="M3 15h14a2 2 0 0 1 0 4H3z"/>
      <circle cx="9" cy="12" r="2"/>
      <path d="M9 14V11.5"/>
      <path d="M5 7.5l3-2c.7-.4 1.6-.2 2 .5L11 8M11 9.5l3 1.5"/>
      <path d="M14.5 6l1.5-1.5c.6-.6 1.6-.6 2.2 0l1 1c.5.5.5 1.3 0 1.8L17 9"/>
    </>),
  },
  {
    id: "sauna",
    name: "Sauna",
    category: "spa",
    keywords: ["sauna", "heat", "dry heat", "wood", "thermal"],
    render: () => (<>
      <rect x="3" y="11" width="18" height="9" rx="0.5"/>
      <path d="M3 14h18M3 17h18"/>
      <path d="M9 11V6c0-1 1-1.5 2 0s2 0 2-1 1-1 2 0v6"/>
      <path d="M7 4c-.5 1 .5 1.5 0 2.5"/>
      <path d="M17 4c-.5 1 .5 1.5 0 2.5"/>
    </>),
  },
  {
    id: "steam-room",
    name: "Steam Room",
    category: "spa",
    keywords: ["steam", "vapor", "eucalyptus", "wet heat", "hammam"],
    render: () => (<>
      <path d="M4 8c0-1 1-1.5 2-1 .5-1.5 2-1.5 3 0 1-1 2.5-.5 2.5 1"/>
      <path d="M11 11c.5-1.5 2-1.5 3 0 1-1 2.5-.5 2.5 1 1.5-.5 2.5.5 2 2"/>
      <path d="M3 14c1.5-.5 2.5.5 4 0s2 1 4 0 3 1 4 0 3 1 5 0"/>
      <path d="M3 17c1.5-.5 2.5.5 4 0s2 1 4 0 3 1 4 0 3 1 5 0"/>
      <path d="M3 20c1.5-.5 2.5.5 4 0s2 1 4 0 3 1 4 0 3 1 5 0"/>
    </>),
  },
  {
    id: "hot-tub",
    name: "Hot Tub",
    category: "spa",
    keywords: ["jacuzzi", "hot tub", "whirlpool", "bubbles", "spa tub"],
    render: () => (<>
      <path d="M3 13v5c0 1 1 2 2 2h14c1 0 2-1 2-2v-5z"/>
      <path d="M3 13h18"/>
      <circle cx="8" cy="8.5" r="1"/>
      <circle cx="12" cy="6.5" r="1"/>
      <circle cx="16" cy="9" r="1"/>
      <circle cx="6" cy="10.5" r="0.6" opacity="0.6"/>
      <circle cx="18" cy="11" r="0.6" opacity="0.6"/>
      <path d="M14 9c-.5-1 .5-1.5 0-2.5" opacity="0.5"/>
    </>),
  },
  {
    id: "pool",
    name: "Pool",
    category: "spa",
    keywords: ["pool", "swimming pool", "swim", "water", "aquatic"],
    render: () => (<>
      <path d="M3 11c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0"/>
      <path d="M3 15c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0"/>
      <path d="M3 19c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0"/>
      <path d="M6.5 8.5L10 6l3.5 2.5"/>
      <path d="M14 5l2 2"/>
    </>),
  },
  {
    id: "lap-pool",
    name: "Lap Pool",
    category: "spa",
    keywords: ["lap pool", "lanes", "swimming", "fitness", "lap"],
    render: () => (<>
      <rect x="3" y="5" width="18" height="14" rx="1"/>
      <path d="M3 9h18M3 12h18M3 15h18" opacity="0.5"/>
      <path d="M3 7c1-.5 2 .5 3 0s2 .5 3 0 2 .5 3 0 2 .5 3 0 2 .5 3 0"/>
      <path d="M3 17c1-.5 2 .5 3 0s2 .5 3 0 2 .5 3 0 2 .5 3 0 2 .5 3 0"/>
    </>),
  },
  {
    id: "cabana",
    name: "Cabana",
    category: "spa",
    keywords: ["cabana", "daybed", "poolside", "private", "reserved"],
    render: () => (<>
      <path d="M4 9l8-5 8 5"/>
      <path d="M5.5 9v10h13V9"/>
      <path d="M5.5 14h13"/>
      <path d="M8 19v-5h8v5"/>
      <path d="M4 9h16" opacity="0.4"/>
    </>),
  },
  {
    id: "lounger",
    name: "Lounger",
    category: "spa",
    keywords: ["chaise", "lounger", "beach chair", "sunbed", "poolside"],
    render: () => (<>
      <path d="M3 14l13-5 1 3-11 4z"/>
      <path d="M6 16h12"/>
      <path d="M6 16l-1 4M18 16l1 4"/>
      <circle cx="14.5" cy="7" r="1"/>
    </>),
  },
  {
    id: "gym",
    name: "Fitness",
    category: "spa",
    keywords: ["gym", "fitness", "dumbbell", "workout", "weight room"],
    render: () => (<>
      <rect x="3" y="9" width="2.5" height="6" rx="0.5"/>
      <rect x="18.5" y="9" width="2.5" height="6" rx="0.5"/>
      <rect x="5.5" y="10.5" width="2" height="3" rx="0.5"/>
      <rect x="16.5" y="10.5" width="2" height="3" rx="0.5"/>
      <path d="M7.5 12h9"/>
    </>),
  },
  {
    id: "yoga",
    name: "Yoga",
    category: "spa",
    keywords: ["yoga", "meditation", "stretch", "mindfulness", "pilates"],
    render: () => (<>
      <circle cx="12" cy="5" r="1.8"/>
      <path d="M12 7v3"/>
      <path d="M5 15c2-3 5-5 7-5s5 2 7 5"/>
      <path d="M5 15h14"/>
      <path d="M5 15l-1 3M19 15l1 3"/>
    </>),
  },
  {
    id: "salon",
    name: "Salon",
    category: "spa",
    keywords: ["salon", "hair", "scissors", "stylist", "blowdry"],
    render: () => (<>
      <circle cx="6" cy="14" r="3"/>
      <circle cx="6" cy="6" r="3"/>
      <path d="M8.2 7.8L20 14"/>
      <path d="M8.2 12.2L20 6"/>
    </>),
  },
  {
    id: "manicure",
    name: "Nail Salon",
    category: "spa",
    keywords: ["nail", "manicure", "pedicure", "lacquer", "polish"],
    render: () => (<>
      <path d="M8 4c0-.6.5-1 1-1h6c.5 0 1 .4 1 1v3l1 1v8.5c0 1.4-1 2.5-2.5 2.5h-4c-1.5 0-2.5-1.1-2.5-2.5V8l1-1z"/>
      <path d="M8 9h8"/>
      <path d="M10 13l1.5 1.5L14 12"/>
    </>),
  },
  {
    id: "facial",
    name: "Facial",
    category: "spa",
    keywords: ["facial", "skincare", "face", "esthetician", "treatment"],
    render: () => (<>
      <path d="M12 4c-3.5 0-6 2.5-6 6v3c0 3 2 6 6 6s6-3 6-6v-3c0-3.5-2.5-6-6-6z"/>
      <circle cx="9.5" cy="11" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="14.5" cy="11" r="0.6" fill="currentColor" stroke="none"/>
      <path d="M10.5 14.5c.5.5 1 .8 1.5.8s1-.3 1.5-.8"/>
      <path d="M8 8c0-1 1-2 2-2M16 8c0-1-1-2-2-2" opacity="0.5"/>
    </>),
  },
  {
    id: "aromatherapy",
    name: "Aromatherapy",
    category: "spa",
    keywords: ["essential oil", "aromatherapy", "bottle", "fragrance", "scent"],
    render: () => (<>
      <path d="M10 3h4v2.5h-4z"/>
      <path d="M9.5 5.5h5L16 8v10c0 1.5-1 2.5-2.5 2.5h-3C9 20.5 8 19.5 8 18V8z"/>
      <path d="M10 13c1-1 3-1 4 0"/>
      <path d="M11 16c.6-.6 1.4-.6 2 0"/>
    </>),
  },
);
