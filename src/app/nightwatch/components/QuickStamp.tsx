'use client';

import { useState } from 'react';
import type { ZoneColor, RosterMember } from '@/lib/nightwatch/types';

interface SaveData {
  text: string;
  urgency: 'low' | 'normal' | 'urgent';
  zone: string;
  tm: string;
}

interface QuickStampProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSave: (data: SaveData) => void;
  zones: Record<number, ZoneColor>;
  roster: RosterMember[];
  currentMin: number;
  minToClock: (m: number) => string;
}

export default function QuickStamp({
  open, onOpen, onClose, onSave, zones, roster, currentMin, minToClock,
}: QuickStampProps) {
  const [text, setText] = useState('');
  const [zone, setZone] = useState('');
  const [tm, setTm] = useState('');
  const [urgency, setUrgency] = useState<'low' | 'normal' | 'urgent'>('normal');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSave({ text: text.trim(), urgency, zone, tm });
    setText(''); setZone(''); setTm(''); setUrgency('normal');
    onClose();
  };

  return (
    <>
      <button
        className={`nw-fab${open ? ' is-open' : ''}`}
        onClick={onOpen}
        aria-label="Quick observation"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
        <span className="nw-fab-label">OBSERVATION</span>
      </button>

      {open && (
        <div className="nw-popover-shroud" onClick={onClose}>
          <form className="nw-popover" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
            <header className="nw-popover-head">
              <div>
                <div className="nw-eyebrow">QUICK CAPTURE</div>
                <h3>New observation</h3>
              </div>
              <button type="button" className="nw-icon-btn" onClick={onClose} aria-label="Close">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </header>

            <div className="nw-popover-body">
              <label className="nw-field">
                <span className="nw-eyebrow">NOTE</span>
                <textarea
                  autoFocus
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="What did you see?"
                  rows={3}
                />
              </label>

              <div className="nw-field-row">
                <label className="nw-field">
                  <span className="nw-eyebrow">ZONE</span>
                  <select value={zone} onChange={e => setZone(e.target.value)}>
                    <option value="">— none —</option>
                    {Object.entries(zones).map(([z, c]) => (
                      <option key={z} value={z}>Zone {z} ({c.label})</option>
                    ))}
                  </select>
                </label>
                <label className="nw-field">
                  <span className="nw-eyebrow">TEAM MEMBER</span>
                  <select value={tm} onChange={e => setTm(e.target.value)}>
                    <option value="">— none —</option>
                    {roster.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <fieldset className="nw-field">
                <span className="nw-eyebrow">URGENCY</span>
                <div className="nw-segctl">
                  {(['low', 'normal', 'urgent'] as const).map(u => (
                    <label key={u} className={`nw-seg is-${u}${urgency === u ? ' is-active' : ''}`}>
                      <input type="radio" name="urgency" checked={urgency === u} onChange={() => setUrgency(u)} />
                      {u.toUpperCase()}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <footer className="nw-popover-foot">
              <span className="nw-popover-meta">
                Stamped to canvas + timeline @ {minToClock(currentMin)}
              </span>
              <button type="submit" className="nw-btn nw-btn--primary">SAVE OBSERVATION</button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
