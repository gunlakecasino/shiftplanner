/* Hotel & Rooms — from the porte cochère to turn-down service. */

LIB_ICONS.push(
  {
    id: "bed-king",
    name: "King Bed",
    category: "hotel",
    keywords: ["bed", "king", "room type", "sleeping", "linen"],
    render: () => (<>
      <path d="M3 13V6h18v7"/>
      <rect x="4.5" y="9" width="6" height="3" rx="0.7"/>
      <rect x="13.5" y="9" width="6" height="3" rx="0.7"/>
      <path d="M3 13h18v4H3z"/>
      <path d="M3 17v2M21 17v2"/>
    </>),
  },
  {
    id: "bed-double",
    name: "Double / Two Queens",
    category: "hotel",
    keywords: ["bed", "double", "two queens", "twin", "room type"],
    render: () => (<>
      <path d="M3 13V7h18v6"/>
      <rect x="4.5" y="9.5" width="3" height="2.5" rx="0.5"/>
      <rect x="9" y="9.5" width="3" height="2.5" rx="0.5"/>
      <rect x="13.5" y="9.5" width="3" height="2.5" rx="0.5"/>
      <rect x="17.5" y="9.5" width="2.5" height="2.5" rx="0.5"/>
      <path d="M3 13h18v4H3z"/>
      <path d="M12 13v4"/>
      <path d="M3 17v2M21 17v2"/>
    </>),
  },
  {
    id: "suite",
    name: "Suite",
    category: "hotel",
    keywords: ["suite", "two room", "parlor", "junior suite", "presidential"],
    render: () => (<>
      <rect x="2.5" y="5" width="19" height="14" rx="1.2"/>
      <path d="M12 5v14"/>
      <rect x="4" y="13" width="6.5" height="3" rx="0.5"/>
      <path d="M5 11h4.5" />
      <path d="M13.5 14h7"/>
      <path d="M13.5 12.5h7v3h-7z"/>
      <path d="M11 11v3M13 11v3" opacity="0.5"/>
    </>),
  },
  {
    id: "key-card",
    name: "Key Card",
    category: "hotel",
    keywords: ["key", "card", "rfid", "nfc", "room key", "access"],
    render: () => (<>
      <rect x="3" y="6" width="18" height="12" rx="1.5"/>
      <path d="M3 10h18"/>
      <circle cx="15.5" cy="14" r="1.2"/>
      <path d="M13 14a3 3 0 0 1 5 0" opacity="0.6"/>
      <path d="M11 14a5 5 0 0 1 9 0" opacity="0.3"/>
    </>),
  },
  {
    id: "room-key-fob",
    name: "Key & Tag",
    category: "hotel",
    keywords: ["key", "fob", "tag", "diamond", "old key"],
    notes: "The traditional fob — used in resort branding even when the actual key is digital.",
    render: () => (<>
      <path d="M7.5 3.5l3 4-3 4-3-4z"/>
      <path d="M10.5 7.5h11"/>
      <path d="M16 7.5v3M19 7.5v3M21 7.5v3"/>
      <circle cx="7.5" cy="7.5" r="0.7" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "digital-key",
    name: "Digital Key",
    category: "hotel",
    keywords: ["mobile key", "phone", "digital", "bluetooth", "tap"],
    render: () => (<>
      <rect x="6" y="2.5" width="12" height="19" rx="2"/>
      <path d="M10 19h4"/>
      <path d="M8.5 5.5h7v8h-7z" />
      <path d="M10.5 8.5l2 2-2 2"/>
      <path d="M13 11h3"/>
    </>),
  },
  {
    id: "front-desk",
    name: "Front Desk",
    category: "hotel",
    keywords: ["reception", "front desk", "lobby", "check-in counter"],
    render: () => (<>
      <rect x="8" y="3" width="8" height="6" rx="0.5"/>
      <path d="M10 6h4M11.5 4.5v.6" />
      <circle cx="12" cy="6" r="0.4" fill="currentColor" stroke="none"/>
      <path d="M3 13h18l-1.5 7H4.5z"/>
      <path d="M3 13l1-1h16l1 1"/>
    </>),
  },
  {
    id: "check-in",
    name: "Check In",
    category: "hotel",
    keywords: ["arrival", "check-in", "register", "guest arrival"],
    render: () => (<>
      <path d="M14 3h6v18h-6"/>
      <path d="M14 12H3"/>
      <path d="M7 8l-4 4 4 4"/>
    </>),
  },
  {
    id: "check-out",
    name: "Check Out",
    category: "hotel",
    keywords: ["departure", "check-out", "leave", "express checkout"],
    render: () => (<>
      <path d="M10 3H4v18h6"/>
      <path d="M10 12h11"/>
      <path d="M17 8l4 4-4 4"/>
    </>),
  },
  {
    id: "concierge-bell",
    name: "Concierge Bell",
    category: "hotel",
    keywords: ["concierge", "bell", "service", "ring", "desk bell"],
    notes: "The dome service bell. Used for concierge actions, service requests, and the call-bell affordance.",
    render: () => (<>
      <rect x="2.5" y="17" width="19" height="2.5" rx="0.5"/>
      <path d="M4.5 17C4.5 13 7.8 9.5 12 9.5S19.5 13 19.5 17"/>
      <circle cx="12" cy="8" r="1.2"/>
      <path d="M12 9.2v1.3"/>
      <path d="M7 16c0-2 1.4-3.6 3.4-4.2" opacity="0.5"/>
    </>),
  },
  {
    id: "room-service",
    name: "Room Service",
    category: "hotel",
    keywords: ["room service", "in-room dining", "tray", "dome", "ird"],
    render: () => (<>
      <path d="M3 16.5h18"/>
      <path d="M4.5 16.5C4.5 12.4 7.8 9 12 9s7.5 3.4 7.5 7.5"/>
      <circle cx="12" cy="7.5" r="0.9"/>
      <path d="M12 8.4v.8"/>
      <path d="M8 4.5c0 1 .8 1.4.8 2.4M11.5 4c0 1 .8 1.4.8 2.4M15 4.5c0 1 .8 1.4.8 2.4" opacity="0.55"/>
    </>),
  },
  {
    id: "housekeeping",
    name: "Housekeeping",
    category: "hotel",
    keywords: ["cleaning", "housekeeping", "spray", "maid", "turn down"],
    render: () => (<>
      <path d="M9 4h4l1.2 2.5v3.5H8V6.5z"/>
      <path d="M8 10h6.2v9c0 1-.8 2-1.8 2h-2.6c-1 0-1.8-1-1.8-2z"/>
      <path d="M14 5l3 1"/>
      <circle cx="18" cy="4" r="0.4" fill="currentColor" stroke="none"/>
      <circle cx="20" cy="5.5" r="0.4" fill="currentColor" stroke="none"/>
      <circle cx="19" cy="7.5" r="0.4" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "do-not-disturb",
    name: "Do Not Disturb",
    category: "hotel",
    keywords: ["dnd", "do not disturb", "privacy", "hanger", "occupied"],
    render: () => (<>
      <rect x="6" y="3.5" width="12" height="17" rx="1.5"/>
      <circle cx="12" cy="6.5" r="1.5"/>
      <circle cx="12" cy="14" r="3"/>
      <path d="M9.5 14h5"/>
    </>),
  },
  {
    id: "make-up-room",
    name: "Make Up Room",
    category: "hotel",
    keywords: ["service", "make up", "clean room", "hanger", "ready"],
    render: () => (<>
      <rect x="6" y="3.5" width="12" height="17" rx="1.5"/>
      <circle cx="12" cy="6.5" r="1.5"/>
      <path d="M9 14l2.2 2.2L15 12.5"/>
    </>),
  },
  {
    id: "luggage",
    name: "Luggage",
    category: "hotel",
    keywords: ["bag", "suitcase", "baggage", "trunk", "checked"],
    render: () => (<>
      <rect x="4" y="7" width="16" height="13" rx="1.5"/>
      <path d="M9 7V5c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v2"/>
      <path d="M12 7v13"/>
      <rect x="2.5" y="13" width="1.5" height="3" rx="0.3" fill="currentColor" stroke="none"/>
      <rect x="20" y="13" width="1.5" height="3" rx="0.3" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "bellhop-cart",
    name: "Bellhop Cart",
    category: "hotel",
    keywords: ["bellhop", "cart", "porter", "luggage cart", "bell desk"],
    render: () => (<>
      <path d="M3 3.5h2.5v12"/>
      <path d="M5.5 15.5h13.5V9"/>
      <path d="M5.5 15.5h13.5"/>
      <rect x="8" y="9" width="8" height="6.5" rx="0.5"/>
      <path d="M11 9V7.5h2V9"/>
      <circle cx="8" cy="18.5" r="1.7"/>
      <circle cx="17" cy="18.5" r="1.7"/>
    </>),
  },
  {
    id: "safe",
    name: "In-Room Safe",
    category: "hotel",
    keywords: ["safe", "vault", "lockbox", "valuables", "security"],
    render: () => (<>
      <rect x="3" y="4" width="18" height="15" rx="1"/>
      <path d="M15 4v15"/>
      <circle cx="9.5" cy="11.5" r="3"/>
      <path d="M9.5 11.5V8.8"/>
      <path d="M17 10.5v2"/>
      <rect x="5" y="19" width="2" height="2" rx="0.3" fill="currentColor" stroke="none"/>
      <rect x="17" y="19" width="2" height="2" rx="0.3" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "minibar",
    name: "Minibar",
    category: "hotel",
    keywords: ["fridge", "minibar", "bar", "snacks", "in-room"],
    render: () => (<>
      <rect x="6" y="3" width="12" height="18" rx="1"/>
      <path d="M6 10.5h12"/>
      <path d="M16 6v2.5"/>
      <path d="M16 13v3"/>
      <path d="M9 13.5h2"/>
    </>),
  },
  {
    id: "balcony-view",
    name: "Balcony View",
    category: "hotel",
    keywords: ["view", "balcony", "window", "ocean view", "strip view"],
    notes: "Use to mark view-category rooms (city / strip / ocean / golf / pool).",
    render: () => (<>
      <rect x="3" y="3.5" width="18" height="13" rx="1"/>
      <path d="M12 3.5v13"/>
      <path d="M3 11.5h18"/>
      <circle cx="16.5" cy="7.5" r="1.5"/>
      <path d="M3 13.5c2-1 4-1 6 0M15 13.5c2-1 4-1 6 0" opacity="0.6"/>
      <path d="M2 16.5h20l-1 3.5H3z"/>
      <path d="M6 17v3M9 17v3M12 17v3M15 17v3M18 17v3" opacity="0.4"/>
    </>),
  },
  {
    id: "connecting-rooms",
    name: "Connecting Rooms",
    category: "hotel",
    keywords: ["connecting", "adjoining", "family", "two rooms"],
    render: () => (<>
      <rect x="2.5" y="5" width="9" height="14" rx="0.5"/>
      <rect x="12.5" y="5" width="9" height="14" rx="0.5"/>
      <path d="M11.5 9v6M12.5 9v6"/>
      <rect x="3.8" y="14" width="6" height="2.5" rx="0.3"/>
      <path d="M3.8 12.5h6"/>
      <rect x="14.2" y="14" width="6" height="2.5" rx="0.3"/>
      <path d="M14.2 12.5h6"/>
    </>),
  },
  {
    id: "turndown",
    name: "Turndown Service",
    category: "hotel",
    keywords: ["turndown", "evening service", "chocolate", "pillow", "nightly"],
    render: () => (<>
      <path d="M3 11V7h18v4"/>
      <path d="M3 11h18v6H3z"/>
      <path d="M11 11l3.5-3.5H19L15.5 11"/>
      <rect x="5.5" y="13" width="3.5" height="2.2" rx="0.3"/>
      <circle cx="7.2" cy="9.5" r="0.6" fill="currentColor" stroke="none"/>
      <path d="M3 17v3M21 17v3"/>
    </>),
  },
  {
    id: "valet-park",
    name: "Valet Parking",
    category: "hotel",
    keywords: ["valet", "porte cochere", "car", "parking", "arrival"],
    notes: "Hand holding a key — distinct from the Parking glyph in the Property category.",
    render: () => (<>
      <path d="M9.5 5l2 2.5-2 2.5-2-2.5z"/>
      <path d="M11.5 7.5h7"/>
      <path d="M15 7.5v2M17 7.5v2"/>
      <path d="M3 15v-2c0-1 1-2 2-2h3l1.5 2"/>
      <circle cx="6.5" cy="16.5" r="1.5"/>
      <circle cx="12" cy="16.5" r="1.5"/>
      <path d="M9 11l3 0l1.5 2.5h-7L9 11z"/>
      <path d="M3 15h11"/>
    </>),
  },
);
