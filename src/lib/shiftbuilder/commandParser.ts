/**
 * Natural-language command parser for the Shift Planner Command Palette.
 *
 * Grammar:
 *   make <TM display name> eligible <Full | AM Overlap | PM Overlap>
 *   make <TM display name> ineligible
 *   make <TM display name> display name "<new name>"
 *   make <TM display name> display name <new name>          (no quotes — rest of line)
 *
 *   remove <TM display name> from <Today's Shift | <day name> | <yyyy-mm-dd> | <Month dd>>
 *
 * The parser is purely a string→state function. The palette UI calls
 * `parseCommand(input, roster, weekContext)` on every keystroke, then renders
 * suggestions and chips based on the returned state.
 *
 * Tab completion: take `state.suggestions[0]` and call
 * `applyCompletion(state, suggestions[0])` to get the new input string.
 */

import type { TeamMember } from "./data";

// =============================================================
// Types
// =============================================================

export type CommandKind = "make" | "remove" | "sudo" | null;

export type MakeAction = "eligible" | "ineligible" | "display name" | null;

export type RemoveWhenKind = "today" | "day" | "date" | null;

export interface RemoveWhen {
  kind: RemoveWhenKind;
  /** Resolved Date object, or null if unresolved */
  date: Date | null;
  /** Raw matched token (e.g. "Today's Shift", "Friday", "2026-05-21") */
  label: string;
}

export type GravePoolGroup = "Full" | "AM" | "PM";

export type NextSlot =
  | "verb"          // initial empty input — suggest "make" / "remove"
  | "tm"            // need a TM name
  | "action"        // need eligible | ineligible | display name
  | "group"         // need Full | AM Overlap | PM Overlap
  | "newName"       // need a new display name (free text, may be quoted)
  | "from-keyword"  // need the literal "from"
  | "when"          // need today / day / date
  | "done";

export interface Suggestion {
  /** What the user sees in the suggestion list */
  label: string;
  /** What gets inserted when the user accepts */
  insert: string;
  /** Friendly secondary label (e.g. "AM Overlap TM" badge) */
  hint?: string;
  /** For TM matches, the canonical record */
  tm?: TeamMember;
  /** Pre-computed match score (higher = better) so the UI can stable-sort */
  score: number;
}

export interface CommandState {
  raw: string;
  kind: CommandKind;
  tm: TeamMember | null;
  /** Partial / unresolved TM name token, if any */
  tmFragment: string;
  /** For `make` */
  action: MakeAction;
  group: GravePoolGroup | null;
  /** Operator-typed new display name (raw, may include trailing quote) */
  newName: string;
  /** For `remove` */
  when: RemoveWhen;
  nextSlot: NextSlot;
  /** Suggestions for the *current* slot, in best-match-first order. */
  suggestions: Suggestion[];
  /** Is the command fully resolved and ready to execute? */
  isComplete: boolean;
  /** Single-line summary suitable for the chip bar or status pill */
  summary: string;
  /** Friendly error message when state is malformed (e.g. unknown TM) */
  error: string | null;
}

/** Context the parser needs beyond just the input string. */
export interface ParseContext {
  roster: TeamMember[];
  /** Current shift date — used for "today" and weekday parsing */
  shiftDate: Date;
  /** The 7 days in the current operator week (Fri…Thu) */
  weekDays: { date: Date; name: string; short: string }[];
}

// =============================================================
// Public API
// =============================================================

const VERBS: { token: string; kind: CommandKind }[] = [
  { token: "make", kind: "make" },
  { token: "remove", kind: "remove" },
  { token: "sudo", kind: "sudo" },
];

const MAKE_ACTIONS: { token: string; action: MakeAction }[] = [
  { token: "eligible", action: "eligible" },
  { token: "ineligible", action: "ineligible" },
  { token: "display name", action: "display name" },
];

const GROUPS: { label: GravePoolGroup; aliases: string[] }[] = [
  { label: "Full", aliases: ["full", "full grave", "g", "grave"] },
  { label: "AM", aliases: ["am", "am overlap", "amoverlap", "am-overlap"] },
  { label: "PM", aliases: ["pm", "pm overlap", "pmoverlap", "pm-overlap"] },
];

/**
 * Parse the input string and return the full state of the command in flight.
 * Always returns a state — never throws. Use `state.error` for problems.
 */
export function parseCommand(input: string, ctx: ParseContext): CommandState {
  const raw = input;
  const trimmed = input.trimStart();

  // -----------------------------
  // Empty input → suggest verbs
  // -----------------------------
  if (trimmed.length === 0) {
    return emptyState(raw, "verb", suggestVerbs(""));
  }

  // -----------------------------
  // First token: must be `make` or `remove`
  // -----------------------------
  const firstToken = readToken(trimmed);
  if (!firstToken) {
    return emptyState(raw, "verb", suggestVerbs(""));
  }

  const verb = VERBS.find(
    (v) => v.token.toLowerCase() === firstToken.token.toLowerCase()
  );
  if (!verb) {
    // Partial — suggest matching verbs.
    return emptyState(raw, "verb", suggestVerbs(firstToken.token));
  }

  // sudo has no arguments — typing `sudo` immediately resolves the command.
  // The palette picks this up via state.kind === "sudo" + isComplete and
  // fires the open-sudo callback.
  if (verb.kind === "sudo") {
    return {
      raw,
      kind: "sudo",
      tm: null,
      tmFragment: "",
      action: null,
      group: null,
      newName: "",
      when: emptyWhen(),
      nextSlot: "done",
      suggestions: [],
      isComplete: true,
      summary: "sudo — open admin window",
      error: null,
    };
  }

  const afterVerb = trimmed.slice(firstToken.token.length);
  // No trailing space yet — the user is still typing the verb
  if (!startsWithWhitespace(afterVerb) && afterVerb.length === 0) {
    return emptyState(raw, "verb", suggestVerbs(firstToken.token));
  }

  const rest = afterVerb.replace(/^\s+/, "");

  // -----------------------------
  // Second slot: TM name
  // -----------------------------
  const tmMatch = matchTM(rest, ctx.roster);
  if (!tmMatch.tm) {
    // Suggest TMs matching the fragment
    return {
      raw,
      kind: verb.kind,
      tm: null,
      tmFragment: tmMatch.fragment,
      action: null,
      group: null,
      newName: "",
      when: emptyWhen(),
      nextSlot: "tm",
      suggestions: suggestTMs(tmMatch.fragment, ctx.roster),
      isComplete: false,
      summary: `${verb.token} …`,
      error:
        tmMatch.fragment.length > 0 && !tmMatch.hasTrailingSpace
          ? null
          : "Pick a team member",
    };
  }

  const afterTM = rest.slice(tmMatch.consumedChars);
  const afterTMStripped = afterTM.replace(/^\s+/, "");

  if (verb.kind === "make") {
    return parseMakeAfterTM(raw, tmMatch.tm, afterTMStripped, ctx);
  }

  // verb === "remove"
  return parseRemoveAfterTM(raw, tmMatch.tm, afterTMStripped, ctx);
}

/**
 * Given the current state and a chosen suggestion, return the new input
 * string. The palette wraps this with: setInput(applyCompletion(...)).
 *
 * Always appends a trailing space EXCEPT when the next slot is `done` (we
 * stop adding spaces once the command resolves).
 */
export function applyCompletion(state: CommandState, s: Suggestion): string {
  // For each slot, the suggestion's `insert` is the canonical token. We
  // need to replace the current partial token with the canonical one.
  //
  // The simplest correct approach: find the last "word boundary" in the
  // raw input where the current fragment starts, and replace from there.
  const raw = state.raw;

  switch (state.nextSlot) {
    case "verb":
      return s.insert + " ";

    case "tm": {
      // Replace from the position right after the verb token.
      const after = stripLeading(raw, state.kind === "make" ? "make" : "remove");
      // `after` includes a leading space. Compose: `<verb> ` + s.insert + ' '
      void after;
      return `${state.kind} ${s.insert} `;
    }

    case "action":
      return `make ${state.tm?.name ?? state.tmFragment} ${s.insert} `;

    case "group":
      return `make ${state.tm?.name ?? ""} ${state.action} ${s.insert} `;

    case "newName": {
      // For display name, we append the new name to what's been typed.
      // If the suggestion is a quoted template, insert directly.
      return `make ${state.tm?.name ?? ""} display name ${s.insert}`;
    }

    case "from-keyword":
      return `remove ${state.tm?.name ?? ""} from `;

    case "when":
      return `remove ${state.tm?.name ?? ""} from ${s.insert}`;

    case "done":
      return raw;
  }
}

// =============================================================
// Internal helpers
// =============================================================

function emptyState(
  raw: string,
  nextSlot: NextSlot,
  suggestions: Suggestion[]
): CommandState {
  return {
    raw,
    kind: null,
    tm: null,
    tmFragment: "",
    action: null,
    group: null,
    newName: "",
    when: emptyWhen(),
    nextSlot,
    suggestions,
    isComplete: false,
    summary: "",
    error: null,
  };
}

function emptyWhen(): RemoveWhen {
  return { kind: null, date: null, label: "" };
}

function startsWithWhitespace(s: string): boolean {
  return /^\s/.test(s);
}

function stripLeading(s: string, prefix: string): string {
  const lower = s.toLowerCase();
  const pLower = prefix.toLowerCase();
  if (lower.startsWith(pLower)) return s.slice(prefix.length);
  return s;
}

function readToken(s: string): { token: string; rest: string } | null {
  const m = s.match(/^(\S+)/);
  if (!m) return null;
  return { token: m[1], rest: s.slice(m[1].length) };
}

function suggestVerbs(fragment: string): Suggestion[] {
  const f = fragment.toLowerCase();
  return VERBS.filter((v) => v.token.startsWith(f)).map((v) => ({
    label: v.token,
    insert: v.token,
    hint: v.kind === "make" ? "edit a team member" : "remove from a night",
    score: v.token.length - f.length,
  }));
}

// --- TM matching ---------------------------------------------------------

interface TMMatchResult {
  tm: TeamMember | null;
  /** The fragment the user typed for the TM (may be empty) */
  fragment: string;
  /** Number of characters consumed from `input` */
  consumedChars: number;
  /** True if input had a trailing space after the matched name */
  hasTrailingSpace: boolean;
}

/**
 * Longest-prefix match against display_name. If a TM whose display_name is
 * exactly the input prefix (followed by whitespace or end-of-string) exists,
 * we resolve. Otherwise we return the longest fragment we read.
 *
 * Display names can have spaces ("Mike W"), so we greedily take tokens until
 * either (a) the cumulative string matches a TM exactly, or (b) the next
 * token would no longer be a prefix of any TM name.
 */
function matchTM(input: string, roster: TeamMember[]): TMMatchResult {
  // Special case: empty input → no match
  if (input.length === 0) {
    return { tm: null, fragment: "", consumedChars: 0, hasTrailingSpace: false };
  }

  // Normalize roster to (lowerName → tm). Include `name` and `fullName`
  // for matching. Display name is preferred.
  const byLower: Map<string, TeamMember> = new Map();
  const allLowerNames: string[] = [];
  roster.forEach((tm) => {
    if (tm.name) {
      const k = tm.name.toLowerCase();
      if (!byLower.has(k)) byLower.set(k, tm);
      allLowerNames.push(k);
    }
    if (tm.fullName) {
      const k = tm.fullName.toLowerCase();
      if (!byLower.has(k)) byLower.set(k, tm);
      allLowerNames.push(k);
    }
  });

  // We'll incrementally build up a candidate string by appending tokens
  // (split on whitespace). For each candidate length, check if it matches.
  const tokens: string[] = [];
  let consumed = 0;
  let remaining = input;
  while (remaining.length > 0) {
    const t = remaining.match(/^(\S+)/);
    if (!t) break;
    tokens.push(t[1]);
    // Skip the token + following spaces
    const tokenLen = t[1].length;
    const after = remaining.slice(tokenLen);
    const wsLen = after.match(/^\s*/)?.[0].length ?? 0;
    consumed += tokenLen + wsLen;
    remaining = after.slice(wsLen);

    const candidate = tokens.join(" ").toLowerCase();
    // EXACT match → resolved, but only finalize if the next character is
    // whitespace (or EOS); otherwise the user might be typing more.
    if (byLower.has(candidate)) {
      const tm = byLower.get(candidate)!;
      const isExactWithSpace = wsLen > 0 || remaining.length === 0;
      if (isExactWithSpace) {
        return {
          tm,
          fragment: tokens.join(" "),
          consumedChars: consumed,
          hasTrailingSpace: wsLen > 0,
        };
      }
    }

    // No further name in roster starts with candidate? Bail.
    const stillProspects = allLowerNames.some((n) => n.startsWith(candidate));
    if (!stillProspects) {
      // Roll back the last token — the cumulative candidate isn't a prefix
      // of any name. The fragment is the previous accumulation.
      tokens.pop();
      const fragment = tokens.join(" ");
      return {
        tm: null,
        fragment,
        consumedChars: fragment.length,
        hasTrailingSpace: false,
      };
    }
  }

  // We consumed the whole input but never hit an exact-with-space match.
  return {
    tm: null,
    fragment: tokens.join(" "),
    consumedChars: consumed,
    hasTrailingSpace: false,
  };
}

function suggestTMs(fragment: string, roster: TeamMember[]): Suggestion[] {
  const f = fragment.toLowerCase().trim();
  // Empty fragment → first 20 alphabetically as a launchpad
  if (f.length === 0) {
    return roster.slice(0, 20).map((tm) => ({
      label: tm.name || tm.fullName || tm.id,
      insert: tm.name || tm.fullName || tm.id,
      hint: gravePoolHint(tm),
      tm,
      score: 0,
    }));
  }

  const matches: { tm: TeamMember; score: number }[] = [];
  roster.forEach((tm) => {
    const name = (tm.name || "").toLowerCase();
    const full = (tm.fullName || "").toLowerCase();
    let score = -1;
    if (name === f) score = 100;
    else if (name.startsWith(f)) score = 80 - (name.length - f.length);
    else if (name.includes(f)) score = 50;
    else if (full.startsWith(f)) score = 40;
    else if (full.includes(f)) score = 20;
    if (score >= 0) matches.push({ tm, score });
  });

  matches.sort((a, b) => b.score - a.score);

  return matches.slice(0, 20).map(({ tm, score }) => ({
    label: tm.name || tm.fullName || tm.id,
    insert: tm.name || tm.fullName || tm.id,
    hint: gravePoolHint(tm),
    tm,
    score,
  }));
}

function gravePoolHint(tm: TeamMember): string | undefined {
  const gp = (tm as any).gravePool;
  if (gp === null || gp === undefined || gp === "") return "no grave pool";
  const s = String(gp);
  if (/^full$/i.test(s)) return "Full Grave";
  if (/^am$/i.test(s)) return "AM Overlap";
  if (/^pm$/i.test(s)) return "PM Overlap";
  return s;
}

// --- `make` after TM ----------------------------------------------------

function parseMakeAfterTM(
  raw: string,
  tm: TeamMember,
  rest: string,
  ctx: ParseContext
): CommandState {
  void ctx;
  if (rest.length === 0) {
    return {
      raw,
      kind: "make",
      tm,
      tmFragment: tm.name ?? "",
      action: null,
      group: null,
      newName: "",
      when: emptyWhen(),
      nextSlot: "action",
      suggestions: suggestActions(""),
      isComplete: false,
      summary: `make ${tm.name}`,
      error: null,
    };
  }

  // Match action — note "display name" is two tokens.
  const lower = rest.toLowerCase();

  if (lower.startsWith("display name")) {
    const afterAction = rest.slice("display name".length);
    if (!startsWithWhitespace(afterAction) && afterAction.length !== 0) {
      // User is still typing the action — suggest it
      return makeActionState(raw, tm, lower);
    }
    const remaining = afterAction.replace(/^\s+/, "");
    return parseMakeDisplayName(raw, tm, remaining);
  }

  if (lower.startsWith("eligible")) {
    const afterAction = rest.slice("eligible".length);
    if (!startsWithWhitespace(afterAction) && afterAction.length !== 0) {
      return makeActionState(raw, tm, lower);
    }
    return parseMakeEligible(raw, tm, afterAction.replace(/^\s+/, ""));
  }

  if (lower.startsWith("ineligible")) {
    const afterAction = rest.slice("ineligible".length);
    // ineligible has no further args — done as soon as we have it
    if (!startsWithWhitespace(afterAction) && afterAction.length !== 0) {
      return makeActionState(raw, tm, lower);
    }
    return {
      raw,
      kind: "make",
      tm,
      tmFragment: tm.name ?? "",
      action: "ineligible",
      group: null,
      newName: "",
      when: emptyWhen(),
      nextSlot: "done",
      suggestions: [],
      isComplete: true,
      summary: `make ${tm.name} ineligible`,
      error: null,
    };
  }

  // Partial action token — suggest matching actions
  return makeActionState(raw, tm, lower);
}

function makeActionState(
  raw: string,
  tm: TeamMember,
  partial: string
): CommandState {
  return {
    raw,
    kind: "make",
    tm,
    tmFragment: tm.name ?? "",
    action: null,
    group: null,
    newName: "",
    when: emptyWhen(),
    nextSlot: "action",
    suggestions: suggestActions(partial),
    isComplete: false,
    summary: `make ${tm.name} …`,
    error: null,
  };
}

function suggestActions(fragment: string): Suggestion[] {
  const f = fragment.toLowerCase();
  return MAKE_ACTIONS.filter((a) => a.token.startsWith(f)).map((a) => ({
    label: a.token,
    insert: a.token,
    hint:
      a.action === "eligible"
        ? "set grave pool"
        : a.action === "ineligible"
        ? "remove from grave"
        : "rename display",
    score: a.token.length - f.length,
  }));
}

function parseMakeEligible(
  raw: string,
  tm: TeamMember,
  groupInput: string
): CommandState {
  if (groupInput.length === 0) {
    return {
      raw,
      kind: "make",
      tm,
      tmFragment: tm.name ?? "",
      action: "eligible",
      group: null,
      newName: "",
      when: emptyWhen(),
      nextSlot: "group",
      suggestions: suggestGroups(""),
      isComplete: false,
      summary: `make ${tm.name} eligible …`,
      error: null,
    };
  }

  const lower = groupInput.toLowerCase().trim();
  const match = GROUPS.find(
    (g) =>
      g.label.toLowerCase() === lower ||
      g.aliases.some((alias) => alias === lower)
  );
  if (match) {
    return {
      raw,
      kind: "make",
      tm,
      tmFragment: tm.name ?? "",
      action: "eligible",
      group: match.label,
      newName: "",
      when: emptyWhen(),
      nextSlot: "done",
      suggestions: [],
      isComplete: true,
      summary: `make ${tm.name} eligible ${match.label}`,
      error: null,
    };
  }

  return {
    raw,
    kind: "make",
    tm,
    tmFragment: tm.name ?? "",
    action: "eligible",
    group: null,
    newName: "",
    when: emptyWhen(),
    nextSlot: "group",
    suggestions: suggestGroups(lower),
    isComplete: false,
    summary: `make ${tm.name} eligible …`,
    error: null,
  };
}

function suggestGroups(fragment: string): Suggestion[] {
  const f = fragment.toLowerCase();
  return GROUPS.filter(
    (g) =>
      g.label.toLowerCase().startsWith(f) ||
      g.aliases.some((a) => a.startsWith(f))
  ).map((g) => ({
    label:
      g.label === "AM" ? "AM Overlap" : g.label === "PM" ? "PM Overlap" : g.label,
    insert:
      g.label === "AM" ? "AM Overlap" : g.label === "PM" ? "PM Overlap" : g.label,
    hint: `grave_pool = "${g.label}"`,
    score: 1,
  }));
}

function parseMakeDisplayName(
  raw: string,
  tm: TeamMember,
  input: string
): CommandState {
  // input may be quoted (e.g. `"Cathy Roe"`) or free text running to EOS.
  const trimmed = input.replace(/^\s+/, "");

  if (trimmed.length === 0) {
    return {
      raw,
      kind: "make",
      tm,
      tmFragment: tm.name ?? "",
      action: "display name",
      group: null,
      newName: "",
      when: emptyWhen(),
      nextSlot: "newName",
      suggestions: [
        {
          label: 'Type the new display name (e.g. "Cathy")',
          insert: '"',
          hint: "quote-wrap if it has spaces",
          score: 0,
        },
      ],
      isComplete: false,
      summary: `make ${tm.name} display name …`,
      error: null,
    };
  }

  // Quoted form: "<new>"
  if (trimmed.startsWith('"')) {
    const closing = trimmed.indexOf('"', 1);
    if (closing < 0) {
      // Open quote — not complete yet
      return {
        raw,
        kind: "make",
        tm,
        tmFragment: tm.name ?? "",
        action: "display name",
        group: null,
        newName: trimmed.slice(1),
        when: emptyWhen(),
        nextSlot: "newName",
        suggestions: [],
        isComplete: false,
        summary: `make ${tm.name} display name "${trimmed.slice(1)}…`,
        error: null,
      };
    }
    const newName = trimmed.slice(1, closing);
    return {
      raw,
      kind: "make",
      tm,
      tmFragment: tm.name ?? "",
      action: "display name",
      group: null,
      newName,
      when: emptyWhen(),
      nextSlot: "done",
      suggestions: [],
      isComplete: newName.length > 0,
      summary: `make ${tm.name} display name "${newName}"`,
      error: newName.length === 0 ? "Display name cannot be empty" : null,
    };
  }

  // Unquoted: rest of line is the new name
  const newName = trimmed.trim();
  return {
    raw,
    kind: "make",
    tm,
    tmFragment: tm.name ?? "",
    action: "display name",
    group: null,
    newName,
    when: emptyWhen(),
    nextSlot: "done",
    suggestions: [],
    isComplete: newName.length > 0,
    summary: `make ${tm.name} display name "${newName}"`,
    error: null,
  };
}

// --- `remove` after TM ---------------------------------------------------

function parseRemoveAfterTM(
  raw: string,
  tm: TeamMember,
  rest: string,
  ctx: ParseContext
): CommandState {
  if (rest.length === 0) {
    return {
      raw,
      kind: "remove",
      tm,
      tmFragment: tm.name ?? "",
      action: null,
      group: null,
      newName: "",
      when: emptyWhen(),
      nextSlot: "from-keyword",
      suggestions: [
        { label: "from", insert: "from", hint: "(required keyword)", score: 1 },
      ],
      isComplete: false,
      summary: `remove ${tm.name} …`,
      error: null,
    };
  }

  const lower = rest.toLowerCase();
  if (!lower.startsWith("from")) {
    return {
      raw,
      kind: "remove",
      tm,
      tmFragment: tm.name ?? "",
      action: null,
      group: null,
      newName: "",
      when: emptyWhen(),
      nextSlot: "from-keyword",
      suggestions: [
        { label: "from", insert: "from", hint: "(required keyword)", score: 1 },
      ],
      isComplete: false,
      summary: `remove ${tm.name} …`,
      error: 'Expected "from"',
    };
  }

  const afterFrom = rest.slice("from".length);
  if (!startsWithWhitespace(afterFrom) && afterFrom.length !== 0) {
    return {
      raw,
      kind: "remove",
      tm,
      tmFragment: tm.name ?? "",
      action: null,
      group: null,
      newName: "",
      when: emptyWhen(),
      nextSlot: "from-keyword",
      suggestions: [
        { label: "from", insert: "from", hint: "(required keyword)", score: 1 },
      ],
      isComplete: false,
      summary: `remove ${tm.name} …`,
      error: null,
    };
  }

  const whenInput = afterFrom.replace(/^\s+/, "");
  return parseRemoveWhen(raw, tm, whenInput, ctx);
}

function parseRemoveWhen(
  raw: string,
  tm: TeamMember,
  input: string,
  ctx: ParseContext
): CommandState {
  if (input.length === 0) {
    return {
      raw,
      kind: "remove",
      tm,
      tmFragment: tm.name ?? "",
      action: null,
      group: null,
      newName: "",
      when: emptyWhen(),
      nextSlot: "when",
      suggestions: suggestWhen("", ctx),
      isComplete: false,
      summary: `remove ${tm.name} from …`,
      error: null,
    };
  }

  const resolved = resolveWhen(input, ctx);
  if (resolved.date) {
    return {
      raw,
      kind: "remove",
      tm,
      tmFragment: tm.name ?? "",
      action: null,
      group: null,
      newName: "",
      when: resolved,
      nextSlot: "done",
      suggestions: [],
      isComplete: true,
      summary: `remove ${tm.name} from ${resolved.label}`,
      error: null,
    };
  }

  return {
    raw,
    kind: "remove",
    tm,
    tmFragment: tm.name ?? "",
    action: null,
    group: null,
    newName: "",
    when: emptyWhen(),
    nextSlot: "when",
    suggestions: suggestWhen(input, ctx),
    isComplete: false,
    summary: `remove ${tm.name} from …`,
    error: input.length > 2 ? `Couldn't parse "${input}" as a date` : null,
  };
}

function suggestWhen(fragment: string, ctx: ParseContext): Suggestion[] {
  const f = fragment.toLowerCase().trim();
  const out: Suggestion[] = [];

  // Today's Shift (always first)
  if ("today's shift".startsWith(f) || "today".startsWith(f) || "tonight".startsWith(f)) {
    out.push({
      label: "Today's Shift",
      insert: "Today's Shift",
      hint: formatDate(ctx.shiftDate),
      score: 100,
    });
  }

  // Each weekday in the operator week
  ctx.weekDays.forEach((d) => {
    if (
      d.name.toLowerCase().startsWith(f) ||
      d.short.toLowerCase() === f
    ) {
      out.push({
        label: d.name,
        insert: d.name,
        hint: formatDate(d.date),
        score: 50,
      });
    }
  });

  // If they typed something date-like, surface a date echo
  if (/^\d/.test(f)) {
    out.push({
      label: f,
      insert: f,
      hint: "(date — yyyy-mm-dd or Month dd)",
      score: 10,
    });
  }

  return out;
}

function resolveWhen(input: string, ctx: ParseContext): RemoveWhen {
  const f = input.toLowerCase().trim();

  // Today
  if (f === "today's shift" || f === "today" || f === "tonight") {
    return { kind: "today", date: ctx.shiftDate, label: "Today's Shift" };
  }

  // Day name
  for (const d of ctx.weekDays) {
    if (d.name.toLowerCase() === f || d.short.toLowerCase() === f) {
      return { kind: "day", date: d.date, label: d.name };
    }
  }

  // ISO date
  const iso = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [_, y, m, dd] = iso;
    const d = new Date(Number(y), Number(m) - 1, Number(dd));
    if (!isNaN(d.getTime())) {
      return { kind: "date", date: d, label: formatDate(d) };
    }
  }

  // Month dd
  const monthDay = input.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (monthDay) {
    const monthName = monthDay[1];
    const day = Number(monthDay[2]);
    const monthIdx = MONTHS.findIndex((m) =>
      m.toLowerCase().startsWith(monthName.toLowerCase())
    );
    if (monthIdx >= 0) {
      const year = ctx.shiftDate.getFullYear();
      const d = new Date(year, monthIdx, day);
      if (!isNaN(d.getTime())) {
        return { kind: "date", date: d, label: formatDate(d) };
      }
    }
  }

  return emptyWhen();
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
