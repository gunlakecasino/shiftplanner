#!/usr/bin/env python3
"""Generate a two-page GLCR grave deployment redesign prototype."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Iterable, Sequence

from reportlab.lib.colors import HexColor, Color
from reportlab.lib.pagesizes import landscape, letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(ROOT, "output", "pdf", "SheetBuilder-GLCR-Grave-Deployment-Redesign.pdf")
FONT_REGULAR = "/Users/briankillian/Library/Fonts/AtkinsonHyperlegible-Regular.ttf"
FONT_BOLD = "/Users/briankillian/Library/Fonts/AtkinsonHyperlegible-Bold.ttf"

PAGE_W, PAGE_H = landscape(letter)
MARGIN_X = 24

INK = HexColor("#111827")
MUTED = HexColor("#4B5563")
SUBTLE = HexColor("#6B7280")
RULE = HexColor("#D1D5DB")
PAPER = HexColor("#FFFFFF")
LINK_BG = HexColor("#F4F8FC")
LINK_BORDER = HexColor("#9DB4CC")
LINK_INK = HexColor("#244E75")
OPEN_BG = HexColor("#FFF8E1")
OPEN_BORDER = HexColor("#A16207")
OPEN_INK = HexColor("#7A4B00")
AVAILABLE_BG = HexColor("#F3F4F6")
AVAILABLE_INK = HexColor("#6B7280")
PURPLE = HexColor("#5B21B6")
PM_COLOR = HexColor("#8A4600")
AM_COLOR = HexColor("#006B4F")


@dataclass(frozen=True)
class Palette:
    bright: Color
    dark: Color


PALETTES = {
    "gold": Palette(HexColor("#FFCC00"), HexColor("#7A5A00")),
    "red": Palette(HexColor("#FF3B30"), HexColor("#B42318")),
    "pink": Palette(HexColor("#FF2D55"), HexColor("#A90E3D")),
    "blue": Palette(HexColor("#007AFF"), HexColor("#0057B8")),
    "brown": Palette(HexColor("#A2845E"), HexColor("#6F5438")),
    "green": Palette(HexColor("#34C759"), HexColor("#176B32")),
}


@dataclass(frozen=True)
class AssignmentCard:
    label: str
    palette: str
    state: str
    names: Sequence[str]
    tasks: Sequence[str]
    via: str | None = None
    break_group: int | None = None
    also_covers: str | None = None


@dataclass(frozen=True)
class OverlapCard:
    label: str
    name: str | None
    tasks: Sequence[str]
    state: str = "direct"


@dataclass(frozen=True)
class SideTaskCard:
    title: str = ""
    area: str = ""
    details: Sequence[str] = ()
    assigned_to: str | None = None
    open_work: bool = False
    completed: bool = False


SIDE_TASKS: tuple[SideTaskCard, ...] = (
    SideTaskCard("Carpet Spot Extraction", assigned_to="Jessica"),
    SideTaskCard("131 Stage Detail", open_work=True),
    SideTaskCard(),
    SideTaskCard(),
    SideTaskCard(),
    SideTaskCard(),
    SideTaskCard(),
    SideTaskCard(),
)


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("Atkinson", FONT_REGULAR))
    pdfmetrics.registerFont(TTFont("Atkinson-Bold", FONT_BOLD))


def fit_lines(text: str, font: str, size: float, width: float) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if pdfmetrics.stringWidth(candidate, font, size) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def draw_text(c: canvas.Canvas, text: str, x: float, y: float, size: float,
              *, bold: bool = False, color: Color = INK) -> None:
    c.setFont("Atkinson-Bold" if bold else "Atkinson", size)
    c.setFillColor(color)
    c.drawString(x, y, text)


def draw_right(c: canvas.Canvas, text: str, x: float, y: float, size: float,
               *, bold: bool = False, color: Color = INK) -> None:
    c.setFont("Atkinson-Bold" if bold else "Atkinson", size)
    c.setFillColor(color)
    c.drawRightString(x, y, text)


def draw_center(c: canvas.Canvas, text: str, x: float, y: float, size: float,
                *, bold: bool = False, color: Color = INK) -> None:
    c.setFont("Atkinson-Bold" if bold else "Atkinson", size)
    c.setFillColor(color)
    c.drawCentredString(x, y, text)


def rounded_label(c: canvas.Canvas, text: str, x: float, y: float,
                  *, bg: Color, fg: Color, size: float = 6.7,
                  pad_x: float = 4, height: float = 12) -> float:
    width = pdfmetrics.stringWidth(text, "Atkinson-Bold", size) + 2 * pad_x
    c.setFillColor(bg)
    c.setStrokeColor(bg)
    c.roundRect(x, y, width, height, 3, fill=1, stroke=0)
    draw_center(c, text, x + width / 2, y + 3.1, size, bold=True, color=fg)
    return width


def draw_header(c: canvas.Canvas, *, page_label: str, page_number: int) -> None:
    # Compact date tile keeps the night obvious without dominating the page.
    c.setFillColor(HexColor("#F5F3FF"))
    c.setStrokeColor(HexColor("#C4B5FD"))
    c.setLineWidth(0.8)
    c.roundRect(MARGIN_X, 558, 48, 36, 4, fill=1, stroke=1)
    draw_center(c, "SUN", MARGIN_X + 24, 583.5, 6.7, bold=True, color=PURPLE)
    draw_center(c, "19", MARGIN_X + 24, 564.5, 19, bold=True, color=INK)

    draw_text(c, "GRAVES ZONE SHEET", 84, 580, 12.5, bold=True, color=INK)
    label_w = rounded_label(c, page_label.upper(), 84, 558,
                            bg=HexColor("#EDE9FE"), fg=PURPLE,
                            size=6.6, height=13)
    draw_text(c, "JULY 2026 - DAY 3 OF 7", 84 + label_w + 10, 561.2,
              7.7, bold=True, color=MUTED)

    # A quiet locator preserves weekly context without resembling app navigation.
    weekdays = ["FR", "SA", "SU", "MO", "TU", "WE", "TH"]
    weekday_x = (PAGE_W - 152) / 2
    for day in weekdays:
        if day == "SU":
            c.setFillColor(PURPLE)
            c.roundRect(weekday_x, 558, 20, 13, 3, fill=1, stroke=0)
            draw_center(c, day, weekday_x + 10, 561.1, 6.4,
                        bold=True, color=PAPER)
        else:
            draw_center(c, day, weekday_x + 10, 561.1, 6.4,
                        bold=True, color=SUBTLE)
        weekday_x += 22

    draw_right(c, "AS OF", PAGE_W - MARGIN_X, 581, 5.8,
               bold=True, color=SUBTLE)
    draw_right(c, "JUL 19 - 11:39 PM", PAGE_W - MARGIN_X, 564.5, 8.2,
               bold=True, color=MUTED)
    c.setStrokeColor(RULE)
    c.setLineWidth(0.8)
    c.line(MARGIN_X, 548, PAGE_W - MARGIN_X, 548)


def draw_section_header(c: canvas.Canvas, label: str, y: float,
                        statuses: Sequence[tuple[str, int, str]]) -> None:
    draw_text(c, label.upper(), MARGIN_X, y, 9.5, bold=True, color=INK)
    label_w = pdfmetrics.stringWidth(label.upper(), "Atkinson-Bold", 9.5)
    right_x = PAGE_W - MARGIN_X
    pieces: list[tuple[str, Color, Color]] = []
    for status, count, kind in statuses:
        if kind == "linked":
            pieces.append((f"{status} {count}", HexColor("#E8F1FA"), LINK_INK))
        elif kind == "open":
            pieces.append((f"{status} {count}", HexColor("#FFF0BF"), OPEN_INK))
        elif kind == "unavailable":
            pieces.append((f"{status} {count}", HexColor("#E5E7EB"), MUTED))
        else:
            pieces.append((f"{status} {count}", HexColor("#E5E7EB"), INK))
    widths = [pdfmetrics.stringWidth(t, "Atkinson-Bold", 6.7) + 8 for t, _, _ in pieces]
    total = sum(widths) + max(0, len(widths) - 1) * 4
    chip_x = right_x - total
    c.setStrokeColor(RULE)
    c.setLineWidth(0.7)
    c.line(MARGIN_X + label_w + 10, y + 3, chip_x - 8, y + 3)
    for (text, bg, fg), width in zip(pieces, widths):
        rounded_label(c, text, chip_x, y - 2, bg=bg, fg=fg, size=6.7, height=12)
        chip_x += width + 4


def draw_task_lines(c: canvas.Canvas, tasks: Iterable[str], x: float, y: float,
                    width: float, *, font_size: float = 8.15,
                    line_height: float = 9.0, max_lines: int = 6,
                    color: Color = INK) -> float:
    used = 0
    for task in tasks:
        for line_index, line in enumerate(fit_lines(task, "Atkinson-Bold", font_size, width - 7)):
            if used >= max_lines:
                return y
            prefix = "- " if line_index == 0 else "  "
            draw_text(c, prefix + line, x, y, font_size, bold=True, color=color)
            y -= line_height
            used += 1
    return y


def draw_assignment_card(c: canvas.Canvas, card: AssignmentCard,
                         x: float, y: float, w: float, h: float,
                         *, compact: bool = False) -> None:
    palette = PALETTES[card.palette]
    state = card.state.lower()
    if state == "linked":
        bg, border = LINK_BG, LINK_BORDER
    elif state in {"open", "open_work"}:
        bg, border = OPEN_BG, OPEN_BORDER
    elif state == "unavailable":
        bg, border = AVAILABLE_BG, HexColor("#9CA3AF")
    else:
        bg, border = PAPER, RULE

    c.setFillColor(bg)
    c.setStrokeColor(border)
    c.setLineWidth(0.8)
    if state in {"open", "open_work"}:
        c.setDash(3, 2)
    else:
        c.setDash()
    c.roundRect(x, y, w, h, 3, fill=1, stroke=1)
    c.setDash()
    card_accent = OPEN_BORDER if state == "open_work" else palette.bright
    header_ink = OPEN_INK if state == "open_work" else palette.dark
    c.setFillColor(card_accent)
    c.roundRect(x, y + h - 4, w, 4, 2, fill=1, stroke=0)
    c.rect(x, y + h - 4, w, 2, fill=1, stroke=0)

    header_y = y + h - 15
    draw_text(c, card.label.upper(), x + 7, header_y, 8.1 if compact else 8.5,
              bold=True, color=header_ink)

    if card.break_group and len(card.names) == 1:
        text = f"B{card.break_group}"
        pill_w = pdfmetrics.stringWidth(text, "Atkinson-Bold", 7) + 9
        c.setFillColor(INK)
        c.roundRect(x + w - pill_w - 5, y + h - 18, pill_w, 12, 4,
                    fill=1, stroke=0)
        draw_center(c, text, x + w - pill_w / 2 - 5, y + h - 14.9, 7,
                    bold=True, color=PAPER)
    elif state == "open":
        pill_w = pdfmetrics.stringWidth("OPEN", "Atkinson-Bold", 6.4) + 9
        c.setFillColor(HexColor("#FFE7A3"))
        c.roundRect(x + w - pill_w - 5, y + h - 18, pill_w, 12, 4, fill=1, stroke=0)
        draw_center(c, "OPEN", x + w - pill_w / 2 - 5, y + h - 14.8, 6.4,
                    bold=True, color=OPEN_INK)
    elif state == "unavailable":
        pill_w = pdfmetrics.stringWidth("UNAVAILABLE", "Atkinson-Bold", 6.2) + 9
        c.setFillColor(HexColor("#E5E7EB"))
        c.roundRect(x + w - pill_w - 5, y + h - 18, pill_w, 12, 4, fill=1, stroke=0)
        draw_center(c, "UNAVAILABLE", x + w - pill_w / 2 - 5, y + h - 14.8, 6.2,
                    bold=True, color=MUTED)

    c.setStrokeColor(HexColor("#E5E7EB"))
    c.setLineWidth(0.55)
    c.line(x, y + h - 21, x + w, y + h - 21)

    footer_text = f"ALSO COVERS {card.also_covers}".upper() if card.also_covers else ""
    footer_wraps = bool(
        footer_text
        and pdfmetrics.stringWidth(footer_text, "Atkinson-Bold", 7.2) > w - 14
    )
    footer_h = (20 if footer_wraps else 14) if card.also_covers else 0
    content_top = y + h - 31
    if state == "linked":
        name_y = content_top
        if len(card.names) == 1:
            draw_text(c, card.names[0], x + 7, name_y, 13.8, bold=True, color=INK)
            task_y = name_y - 17
        else:
            for index, name in enumerate(card.names):
                draw_text(c, name, x + 7, name_y - index * 12, 10.5, bold=True, color=INK)
            task_y = name_y - len(card.names) * 12 - 2
    elif state == "open":
        draw_text(c, "ASSIGNMENT REQUIRED", x + 7, content_top, 8.2,
                  bold=True, color=OPEN_INK)
        task_y = content_top - 14
    elif state == "open_work":
        rounded_label(c, "OPEN WORK", x + 7, content_top - 7,
                      bg=HexColor("#FFE7A3"), fg=OPEN_INK, size=6.4, height=12)
        task_y = content_top - 23
    elif state == "unavailable":
        draw_text(c, "NO ELIGIBLE TEAM MEMBER", x + 7, content_top, 8.2,
                  bold=True, color=MUTED)
        task_y = content_top - 14
    else:
        name_size = 13.5 if compact else 14.5
        name = card.names[0] if card.names else ""
        draw_text(c, name, x + 7, content_top - 1, name_size, bold=True, color=INK)
        task_y = content_top - (16 if compact else 17)

    max_task_bottom = y + footer_h + 5
    max_lines = max(0, int((task_y - max_task_bottom) // (8.7 if compact else 9.0)) + 1)
    draw_task_lines(c, card.tasks, x + 7, task_y, w - 14,
                    font_size=7.8 if compact else 8.15,
                    line_height=8.7 if compact else 9.0,
                    max_lines=max_lines,
                    color=INK)

    if card.also_covers:
        c.setFillColor(palette.dark)
        c.roundRect(x, y, w, footer_h, 2, fill=1, stroke=0)
        c.rect(x, y + 2, w, footer_h - 2, fill=1, stroke=0)
        if footer_wraps:
            draw_text(c, "ALSO COVERS", x + 7, y + 10.8, 6.8, bold=True, color=PAPER)
            draw_text(c, card.also_covers.upper(), x + 7, y + 3.2, 6.8,
                      bold=True, color=PAPER)
        else:
            draw_text(c, footer_text, x + 7, y + 4.1, 7.2, bold=True, color=PAPER)


def draw_card_grid(c: canvas.Canvas, cards: Sequence[AssignmentCard],
                   *, top: float, card_h: float, rows: int = 2,
                   gap_x: float = 6, gap_y: float = 6,
                   compact: bool = False) -> None:
    cols = 5
    usable = PAGE_W - 2 * MARGIN_X
    card_w = (usable - gap_x * (cols - 1)) / cols
    for index, card in enumerate(cards):
        row = index // cols
        col = index % cols
        x = MARGIN_X + col * (card_w + gap_x)
        y = top - (row + 1) * card_h - row * gap_y
        draw_assignment_card(c, card, x, y, card_w, card_h, compact=compact)


def truncate_text(text: str, font: str, size: float, max_width: float) -> str:
    if pdfmetrics.stringWidth(text, font, size) <= max_width:
        return text
    suffix = "..."
    shortened = text
    while shortened and pdfmetrics.stringWidth(shortened + suffix, font, size) > max_width:
        shortened = shortened[:-1]
    return shortened.rstrip() + suffix


def draw_side_task_summary_card(c: canvas.Canvas, cards: Sequence[SideTaskCard],
                                *, x: float, y: float, w: float, h: float) -> None:
    active = [(index + 1, card) for index, card in enumerate(cards)
              if card.title and not card.completed]
    c.setFillColor(PAPER)
    c.setStrokeColor(HexColor("#B9A7E8"))
    c.setLineWidth(0.9)
    c.roundRect(x, y, w, h, 3, fill=1, stroke=1)
    c.setFillColor(PURPLE)
    c.roundRect(x, y + h - 4, w, 4, 2, fill=1, stroke=0)
    c.rect(x, y + h - 4, w, 2, fill=1, stroke=0)

    draw_text(c, "SIDE TASKS", x + 7, y + h - 16, 8.1,
              bold=True, color=PURPLE)
    status = f"{len(active)} ACTIVE - P2"
    status_w = pdfmetrics.stringWidth(status, "Atkinson-Bold", 6.1) + 10
    rounded_label(c, status, x + w - status_w - 6, y + h - 19,
                  bg=HexColor("#EDE9FE"), fg=PURPLE,
                  size=6.1, height=11)
    c.setStrokeColor(HexColor("#E5E7EB"))
    c.setLineWidth(0.55)
    c.line(x, y + h - 21, x + w, y + h - 21)

    if not active:
        draw_center(c, "NO ACTIVE SIDE TASKS", x + w / 2, y + 19, 7.2,
                    bold=True, color=SUBTLE)
        return

    if len(active) <= 3:
        display_rows: list[tuple[int | None, SideTaskCard | None, str | None]] = [
            (task_number, task, None) for task_number, task in active
        ]
    else:
        display_rows = [
            (active[0][0], active[0][1], None),
            (active[1][0], active[1][1], None),
            (None, None, f"+{len(active) - 2} MORE ON PAGE 2"),
        ]

    line_y = y + h - 32
    for task_number, task, overflow_text in display_rows:
        if overflow_text:
            draw_text(c, overflow_text, x + 7, line_y, 6.8,
                      bold=True, color=PURPLE)
            line_y -= 10
            continue

        assert task is not None and task_number is not None
        draw_center(c, str(task_number), x + 11, line_y, 6.6,
                    bold=True, color=PURPLE)
        if task.open_work:
            status_text = "OPEN"
            status_color = OPEN_INK
            status_bg = HexColor("#FFE7A3")
        else:
            status_text = task.assigned_to or ""
            status_color = MUTED
            status_bg = HexColor("#F3F4F6")
        status_width = pdfmetrics.stringWidth(status_text, "Atkinson-Bold", 6.0) + 9
        task_max_width = w - status_width - 34
        task_text = truncate_text(task.title, "Atkinson-Bold", 7.1, task_max_width)
        draw_text(c, task_text, x + 20, line_y, 7.1, bold=True, color=INK)
        if status_text:
            rounded_label(c, status_text, x + w - status_width - 6, line_y - 3.2,
                          bg=status_bg, fg=status_color, size=6.0, height=10)
        line_y -= 10


def draw_footer(c: canvas.Canvas, page_number: int) -> None:
    draw_text(c, "DESIGN PROTOTYPE - SOURCE SNAPSHOT JUL 19, 2026", MARGIN_X, 10,
              6.4, bold=True, color=SUBTLE)
    draw_right(c, f"SHEETBUILDER - GLCR GRAVE SHIFT - PAGE {page_number} OF 2",
               PAGE_W - MARGIN_X, 10, 6.4, bold=True, color=SUBTLE)


def page_one(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    draw_header(c, page_label="Assignments", page_number=1)

    zones = [
        AssignmentCard("Zone 1", "gold", "linked", ["1A Darlene", "1B Gary"],
                       ["Elevators and stairwells", "Self serve station"],
                       via="RR 1+2"),
        AssignmentCard("Zone 3", "red", "linked", ["Jamie"],
                       ["Self serve station"], via="Zone 5", break_group=2),
        AssignmentCard("Zone 4", "red", "direct", ["Kaylee"],
                       ["Poker Room: clean drink inserts"], break_group=1,
                       also_covers="Zone 2"),
        AssignmentCard("Zone 5", "red", "direct", ["Jamie"],
                       ["Team Member Smoking Room", "Team Member Locker Room",
                        "High Limit Table Games", "Promo Stage"],
                       break_group=2, also_covers="Zone 3"),
        AssignmentCard("Zone 9", "red", "direct", ["Jared"],
                       ["Social Bar Tables"], break_group=2,
                       also_covers="Zone 9 Smoking Room"),
        AssignmentCard("Zone 2", "gold", "linked", ["Kaylee"],
                       ["Lobby restrooms and trash"], via="Zone 4", break_group=1),
        AssignmentCard("Zone 6", "pink", "linked", ["Kathy"],
                       ["Entry door glass", "Outside smoking area"],
                       via="RR 6 Women", break_group=2),
        AssignmentCard("Zone 7", "blue", "linked", ["7A Jack", "7B Sheri O"],
                       ["Smoking room", "Pit 1 and 2: trash", "Pit 1 and 2: vacuum"],
                       via="RR 7"),
        AssignmentCard("Zone 8", "brown", "linked", ["8A Silvia", "8B Mike S"],
                       ["Pit 3: vacuum", "Pit 3: trash"], via="RR 8"),
        AssignmentCard("Zone 10", "green", "linked", ["10A Melissa", "10B Kaiden"],
                       ["High Limit Slots Restroom", "Self serve station",
                        "Outdoor smoking area"], via="RR 10"),
    ]
    draw_section_header(c, "Zones", 535,
                        [("ASSIGNED", 10, "direct")])
    draw_card_grid(c, zones, top=525, card_h=96.5)

    restrooms = [
        AssignmentCard("RR 1+2 Women", "gold", "direct", ["Darlene"],
                       ["Zone 1 Family Restroom", "Buffet Restroom after lunch"],
                       break_group=3, also_covers="Zone 1A"),
        AssignmentCard("RR 6 Women", "pink", "direct", ["Kathy"],
                       ["131 Restroom"], break_group=2, also_covers="Zone 6"),
        AssignmentCard("RR 7 Women", "blue", "direct", ["Sheri O"],
                       [], break_group=2, also_covers="Zone 7B"),
        AssignmentCard("RR 8 Women", "brown", "direct", ["Silvia"],
                       ["Zone 8 Family Restroom", "TDR Restroom", "Team Member Locker Rooms"],
                       break_group=3, also_covers="Zone 8A"),
        AssignmentCard("RR 10 Women", "green", "direct", ["Melissa"],
                       ["CBK Locker Rooms"], break_group=1, also_covers="Zone 10A"),
        AssignmentCard("RR 1+2 Men", "gold", "direct", ["Gary"],
                       ["Zone 1 Family Restroom", "Buffet Restroom after lunch"],
                       break_group=1, also_covers="Zone 1B"),
        AssignmentCard("RR 6 Men", "pink", "direct", ["Scott"],
                       ["131 Restroom"], break_group=3, also_covers="RR 7"),
        AssignmentCard("RR 7 Men", "blue", "direct", ["Jack"],
                       [], break_group=1, also_covers="Zone 7A"),
        AssignmentCard("RR 8 Men", "brown", "direct", ["Mike S"],
                       ["Zone 8 Family Restroom", "TDR Restroom", "Team Member Locker Rooms"],
                       break_group=1, also_covers="Zone 8B"),
        AssignmentCard("RR 10 Men", "green", "direct", ["Kaiden"],
                       ["CBK Locker Rooms"], break_group=3, also_covers="Zone 10B"),
    ]
    draw_section_header(c, "Restrooms", 312,
                        [("ASSIGNED", 10, "direct")])
    draw_card_grid(c, restrooms, top=302, card_h=88.5, compact=True)

    auxiliary = [
        AssignmentCard("Admin", "pink", "blank", [], []),
        AssignmentCard("Zone 9 Smoking Room", "red", "linked", ["Jared"], [],
                       via="Zone 9", break_group=2),
        AssignmentCard("Support 1", "blue", "direct", ["Jessica"], [], break_group=3),
    ]
    draw_section_header(c, "Auxiliary", 104,
                        [("ASSIGNED", 2, "direct")])
    usable = PAGE_W - 2 * MARGIN_X
    gap = 8
    card_w = (usable - 3 * gap) / 4
    for index, card in enumerate(auxiliary):
        draw_assignment_card(c, card, MARGIN_X + index * (card_w + gap), 30,
                             card_w, 64, compact=True)
    draw_side_task_summary_card(c, SIDE_TASKS,
                                x=MARGIN_X + 3 * (card_w + gap), y=30,
                                w=card_w, h=64)

    draw_footer(c, 1)
    c.showPage()


def draw_break_column(c: canvas.Canvas, *, x: float, y: float, w: float, h: float,
                      code: str, title: str, count: int,
                      people: Sequence[tuple[str, str, str]]) -> None:
    c.setFillColor(PAPER)
    c.setStrokeColor(RULE)
    c.setLineWidth(0.9)
    c.roundRect(x, y, w, h, 4, fill=1, stroke=1)
    c.setFillColor(INK if code != "OL" else LINK_INK)
    c.roundRect(x, y + h - 4, w, 4, 2, fill=1, stroke=0)
    c.rect(x, y + h - 4, w, 2, fill=1, stroke=0)

    draw_text(c, code, x + 10, y + h - 34, 23, bold=True, color=INK)
    draw_text(c, title.upper(), x + 48, y + h - 23, 9.5, bold=True, color=INK)
    people_label = "1 PERSON" if count == 1 else f"{count} PEOPLE"
    draw_text(c, people_label, x + 48, y + h - 36, 7.4, color=SUBTLE)
    c.setStrokeColor(HexColor("#E5E7EB"))
    c.line(x, y + h - 44, x + w, y + h - 44)

    if not people:
        draw_center(c, "NONE SCHEDULED", x + w / 2, y + h - 76, 9,
                    bold=True, color=SUBTLE)
        return

    row_y = y + h - 62
    for name, assignment, palette_name in people:
        palette = PALETTES[palette_name]
        draw_text(c, name, x + 10, row_y, 10.5, bold=True, color=INK)
        tag_w = pdfmetrics.stringWidth(assignment, "Atkinson-Bold", 7.2) + 12
        c.setFillColor(HexColor("#F8FAFC"))
        c.setStrokeColor(palette.dark)
        c.setLineWidth(0.9)
        c.roundRect(x + w - tag_w - 10, row_y - 4, tag_w, 15, 3, fill=1, stroke=1)
        draw_center(c, assignment, x + w - tag_w / 2 - 10, row_y + 0.2, 7.2,
                    bold=True, color=palette.dark)
        c.setStrokeColor(HexColor("#E5E7EB"))
        c.setDash(2, 2)
        c.line(x + 10, row_y - 9, x + w - 10, row_y - 9)
        c.setDash()
        row_y -= 28


def draw_overlap_card(c: canvas.Canvas, card: OverlapCard, *, x: float, y: float,
                      w: float, h: float, accent: Color) -> None:
    if card.state == "open":
        bg, border = OPEN_BG, OPEN_BORDER
    elif card.state == "available":
        bg, border = AVAILABLE_BG, RULE
    else:
        bg, border = PAPER, RULE
    c.setFillColor(bg)
    c.setStrokeColor(border)
    c.setLineWidth(0.8)
    if card.state in {"open", "available"}:
        c.setDash(3, 2)
    else:
        c.setDash()
    c.roundRect(x, y, w, h, 3, fill=1, stroke=1)
    c.setDash()
    c.setFillColor(accent if card.state != "open" else OPEN_BORDER)
    c.roundRect(x, y + h - 4, w, 4, 2, fill=1, stroke=0)
    c.rect(x, y + h - 4, w, 2, fill=1, stroke=0)

    if card.state == "available":
        draw_center(c, "AVAILABLE", x + w / 2, y + h / 2 + 2, 8.5,
                    bold=True, color=AVAILABLE_INK)
        draw_center(c, "NO WORK ASSIGNED", x + w / 2, y + h / 2 - 10, 6.6,
                    bold=True, color=AVAILABLE_INK)
        return

    if card.state == "open":
        rounded_label(c, "OPEN WORK", x + 7, y + h - 29,
                      bg=HexColor("#FFE7A3"), fg=OPEN_INK, size=6.4, height=12)
        task_y = y + h - 45
    else:
        draw_text(c, card.name or "", x + 7, y + h - 23, 11.5, bold=True, color=INK)
        task_y = y + h - 40
    draw_task_lines(c, card.tasks, x + 7, task_y, w - 14,
                    font_size=7.6, line_height=9.0, max_lines=5, color=INK)


def draw_overlap_row(c: canvas.Canvas, cards: Sequence[OverlapCard], *, y: float,
                     h: float, accent: Color) -> None:
    gap = 6
    usable = PAGE_W - 2 * MARGIN_X
    w = (usable - 5 * gap) / 6
    for index, card in enumerate(cards):
        draw_overlap_card(c, card, x=MARGIN_X + index * (w + gap), y=y, w=w, h=h,
                          accent=accent)


def draw_side_task_card(c: canvas.Canvas, card: SideTaskCard, *, x: float,
                        y: float, w: float, h: float) -> None:
    is_populated = bool(card.title or card.area or card.details or card.assigned_to or card.open_work)
    accent = OPEN_BORDER if card.open_work else (PURPLE if is_populated else HexColor("#9CA3AF"))

    c.setFillColor(PAPER)
    c.setStrokeColor(RULE)
    c.setLineWidth(0.9)
    c.roundRect(x, y, w, h, 4, fill=1, stroke=1)

    c.setFillColor(accent)
    c.roundRect(x, y + h - 4, w, 4, 2, fill=1, stroke=0)
    c.rect(x, y + h - 4, w, 2, fill=1, stroke=0)

    inner_x = x + 10
    inner_w = w - 20
    area_w = 116
    task_w = inner_w - area_w - 10
    top_label_y = y + h - 17
    top_value_y = y + h - 30
    top_line_y = y + h - 34
    draw_text(c, "TASK / PROJECT", inner_x, top_label_y, 6.2, bold=True, color=SUBTLE)
    draw_text(c, card.title, inner_x, top_value_y, 9.6, bold=True, color=INK)
    c.setStrokeColor(HexColor("#9CA3AF"))
    c.setLineWidth(0.55)
    c.line(inner_x, top_line_y, inner_x + task_w, top_line_y)
    area_x = inner_x + task_w + 10
    draw_text(c, "AREA / LOCATION", area_x, top_label_y, 6.2, bold=True, color=SUBTLE)
    draw_text(c, card.area, area_x, top_value_y, 8.2, bold=True, color=INK)
    c.line(area_x, top_line_y, x + w - 10, top_line_y)

    details_label_y = y + h - 47
    draw_text(c, "DETAILS", inner_x, details_label_y, 6.2, bold=True, color=SUBTLE)
    details = list(card.details)
    for line_index in range(2):
        line_y = y + h - 60 - line_index * 12
        if line_index < len(details):
            draw_text(c, details[line_index], inner_x, line_y + 2.2, 8.1,
                      bold=True, color=INK)
        c.setStrokeColor(HexColor("#D1D5DB"))
        c.line(inner_x, line_y, x + w - 10, line_y)

    field_y = y + 7
    field_h = 25
    assignment_w = (w - 21) * 0.46
    c.setFillColor(HexColor("#F8FAFC"))
    c.setStrokeColor(HexColor("#E5E7EB"))
    c.setLineWidth(0.6)
    c.roundRect(x + 7, field_y, assignment_w, field_h, 3, fill=1, stroke=1)
    draw_text(c, "ASSIGNED TO", x + 14, field_y + 15.5, 6.1, bold=True, color=SUBTLE)
    check_x = x + 7 + assignment_w - 66
    if card.assigned_to:
        draw_text(c, card.assigned_to, x + 14, field_y + 4.8, 8.2,
                  bold=True, color=INK)
    else:
        c.setStrokeColor(HexColor("#9CA3AF"))
        c.line(x + 14, field_y + 5, check_x - 8, field_y + 5)
    c.setFillColor(HexColor("#FFE7A3") if card.open_work else PAPER)
    c.setStrokeColor(OPEN_BORDER if card.open_work else HexColor("#9CA3AF"))
    c.rect(check_x, field_y + 8, 8, 8, fill=1, stroke=1)
    if card.open_work:
        draw_center(c, "X", check_x + 4, field_y + 9.7, 6.2, bold=True, color=OPEN_INK)
    draw_text(c, "OPEN WORK", check_x + 12, field_y + 9, 6.2,
              bold=True, color=OPEN_INK if card.open_work else SUBTLE)

    sign_x = x + 14 + assignment_w
    sign_w = w - assignment_w - 21
    c.setFillColor(HexColor("#F8FAFC"))
    c.setStrokeColor(HexColor("#E5E7EB"))
    c.roundRect(sign_x, field_y, sign_w, field_h, 3, fill=1, stroke=1)
    draw_text(c, "COMPLETED BY", sign_x + 7, field_y + 15.5, 6.1,
              bold=True, color=SUBTLE)
    c.setStrokeColor(HexColor("#9CA3AF"))
    c.line(sign_x + 70, field_y + 6, sign_x + sign_w - 79, field_y + 6)
    draw_text(c, "TIME", sign_x + sign_w - 70, field_y + 15.5, 6.1,
              bold=True, color=SUBTLE)
    c.line(sign_x + sign_w - 43, field_y + 6, sign_x + sign_w - 7, field_y + 6)


def draw_task_register(c: canvas.Canvas, cards: Sequence[SideTaskCard], *,
                       x: float, y: float, w: float, h: float) -> None:
    """Draw an eight-line register usable digitally or with handwriting."""
    header_h = 21
    row_h = (h - header_h) / len(cards)
    columns = [
        ("#", 24),
        ("TASK / PROJECT", 326),
        ("ASSIGNED TO", 124),
        ("COMPLETED", 74),
        ("COMPLETED BY", 136),
        ("TIME", w - 684),
    ]

    c.setFillColor(PAPER)
    c.setStrokeColor(RULE)
    c.setLineWidth(0.9)
    c.roundRect(x, y, w, h, 4, fill=1, stroke=1)
    c.setFillColor(HexColor("#F3F4F6"))
    c.roundRect(x, y + h - header_h, w, header_h, 4, fill=1, stroke=0)
    c.rect(x, y + h - header_h, w, header_h - 4, fill=1, stroke=0)

    column_xs = [x]
    running_x = x
    for _, width in columns:
        running_x += width
        column_xs.append(running_x)

    for index, (label, width) in enumerate(columns):
        left = column_xs[index]
        if index in {0, 3}:
            draw_center(c, label, left + width / 2, y + h - 14.2, 6.8,
                        bold=True, color=SUBTLE)
        else:
            draw_text(c, label, left + 7, y + h - 14.2, 6.8,
                      bold=True, color=SUBTLE)

    c.setStrokeColor(RULE)
    c.setLineWidth(0.6)
    for boundary_x in column_xs[1:-1]:
        c.line(boundary_x, y, boundary_x, y + h)
    c.line(x, y + h - header_h, x + w, y + h - header_h)

    for row_index, card in enumerate(cards):
        row_top = y + h - header_h - row_index * row_h
        row_bottom = row_top - row_h
        if row_index % 2 == 1:
            c.setFillColor(HexColor("#FBFCFD"))
            c.rect(x + 0.5, row_bottom, w - 1, row_h, fill=1, stroke=0)

        if card.open_work:
            c.setFillColor(OPEN_BG)
            c.rect(column_xs[2] + 0.5, row_bottom + 0.5,
                   columns[2][1] - 1, row_h - 1, fill=1, stroke=0)

        c.setStrokeColor(HexColor("#D1D5DB"))
        c.setLineWidth(0.5)
        c.line(x, row_bottom, x + w, row_bottom)
        draw_center(c, str(row_index + 1), x + 12, row_bottom + row_h / 2 - 2.6,
                    7.2, bold=True, color=SUBTLE)

        task_left, task_right = column_xs[1], column_xs[2]
        if card.title:
            draw_text(c, card.title, task_left + 7, row_bottom + row_h / 2 - 3.2,
                      8.8, bold=True, color=INK)
        else:
            c.setStrokeColor(HexColor("#9CA3AF"))
            c.line(task_left + 7, row_bottom + 7, task_right - 7, row_bottom + 7)

        assigned_left, assigned_right = column_xs[2], column_xs[3]
        if card.assigned_to:
            draw_text(c, card.assigned_to, assigned_left + 7,
                      row_bottom + row_h / 2 - 3.2, 8.4, bold=True, color=INK)
        elif card.open_work:
            rounded_label(c, "OPEN WORK", assigned_left + 7,
                          row_bottom + (row_h - 12) / 2,
                          bg=HexColor("#FFE7A3"), fg=OPEN_INK,
                          size=6.2, height=12)
        else:
            c.setStrokeColor(HexColor("#9CA3AF"))
            c.line(assigned_left + 7, row_bottom + 7, assigned_right - 7, row_bottom + 7)

        complete_left, complete_right = column_xs[3], column_xs[4]
        box_size = 9
        box_x = complete_left + (complete_right - complete_left - box_size) / 2
        box_y = row_bottom + (row_h - box_size) / 2
        c.setFillColor(HexColor("#DCFCE7") if card.completed else PAPER)
        c.setStrokeColor(HexColor("#15803D") if card.completed else HexColor("#9CA3AF"))
        c.rect(box_x, box_y, box_size, box_size, fill=1, stroke=1)
        if card.completed:
            draw_center(c, "X", box_x + box_size / 2, box_y + 1.6, 6.5,
                        bold=True, color=HexColor("#166534"))

        for left, right in ((column_xs[4], column_xs[5]),
                            (column_xs[5], column_xs[6])):
            c.setStrokeColor(HexColor("#9CA3AF"))
            c.line(left + 7, row_bottom + 7, right - 7, row_bottom + 7)


def page_two(c: canvas.Canvas) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    draw_header(c, page_label="Tasks & Overlaps", page_number=2)

    draw_section_header(c, "Side Tasks / Projects", 535,
                        [("CAPACITY", 8, "direct"), ("ENTRIES", 2, "direct"),
                         ("OPEN WORK", 1, "open")])
    usable = PAGE_W - 2 * MARGIN_X
    draw_task_register(c, SIDE_TASKS, x=MARGIN_X, y=304, w=usable, h=216)

    c.setFillColor(PAPER)
    c.setStrokeColor(RULE)
    c.setLineWidth(0.8)
    c.roundRect(MARGIN_X, 244, usable, 48, 3, fill=1, stroke=1)
    draw_text(c, "NOTES / CHANGES", MARGIN_X + 9, 276, 7.1,
              bold=True, color=SUBTLE)
    c.setStrokeColor(HexColor("#E5E7EB"))
    c.line(MARGIN_X + 9, 262, PAGE_W - MARGIN_X - 9, 262)
    c.line(MARGIN_X + 9, 250, PAGE_W - MARGIN_X - 9, 250)

    draw_section_header(c, "Overlap Coverage", 226,
                        [("ASSIGNED", 8, "direct"), ("OPEN WORK", 1, "open"),
                         ("AVAILABLE", 3, "unavailable")])
    sunday_label = "SUNDAY JUL 19"
    draw_text(c, sunday_label, MARGIN_X, 207, 10.5, bold=True, color=PURPLE)
    sunday_time_x = MARGIN_X + pdfmetrics.stringWidth(sunday_label, "Atkinson-Bold", 12) + 10
    draw_text(c, "11 PM - 1 AM", sunday_time_x, 208, 7.8, bold=True, color=MUTED)
    pm_cards = [
        OverlapCard("PM 1", "Becca", ["Tables and Restrooms"]),
        OverlapCard("PM 2", "Doug", ["Vacuum"]),
        OverlapCard("PM 3", "Gage", ["Glass and Counters"]),
        OverlapCard("PM 4", "Missy", ["Vacuum"]),
        OverlapCard("PM 5", None, [], state="available"),
        OverlapCard("PM 6", None, [], state="available"),
    ]
    draw_overlap_row(c, pm_cards, y=137, h=65, accent=PM_COLOR)

    monday_label = "MONDAY JUL 20"
    draw_text(c, monday_label, MARGIN_X, 119, 10.5, bold=True, color=HexColor("#137A3A"))
    monday_time_x = MARGIN_X + pdfmetrics.stringWidth(monday_label, "Atkinson-Bold", 12) + 10
    draw_text(c, "5 AM - 7 AM", monday_time_x, 120, 7.8, bold=True, color=MUTED)
    am_cards = [
        OverlapCard("AM 1", "Auggie", ["CBK Front", "Shkode Front"]),
        OverlapCard("AM 2", "Christina", ["Sandhill Cafe / Express", "Lobby Bar"]),
        OverlapCard("AM 3", "Char", ["Trash", "Hotel and CBK Offices"]),
        OverlapCard("AM 4", "LeeAnn", ["CBK Back", "Shkode Back"]),
        OverlapCard("AM 5", None, ["131 Green Rooms", "Trash", "131 Stage"], state="open"),
        OverlapCard("AM 6", None, [], state="available"),
    ]
    draw_overlap_row(c, am_cards, y=30, h=79, accent=AM_COLOR)

    draw_footer(c, 2)
    c.showPage()


def main() -> None:
    register_fonts()
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    c = canvas.Canvas(OUTPUT, pagesize=(PAGE_W, PAGE_H), pageCompression=1)
    c.setTitle("SheetBuilder - GLCR Grave Deployment Redesign")
    c.setAuthor("SheetBuilder design prototype")
    c.setSubject("Accessible grave deployment, task, and overlap sheet redesign")
    page_one(c)
    page_two(c)
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    main()
