import Link from 'next/link';

export default function RootPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0a0a0c',
        color: '#F2F2F4',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Barlow', 'Helvetica Neue', sans-serif",
        gap: '8px',
      }}
    >
      {/* Eyebrow */}
      <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '12px' }}>
        GUN LAKE CASINO RESORT · OMS
      </div>

      {/* Logo wordmark */}
      <h1 style={{ fontSize: 'clamp(32px, 4vw, 56px)', fontWeight: 700, letterSpacing: '-0.02em', margin: 0, textTransform: 'uppercase', color: '#fff' }}>
        Operations Hub
      </h1>

      {/* Gold rule */}
      <div style={{ width: '280px', height: '1px', background: 'linear-gradient(90deg, transparent, #e0cbb6 50%, transparent)', margin: '20px 0 28px' }} />

      {/* App cards */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <AppCard
          href="/shiftbuilder"
          accent="#30b2ff"
          eyebrow="Zone Deployment"
          title="Shift Builder"
          description="Build zone assignments, manage breaks, RR rows, and print the shift deployment book."
        />
        <AppCard
          href="/today"
          accent="#C13A14"
          eyebrow="Floor Tablet"
          title="Zone Deployment Board"
          description="Quick pre-shift edits on the grave floor — tonight plus published history, assign, audit log, and print."
        />
        <AppCard
          href="/nightwatch"
          accent="#e0cbb6"
          eyebrow="Grave Shift Journal"
          title="Nightwatch"
          description="Live dashboard + freeform canvas for the grave shift. Notes, observations, tasks, and team intel."
          badge="NEW"
        />
        <AppCard
          href="/people"
          accent="#5aa88f"
          eyebrow="Email Relationships"
          title="People"
          description="Strictly the people you receive or communicate with via email. Your living relationship & colleague manager."
        />
        <AppCard
          href="/mail"
          accent="#3a9bb8"
          eyebrow="Cyrus Intelligence"
          title="Mail"
          description="Radial clusters + classic list. Cyrus AI suggestions, enrichment, and action workflows for every email."
        />
      </div>

      <p style={{ marginTop: '40px', fontSize: '11px', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.08em' }}>
        GLCR Internal · Grave Shift Operations
      </p>
    </main>
  );
}

function AppCard({
  href, accent, eyebrow, title, description, badge,
}: {
  href: string;
  accent: string;
  eyebrow: string;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        width: '280px',
        background: 'rgba(28,28,32,0.78)',
        border: `1px solid rgba(255,255,255,0.08)`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: '10px',
        padding: '24px',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'all 0.15s ease',
        position: 'relative',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      {badge && (
        <span style={{
          position: 'absolute', top: '14px', right: '14px',
          fontSize: '8px', fontWeight: 700, letterSpacing: '0.14em',
          background: `${accent}22`, color: accent,
          border: `1px solid ${accent}55`,
          padding: '2px 7px', borderRadius: '999px',
        }}>
          {badge}
        </span>
      )}
      <div style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.16em', color: accent, textTransform: 'uppercase', marginBottom: '8px' }}>
        {eyebrow}
      </div>
      <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.01em', marginBottom: '10px', textTransform: 'uppercase' }}>
        {title}
      </div>
      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
        {description}
      </div>
    </Link>
  );
}
