import type React from "react";

export type TaskTextSpan = {
  start: number;
  end: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
};

export type TaskTextStyle = {
  fontSizePx?: 11 | 13 | 15;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  spans?: TaskTextSpan[];
};

export type TaskFormatScope = "task" | "selection";

export const TASK_FONT_SIZES = [11, 13, 15] as const;

/** Default deployment-card task label colors (builder + print). */
export const TASK_LABEL_COLOR = {
  primary: "#111827",
  secondary: "#374151",
  primaryDark: "#E8E8ED",
  secondaryDark: "#AEAEB2",
} as const;

/** Default task label sizes (px) by card context. */
export const TASK_LABEL_SIZE_PX = {
  default: 14,
  zoneCard: 13,
  zoneList: 12.5,
  rrOverlap: 10.5,
  dense: 10,
  denseSmall: 9.5,
  print: 10,
  printDense: 9.5,
} as const;

export function taskLabelSizeClass(px: number): string {
  return `text-[${px}px]`;
}

export function parseTaskLabelSizePx(
  textSize?: string,
  fallback: number = TASK_LABEL_SIZE_PX.default,
): number {
  const match = textSize?.match(/\[([\d.]+)px\]/);
  return match ? parseFloat(match[1]) : fallback;
}

export function taskLabelShrinkPx(basePx: number): number {
  return Math.max(8.5, Math.round((basePx - 3) * 2) / 2);
}

export function taskLabelColorClass(hasTM: boolean, dark = false): string {
  if (dark) {
    return hasTM
      ? `text-[${TASK_LABEL_COLOR.primaryDark}]`
      : `text-[${TASK_LABEL_COLOR.secondaryDark}]`;
  }
  return hasTM
    ? `text-[${TASK_LABEL_COLOR.primary}]`
    : `text-[${TASK_LABEL_COLOR.secondary}]`;
}

export function normalizeTaskTextStyle(raw: unknown): TaskTextStyle | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const style: TaskTextStyle = {};
  if (o.fontSizePx === 11 || o.fontSizePx === 13 || o.fontSizePx === 15) {
    style.fontSizePx = o.fontSizePx;
  }
  if (o.fontWeight === "bold" || o.fontWeight === "normal") style.fontWeight = o.fontWeight;
  if (o.fontStyle === "italic" || o.fontStyle === "normal") style.fontStyle = o.fontStyle;
  if (o.textDecoration === "underline" || o.textDecoration === "line-through" || o.textDecoration === "none") {
    style.textDecoration = o.textDecoration;
  }
  if (Array.isArray(o.spans)) {
    const spans = o.spans
      .map((s) => {
        if (!s || typeof s !== "object") return null;
        const span = s as Record<string, unknown>;
        const start = Number(span.start);
        const end = Number(span.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
        const out: TaskTextSpan = { start, end };
        if (span.bold) out.bold = true;
        if (span.italic) out.italic = true;
        if (span.underline) out.underline = true;
        if (span.strike) out.strike = true;
        if (typeof span.color === "string" && span.color) out.color = span.color;
        return out;
      })
      .filter(Boolean) as TaskTextSpan[];
    if (spans.length) style.spans = spans;
  }
  return Object.keys(style).length ? style : null;
}

export function remapTaskTextStyleForLabelChange(
  style: TaskTextStyle | null | undefined,
  oldLabel: string,
  newLabel: string,
): TaskTextStyle | null {
  if (!style?.spans?.length || oldLabel === newLabel) return style ?? null;
  if (!newLabel) return { ...style, spans: [] };
  const spans = style.spans
    .map((span) => {
      const slice = oldLabel.slice(span.start, span.end);
      if (!slice) return null;
      const start = newLabel.indexOf(slice);
      if (start < 0) return null;
      return { ...span, start, end: start + slice.length };
    })
    .filter(Boolean) as TaskTextSpan[];
  return { ...style, spans: spans.length ? spans : undefined };
}

export function taskLevelCss(style: TaskTextStyle | null | undefined): React.CSSProperties {
  if (!style) return {};
  const css: React.CSSProperties = {};
  if (style.fontSizePx) css.fontSize = `${style.fontSizePx}px`;
  if (style.fontWeight === "bold") css.fontWeight = 700;
  if (style.fontStyle === "italic") css.fontStyle = "italic";
  if (style.textDecoration === "underline") css.textDecoration = "underline";
  if (style.textDecoration === "line-through") css.textDecoration = "line-through";
  return css;
}

function spanCss(span: TaskTextSpan): React.CSSProperties {
  const css: React.CSSProperties = {};
  if (span.bold) css.fontWeight = 700;
  if (span.italic) css.fontStyle = "italic";
  const deco: string[] = [];
  if (span.underline) deco.push("underline");
  if (span.strike) deco.push("line-through");
  if (deco.length) css.textDecoration = deco.join(" ");
  if (span.color) css.color = span.color;
  return css;
}

export type FormattedTextSegment = {
  text: string;
  style: React.CSSProperties;
};

export function buildFormattedTextSegments(
  label: string,
  textStyle: TaskTextStyle | null | undefined,
): FormattedTextSegment[] {
  const base = taskLevelCss(textStyle);
  const spans = textStyle?.spans ?? [];
  if (!label) return [{ text: "", style: base }];
  if (!spans.length) return [{ text: label, style: base }];

  const points = new Set<number>([0, label.length]);
  for (const s of spans) {
    points.add(Math.max(0, Math.min(label.length, s.start)));
    points.add(Math.max(0, Math.min(label.length, s.end)));
  }
  const sorted = [...points].sort((a, b) => a - b);
  const segments: FormattedTextSegment[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;
    const text = label.slice(start, end);
    const active = spans.filter((s) => s.start <= start && s.end >= end);
    let merged = { ...base };
    for (const s of active) {
      merged = { ...merged, ...spanCss(s) };
    }
    segments.push({ text, style: merged });
  }

  return segments.length ? segments : [{ text: label, style: base }];
}

export function getSelectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const end = start + range.toString().length;
  if (end <= start) return null;
  return { start, end };
}

function clampSpan(span: TaskTextSpan, len: number): TaskTextSpan | null {
  const start = Math.max(0, Math.min(len, span.start));
  const end = Math.max(0, Math.min(len, span.end));
  if (end <= start) return null;
  return { ...span, start, end };
}

export function applySpanFormat(
  style: TaskTextStyle | null | undefined,
  labelLength: number,
  start: number,
  end: number,
  patch: Partial<Pick<TaskTextSpan, "bold" | "italic" | "underline" | "strike" | "color">>,
  toggle = true,
): TaskTextStyle {
  const base: TaskTextStyle = { ...(style ?? {}) };
  const spans = [...(base.spans ?? [])];
  const existingIdx = spans.findIndex(
    (s) =>
      s.start === start &&
      s.end === end &&
      (patch.bold !== undefined ||
        patch.italic !== undefined ||
        patch.underline !== undefined ||
        patch.strike !== undefined ||
        patch.color !== undefined),
  );

  if (existingIdx >= 0) {
    const cur = spans[existingIdx];
    const next = { ...cur };
    if (patch.bold !== undefined) next.bold = toggle ? !cur.bold : true;
    if (patch.italic !== undefined) next.italic = toggle ? !cur.italic : true;
    if (patch.underline !== undefined) next.underline = toggle ? !cur.underline : true;
    if (patch.strike !== undefined) next.strike = toggle ? !cur.strike : true;
    if (patch.color !== undefined) next.color = patch.color;
    const hasFmt = next.bold || next.italic || next.underline || next.strike || next.color;
    if (hasFmt) spans[existingIdx] = next;
    else spans.splice(existingIdx, 1);
  } else {
    const next: TaskTextSpan = { start, end, ...patch };
    if (toggle && patch.bold) next.bold = true;
    if (toggle && patch.italic) next.italic = true;
    if (toggle && patch.underline) next.underline = true;
    if (toggle && patch.strike) next.strike = true;
    spans.push(next);
  }

  const clamped = spans
    .map((s) => clampSpan(s, labelLength))
    .filter(Boolean) as TaskTextSpan[];
  return { ...base, spans: clamped.length ? clamped : undefined };
}

export function applyTaskLevelFormat(
  style: TaskTextStyle | null | undefined,
  patch: Partial<Pick<TaskTextStyle, "fontSizePx" | "fontWeight" | "fontStyle" | "textDecoration">>,
): TaskTextStyle {
  return { ...(style ?? {}), ...patch };
}

export function isTaskTextStyleEqual(a: TaskTextStyle | null | undefined, b: TaskTextStyle | null | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}