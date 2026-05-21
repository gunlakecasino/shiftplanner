/* Dining & Bar — every glyph a four-star F&B booking system needs. */

LIB_ICONS.push(
  {
    id: "restaurant",
    name: "Restaurant",
    category: "dining",
    keywords: ["dining", "restaurant", "knife", "fork", "eat"],
    render: () => (<>
      <path d="M7 3v8c0 .8.7 1.5 1.5 1.5S10 11.8 10 11V3"/>
      <path d="M8.5 12.5V21"/>
      <path d="M7 3v4M10 3v4"/>
      <path d="M16 21V3"/>
      <path d="M14 3c-1 0-2 1.5-2 4s1 4 2 4h4c1 0 2-1.5 2-4s-1-4-2-4z"/>
    </>),
  },
  {
    id: "fine-dining",
    name: "Fine Dining",
    category: "dining",
    keywords: ["fine dining", "place setting", "tasting", "white tablecloth", "michelin"],
    notes: "A full place setting — used for upscale signature restaurants.",
    render: () => (<>
      <circle cx="12" cy="12" r="8.5"/>
      <circle cx="12" cy="12" r="5"/>
      <path d="M4.5 4l2 2M19.5 4l-2 2"/>
      <path d="M3 8l3 1M21 8l-3 1"/>
    </>),
  },
  {
    id: "steakhouse",
    name: "Steakhouse",
    category: "dining",
    keywords: ["steak", "steakhouse", "grill", "meat", "chop house"],
    render: () => (<>
      <path d="M5 12c0-3 2.5-5.5 6-5.5s7 1 8 4.5c.5 2-.5 4-3 5s-5 1-7 1-4-2.5-4-5z"/>
      <path d="M7.5 12c2-2 5-2 7 0"/>
      <circle cx="14" cy="10" r="0.4" fill="currentColor" stroke="none"/>
      <circle cx="11" cy="13.5" r="0.4" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "buffet",
    name: "Buffet",
    category: "dining",
    keywords: ["buffet", "warmer", "chafing dish", "all you can eat", "stations"],
    render: () => (<>
      <path d="M3 13c0-3 4-5 9-5s9 2 9 5z"/>
      <path d="M3 13h18l-1 5H4z"/>
      <circle cx="12" cy="5.5" r="0.8"/>
      <path d="M12 6.3v1.7"/>
      <path d="M3 18h18"/>
      <path d="M9 18v2M15 18v2"/>
    </>),
  },
  {
    id: "cafe",
    name: "Café",
    category: "dining",
    keywords: ["cafe", "coffee shop", "espresso bar", "casual"],
    render: () => (<>
      <path d="M4 9h12v6c0 2.2-1.8 4-4 4H8c-2.2 0-4-1.8-4-4z"/>
      <path d="M16 11h2a2.5 2.5 0 0 1 0 5h-2"/>
      <path d="M7 6c-.5-1 .5-1.5 0-2.5M10 6c-.5-1 .5-1.5 0-2.5M13 6c-.5-1 .5-1.5 0-2.5" opacity="0.55"/>
    </>),
  },
  {
    id: "coffee",
    name: "Coffee",
    category: "dining",
    keywords: ["coffee", "espresso", "americano", "drip", "barista"],
    render: () => (<>
      <path d="M5 10h11v6c0 2.2-1.8 4-4 4H9c-2.2 0-4-1.8-4-4z"/>
      <path d="M16 12h1.5a2.5 2.5 0 0 1 0 5H16"/>
      <path d="M8 7c-.5-1 .5-1.5 0-2.5M11 7c-.5-1 .5-1.5 0-2.5M14 7c-.5-1 .5-1.5 0-2.5" opacity="0.6"/>
    </>),
  },
  {
    id: "tea",
    name: "Tea",
    category: "dining",
    keywords: ["tea", "afternoon tea", "high tea", "teapot", "service"],
    render: () => (<>
      <path d="M5 11h11v5c0 2-1.5 3.5-3.5 3.5h-4c-2 0-3.5-1.5-3.5-3.5z"/>
      <path d="M16 13h1.5a2 2 0 0 1 0 4H16"/>
      <path d="M5 11c-1-1-2-.5-2 1.5s1 2.5 2 1.5"/>
      <path d="M10 5l1 3M12 5v3" opacity="0.6"/>
    </>),
  },
  {
    id: "bar",
    name: "Bar",
    category: "dining",
    keywords: ["bar", "counter", "lounge bar", "cocktail bar"],
    render: () => (<>
      <path d="M3 7h18l-2 3h-14z"/>
      <path d="M12 10v8"/>
      <path d="M8 18h8"/>
      <path d="M3 4l2 1.5M21 4l-2 1.5"/>
    </>),
  },
  {
    id: "cocktail",
    name: "Cocktail",
    category: "dining",
    keywords: ["cocktail", "martini", "mixology", "shaken", "lounge"],
    render: () => (<>
      <path d="M3 5h18l-9 8z"/>
      <path d="M12 13v6"/>
      <path d="M8 19h8"/>
      <circle cx="17" cy="4" r="1"/>
    </>),
  },
  {
    id: "wine",
    name: "Wine",
    category: "dining",
    keywords: ["wine", "glass", "stem", "red wine", "by the glass"],
    render: () => (<>
      <path d="M7 3h10v4c0 3-2 6-5 6s-5-3-5-6z"/>
      <path d="M7 6.5h10" opacity="0.5"/>
      <path d="M12 13v6"/>
      <path d="M8.5 19h7"/>
    </>),
  },
  {
    id: "wine-bottle",
    name: "Wine Bottle",
    category: "dining",
    keywords: ["bottle", "wine list", "vintage", "cellar"],
    render: () => (<>
      <path d="M10 3h4v4l2 2v10.5c0 1-.5 1.5-1.5 1.5h-5c-1 0-1.5-.5-1.5-1.5V9l2-2z"/>
      <path d="M10 9h4"/>
      <path d="M8.5 13h7v3h-7z"/>
    </>),
  },
  {
    id: "champagne",
    name: "Champagne",
    category: "dining",
    keywords: ["champagne", "flute", "sparkling", "celebrate", "bottle service"],
    render: () => (<>
      <path d="M9 3h6v3c0 4-1 9-3 12-2-3-3-8-3-12z"/>
      <path d="M12 18v3"/>
      <path d="M9.5 21h5"/>
      <circle cx="11" cy="11" r="0.4" fill="currentColor" stroke="none"/>
      <circle cx="13" cy="13" r="0.4" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="15.5" r="0.4" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "beer",
    name: "Beer",
    category: "dining",
    keywords: ["beer", "draft", "mug", "lager", "pub", "tap"],
    render: () => (<>
      <path d="M5.5 6h11v13c0 1-.5 1.5-1.5 1.5h-8c-1 0-1.5-.5-1.5-1.5z"/>
      <path d="M16.5 9h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/>
      <path d="M7 9.5c.5-1 1.5-1 2 0s1.5 1 2 0 1.5-1 2 0 1.5 1 2 0"/>
      <path d="M5.5 6c-.5-1.5.5-3 2-3" opacity="0.6"/>
    </>),
  },
  {
    id: "whiskey",
    name: "Whiskey",
    category: "dining",
    keywords: ["whiskey", "scotch", "bourbon", "rocks", "neat", "old fashioned"],
    render: () => (<>
      <path d="M6 8h12v9.5c0 1.5-1.2 2.5-2.5 2.5h-7C7.2 20 6 19 6 17.5z"/>
      <path d="M6 8c-1-2 0-3 2-3h8c2 0 3 1 2 3" opacity="0.6"/>
      <circle cx="10" cy="14" r="1.5"/>
      <circle cx="14" cy="16" r="1"/>
    </>),
  },
  {
    id: "room-service-tray",
    name: "Room Service Tray",
    category: "dining",
    keywords: ["tray", "in-room dining", "served", "delivery"],
    render: () => (<>
      <ellipse cx="12" cy="14" rx="9" ry="1.5"/>
      <ellipse cx="12" cy="11.5" rx="6" ry="1.2"/>
      <path d="M9 7v1c0 1 1 2 3 2s3-1 3-2V7"/>
      <path d="M8 6c.5-1.5 2-2.5 4-2.5s3.5 1 4 2.5z"/>
      <path d="M3 17l3 3h12l3-3"/>
    </>),
  },
  {
    id: "menu",
    name: "Menu",
    category: "dining",
    keywords: ["menu", "card", "list", "wine list", "carte"],
    render: () => (<>
      <path d="M5 3h11l3 3v15H5z"/>
      <path d="M16 3v3h3"/>
      <path d="M8 10h7M8 13h7M8 16h5"/>
    </>),
  },
  {
    id: "reservation",
    name: "Reservation",
    category: "dining",
    keywords: ["reservation", "booking", "table", "rsvp", "opentable"],
    render: () => (<>
      <rect x="3" y="5" width="18" height="15" rx="1"/>
      <path d="M3 9h18"/>
      <path d="M8 3v4M16 3v4"/>
      <circle cx="12" cy="14" r="2.5"/>
      <path d="M10 18a2.5 2.5 0 0 1 4 0"/>
      <path d="M9 14h-1M15 14h1" opacity="0.5"/>
    </>),
  },
  {
    id: "sommelier",
    name: "Sommelier",
    category: "dining",
    keywords: ["sommelier", "wine pairing", "wine list", "expert", "tasting"],
    notes: "Wine + tastevin emblem. Use for sommelier-paired tasting menus.",
    render: () => (<>
      <path d="M8 4h8v3c0 2.5-1.5 4.5-4 4.5S8 9.5 8 7z"/>
      <path d="M12 11.5V17"/>
      <path d="M9 17h6"/>
      <circle cx="17" cy="17" r="3"/>
      <circle cx="17" cy="17" r="0.6" fill="currentColor" stroke="none"/>
    </>),
  },
  {
    id: "dessert",
    name: "Dessert",
    category: "dining",
    keywords: ["dessert", "cake", "pastry", "sweet", "patisserie"],
    render: () => (<>
      <path d="M5 13h14v5c0 1-1 2-2 2H7c-1 0-2-1-2-2z"/>
      <path d="M5 13c0-2.5 3-4.5 7-4.5s7 2 7 4.5"/>
      <path d="M12 8.5V5"/>
      <path d="M11 5c0-1 .5-1.5 1-2.5"/>
    </>),
  },
  {
    id: "sushi",
    name: "Sushi",
    category: "dining",
    keywords: ["sushi", "sashimi", "japanese", "omakase", "nigiri"],
    render: () => (<>
      <ellipse cx="8" cy="13" rx="4.5" ry="3"/>
      <path d="M3.5 13c0-1.5 2-3 4.5-3s4.5 1.5 4.5 3"/>
      <ellipse cx="8" cy="10.5" rx="3.5" ry="1.2"/>
      <ellipse cx="16.5" cy="15" rx="4" ry="2.5"/>
      <ellipse cx="16.5" cy="13" rx="3" ry="1"/>
      <path d="M3 18h18"/>
    </>),
  },
  {
    id: "bakery",
    name: "Bakery",
    category: "dining",
    keywords: ["bakery", "croissant", "bread", "patisserie", "pastry shop"],
    render: () => (<>
      <path d="M4 14c2-5 6-7 8-7s6 2 8 7c-2 1-4 1-6 0-1 .5-2 .5-3 0-2 1-5 1-7 0z"/>
      <path d="M7 11c.5 1 1 1.5 2 2M10 9c0 1 .5 2 1 2.5M14 9c-.5 1.5-.5 2.5 0 3" opacity="0.5"/>
    </>),
  },
  {
    id: "no-smoking",
    name: "No Smoking",
    category: "dining",
    keywords: ["no smoking", "non-smoking", "smoke free", "prohibited"],
    render: () => (<>
      <circle cx="12" cy="12" r="9"/>
      <path d="M5.5 5.5l13 13"/>
      <rect x="6" y="11" width="11" height="2"/>
      <path d="M14 11V9c0-.8.6-1.5 1.5-1.5"/>
      <path d="M17 11v-1c0-.8.6-1.5 1.5-1.5"/>
    </>),
  },
  {
    id: "smoking-area",
    name: "Smoking Area",
    category: "dining",
    keywords: ["smoking", "cigar lounge", "smoking permitted", "designated"],
    render: () => (<>
      <rect x="3" y="11" width="14" height="2.5" rx="0.3"/>
      <path d="M14 11V9c0-1 .7-1.7 1.7-1.7M18 11V9.5c0-1 .7-1.7 1.7-1.7"/>
      <path d="M3 13.5V11M7 13.5V11M11 13.5V11"/>
      <path d="M8 16c0 1 1.5 1.5 1.5 2.5" opacity="0.5"/>
    </>),
  },
);
