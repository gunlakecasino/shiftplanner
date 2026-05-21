/* Entertainment — showroom, theater, nightclub, headliner. */

LIB_ICONS.push(
  {
    id: "theater",
    name: "Theater",
    category: "entertainment",
    keywords: ["theater", "show", "broadway", "musical", "production"],
    notes: "The classic theater mask. Use for showroom listings and broadway-style residencies.",
    render: () => (<>
      <path d="M6 4h12v6c0 4-2.7 8-6 8s-6-4-6-8z"/>
      <path d="M9 8.5c0 1 .5 1.5 1.5 1.5M13.5 10c1 0 1.5-.5 1.5-1.5"/>
      <path d="M9.5 13c.7 1.5 2 2.5 2.5 2.5s1.8-1 2.5-2.5"/>
      <path d="M6 4l-2-1M18 4l2-1" opacity="0.5"/>
    </>),
  },
  {
    id: "stage",
    name: "Stage",
    category: "entertainment",
    keywords: ["stage", "platform", "performance", "spotlight"],
    render: () => (<>
      <path d="M5 4l-2 3h18l-2-3z"/>
      <path d="M3 7v3a9 5 0 0 0 18 0V7"/>
      <path d="M3 10c2 2 4 3 9 3s7-1 9-3"/>
      <circle cx="12" cy="14.5" r="1" fill="currentColor" stroke="none"/>
      <path d="M3 18h18"/>
    </>),
  },
  {
    id: "concert-mic",
    name: "Concert",
    category: "entertainment",
    keywords: ["concert", "microphone", "live music", "headliner", "tour"],
    render: () => (<>
      <rect x="9" y="3" width="6" height="10" rx="3"/>
      <path d="M5.5 11c0 3.5 2.9 6.5 6.5 6.5s6.5-3 6.5-6.5"/>
      <path d="M12 17.5V21"/>
      <path d="M8.5 21h7"/>
    </>),
  },
  {
    id: "comedy",
    name: "Comedy",
    category: "entertainment",
    keywords: ["comedy", "stand-up", "mic", "comedian", "headliner"],
    render: () => (<>
      <ellipse cx="12" cy="6.5" rx="4" ry="3"/>
      <path d="M12 9.5V14"/>
      <path d="M8 14h8c0 2-1 3.5-3 3.5h-2c-2 0-3-1.5-3-3.5z"/>
      <path d="M11 17.5l-2 3.5M13 17.5l2 3.5"/>
    </>),
  },
  {
    id: "ticket",
    name: "Ticket",
    category: "entertainment",
    keywords: ["ticket", "admission", "pass", "booking", "seat"],
    render: () => (<>
      <path d="M3 7.5v3a1.5 1.5 0 0 1 0 3v3h18v-3a1.5 1.5 0 0 1 0-3v-3z"/>
      <path d="M14 7.5v9" strokeDasharray="1 1.5"/>
      <path d="M7 11h4"/>
    </>),
  },
  {
    id: "vip",
    name: "VIP",
    category: "entertainment",
    keywords: ["vip", "premium", "exclusive", "private", "table"],
    notes: "VIP star — used for table service, premium tickets, and high-roller status flags.",
    render: () => (<>
      <path d="M12 2.5l2.5 5.5 5.5.7-4 4 1 5.5L12 15.5l-5 2.7 1-5.5-4-4 5.5-.7z" fill="currentColor" stroke="none" opacity="0.15"/>
      <path d="M12 2.5l2.5 5.5 5.5.7-4 4 1 5.5L12 15.5l-5 2.7 1-5.5-4-4 5.5-.7z"/>
      <path d="M9.5 19.5h5"/>
      <path d="M10 21.5h4"/>
    </>),
  },
  {
    id: "nightclub",
    name: "Nightclub",
    category: "entertainment",
    keywords: ["nightclub", "club", "dance", "disco ball", "bottle service"],
    render: () => (<>
      <circle cx="12" cy="10" r="6"/>
      <path d="M6 10c2-1 4-1.5 6-1.5s4 .5 6 1.5"/>
      <path d="M6 10c2 1 4 1.5 6 1.5s4-.5 6-1.5"/>
      <path d="M9 4.5c1 1.5 1 3.5 1 5.5s0 4-1 5.5"/>
      <path d="M15 4.5c-1 1.5-1 3.5-1 5.5s0 4 1 5.5"/>
      <path d="M12 16v3"/>
      <path d="M9 21h6"/>
    </>),
  },
  {
    id: "dj-booth",
    name: "DJ Booth",
    category: "entertainment",
    keywords: ["dj", "turntable", "deck", "spin", "vinyl"],
    render: () => (<>
      <circle cx="7" cy="13" r="4"/>
      <circle cx="7" cy="13" r="1" fill="currentColor" stroke="none"/>
      <circle cx="17" cy="13" r="4"/>
      <circle cx="17" cy="13" r="1" fill="currentColor" stroke="none"/>
      <path d="M3 18h18"/>
      <path d="M3 18v2h18v-2"/>
    </>),
  },
  {
    id: "headliner",
    name: "Headliner",
    category: "entertainment",
    keywords: ["headliner", "star", "marquee", "feature", "residency"],
    render: () => (<>
      <path d="M12 3.5l2.4 5 5.6.8-4 4 1 5.6-5-2.7-5 2.7 1-5.6-4-4 5.6-.8z" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "live-music",
    name: "Live Music",
    category: "entertainment",
    keywords: ["music", "live music", "lounge", "performance"],
    render: () => (<>
      <path d="M9 17.5V5l9-1.5v12"/>
      <ellipse cx="7" cy="17.5" rx="2.5" ry="1.8"/>
      <ellipse cx="16" cy="15.5" rx="2.5" ry="1.8"/>
      <path d="M9 8l9-1.5" opacity="0.5"/>
    </>),
  },
  {
    id: "arena",
    name: "Arena",
    category: "entertainment",
    keywords: ["arena", "stadium", "venue", "concert hall", "seating"],
    render: () => (<>
      <ellipse cx="12" cy="12" rx="9" ry="5"/>
      <ellipse cx="12" cy="12" rx="5" ry="2.5"/>
      <path d="M3 12c0 3 4 5 9 5s9-2 9-5" opacity="0.4"/>
      <path d="M3 10c0-3 4-5 9-5s9 2 9 5"/>
      <circle cx="6" cy="9" r="0.5" fill="currentColor" stroke="none"/>
      <circle cx="18" cy="9" r="0.5" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "cinema",
    name: "Cinema",
    category: "entertainment",
    keywords: ["movie", "cinema", "film", "theatre", "premiere"],
    render: () => (<>
      <rect x="3" y="5" width="18" height="13" rx="1"/>
      <path d="M3 9h2v-4M7 9h2v-4M11 9h2v-4M15 9h2v-4M19 9h2v-4"/>
      <path d="M3 14h2v4M7 14h2v4M11 14h2v4M15 14h2v4M19 14h2v4"/>
      <path d="M10 10v3l4-1.5z" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "event-calendar",
    name: "Event",
    category: "entertainment",
    keywords: ["event", "calendar", "date", "schedule", "showtime"],
    render: () => (<>
      <rect x="3" y="5" width="18" height="15" rx="1"/>
      <path d="M3 9h18"/>
      <path d="M8 3v4M16 3v4"/>
      <path d="M9 14l1.5 1.5L15 11.5"/>
    </>),
  },
  {
    id: "pyrotechnics",
    name: "Pyrotechnics",
    category: "entertainment",
    keywords: ["fireworks", "pyrotechnics", "celebration", "effect", "show"],
    render: () => (<>
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4"/>
      <path d="M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5l2.5-2.5M15 9l2.5-2.5"/>
      <circle cx="12" cy="4" r="0.5" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="20" r="0.5" fill="currentColor" stroke="none"/>
      <circle cx="4" cy="12" r="0.5" fill="currentColor" stroke="none"/>
      <circle cx="20" cy="12" r="0.5" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "bowling",
    name: "Bowling",
    category: "entertainment",
    keywords: ["bowling", "pins", "lanes", "arcade", "family"],
    render: () => (<>
      <circle cx="8" cy="14" r="4.5"/>
      <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" stroke="none"/>
      <circle cx="9.5" cy="12" r="0.5" fill="currentColor" stroke="none"/>
      <circle cx="8" cy="15" r="0.5" fill="currentColor" stroke="none"/>
      <path d="M17 5c-1 0-1.5 1-1.5 2.5s.5 3 1.5 4.5c1-1.5 1.5-3 1.5-4.5S18 5 17 5z"/>
      <path d="M17 12c-1.5 2-1.5 5 0 7c1.5-2 1.5-5 0-7z"/>
    </>),
  },
  {
    id: "arcade",
    name: "Arcade",
    category: "entertainment",
    keywords: ["arcade", "games", "joystick", "family entertainment"],
    render: () => (<>
      <rect x="3" y="9" width="18" height="11" rx="1.5"/>
      <circle cx="8" cy="14.5" r="2.5"/>
      <path d="M8 13v3M6.5 14.5h3"/>
      <circle cx="15" cy="13.5" r="1.2"/>
      <circle cx="18" cy="13.5" r="1.2"/>
      <circle cx="15" cy="16.5" r="1.2"/>
      <circle cx="18" cy="16.5" r="1.2"/>
      <path d="M5 9c2-3 5-5 7-5s5 2 7 5"/>
    </>),
  },
);
