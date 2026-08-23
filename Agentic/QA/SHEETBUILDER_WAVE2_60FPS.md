# SheetBuilder Wave 2 — 60fps Frontman QA

Live PIN can block filming. This is the expected after-shot / Frontman pass if the desk cannot be recorded on-device.

Sacred (untouched): color rails, Golden 1056×816 print, no Engine in header, no Apply without confirm, no Batch Planner/Projects, cool `#F4F6FA` desk.

## day×5

Switch the day strip five times in a row.

- Paper moves on a shared-axis ≤220ms veil. Cards keep slot identity (`key={slotKey}`), so names do not remount-fade.
- No full-canvas fade, no 1.75s sweep, no bounce-home on the grid.
- Reduced motion: instant. Color rails stay.

## drag×10

Drag a TM onto ten legal seats (mix of zone / RR / aux / swing).

- Fit halos only while in flight.
- Drop settle is a short snappy scale (no bounce-home spring).
- Neighbors do not fade the whole board. Poll hairline is a 1px topbar cue, not a remount.

## Draft×3

Enter Draft, make a change, hit **Apply to Live** from the header, cancel, then apply for real, then discard once.

- Header and pill say **Apply to Live**. Hover/title names the confirm gate.
- Confirm dialog is the write. Header Apply disables while the dialog is open (`aria-haspopup="dialog"`) and shows **Applying…** only after confirm.
- Gold draft frame is reserved chrome — toggling Draft does not remount the board.

## pad×5

Open/close PlacementPad and TasksPad from five different slots (interrupt mid-open at least once).

- Pad morphs from the slot (shared-element, reverse matches forward, ≤280ms).
- Neighbors soft-compress ~3–4% (`scale(0.966)`). Light scrim on the stage. Rails stay.
- No modal slide-over. Reduced motion: instant (no fade).
- Closing from the same slot retraces the open path.

## Named night scan (empty density)

One empty zone + one empty aux + one filled zone on the same night.

- Empty zone: one quiet **Assign TM** (P1 invite). No dashed orphan grid.
- Empty aux / unset blank: quiet **0 open**. No `+ Set role`, no dashed shell.
- Swings / empty section chips: **0 open**, not `0 / 10 FILLED`.
- No competing CTAs.

## After-shots (when PIN allows)

Capture, in this order: named-night scan, pad open on a filled zone, pad mid-close, Draft confirm dialog, header Apply disabled during confirm.
