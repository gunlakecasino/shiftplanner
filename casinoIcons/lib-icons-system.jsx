/* System & UI — the connective tissue between every other category. */

LIB_ICONS.push(
  { id: "search", name: "Search", category: "system",
    keywords: ["search", "find", "magnify", "lookup"],
    render: () => (<><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></>) },
  { id: "plus", name: "Plus / New", category: "system",
    keywords: ["new", "add", "create", "plus"],
    render: () => (<><path d="M12 5v14M5 12h14"/></>) },
  { id: "close", name: "Close", category: "system",
    keywords: ["close", "x", "dismiss", "cancel"],
    render: () => (<><path d="M6 6l12 12M18 6L6 18"/></>) },
  { id: "check", name: "Check", category: "system",
    keywords: ["check", "done", "confirm", "ok"],
    render: () => (<><path d="M5 12.5l4 4L19 7"/></>) },
  { id: "chevron-down", name: "Chevron Down", category: "system",
    keywords: ["dropdown", "expand", "open"],
    render: () => (<><path d="M6 9l6 6 6-6"/></>) },
  { id: "chevron-up", name: "Chevron Up", category: "system",
    keywords: ["collapse", "fold"],
    render: () => (<><path d="M6 15l6-6 6 6"/></>) },
  { id: "chevron-left", name: "Chevron Left", category: "system",
    keywords: ["back", "previous"],
    render: () => (<><path d="M15 6l-6 6 6 6"/></>) },
  { id: "chevron-right", name: "Chevron Right", category: "system",
    keywords: ["forward", "next", "more"],
    render: () => (<><path d="M9 6l6 6-6 6"/></>) },
  { id: "arrow-right", name: "Arrow Right", category: "system",
    keywords: ["next", "continue", "proceed"],
    render: () => (<><path d="M4 12h16M14 6l6 6-6 6"/></>) },
  { id: "arrow-left", name: "Arrow Left", category: "system",
    keywords: ["back", "return"],
    render: () => (<><path d="M20 12H4M10 6l-6 6 6 6"/></>) },
  { id: "filter", name: "Filter", category: "system",
    keywords: ["filter", "refine", "narrow"],
    render: () => (<><path d="M3 5h18l-7 9v6l-4-2v-4z"/></>) },
  { id: "sort", name: "Sort", category: "system",
    keywords: ["sort", "order", "arrange"],
    render: () => (<><path d="M4 6h16M6 12h12M9 18h6"/></>) },
  { id: "settings", name: "Settings", category: "system",
    keywords: ["settings", "preferences", "gear", "cog"],
    render: () => (<>
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
      <path d="M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>
    </>) },
  { id: "user", name: "User", category: "system",
    keywords: ["user", "profile", "account", "guest"],
    render: () => (<><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></>) },
  { id: "users", name: "Users", category: "system",
    keywords: ["users", "group", "team", "guests"],
    render: () => (<>
      <circle cx="9" cy="8" r="3.5"/>
      <path d="M3 19c0-3.5 2.5-6 6-6s6 2.5 6 6"/>
      <circle cx="17" cy="9" r="2.5"/>
      <path d="M15 13.5c3 0 6 2 6 5.5"/>
    </>) },
  { id: "bell", name: "Notifications", category: "system",
    keywords: ["bell", "alert", "notification", "ring"],
    render: () => (<>
      <path d="M5.5 16h13l-1.5-2v-4a5.5 5.5 0 0 0-11 0v4z"/>
      <path d="M10 19a2 2 0 0 0 4 0"/>
    </>) },
  { id: "calendar", name: "Calendar", category: "system",
    keywords: ["calendar", "date", "month"],
    render: () => (<>
      <rect x="3" y="5" width="18" height="15" rx="1"/>
      <path d="M3 9h18M8 3v4M16 3v4"/>
    </>) },
  { id: "clock", name: "Clock", category: "system",
    keywords: ["clock", "time", "hours"],
    render: () => (<><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3.5 2"/></>) },
  { id: "download", name: "Download", category: "system",
    keywords: ["download", "save", "export"],
    render: () => (<><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></>) },
  { id: "upload", name: "Upload", category: "system",
    keywords: ["upload", "import", "send"],
    render: () => (<><path d="M12 20V8M7 13l5-5 5 5M4 4h16"/></>) },
  { id: "share", name: "Share", category: "system",
    keywords: ["share", "send", "outgoing"],
    render: () => (<>
      <circle cx="6" cy="12" r="2.5"/>
      <circle cx="18" cy="6" r="2.5"/>
      <circle cx="18" cy="18" r="2.5"/>
      <path d="M8 11l8-4M8 13l8 4"/>
    </>) },
  { id: "edit", name: "Edit", category: "system",
    keywords: ["edit", "pencil", "modify"],
    render: () => (<>
      <path d="M4 20l4-1.5L19 7l-2.5-2.5L5.5 16z"/>
      <path d="M14.5 6.5l3 3"/>
    </>) },
  { id: "trash", name: "Delete", category: "system",
    keywords: ["delete", "trash", "remove"],
    render: () => (<>
      <path d="M4 7h16"/>
      <path d="M9 7V4h6v3"/>
      <path d="M6 7l1 13c0 .8.7 1.5 1.5 1.5h7c.8 0 1.5-.7 1.5-1.5l1-13"/>
      <path d="M10 11v6M14 11v6"/>
    </>) },
  { id: "lock", name: "Lock", category: "system",
    keywords: ["lock", "locked", "secure", "private"],
    render: () => (<>
      <rect x="5" y="11" width="14" height="9" rx="1.5"/>
      <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
    </>) },
  { id: "unlock", name: "Unlock", category: "system",
    keywords: ["unlock", "open", "unlocked"],
    render: () => (<>
      <rect x="5" y="11" width="14" height="9" rx="1.5"/>
      <path d="M8 11V8a4 4 0 0 1 7.5-2"/>
    </>) },
  { id: "eye", name: "Show", category: "system",
    keywords: ["eye", "view", "show", "visible"],
    render: () => (<>
      <path d="M2 12C4.5 7.5 8 5 12 5s7.5 2.5 10 7c-2.5 4.5-6 7-10 7S4.5 16.5 2 12z"/>
      <circle cx="12" cy="12" r="3"/>
    </>) },
  { id: "eye-off", name: "Hide", category: "system",
    keywords: ["hide", "hidden", "invisible"],
    render: () => (<>
      <path d="M3 3l18 18"/>
      <path d="M6.5 6.7C4.5 8 3 10 2 12c2.5 4.5 6 7 10 7 1.5 0 3-.4 4.3-1"/>
      <path d="M9 6c1-.3 2-.5 3-.5 4 0 7.5 2.5 10 7-.7 1.3-1.6 2.5-2.6 3.5"/>
      <path d="M10 10a3 3 0 0 0 4 4"/>
    </>) },
  { id: "star", name: "Star (Rating)", category: "system",
    keywords: ["star", "favorite", "rating", "review"],
    render: () => (<><path d="M12 3.5l2.5 5.5 5.5.7-4 4 1 5.5L12 16.5l-5 2.7 1-5.5-4-4 5.5-.7z"/></>) },
  { id: "heart", name: "Favorite", category: "system",
    keywords: ["heart", "favorite", "save", "like"],
    render: () => (<><path d="M12 20.5s-8-5-8-11A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8-2c1.5 1 0 0 0 5 0 6-8 11-8 11z"/></>) },
  { id: "bookmark", name: "Bookmark", category: "system",
    keywords: ["bookmark", "save", "pin"],
    render: () => (<><path d="M6 3h12v18l-6-4-6 4z"/></>) },
  { id: "menu", name: "Menu", category: "system",
    keywords: ["menu", "hamburger", "nav"],
    render: () => (<><path d="M4 7h16M4 12h16M4 17h16"/></>) },
  { id: "more", name: "More", category: "system",
    keywords: ["more", "overflow", "dots"],
    render: () => (<>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>
      <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/>
    </>) },
  { id: "external-link", name: "External Link", category: "system",
    keywords: ["external", "link", "open in new"],
    render: () => (<>
      <path d="M14 4h6v6"/>
      <path d="M20 4l-9 9"/>
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>
    </>) },
  { id: "refresh", name: "Refresh", category: "system",
    keywords: ["refresh", "reload", "sync"],
    render: () => (<>
      <path d="M4 12a8 8 0 0 1 14-5.5"/>
      <path d="M20 12a8 8 0 0 1-14 5.5"/>
      <path d="M18 3v4h-4M6 21v-4h4"/>
    </>) },
  { id: "print", name: "Print", category: "system",
    keywords: ["print", "printer"],
    render: () => (<>
      <path d="M7 9V4h10v5"/>
      <rect x="4" y="9" width="16" height="8" rx="1"/>
      <path d="M7 17v3.5h10V17"/>
    </>) },
  { id: "language", name: "Language", category: "system",
    keywords: ["language", "translate", "globe", "international"],
    render: () => (<>
      <circle cx="12" cy="12" r="9"/>
      <path d="M3 12h18"/>
      <path d="M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>
    </>) },
  { id: "qr-code", name: "QR Code", category: "system",
    keywords: ["qr", "code", "scan", "check-in"],
    render: () => (<>
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
      <path d="M14 14h3M20 14v3M14 17v4M17 20h4M17 17v0"/>
      <rect x="5.5" y="5.5" width="2" height="2" fill="currentColor" stroke="none"/>
      <rect x="16.5" y="5.5" width="2" height="2" fill="currentColor" stroke="none"/>
      <rect x="5.5" y="16.5" width="2" height="2" fill="currentColor" stroke="none"/>
    </>) },
  { id: "tap-nfc", name: "Tap / NFC", category: "system",
    keywords: ["tap", "nfc", "contactless", "phone"],
    render: () => (<>
      <rect x="3" y="3" width="11" height="18" rx="2"/>
      <path d="M7 18h3"/>
      <path d="M16 7a4 4 0 0 1 0 10"/>
      <path d="M19 4a8 8 0 0 1 0 16"/>
    </>) },
  { id: "info", name: "Info", category: "system",
    keywords: ["info", "help", "details"],
    render: () => (<>
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 11v6"/>
      <circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none"/>
    </>) },
  { id: "warning", name: "Warning", category: "system",
    keywords: ["warning", "caution", "alert"],
    render: () => (<>
      <path d="M12 3.5l9.5 16.5h-19z"/>
      <path d="M12 10v5"/>
      <circle cx="12" cy="17.5" r="0.8" fill="currentColor" stroke="none"/>
    </>) },
  { id: "logo-mark", name: "Logo Mark", category: "system",
    keywords: ["logo", "mark", "brand", "icon"],
    notes: "Diamond on a foundation — a stand-in property mark using the same shape vocabulary as the loyalty tier ladder.",
    render: () => (<>
      <path d="M12 3l6 5-6 9-6-9z" fill="currentColor" stroke="none" opacity="0.15"/>
      <path d="M12 3l6 5-6 9-6-9z"/>
      <path d="M6 8h12"/>
      <path d="M5 21h14"/>
    </>) },
);
