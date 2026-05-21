/* Compliance & Security — the regulated half of the property. */

LIB_ICONS.push(
  {
    id: "age-21",
    name: "21+",
    category: "compliance",
    keywords: ["21", "age", "id check", "gaming age", "verify"],
    notes: "21+ gaming age verification. Used at floor entry, sportsbook kiosks, and account creation.",
    render: () => (<>
      <circle cx="12" cy="12" r="9"/>
      <path d="M8.5 10.5c0-1.5 1-2 2-2s2 .5 2 2c0 1.5-3 2-3 3v1h3"/>
      <path d="M13.5 15.5V8.5l-1.5 1"/>
    </>),
  },
  {
    id: "responsible-gaming",
    name: "Responsible Gaming",
    category: "compliance",
    keywords: ["responsible gaming", "problem gambling", "limits", "self-help"],
    notes: "Hand framing chips — the universal responsible-gaming mark.",
    render: () => (<>
      <path d="M5 11l1-2c.3-.5 1-.7 1.5-.3"/>
      <path d="M7.5 8.7c.3-.4 1-.4 1.4 0L11 10.5"/>
      <path d="M9 7c.3-.4 1-.4 1.4 0L13 9.5l1.5-1.5c.4-.4 1.1-.4 1.5 0s.4 1.1 0 1.5L14 12"/>
      <path d="M6 11l-1 1c-1 1-1 2 0 3l3 3h6c1.5 0 3-1 3.5-2.5l2-4"/>
      <circle cx="11" cy="14" r="1.3"/>
    </>),
  },
  {
    id: "self-exclude",
    name: "Self-Exclude",
    category: "compliance",
    keywords: ["self-exclude", "self-exclusion", "ban", "voluntary", "list"],
    render: () => (<>
      <circle cx="12" cy="8" r="3"/>
      <path d="M5 21c0-3.5 3.5-6 7-6s7 2.5 7 6"/>
      <path d="M16.5 4.5l4 4M20.5 4.5l-4 4"/>
    </>),
  },
  {
    id: "ctr",
    name: "Cash Transaction (Title 31)",
    category: "compliance",
    keywords: ["ctr", "title 31", "currency transaction report", "fincen", "aml"],
    notes: "Documented cash transaction at or above the regulatory threshold.",
    render: () => (<>
      <rect x="3" y="4" width="13" height="14"/>
      <path d="M3 8h13"/>
      <path d="M6 13h2.5M6 16h5"/>
      <path d="M5.5 5.5h2v1h-2z" fill="currentColor" stroke="none" opacity="0.4"/>
      <circle cx="16" cy="17" r="4"/>
      <path d="M14.5 17h3"/>
      <path d="M16 15.5v3"/>
    </>),
  },
  {
    id: "suspicious-activity",
    name: "Suspicious Activity",
    category: "compliance",
    keywords: ["sar", "suspicious activity report", "aml", "alert", "watch"],
    render: () => (<>
      <path d="M12 3l9 16H3z"/>
      <path d="M12 9v5"/>
      <circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "w2g",
    name: "W-2G / Tax Form",
    category: "compliance",
    keywords: ["w2g", "tax", "win", "irs", "1099", "jackpot tax"],
    render: () => (<>
      <rect x="4" y="3" width="14" height="18" rx="0.5"/>
      <path d="M4 8h14"/>
      <path d="M7 12h8M7 15h6"/>
      <path d="M14 18l1.5 1.5L19 16"/>
    </>),
  },
  {
    id: "cashless-wallet",
    name: "Cashless Wallet",
    category: "compliance",
    keywords: ["cashless", "wallet", "digital", "tap", "mobile pay"],
    render: () => (<>
      <rect x="3" y="6" width="18" height="13" rx="1.5"/>
      <path d="M3 10h18"/>
      <circle cx="16.5" cy="14.5" r="1.5"/>
      <path d="M14 14.5a3 3 0 0 1 5 0" opacity="0.55"/>
      <path d="M7 14h3" />
    </>),
  },
  {
    id: "vault",
    name: "Vault",
    category: "compliance",
    keywords: ["vault", "main bank", "safe", "secure", "count room"],
    render: () => (<>
      <rect x="3" y="3" width="18" height="18" rx="1"/>
      <circle cx="12" cy="12" r="5"/>
      <path d="M12 7V4M12 17v3M7 12H4M17 12h3"/>
      <path d="M8 8l-1.5-1.5M16 16l1.5 1.5M8 16l-1.5 1.5M16 8l1.5-1.5"/>
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "drop-count",
    name: "Drop Count",
    category: "compliance",
    keywords: ["drop", "count", "soft count", "hard count", "audit"],
    render: () => (<>
      <rect x="4" y="6" width="16" height="12" rx="0.5"/>
      <path d="M4 10h16"/>
      <rect x="9" y="12" width="6" height="3" rx="0.3"/>
      <path d="M6 13h2M16 13h2" opacity="0.6"/>
      <rect x="7" y="3.5" width="10" height="2.5" rx="0.3"/>
    </>),
  },
  {
    id: "compliance",
    name: "Compliance",
    category: "compliance",
    keywords: ["compliance", "gavel", "regulation", "audit", "legal"],
    render: () => (<>
      <path d="M8 4l8 8" />
      <path d="M5.5 6.5L9 3l4 4-3.5 3.5z"/>
      <path d="M9 13l-5 5 2 2 5-5z"/>
      <path d="M3 21h10" />
    </>),
  },
  {
    id: "verified",
    name: "Verified",
    category: "compliance",
    keywords: ["verified", "id", "approved", "check", "kyc"],
    render: () => (<>
      <path d="M12 3l8 3v6c0 4-3.5 7.5-8 9-4.5-1.5-8-5-8-9V6z"/>
      <path d="M8.5 12l2.5 2.5 4.5-5"/>
    </>),
  },
  {
    id: "incident",
    name: "Incident Report",
    category: "compliance",
    keywords: ["incident", "report", "security", "log", "event"],
    render: () => (<>
      <rect x="4" y="3" width="14" height="18" rx="1"/>
      <path d="M8 7h6M8 10h6"/>
      <path d="M13 14l4 3-1 1 2 2 2-2-2-2"/>
      <circle cx="13.5" cy="14.5" r="1.2"/>
    </>),
  },
);
