/* Loyalty & Rewards — the player's club. Tiers, points, comps, host. */

LIB_ICONS.push(
  {
    id: "tier-pearl",
    name: "Tier — Pearl",
    category: "loyalty",
    keywords: ["tier", "pearl", "entry", "loyalty", "bronze"],
    notes: "Entry tier — pearl. Generic jewel ladder (Pearl → Sapphire → Ruby → Emerald → Diamond).",
    render: () => (<>
      <circle cx="12" cy="12" r="7"/>
      <path d="M8 10c0-2 1.5-3.5 3.5-3.5" opacity="0.55"/>
    </>),
  },
  {
    id: "tier-sapphire",
    name: "Tier — Sapphire",
    category: "loyalty",
    keywords: ["tier", "sapphire", "blue", "loyalty", "silver"],
    render: () => (<>
      <path d="M12 3.5l7 6-7 11-7-11z"/>
      <path d="M5 9.5h14"/>
      <path d="M9 9.5l3 11M15 9.5l-3 11" opacity="0.55"/>
      <path d="M12 3.5l-3 6h6z" fill="currentColor" stroke="none" opacity="0.15"/>
    </>),
  },
  {
    id: "tier-ruby",
    name: "Tier — Ruby",
    category: "loyalty",
    keywords: ["tier", "ruby", "red", "loyalty", "gold"],
    render: () => (<>
      <path d="M6 6h12l3 5-9 11-9-11z"/>
      <path d="M3 11h18"/>
      <path d="M9 6l3 5-3 5M15 6l-3 5 3 5" opacity="0.55"/>
      <path d="M6 6l-3 5 9-5 9 5-3-5" fill="currentColor" stroke="none" opacity="0.12"/>
    </>),
  },
  {
    id: "tier-emerald",
    name: "Tier — Emerald",
    category: "loyalty",
    keywords: ["tier", "emerald", "green", "loyalty", "platinum"],
    render: () => (<>
      <path d="M8 4h8l3.5 3.5v9L16 20H8L4.5 16.5v-9z"/>
      <path d="M4.5 7.5h15M4.5 16.5h15"/>
      <path d="M8 4l-3.5 3.5M16 4l3.5 3.5M8 20l-3.5-3.5M16 20l3.5-3.5"/>
    </>),
  },
  {
    id: "tier-diamond",
    name: "Tier — Diamond",
    category: "loyalty",
    keywords: ["tier", "diamond", "loyalty", "top", "elite"],
    render: () => (<>
      <path d="M12 3l9 7-9 11L3 10z"/>
      <path d="M3 10h18"/>
      <path d="M8 10l4 11M16 10l-4 11"/>
      <path d="M8 10l4-7 4 7" opacity="0.55"/>
    </>),
  },
  {
    id: "points",
    name: "Reward Points",
    category: "loyalty",
    keywords: ["points", "rewards", "earn", "balance", "currency"],
    render: () => (<>
      <circle cx="12" cy="12" r="9"/>
      <path d="M9 16V8h3.5a2.5 2.5 0 0 1 0 5H9"/>
    </>),
  },
  {
    id: "free-play",
    name: "Free Play",
    category: "loyalty",
    keywords: ["free play", "credit", "promotional", "comp"],
    notes: "Gift + chip — promotional play credit on a slot machine.",
    render: () => (<>
      <circle cx="12" cy="14" r="6.5"/>
      <circle cx="12" cy="14" r="3.5"/>
      <path d="M12 6.5v3M9.5 7l2.5 2.5L14.5 7"/>
      <path d="M10 3.5v3l-3-1z"/>
      <path d="M14 3.5v3l3-1z"/>
    </>),
  },
  {
    id: "tier-credits",
    name: "Tier Credits",
    category: "loyalty",
    keywords: ["tier credits", "qualifying", "progress", "tc", "earn"],
    render: () => (<>
      <rect x="3" y="9" width="18" height="6" rx="1"/>
      <path d="M3 12h6"/>
      <path d="M9 12h2"/>
      <path d="M11 12h3" opacity="0.4"/>
      <path d="M14 12h7" opacity="0.2"/>
      <circle cx="9" cy="12" r="1.6" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "multiplier",
    name: "Multiplier",
    category: "loyalty",
    keywords: ["multiplier", "bonus", "2x", "5x", "boost"],
    render: () => (<>
      <circle cx="12" cy="12" r="9"/>
      <path d="M9 9l6 6M15 9l-6 6"/>
    </>),
  },
  {
    id: "birthday",
    name: "Birthday",
    category: "loyalty",
    keywords: ["birthday", "cake", "comp", "guest milestone"],
    render: () => (<>
      <path d="M4 13c0-2.5 3-4 8-4s8 1.5 8 4z"/>
      <path d="M4 13h16v6c0 1-1 2-2 2H6c-1 0-2-1-2-2z"/>
      <path d="M12 9V5"/>
      <path d="M12 4c-.5-.5.5-1.5 0-2 0 .5-.5 1 0 2z" fill="currentColor" stroke="none"/>
      <path d="M8 18l1.5-2 1.5 2 1.5-2 1.5 2 1.5-2 1.5 2" opacity="0.5"/>
    </>),
  },
  {
    id: "anniversary",
    name: "Anniversary",
    category: "loyalty",
    keywords: ["anniversary", "milestone", "tenure", "guest"],
    render: () => (<>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>
      <path d="M9 3l1 3M15 3l-1 3M9 21l1-3M15 21l-1-3"/>
    </>),
  },
  {
    id: "host",
    name: "Host",
    category: "loyalty",
    keywords: ["host", "casino host", "personal host", "vip host", "contact"],
    notes: "A host is the relationship manager for a high-value player. Person + headset.",
    render: () => (<>
      <circle cx="12" cy="7.5" r="3.5"/>
      <path d="M5 21c0-3.5 3.5-6 7-6s7 2.5 7 6"/>
      <path d="M16 9c0-2-2-3.5-4-3.5S8 7 8 9"/>
      <path d="M8 9v2"/>
      <path d="M16 9v2"/>
    </>),
  },
  {
    id: "comp",
    name: "Comp",
    category: "loyalty",
    keywords: ["comp", "complimentary", "gift", "voucher", "perk"],
    notes: "A complimentary perk extended by host or earned by tier.",
    render: () => (<>
      <path d="M4 9h16v4H4z"/>
      <path d="M5 13h14v8H5z"/>
      <path d="M12 9v12"/>
      <path d="M12 9c-2-1-5-1-5-3s2.5-2 5 0c2.5-2 5-2 5 0s-3 2-5 3z"/>
    </>),
  },
  {
    id: "promotion",
    name: "Promotion",
    category: "loyalty",
    keywords: ["promo", "promotion", "offer", "campaign", "megaphone"],
    render: () => (<>
      <path d="M3 9v6l13 4V5z"/>
      <path d="M16 7v10c2 0 4-2 4-5s-2-5-4-5z"/>
      <path d="M6 15v3h3"/>
    </>),
  },
  {
    id: "earn-rate",
    name: "Earn Rate",
    category: "loyalty",
    keywords: ["earn rate", "multiplier", "tier benefit", "accelerator"],
    render: () => (<>
      <path d="M3 18l6-6 4 4 8-9"/>
      <path d="M14 7h7v7"/>
    </>),
  },
  {
    id: "free-night",
    name: "Free Night",
    category: "loyalty",
    keywords: ["free night", "comp room", "moon", "stay", "hotel offer"],
    render: () => (<>
      <path d="M18 14a8 8 0 1 1-8-9 7 7 0 0 0 8 9z" fill="currentColor" stroke="none" opacity="0.1"/>
      <path d="M18 14a8 8 0 1 1-8-9 7 7 0 0 0 8 9z"/>
      <path d="M17 6l.6 1.4L19 8l-1.4.6L17 10l-.6-1.4L15 8l1.4-.6z" fill="currentColor" stroke="none"/>
    </>),
  },
);
