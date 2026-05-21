/* Gaming — the visual language of the casino floor.
   24×24 viewBox, currentColor stroke (1.5 default), round caps/joins. */

LIB_ICONS.push(
  {
    id: "slot-machine",
    name: "Slot Machine",
    category: "gaming",
    keywords: ["slots", "reel", "video", "egm", "machine", "cabinet"],
    notes: "Three-reel cabinet with arm. Use for slot floor zones and machine listings.",
    render: () => (<>
      <rect x="3.5" y="4" width="14" height="16" rx="1.5"/>
      <rect x="5.5" y="7" width="2.7" height="5"/>
      <rect x="9.15" y="7" width="2.7" height="5"/>
      <rect x="12.8" y="7" width="2.7" height="5"/>
      <path d="M6 14.2h9"/>
      <path d="M8.5 16.7h4"/>
      <path d="M17.5 9v4"/>
      <circle cx="19.5" cy="9" r="1"/>
    </>),
  },
  {
    id: "slot-reels",
    name: "Reels",
    category: "gaming",
    keywords: ["slot", "reel", "spinning", "symbols", "line"],
    render: () => (<>
      <rect x="3" y="5" width="5" height="14" rx="0.7"/>
      <rect x="9.5" y="5" width="5" height="14" rx="0.7"/>
      <rect x="16" y="5" width="5" height="14" rx="0.7"/>
      <path d="M3 12h18"/>
      <circle cx="5.5" cy="8.5" r="0.6" fill="currentColor" stroke="none"/>
      <path d="M11 8.5h2" />
      <path d="M17.5 8l2 1.5" />
    </>),
  },
  {
    id: "video-poker",
    name: "Video Poker",
    category: "gaming",
    keywords: ["vp", "video", "draw", "poker", "screen"],
    render: () => (<>
      <rect x="3" y="4" width="18" height="11" rx="1.2"/>
      <rect x="5.5" y="6.5" width="2.6" height="3.8" rx="0.3"/>
      <rect x="8.7" y="6.5" width="2.6" height="3.8" rx="0.3"/>
      <rect x="11.9" y="6.5" width="2.6" height="3.8" rx="0.3"/>
      <rect x="15.1" y="6.5" width="2.6" height="3.8" rx="0.3"/>
      <path d="M5.5 12.5h13"/>
      <rect x="3" y="17" width="18" height="3.5" rx="0.5"/>
      <circle cx="7" cy="18.7" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="10" cy="18.7" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="13" cy="18.7" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="16" cy="18.7" r="0.6" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "dice",
    name: "Die",
    category: "gaming",
    keywords: ["dice", "craps", "roll", "cube"],
    render: () => (<>
      <path d="M12 3.5l-7.5 4.5v8L12 20.5l7.5-4.5v-8z"/>
      <path d="M4.5 8L12 12.5l7.5-4.5"/>
      <path d="M12 12.5V20.5"/>
      <circle cx="8.5" cy="14.5" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="15.5" cy="14.5" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="15.5" cy="17.7" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "dice-pair",
    name: "Dice Pair",
    category: "gaming",
    keywords: ["craps", "shoot", "snake-eyes", "roll", "two"],
    render: () => (<>
      <rect x="2.5" y="6" width="9" height="9" rx="1.5"/>
      <circle cx="5" cy="8.5" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="9" cy="12.5" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="5" cy="12.5" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="9" cy="8.5" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="7" cy="10.5" r="0.6" fill="currentColor" stroke="none"/>
      <rect x="12.5" y="11" width="9" height="9" rx="1.5"/>
      <circle cx="15" cy="13.5" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="19" cy="17.5" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="17" cy="15.5" r="0.6" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "playing-cards",
    name: "Playing Cards",
    category: "gaming",
    keywords: ["cards", "deck", "hand", "table game"],
    render: () => (<>
      <g transform="rotate(-12 9 13)">
        <rect x="3.5" y="6.5" width="10" height="13" rx="1.2"/>
      </g>
      <g transform="rotate(10 15 12)">
        <rect x="9.5" y="4" width="10" height="13" rx="1.2" fill="var(--surface)"/>
        <path d="M14.5 7.5l-1.2 1.6c-.6.8-.2 1.9.8 1.9s1.4-1.1.8-1.9z" fill="currentColor" stroke="none"/>
      </g>
    </>),
  },
  {
    id: "card-spade",
    name: "Spade",
    category: "gaming",
    keywords: ["suit", "spade", "card", "spades"],
    render: () => (<>
      <path d="M12 3.5c-1 1.5-6 6-6 9.5 0 2 1.5 3.3 3.2 3.3 1.1 0 1.8-.5 2.3-1.1l-1 5h3l-1-5c.5.6 1.2 1.1 2.3 1.1 1.7 0 3.2-1.3 3.2-3.3 0-3.5-5-8-6-9.5z" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "card-heart",
    name: "Heart (suit)",
    category: "gaming",
    keywords: ["heart", "suit", "card", "hearts"],
    render: () => (<>
      <path d="M12 20.5s-7.5-4.5-7.5-10A4 4 0 0 1 12 8a4 4 0 0 1 7.5 2.5c0 5.5-7.5 10-7.5 10z" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "card-diamond",
    name: "Diamond (suit)",
    category: "gaming",
    keywords: ["diamond", "suit", "card", "diamonds"],
    render: () => (<>
      <path d="M12 3.5L19 12l-7 8.5L5 12z" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "card-club",
    name: "Club (suit)",
    category: "gaming",
    keywords: ["club", "suit", "card", "clubs"],
    render: () => (<>
      <circle cx="12" cy="7.5" r="3" fill="currentColor" stroke="none"/>
      <circle cx="7.5" cy="14" r="3" fill="currentColor" stroke="none"/>
      <circle cx="16.5" cy="14" r="3" fill="currentColor" stroke="none"/>
      <path d="M10 21h4l-1.2-5.5h-1.6z" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "poker-chip",
    name: "Poker Chip",
    category: "gaming",
    keywords: ["chip", "wager", "bet", "tokens", "denomination"],
    notes: "Generic chip glyph. Combine with color tokens for denomination ($1 white, $5 red, $25 green, $100 black, $500 purple).",
    render: () => (<>
      <circle cx="12" cy="12" r="8.5"/>
      <circle cx="12" cy="12" r="5"/>
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M5.9 5.9l2.1 2.1M16 16l2.1 2.1M5.9 18.1l2.1-2.1M16 8l2.1-2.1"/>
    </>),
  },
  {
    id: "chip-stack",
    name: "Chip Stack",
    category: "gaming",
    keywords: ["chips", "stack", "buy-in", "bankroll", "rack"],
    render: () => (<>
      <ellipse cx="12" cy="7.5" rx="7" ry="2.5"/>
      <path d="M5 7.5v9a7 2.5 0 0 0 14 0v-9"/>
      <path d="M5 10.5a7 2.5 0 0 0 14 0"/>
      <path d="M5 13.5a7 2.5 0 0 0 14 0"/>
    </>),
  },
  {
    id: "roulette",
    name: "Roulette",
    category: "gaming",
    keywords: ["wheel", "roulette", "spin", "00", "european"],
    render: () => (<>
      <circle cx="12" cy="12" r="9"/>
      <circle cx="12" cy="12" r="5.5"/>
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/>
      <path d="M12 3v3.5M12 17.5v3.5M3 12h3.5M17.5 12h3.5"/>
      <path d="M5.7 5.7l2.4 2.4M15.9 15.9l2.4 2.4M5.7 18.3l2.4-2.4M15.9 8.1l2.4-2.4"/>
      <circle cx="18.6" cy="9" r="1" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "craps-table",
    name: "Craps Table",
    category: "gaming",
    keywords: ["craps", "table", "rail", "stickman", "dice game"],
    render: () => (<>
      <path d="M3 8c0-1.7 1.3-3 3-3h12c1.7 0 3 1.3 3 3v8c0 1.7-1.3 3-3 3H6c-1.7 0-3-1.3-3-3z"/>
      <path d="M3 11h18M3 13h18"/>
      <circle cx="7" cy="16.5" r="0.4" fill="currentColor" stroke="none"/>
      <circle cx="9.5" cy="16.5" r="0.4" fill="currentColor" stroke="none"/>
      <circle cx="14.5" cy="16.5" r="0.4" fill="currentColor" stroke="none"/>
      <circle cx="17" cy="16.5" r="0.4" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "wheel-of-fortune",
    name: "Big Wheel",
    category: "gaming",
    keywords: ["big six", "money wheel", "wheel of fortune", "carnival"],
    render: () => (<>
      <circle cx="12" cy="13" r="7.5"/>
      <path d="M12 5.5v15M4.5 13h15"/>
      <path d="M6.7 7.7l10.6 10.6M6.7 18.3l10.6-10.6"/>
      <circle cx="12" cy="13" r="1.2" fill="currentColor" stroke="none"/>
      <path d="M12 3.5l-1.2 2h2.4z" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "jackpot-bell",
    name: "Jackpot Bell",
    category: "gaming",
    keywords: ["jackpot", "bell", "win", "alarm", "hit"],
    notes: "Classic slot win symbol — also used in app notifications for jackpot alerts.",
    render: () => (<>
      <path d="M12 3.5v1.8"/>
      <path d="M5.5 18l-1.2 1.5h15.4L18.5 18z"/>
      <path d="M5.5 18v-5.2a6.5 6.5 0 0 1 13 0V18"/>
      <circle cx="12" cy="20.5" r="1.3"/>
      <path d="M8.5 11.5c0-1.5 1-2.8 2.5-3.3" opacity="0.55"/>
    </>),
  },
  {
    id: "sportsbook",
    name: "Sportsbook",
    category: "gaming",
    keywords: ["sports", "betting", "odds", "lines", "book"],
    render: () => (<>
      <rect x="3" y="4.5" width="18" height="15" rx="1.5"/>
      <path d="M3 9h18"/>
      <circle cx="7.5" cy="13" r="1.8"/>
      <circle cx="16.5" cy="13" r="1.8"/>
      <path d="M10 13h4M12 11v4"/>
      <path d="M6 17h12"/>
    </>),
  },
  {
    id: "bingo-keno",
    name: "Bingo / Keno",
    category: "gaming",
    keywords: ["bingo", "keno", "ball", "draw", "numbers"],
    render: () => (<>
      <circle cx="12" cy="11" r="7"/>
      <ellipse cx="12" cy="11" rx="7" ry="2.8"/>
      <ellipse cx="12" cy="11" rx="2.8" ry="7"/>
      <path d="M12 4V3M9 18.5l-1 2.5M15 18.5l1 2.5"/>
    </>),
  },
  {
    id: "cherries",
    name: "Cherries",
    category: "gaming",
    keywords: ["cherries", "slot symbol", "fruit", "classic"],
    render: () => (<>
      <circle cx="8.5" cy="16.5" r="3"/>
      <circle cx="15.5" cy="16.5" r="3"/>
      <path d="M8.5 13.5c0-3 1.5-4.5 4-7"/>
      <path d="M15.5 13.5c0-3-1-5-2-7"/>
      <path d="M12.5 6.5c1.5-1 3-1 4 0c-.5 1.5-2 2-3 1.5"/>
    </>),
  },
  {
    id: "lucky-seven",
    name: "Lucky 7",
    category: "gaming",
    keywords: ["seven", "777", "slot", "lucky", "win"],
    render: () => (<>
      <path d="M5 5h14L13 20"/>
      <path d="M9 12.5h6"/>
    </>),
  },
  {
    id: "card-shoe",
    name: "Card Shoe",
    category: "gaming",
    keywords: ["shoe", "dealer", "shuffler", "blackjack", "deal"],
    render: () => (<>
      <path d="M4 10v6h16v-6L14 7.5v2.5z"/>
      <path d="M4 16l-1 2.5h18L20 16"/>
      <rect x="11" y="12" width="2.5" height="4"/>
    </>),
  },
  {
    id: "cage",
    name: "Cage / Cashier",
    category: "gaming",
    keywords: ["cage", "cashier", "teller", "redemption", "cash", "window"],
    notes: "Use for cash-out / chip redemption locations on property maps.",
    render: () => (<>
      <rect x="3" y="4" width="18" height="12" rx="1"/>
      <path d="M3 8h18"/>
      <path d="M7.5 8v8M12 8v8M16.5 8v8"/>
      <path d="M3 16l-1 4h20l-1-4"/>
    </>),
  },
  {
    id: "pit",
    name: "Pit",
    category: "gaming",
    keywords: ["pit", "supervisor", "pit boss", "floor", "table area"],
    notes: "Echoes the printed-book pit shape. Use for pit assignment lists and floor maps.",
    render: () => (<>
      <path d="M5 8c0-2 1.5-3.5 3.5-3.5h7c2 0 3.5 1.5 3.5 3.5v8c0 2-1.5 3.5-3.5 3.5h-7C6.5 19.5 5 18 5 16z"/>
      <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/>
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "surveillance-camera",
    name: "Surveillance",
    category: "gaming",
    keywords: ["camera", "surveillance", "security", "dome", "ceiling"],
    render: () => (<>
      <path d="M12 3v2.5"/>
      <path d="M3.5 14C3.5 9.3 7.3 5.5 12 5.5S20.5 9.3 20.5 14H3.5z"/>
      <circle cx="12" cy="11.5" r="2.4"/>
      <circle cx="12" cy="11.5" r="0.8" fill="currentColor" stroke="none"/>
      <path d="M3.5 14v2h17v-2"/>
      <path d="M9 20l-2 0.5M15 20l2 0.5"/>
    </>),
  },
  {
    id: "eye-in-the-sky",
    name: "Eye in the Sky",
    category: "gaming",
    keywords: ["surveillance", "monitor", "watch", "eye", "security"],
    notes: "The all-seeing eye — used in surveillance dashboards, audit views, and the back-of-house monitor wall.",
    render: () => (<>
      <path d="M2.5 12C5 7.5 8.5 5 12 5s7 2.5 9.5 7c-2.5 4.5-6 7-9.5 7s-7-2.5-9.5-7z"/>
      <circle cx="12" cy="12" r="3.2"/>
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "marker",
    name: "Marker",
    category: "gaming",
    keywords: ["marker", "credit", "iou", "line", "loan", "front money"],
    notes: "A casino marker — short-term interest-free credit. Use in player accounts / cage.",
    render: () => (<>
      <path d="M5 3h11l3.5 3.5V21H5z"/>
      <path d="M16 3v3.5h3.5"/>
      <path d="M8 11h8M8 14h6M8 17h4"/>
      <circle cx="16" cy="17" r="2.5" stroke="currentColor"/>
      <path d="M15 17h2"/>
    </>),
  },
  {
    id: "tito-ticket",
    name: "TITO Ticket",
    category: "gaming",
    keywords: ["tito", "ticket", "voucher", "redemption", "ticket-in", "ticket-out"],
    render: () => (<>
      <path d="M3 7.5v3a1.5 1.5 0 0 1 0 3v3h18v-3a1.5 1.5 0 0 1 0-3v-3z"/>
      <path d="M8 9v6"/>
      <path d="M11 9.5h6M11 12h7M11 14.5h5"/>
    </>),
  },
  {
    id: "player-card",
    name: "Player's Card",
    category: "gaming",
    keywords: ["players card", "loyalty card", "rewards", "card", "key tag"],
    notes: "Loyalty card with chip. Often replaced by mobile NFC — pair with the phone-tap icon.",
    render: () => (<>
      <rect x="3" y="5" width="18" height="13" rx="1.5"/>
      <rect x="5.5" y="8.5" width="3.8" height="3.2" rx="0.5"/>
      <path d="M11.5 9.5h7M11.5 12.5h4.5"/>
      <path d="M5.5 15h6"/>
    </>),
  },
  {
    id: "high-limit",
    name: "High Limit",
    category: "gaming",
    keywords: ["high limit", "salon", "vip room", "high roller", "private"],
    notes: "High-limit room / salon. Star + chip — premium, private, locked.",
    render: () => (<>
      <path d="M12 3.5l1.9 4 4.2.6-3 3 .7 4.2L12 13.3l-3.8 2 .7-4.2-3-3 4.2-.6z" fill="currentColor" stroke="none"/>
      <rect x="5" y="15.5" width="14" height="5" rx="1"/>
      <path d="M8 18h8"/>
    </>),
  },
  {
    id: "drop-box",
    name: "Drop Box",
    category: "gaming",
    keywords: ["drop", "box", "table drop", "count", "deposit"],
    notes: "The locked box under a table — where cash and markers go. Counted in the drop room.",
    render: () => (<>
      <rect x="4.5" y="6" width="15" height="13" rx="1"/>
      <path d="M9 6V4.5h6V6"/>
      <path d="M8 11h8" />
      <rect x="10.5" y="13.5" width="3" height="2.5" rx="0.4"/>
    </>),
  },
);
