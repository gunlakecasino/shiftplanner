/* Library viewer — search, filter, browse, inspect, copy SVG. */

const { useState, useMemo, useEffect, useRef, useCallback } = React;

/* ------------------------------------------------------------------ */
/* Core SVG helper — wraps an icon's render() in a viewBox + strokes  */
/* ------------------------------------------------------------------ */
function IconSvg({ icon, size = 24, stroke = 1.5, color = "currentColor", svgRef, style }) {
  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0, ...(style||{}) }}
    >
      {icon.render(stroke)}
    </svg>
  );
}

/* Cheap inline icons for the chrome (not part of the library proper) */
const ChromeIcons = {
  search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>,
  close: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  copy: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="3" width="13" height="13" rx="1.5"/><path d="M16 8H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2"/></svg>,
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4 4L19 7"/></svg>,
  sun: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/></svg>,
  moon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14a8 8 0 1 1-9-9 7 7 0 0 0 9 9z"/></svg>,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
function getIconSvgString(icon, stroke, size = 24, color = "currentColor") {
  // Render the icon's react element to a static SVG string for copy/download.
  const reactEl = icon.render(stroke);
  // We can use ReactDOMServer-like trick — but UMD doesn't ship the server module.
  // Instead, render once into a hidden DOM node, then grab innerHTML.
  const tmp = document.createElement("div");
  const tmpRoot = ReactDOM.createRoot(tmp);
  // tmpRoot.render is async, so we can't synchronously read DOM. Bail to a sync approach:
  // We'll cache by rendering once on demand via a ref. See SVGCode component below.
  // This function is unused — kept as a placeholder.
  return "";
}

function copyToClipboard(text) {
  try {
    return navigator.clipboard.writeText(text);
  } catch (e) {
    return Promise.reject(e);
  }
}

function downloadFile(filename, content, mime = "image/svg+xml") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

/* Build a clean serialized SVG from a live DOM <svg>. Strips React attrs,
   normalizes attribute order, formats with 2-space indents. */
function serializeSvg(svgEl, opts = {}) {
  if (!svgEl) return "";
  const clone = svgEl.cloneNode(true);
  // Clean up React-added attributes and inline styles we don't want exported
  function clean(node) {
    if (node.nodeType !== 1) return;
    [...node.attributes].forEach(a => {
      if (a.name === "style" || a.name.startsWith("data-")) node.removeAttribute(a.name);
    });
    [...node.childNodes].forEach(clean);
  }
  clean(clone);
  // Use XMLSerializer
  const xml = new XMLSerializer().serializeToString(clone);
  // Light pretty-print: line break after each '>' followed by '<'
  return xml
    .replace(/>\s*</g, ">\n<")
    .replace(/\n(<\/svg>)/, "\n$1");
}

/* ------------------------------------------------------------------ */
/* TopBar                                                             */
/* ------------------------------------------------------------------ */
function TopBar({ search, setSearch, stroke, setStroke, size, setSize, theme, setTheme, total }) {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 30,
      background: "color-mix(in srgb, var(--surface), transparent 18%)",
      backdropFilter: "saturate(180%) blur(20px)",
      WebkitBackdropFilter: "saturate(180%) blur(20px)",
      borderBottom: "0.5px solid var(--line)",
    }}>
      <div style={{
        maxWidth: 1480, margin: "0 auto",
        padding: "14px 32px",
        display: "flex", alignItems: "center", gap: 18,
      }}>
        {/* Mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 6,
            background: "linear-gradient(180deg, var(--ink-900), var(--ink-800))",
            color: "var(--gold-light)",
            display: "grid", placeItems: "center",
            boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.06)",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l6 5-6 9-6-9z" fill="currentColor" stroke="none" opacity="0.35"/>
              <path d="M12 3l6 5-6 9-6-9z"/>
              <path d="M6 8h12"/>
            </svg>
          </div>
          <div style={{ lineHeight: 1.15 }}>
            <div style={{
              fontFamily: "var(--serif)", fontSize: 18, fontWeight: 600,
              letterSpacing: "-0.005em", color: "var(--ink-900)",
            }}>Icon Library</div>
            <div style={{
              fontSize: 10.5, color: "var(--ink-500)", letterSpacing: 1.2,
              textTransform: "uppercase", fontWeight: 500,
            }}>Resort &amp; Casino · {total} marks</div>
          </div>
        </div>

        {/* Search */}
        <div style={{
          flex: 1, maxWidth: 560,
          display: "flex", alignItems: "center", gap: 10,
          padding: "0 14px", height: 38,
          background: "var(--surface)",
          borderRadius: 10,
          boxShadow: "inset 0 0 0 0.5px var(--line-strong)",
        }}>
          <span style={{ color: "var(--ink-400)", display: "flex" }}>{ChromeIcons.search}</span>
          <input
            type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search icons — try ‘chip’, ‘bell’, ‘21+’, ‘pool’…"
            style={{ flex: 1, fontSize: 13.5, color: "var(--ink-900)" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: "var(--ink-400)", display: "flex" }}>
              {ChromeIcons.close}
            </button>
          )}
        </div>

        {/* Stroke weight */}
        <Segmented
          label="Stroke"
          options={[{v: 1.0, l: "1"}, {v: 1.5, l: "1.5"}, {v: 2.0, l: "2"}]}
          value={stroke}
          onChange={setStroke}
        />

        {/* Size */}
        <Segmented
          label="Size"
          options={[{v: "S", l: "S"}, {v: "M", l: "M"}, {v: "L", l: "L"}]}
          value={size}
          onChange={setSize}
        />

        {/* Theme */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={theme === "dark" ? "Light theme" : "Dark theme"}
          style={{
            width: 36, height: 36, borderRadius: 9,
            display: "grid", placeItems: "center",
            color: "var(--ink-700)",
            boxShadow: "inset 0 0 0 0.5px var(--line-strong)",
            background: "var(--surface)",
          }}
        >
          {theme === "dark" ? ChromeIcons.sun : ChromeIcons.moon}
        </button>
      </div>
    </header>
  );
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        fontSize: 9.5, fontWeight: 600, letterSpacing: 1.4,
        color: "var(--ink-500)", textTransform: "uppercase",
      }}>{label}</span>
      <div style={{
        display: "inline-flex", padding: 2.5,
        background: "var(--surface-3)",
        borderRadius: 9,
        boxShadow: "inset 0 0 0 0.5px var(--line)",
      }}>
        {options.map(o => {
          const active = value === o.v;
          return (
            <button key={o.l}
              onClick={() => onChange(o.v)}
              style={{
                padding: "5px 11px", borderRadius: 6.5,
                fontSize: 12, fontWeight: 600,
                fontFamily: "var(--mono)",
                color: active ? "var(--ink-900)" : "var(--ink-500)",
                background: active ? "var(--surface)" : "transparent",
                boxShadow: active ? "0 1px 2px rgba(20,24,31,0.08), inset 0 0 0 0.5px var(--line)" : "none",
                transition: "all .15s var(--ease)",
              }}
            >{o.l}</button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero / Cover                                                       */
/* ------------------------------------------------------------------ */
function Hero({ total, catCounts }) {
  return (
    <section style={{
      maxWidth: 1480, margin: "0 auto",
      padding: "56px 32px 36px",
      display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 64, alignItems: "end",
    }}>
      <div>
        <div style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: 2.2, color: "var(--gold-deep)",
          textTransform: "uppercase", marginBottom: 22,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ width: 22, height: 1, background: "var(--gold)" }}/>
          Edition One · AAA Four Diamond Surface System
        </div>
        <h1 style={{
          margin: 0, fontFamily: "var(--serif)",
          fontSize: 64, fontWeight: 500,
          letterSpacing: "-0.022em", lineHeight: 0.98,
          color: "var(--ink-900)",
        }}>
          One visual language for every<br/>
          <em style={{ fontWeight: 500, color: "var(--gold-deep)" }}>surface a guest can touch.</em>
        </h1>
        <p style={{
          marginTop: 24, maxWidth: 560,
          fontSize: 15.5, lineHeight: 1.55, color: "var(--ink-700)",
        }}>
          A line-drawn glyph set sized for the eleven surfaces a Four Diamond
          casino-resort ships in parallel — guest apps, in-room TV, kiosks,
          host CRM, signage, the cage, the pit. Every mark sits in a 24-pixel
          field with a tunable stroke and rounds at the joins. Built original
          for this project; no library or third-party set.
        </p>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14,
        background: "var(--surface)",
        padding: 24, borderRadius: 14,
        boxShadow: "var(--shadow-md)",
        position: "relative",
      }}>
        <div style={{
          position: "absolute", top: -1, left: 24, right: 24, height: 2,
          background: "linear-gradient(90deg, transparent, var(--gold), transparent)",
        }}/>
        <HeroStat label="Total marks" value={total}/>
        <HeroStat label="Categories" value={LIB_CATEGORIES.length}/>
        <HeroStat label="Grid" value="24×24" mono/>
        <HeroStat label="Strokes" value="3" mono/>
        <div style={{ gridColumn: "1 / -1", height: 1, background: "var(--line)" }}/>
        <div style={{
          gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14, paddingTop: 4,
        }}>
          {LIB_CATEGORIES.slice(0, 8).map(c => (
            <div key={c.id} style={{ fontSize: 11, color: "var(--ink-500)" }}>
              <div style={{
                fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600,
                color: "var(--ink-900)",
              }}>{catCounts[c.id] || 0}</div>
              <div style={{ marginTop: 2, fontSize: 10.5, letterSpacing: 0.4 }}>{c.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HeroStat({ label, value, mono }) {
  return (
    <div>
      <div style={{
        fontFamily: mono ? "var(--mono)" : "var(--serif)",
        fontWeight: mono ? 500 : 600,
        fontSize: mono ? 22 : 30,
        letterSpacing: mono ? 0 : "-0.018em",
        color: "var(--ink-900)", lineHeight: 1,
      }}>{value}</div>
      <div style={{
        marginTop: 8, fontSize: 9.5, letterSpacing: 1.4,
        textTransform: "uppercase", color: "var(--ink-500)", fontWeight: 600,
      }}>{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar — category nav                                             */
/* ------------------------------------------------------------------ */
const SIDEBAR_GLYPHS = {
  gaming: "chip-stack",
  hotel: "key-card",
  spa: "spa-lotus",
  dining: "restaurant",
  entertainment: "ticket",
  property: "map",
  services: "wifi",
  activities: "golf-flag",
  loyalty: "tier-diamond",
  compliance: "verified",
  system: "settings",
};

function Sidebar({ category, setCategory, counts, stroke }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <aside style={{
      width: 244, flexShrink: 0,
      position: "sticky", top: 84, alignSelf: "flex-start",
      maxHeight: "calc(100vh - 100px)",
      overflowY: "auto",
      paddingBottom: 24,
    }} className="scroll">
      <SidebarItem
        active={category === "all"}
        onClick={() => setCategory("all")}
        glyph={null}
        label="All Icons"
        count={total}
        accent="var(--ink-900)"
        stroke={stroke}
      />
      <div style={{ height: 16 }}/>
      <div style={{
        fontSize: 9.5, letterSpacing: 1.6, fontWeight: 600,
        color: "var(--ink-400)", textTransform: "uppercase",
        padding: "0 12px 8px",
      }}>Categories</div>
      {LIB_CATEGORIES.map(cat => {
        const glyphIcon = LIB_ICONS.find(i => i.id === SIDEBAR_GLYPHS[cat.id]);
        return (
          <SidebarItem
            key={cat.id}
            active={category === cat.id}
            onClick={() => setCategory(cat.id)}
            glyph={glyphIcon}
            label={cat.label}
            count={counts[cat.id] || 0}
            accent={CATEGORY_ACCENTS[cat.id]}
            stroke={stroke}
          />
        );
      })}
    </aside>
  );
}

function SidebarItem({ active, onClick, glyph, label, count, accent, stroke }) {
  return (
    <button onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%",
        padding: "9px 12px",
        borderRadius: 8,
        background: active ? "var(--surface)" : "transparent",
        boxShadow: active ? "inset 0 0 0 0.5px var(--line-strong), 0 1px 2px rgba(20,24,31,.04)" : "none",
        color: active ? "var(--ink-900)" : "var(--ink-700)",
        textAlign: "left",
        position: "relative",
        transition: "all .15s var(--ease)",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--tint-1)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      {active && (
        <span style={{
          position: "absolute", left: -10, top: "20%", bottom: "20%", width: 2,
          background: accent, borderRadius: 1,
        }}/>
      )}
      <span style={{
        width: 24, height: 24, display: "grid", placeItems: "center",
        color: active ? accent : "var(--ink-500)",
        flexShrink: 0,
      }}>
        {glyph ? <IconSvg icon={glyph} size={16} stroke={1.5}/> :
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="0.5"/>
            <rect x="14" y="3" width="7" height="7" rx="0.5"/>
            <rect x="3" y="14" width="7" height="7" rx="0.5"/>
            <rect x="14" y="14" width="7" height="7" rx="0.5"/>
          </svg>
        }
      </span>
      <span style={{
        flex: 1, fontSize: 13.5, fontWeight: active ? 600 : 500, letterSpacing: -0.05,
      }}>{label}</span>
      <span className="tnum" style={{
        fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: 500,
        color: "var(--ink-400)",
      }}>{count}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Category section                                                   */
/* ------------------------------------------------------------------ */
function CategorySection({ cat, icons, sizePreset, stroke, onSelect }) {
  if (!icons || icons.length === 0) return null;
  const cardDim = { S: 92, M: 116, L: 148 }[sizePreset];
  const iconDim = { S: 24, M: 32, L: 44 }[sizePreset];

  return (
    <section style={{ marginBottom: 56 }}>
      <header style={{ marginBottom: 22 }}>
        <div style={{
          display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap",
        }}>
          <div style={{
            fontFamily: "var(--serif)",
            fontSize: 34, fontWeight: 500,
            letterSpacing: "-0.018em", color: "var(--ink-900)",
            lineHeight: 1.05,
          }}>
            <span style={{ color: CATEGORY_ACCENTS[cat.id], fontStyle: "italic", marginRight: 12 }}>
              {cat.serif}
            </span>
            <span style={{ color: "var(--ink-400)", fontSize: 28 }}>·</span>
            <span style={{ marginLeft: 12, fontSize: 22, color: "var(--ink-500)", fontWeight: 500, letterSpacing: 0 }}>
              {cat.label}
            </span>
          </div>
          <div style={{ flex: 1 }}/>
          <div className="tnum" style={{
            fontSize: 11, fontFamily: "var(--mono)", color: "var(--ink-500)",
            letterSpacing: 0,
          }}>{icons.length} marks</div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 14, marginTop: 8,
          maxWidth: 720,
        }}>
          <span style={{ width: 36, height: 1, background: CATEGORY_ACCENTS[cat.id], opacity: 0.4, flexShrink: 0 }}/>
          <p style={{
            margin: 0, fontSize: 14, color: "var(--ink-500)", lineHeight: 1.55,
          }}>{cat.desc}</p>
        </div>
      </header>

      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${cardDim}px, 1fr))`,
        gap: 10,
      }}>
        {icons.map(icon => (
          <IconCard key={icon.id}
            icon={icon}
            cardDim={cardDim}
            iconDim={iconDim}
            stroke={stroke}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

function IconCard({ icon, cardDim, iconDim, stroke, onSelect }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={() => onSelect(icon)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: cardDim,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 10, padding: 8,
        background: hover ? "var(--surface)" : "var(--surface-2)",
        borderRadius: 10,
        boxShadow: hover
          ? "0 4px 14px rgba(20,24,31,.10), inset 0 0 0 0.5px var(--line-strong)"
          : "inset 0 0 0 0.5px var(--line)",
        transform: hover ? "translateY(-1px)" : "translateY(0)",
        transition: "all .14s var(--ease)",
        color: "var(--ink-900)",
        textAlign: "center",
        position: "relative",
      }}
    >
      <IconSvg icon={icon} size={iconDim} stroke={stroke}/>
      <span style={{
        fontSize: 10.5, color: "var(--ink-500)",
        maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        letterSpacing: -0.05,
      }}>{icon.name}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Detail panel — slides in from right                                */
/* ------------------------------------------------------------------ */
function DetailPanel({ icon, stroke, onClose }) {
  const svgRef = useRef(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCopy = useCallback((flavor) => {
    let payload = "";
    if (flavor === "svg") {
      payload = serializeSvg(svgRef.current);
    } else if (flavor === "react") {
      const inner = serializeSvg(svgRef.current)
        .replace(/^<svg[^>]*>/, "")
        .replace(/<\/svg>$/, "")
        .trim();
      payload = `// ${icon.name}\nexport const ${toPascal(icon.id)}Icon = ({ size = 24, stroke = ${stroke}, color = 'currentColor' }) => (\n  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">\n    ${inner.replace(/\n/g, "\n    ")}\n  </svg>\n);`;
    } else if (flavor === "name") {
      payload = icon.id;
    }
    copyToClipboard(payload).then(() => {
      setCopied(flavor);
      setTimeout(() => setCopied(""), 1400);
    });
  }, [icon, stroke]);

  const handleDownload = () => {
    const svg = serializeSvg(svgRef.current);
    downloadFile(`${icon.id}.svg`, svg);
  };

  const cat = LIB_CATEGORIES.find(c => c.id === icon.category);
  const accent = CATEGORY_ACCENTS[icon.category];

  return (
    <>
      <div className="anim-fade"
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(15,17,22,0.32)",
          backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
        }}
      />
      <aside className="anim-panel scroll" style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 101,
        width: "min(520px, 96vw)",
        background: "var(--bg)",
        boxShadow: "-24px 0 64px rgba(20,24,31,0.22), -2px 0 8px rgba(20,24,31,0.10)",
        overflowY: "auto",
      }}>
        {/* Header */}
        <header style={{
          padding: "20px 28px 16px",
          position: "sticky", top: 0,
          background: "color-mix(in srgb, var(--bg), transparent 12%)",
          backdropFilter: "blur(14px)",
          zIndex: 2,
          borderBottom: "0.5px solid var(--line)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{
            fontSize: 9.5, letterSpacing: 1.6, fontWeight: 600,
            color: accent, textTransform: "uppercase",
          }}>{cat.serif} · {cat.label}</span>
          <div style={{ flex: 1 }}/>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8,
            display: "grid", placeItems: "center",
            color: "var(--ink-500)",
            boxShadow: "inset 0 0 0 0.5px var(--line)",
          }}>{ChromeIcons.close}</button>
        </header>

        <div style={{ padding: "20px 28px 40px" }}>
          {/* Preview — large stage */}
          <div style={{
            background: "var(--surface)",
            borderRadius: 14, padding: "44px 20px",
            display: "grid", placeItems: "center",
            boxShadow: "var(--shadow-sm)",
            position: "relative",
            backgroundImage: "radial-gradient(circle at 50% 50%, rgba(184,149,106,0.06), transparent 70%)",
          }}>
            <IconSvg svgRef={svgRef} icon={icon} size={108} stroke={stroke} color="var(--ink-900)"/>
            <div style={{
              position: "absolute", top: 14, left: 14,
              fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-300)",
            }}>24 × 24 · stroke {stroke}</div>
            <div style={{
              position: "absolute", top: 14, right: 14,
              fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-300)",
            }}>{icon.id}</div>
          </div>

          {/* Title + notes */}
          <h2 style={{
            margin: "26px 0 4px",
            fontFamily: "var(--serif)", fontSize: 38,
            fontWeight: 500, letterSpacing: "-0.022em", lineHeight: 1.02,
            color: "var(--ink-900)",
          }}>{icon.name}</h2>
          {icon.notes && (
            <p style={{
              margin: "10px 0 0", maxWidth: 460,
              fontSize: 14.5, lineHeight: 1.55, color: "var(--ink-700)",
              fontStyle: "italic", fontFamily: "var(--serif)",
            }}>{icon.notes}</p>
          )}

          {/* Keywords */}
          <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {icon.keywords.map(k => (
              <span key={k} style={{
                fontSize: 11, fontFamily: "var(--mono)", color: "var(--ink-700)",
                padding: "3px 8px", borderRadius: 4,
                background: "var(--gold-bg)",
                boxShadow: "inset 0 0 0 0.5px rgba(184,149,106,0.30)",
              }}>{k}</span>
            ))}
          </div>

          {/* Size grid */}
          <Block label="At every size">
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10,
            }}>
              {[16, 20, 24, 32, 48].map(s => (
                <SwatchCard key={s} label={`${s}px`}>
                  <IconSvg icon={icon} size={s} stroke={stroke}/>
                </SwatchCard>
              ))}
            </div>
          </Block>

          {/* Stroke variants */}
          <Block label="Stroke weights">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
              {[1.0, 1.25, 1.5, 1.75, 2.0].map(s => (
                <SwatchCard key={s} label={s.toFixed(s % 1 ? 2 : 1)}>
                  <IconSvg icon={icon} size={32} stroke={s}/>
                </SwatchCard>
              ))}
            </div>
          </Block>

          {/* Color contexts */}
          <Block label="On surface">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              <SwatchCard bg="var(--surface)" fg="var(--ink-900)" label="Paper">
                <IconSvg icon={icon} size={28} stroke={stroke}/>
              </SwatchCard>
              <SwatchCard bg="var(--ink-900)" fg="var(--gold-light)" label="Ink">
                <IconSvg icon={icon} size={28} stroke={stroke}/>
              </SwatchCard>
              <SwatchCard bg="var(--gold)" fg="var(--ink-900)" label="Gold">
                <IconSvg icon={icon} size={28} stroke={stroke}/>
              </SwatchCard>
              <SwatchCard bg="var(--house)" fg="var(--gold-light)" label="Claret">
                <IconSvg icon={icon} size={28} stroke={stroke}/>
              </SwatchCard>
            </div>
          </Block>

          {/* Copy buttons */}
          <Block label="Export">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <CopyButton onClick={() => handleCopy("svg")} copied={copied === "svg"} label="SVG"/>
              <CopyButton onClick={() => handleCopy("react")} copied={copied === "react"} label="React"/>
              <CopyButton onClick={() => handleCopy("name")} copied={copied === "name"} label="Name (id)"/>
              <button onClick={handleDownload} style={primaryBtn}>
                {ChromeIcons.download} <span style={{ marginLeft: 6 }}>Download .svg</span>
              </button>
            </div>
          </Block>

          {/* Code preview */}
          <Block label="SVG source">
            <SvgCode icon={icon} stroke={stroke}/>
          </Block>
        </div>
      </aside>
    </>
  );
}

function Block({ label, children }) {
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{
        fontSize: 9.5, fontWeight: 600, letterSpacing: 1.6,
        color: "var(--ink-500)", textTransform: "uppercase",
        marginBottom: 10,
      }}>{label}</div>
      {children}
    </div>
  );
}

function SwatchCard({ children, label, bg, fg }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    }}>
      <div style={{
        width: "100%", aspectRatio: "1/1",
        background: bg || "var(--surface)",
        color: fg || "var(--ink-900)",
        display: "grid", placeItems: "center",
        borderRadius: 8,
        boxShadow: "inset 0 0 0 0.5px var(--line)",
      }}>{children}</div>
      <span style={{
        fontSize: 9.5, fontFamily: "var(--mono)", color: "var(--ink-500)",
      }}>{label}</span>
    </div>
  );
}

const primaryBtn = {
  padding: "8px 13px",
  borderRadius: 8,
  background: "linear-gradient(180deg, var(--ink-800), var(--ink-900))",
  color: "#fff",
  fontSize: 12.5, fontWeight: 500, letterSpacing: -0.05,
  display: "inline-flex", alignItems: "center",
  boxShadow: "0 1px 2px rgba(20,24,31,0.30), inset 0 1px 0 rgba(255,255,255,0.10)",
};

function CopyButton({ onClick, copied, label }) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 13px",
      borderRadius: 8,
      background: copied ? "var(--jade-bg)" : "var(--surface)",
      color: copied ? "var(--jade)" : "var(--ink-900)",
      fontSize: 12.5, fontWeight: 500, letterSpacing: -0.05,
      display: "inline-flex", alignItems: "center", gap: 6,
      boxShadow: copied
        ? "inset 0 0 0 0.5px var(--jade)"
        : "inset 0 0 0 0.5px var(--line-strong)",
      transition: "all .15s var(--ease)",
    }}>
      {copied ? ChromeIcons.check : ChromeIcons.copy}
      <span>{copied ? "Copied" : `Copy ${label}`}</span>
    </button>
  );
}

function SvgCode({ icon, stroke }) {
  const ref = useRef(null);
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (ref.current) {
      const svg = ref.current.querySelector("svg");
      setSrc(serializeSvg(svg));
    }
  }, [icon, stroke]);
  return (
    <div>
      {/* Hidden source SVG used to serialize */}
      <div ref={ref} style={{ display: "none" }}>
        <IconSvg icon={icon} size={24} stroke={stroke}/>
      </div>
      <pre style={{
        margin: 0,
        padding: "14px 16px",
        background: "var(--surface)",
        color: "var(--ink-700)",
        fontFamily: "var(--mono)", fontSize: 11.5, lineHeight: 1.6,
        borderRadius: 8,
        boxShadow: "inset 0 0 0 0.5px var(--line)",
        overflow: "auto", maxHeight: 220,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>{src}</pre>
    </div>
  );
}

function toPascal(str) {
  return str.split(/[-_]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

/* ------------------------------------------------------------------ */
/* Empty state                                                        */
/* ------------------------------------------------------------------ */
function EmptyState({ query }) {
  return (
    <div style={{
      padding: "80px 20px",
      textAlign: "center",
      background: "var(--surface-2)",
      borderRadius: 14,
      boxShadow: "inset 0 0 0 0.5px var(--line)",
    }}>
      <div style={{
        fontFamily: "var(--serif)", fontSize: 28, fontStyle: "italic",
        color: "var(--ink-500)", letterSpacing: "-0.015em",
      }}>No marks match “{query}”</div>
      <div style={{
        marginTop: 10, fontSize: 13.5, color: "var(--ink-400)",
      }}>Try a more general term — guest, room, table, ticket.</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App root                                                           */
/* ------------------------------------------------------------------ */
function App() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [stroke, setStroke] = useState(1.5);
  const [size, setSize] = useState("M");
  const [theme, setTheme] = useState("light");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    document.body.classList.toggle("theme-dark", theme === "dark");
  }, [theme]);

  // Counts per category (full set — not affected by search)
  const counts = useMemo(() => {
    const c = {};
    LIB_ICONS.forEach(i => { c[i.category] = (c[i.category] || 0) + 1; });
    return c;
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return LIB_ICONS.filter(icon => {
      if (category !== "all" && icon.category !== category) return false;
      if (!q) return true;
      const hay = [icon.name, icon.id, icon.category, ...(icon.keywords || [])].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [search, category]);

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach(icon => {
      if (!g[icon.category]) g[icon.category] = [];
      g[icon.category].push(icon);
    });
    return g;
  }, [filtered]);

  const orderedCats = LIB_CATEGORIES.filter(c =>
    category === "all" ? grouped[c.id] : c.id === category && grouped[c.id]
  );

  return (
    <div>
      <TopBar
        search={search} setSearch={setSearch}
        stroke={stroke} setStroke={setStroke}
        size={size} setSize={setSize}
        theme={theme} setTheme={setTheme}
        total={LIB_ICONS.length}
      />
      {!search && category === "all" && <Hero total={LIB_ICONS.length} catCounts={counts}/>}

      <div style={{
        maxWidth: 1480, margin: "0 auto",
        padding: "8px 32px 96px",
        display: "flex", gap: 40, alignItems: "flex-start",
      }}>
        <Sidebar category={category} setCategory={setCategory} counts={counts} stroke={stroke}/>
        <main style={{ flex: 1, minWidth: 0 }}>
          {filtered.length === 0 ? <EmptyState query={search}/> :
            orderedCats.map(cat => (
              <CategorySection
                key={cat.id} cat={cat} icons={grouped[cat.id]}
                sizePreset={size} stroke={stroke}
                onSelect={setSelected}
              />
            ))
          }
        </main>
      </div>

      {selected && <DetailPanel icon={selected} stroke={stroke} onClose={() => setSelected(null)}/>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);

