/* Services & Guest — everything the concierge desk can route. */

LIB_ICONS.push(
  {
    id: "wifi",
    name: "Wi-Fi",
    category: "services",
    keywords: ["wifi", "wireless", "internet", "connection"],
    render: () => (<>
      <path d="M2 9c3-3 6.5-4.5 10-4.5s7 1.5 10 4.5"/>
      <path d="M5.5 12c2-2 4-3 6.5-3s4.5 1 6.5 3"/>
      <path d="M9 15c1-1 2-1.5 3-1.5s2 .5 3 1.5"/>
      <circle cx="12" cy="18.5" r="1.2" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "wifi-premium",
    name: "Premium Wi-Fi",
    category: "services",
    keywords: ["wifi premium", "fast", "tier", "upgrade", "high speed"],
    render: () => (<>
      <path d="M2 9c3-3 6.5-4.5 10-4.5s7 1.5 10 4.5"/>
      <path d="M5.5 12c2-2 4-3 6.5-3s4.5 1 6.5 3"/>
      <path d="M9 15c1-1 2-1.5 3-1.5s2 .5 3 1.5"/>
      <path d="M12 17l.8 1.6 1.7.2-1.3 1.2.3 1.7L12 21l-1.5.7.3-1.7L9.5 18.8l1.7-.2z" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "phone",
    name: "Phone",
    category: "services",
    keywords: ["phone", "telephone", "call", "front desk"],
    render: () => (<>
      <path d="M5 4h3.5l1.5 4.5-2 1.5c1 2 2.5 3.5 4.5 4.5l1.5-2 4.5 1.5V18a2 2 0 0 1-2 2C9.7 20 4 14.3 4 6a2 2 0 0 1 1-2z"/>
    </>),
  },
  {
    id: "concierge",
    name: "Concierge",
    category: "services",
    keywords: ["concierge", "host", "service", "assistance", "guest service"],
    notes: "Person with a star — the concierge desk staffer.",
    render: () => (<>
      <circle cx="12" cy="7" r="3"/>
      <path d="M5 21c0-3.5 3.5-7 7-7s7 3.5 7 7"/>
      <path d="M16 4.5l.6 1.4 1.4.2-1 1 .3 1.4L16 7.8l-1.3.7.3-1.4-1-1 1.4-.2z" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "information",
    name: "Information",
    category: "services",
    keywords: ["info", "information", "help", "desk", "guest services"],
    render: () => (<>
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 10.5V16"/>
      <circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "lost-and-found",
    name: "Lost &amp; Found",
    category: "services",
    keywords: ["lost", "found", "lost and found", "claim", "items"],
    render: () => (<>
      <path d="M5 9h14v9c0 1-1 2-2 2H7c-1 0-2-1-2-2z"/>
      <path d="M5 9V6c0-1 1-2 2-2h10c1 0 2 1 2 2v3"/>
      <circle cx="12" cy="13.5" r="2"/>
      <path d="M14 15.5l1.5 2"/>
    </>),
  },
  {
    id: "atm",
    name: "ATM",
    category: "services",
    keywords: ["atm", "cash", "withdrawal", "bank machine"],
    render: () => (<>
      <rect x="4" y="3" width="16" height="18" rx="1"/>
      <rect x="6.5" y="6" width="11" height="5" rx="0.4"/>
      <path d="M8 13.5h3M13 13.5h3"/>
      <path d="M8 16h3M13 16h3"/>
      <path d="M8 18.5h8"/>
    </>),
  },
  {
    id: "currency-exchange",
    name: "Currency Exchange",
    category: "services",
    keywords: ["currency", "exchange", "fx", "forex", "international"],
    render: () => (<>
      <circle cx="8" cy="8" r="4.5"/>
      <path d="M9.5 6.5c-.5-.7-2-1-2.5 0s2 1 2 2-2 .5-2.5-.5"/>
      <path d="M8 5v6.5"/>
      <circle cx="16" cy="16" r="4.5"/>
      <path d="M14.5 14.8a2 2 0 1 1 0 2.4"/>
      <path d="M14.5 14h-2v2M14.5 18h-2v-2" opacity="0.5"/>
      <path d="M12.5 11l-1 1M14.5 13l-1 1" opacity="0.5"/>
    </>),
  },
  {
    id: "business-center",
    name: "Business Center",
    category: "services",
    keywords: ["business", "office", "workstation", "computer", "print"],
    render: () => (<>
      <rect x="3" y="5" width="18" height="11" rx="1"/>
      <path d="M3 13h18"/>
      <path d="M9 19h6M12 16v3"/>
      <path d="M6 8h5"/>
    </>),
  },
  {
    id: "print-fax",
    name: "Print &amp; Fax",
    category: "services",
    keywords: ["print", "fax", "scan", "copier", "business"],
    render: () => (<>
      <path d="M6 8V3.5h12V8"/>
      <rect x="3" y="8" width="18" height="8" rx="1"/>
      <path d="M6 16v4.5h12V16"/>
      <path d="M8 18.5h8"/>
      <circle cx="17" cy="11.5" r="0.6" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "coat-check",
    name: "Coat Check",
    category: "services",
    keywords: ["coat check", "cloakroom", "garderobe", "hanger"],
    render: () => (<>
      <path d="M12 4c-1 0-2 .7-2 2s1 1.5 2 1.5"/>
      <path d="M12 7.5L3 14l1 2h16l1-2z"/>
      <path d="M12 7.5V14" opacity="0.5"/>
    </>),
  },
  {
    id: "gift-shop",
    name: "Gift Shop",
    category: "services",
    keywords: ["gift", "shop", "souvenir", "boutique"],
    render: () => (<>
      <path d="M3 9h18v3H3z"/>
      <path d="M5 12v8c0 .5.5 1 1 1h12c.5 0 1-.5 1-1v-8"/>
      <path d="M12 9v12"/>
      <path d="M12 9c-2-1.5-5-1.5-5-3.5s2.5-2.5 5 0c2.5-2.5 5-2 5 .5s-3 2-5 3z"/>
    </>),
  },
  {
    id: "boutique",
    name: "Boutique",
    category: "services",
    keywords: ["boutique", "shopping", "retail", "fashion", "luxury shopping"],
    render: () => (<>
      <path d="M5 7h14l1 13c0 1-.5 1.5-1.5 1.5H5.5c-1 0-1.5-.5-1.5-1.5z"/>
      <path d="M8 7V5.5a4 4 0 0 1 8 0V7"/>
    </>),
  },
  {
    id: "jewelry",
    name: "Jewelry",
    category: "services",
    keywords: ["jewelry", "diamond", "gem", "luxury retail", "store"],
    render: () => (<>
      <path d="M6 8h12l-6 12z"/>
      <path d="M6 8l2-4h8l2 4"/>
      <path d="M6 8h12"/>
      <path d="M10 4l2 4 2-4"/>
      <path d="M8 8l4 12 4-12"/>
    </>),
  },
  {
    id: "florist",
    name: "Florist",
    category: "services",
    keywords: ["florist", "flowers", "bouquet", "arrangement"],
    render: () => (<>
      <circle cx="12" cy="6.5" r="2.5"/>
      <circle cx="7.5" cy="10.5" r="2.5"/>
      <circle cx="16.5" cy="10.5" r="2.5"/>
      <circle cx="12" cy="11" r="1.2" fill="currentColor" stroke="none"/>
      <path d="M12 13.5V21"/>
      <path d="M8 17c2-2 4-2 8 1"/>
      <path d="M16 17c-2-2-4-2-8 1" opacity="0.5"/>
    </>),
  },
  {
    id: "photographer",
    name: "Photography",
    category: "services",
    keywords: ["photo", "photographer", "camera", "studio", "memories"],
    render: () => (<>
      <rect x="3" y="7" width="18" height="13" rx="1.5"/>
      <path d="M8 7l1.5-3h5L16 7"/>
      <circle cx="12" cy="13.5" r="3.5"/>
      <circle cx="12" cy="13.5" r="1" fill="currentColor" stroke="none"/>
      <circle cx="17.5" cy="10" r="0.6" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "wedding",
    name: "Wedding",
    category: "services",
    keywords: ["wedding", "rings", "ceremony", "vows"],
    render: () => (<>
      <circle cx="8" cy="13.5" r="5"/>
      <circle cx="16" cy="13.5" r="5"/>
      <path d="M6 6l2 3M10 6l-2 3"/>
      <path d="M14 6l2 3M18 6l-2 3"/>
    </>),
  },
  {
    id: "chapel",
    name: "Chapel",
    category: "services",
    keywords: ["chapel", "wedding", "ceremony", "vows", "church"],
    render: () => (<>
      <path d="M3 21V10l9-6 9 6v11"/>
      <path d="M3 21h18"/>
      <path d="M12 4v3M10 5.5h4"/>
      <rect x="10" y="13" width="4" height="8"/>
      <rect x="6" y="13" width="2.5" height="4"/>
      <rect x="15.5" y="13" width="2.5" height="4"/>
    </>),
  },
  {
    id: "convention",
    name: "Convention",
    category: "services",
    keywords: ["convention", "meeting", "conference", "boardroom", "trade show"],
    render: () => (<>
      <rect x="3" y="9" width="18" height="11" rx="1"/>
      <path d="M3 13h18"/>
      <circle cx="8" cy="6" r="1.6"/>
      <circle cx="16" cy="6" r="1.6"/>
      <path d="M5 9c0-1.5 1.5-2 3-2s3 .5 3 2"/>
      <path d="M13 9c0-1.5 1.5-2 3-2s3 .5 3 2"/>
    </>),
  },
  {
    id: "ballroom",
    name: "Ballroom",
    category: "services",
    keywords: ["ballroom", "gala", "event space", "banquet", "wedding venue"],
    render: () => (<>
      <path d="M3 8V5h18v3"/>
      <path d="M3 8h18l-1 12H4z"/>
      <circle cx="12" cy="13" r="3.5"/>
      <path d="M9 13c1-1 2-1 3 0s2 1 3 0" opacity="0.6"/>
      <path d="M12 9.5v-2"/>
    </>),
  },
);
