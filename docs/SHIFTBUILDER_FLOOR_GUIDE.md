# ShiftBuilder — Floor Guide for Covering a Shift

**Most nights there are no extra people. You will usually move people who are already placed.**

This guide is for someone **covering a grave shift** who needs to update tonight’s deployment board because of call-offs, swaps, or similar changes. You do not need to know how the whole system works—just how to sign in, confirm you’re on the right night, and move team members on the board.

For a hands-on walkthrough, open **ShiftBuilder Help** (`/shiftbuilder/help`) and launch the **interactive tutorial**. You can also open **Grave Cover Guide** from the account menu on the live board.

---

## What ShiftBuilder is

ShiftBuilder is the **live deployment board** for the grave shift. It shows who is assigned to each **zone**, **restroom (RR)**, and **auxiliary** position for the night you have selected. Changes you make here are what the floor uses for the rest of the shift.

---

## 1. Sign in

1. Open **ShiftBuilder** in your browser (admin will give you the link).
2. Enter your **ops PIN** when prompted.
3. Wait for the board to load. You should see the deployment canvas (zones, restrooms, aux slots).

If you do not have a PIN or it does not work, contact **admin**—do not share PINs with others.

---

## 2. Select the correct night

Use the **floating nav bar** at the top of the screen:

- **Day strip (center):** The **selected** grave night shows a colored pill with the **short month + date number** (e.g. `JUN` / `23`). Other nights in the week show only the **weekday letter** (M, T, W…). Tap a day to switch which night you are editing.
- **← / → arrows:** Move to the previous or next **grave week**.
- **Month label (left):** Opens a calendar to jump to a specific date.
- **Locate icon:** Jump back to today when you are viewing another date.

Always double-check the selected night before moving people on the board.

---

## 3. Know the main parts of the screen

### Deployment board (center)

- **Zone cards** (Z1–Z10): main floor positions.
- **Restroom cards** (RR): men’s / women’s sides—assign to the **specific side**, not a generic RR slot.
- **Auxiliary (AUX):** extra/support roles when used.
- **Empty slots** show **Unassigned** in the name area and an **ASSIGN TM** invite below the divider.

**When someone calls off, start here—not the roster.** Look at who is already on the board and which zones or RRs are usually lighter. That is where you pull from.

### Grave Roster (left side)

Toggle the roster with the **people icon** in the floating nav. The panel opens on the **left**; the board shifts to make room.

Useful roster sections:

| Section | What it shows |
|---|---|
| **Already Placed** | Everyone currently on the board tonight (your main reference when reshuffling). |
| **On Sheet — Not Placed** | TMs on tonight’s schedule who are **not** on the board yet—often **Graves** only, sometimes PM/AM bands. **Usually empty or very short on grave.** Check here only after you have looked at the board. |
| **Called Off** | TMs marked unavailable for tonight. Each name has a **Restore** button (if someone shows up or was marked off by mistake). |

Use the **search box** at the top of the roster to find someone by name. The **Graves only** filter narrows the sheet to the full-grave band.

### Floating nav (top)

Besides the day strip and roster toggle:

- **Layers icon** — switches between the **deployment board** and the **overlap sheet** (breaks / double-duty layout).
- **Account initials** — sign out, print, print preview, and help links.
- **Published / Read-only** badge — floor accounts may be read-only until the night is published; you cannot edit a locked night.

---

## 4. Opening the Placement Pad

The **Placement Pad** is the flyout panel anchored to a card. It is **not** a fixed side panel.

| Device | Gesture | Where on the card |
|---|---|---|
| **iPad / tablet** | **Single tap** | Upper **name area** (assignee zone) |
| **Desktop** | **Double-click** | Upper **name area** (assignee zone) |

On an **empty** slot, you can also tap **ASSIGN TM** in the lower invite area (same pad opens).

Close the pad with **✕** in the top-right corner.

### Placement Pad — filled slot

When someone is assigned, the pad shows:

- **Header:** slot label, TM name, and a yellow **Mark unavailable** button (whole night).
- **Body:** regular task rows (if any), rotation matrix, and **Add tasks** (opens the Tasks Pad).
- **Footer:** **Lock** · **Clear** · **Coverage** · **Swap**

### Placement Pad — empty slot

- **Assign team member** button at the top (accent-colored).
- Opens the TM picker: scheduled + eligible names, sorted by rotation health.
- Footer actions are not shown until someone is placed.

---

## 5. Mark unavailable vs Clear vs Restore

These three actions are easy to mix up. Use the right one:

| Action | Where | What it does |
|---|---|---|
| **Mark unavailable** | Placement Pad header (yellow button) | TM is **off for the whole night**. Removed from **all** slots. Moves to **Called Off** in the roster. |
| **Mark unavailable tonight** | TM picker (during Assign / Swap) | Same end result, but you pick a reason: **Called off**, **PTO**, **LOA**, or **Other / Off**. |
| **Clear** | Placement Pad footer | Removes the TM from **one slot only**. They stay available and can be placed somewhere else. Does **not** mark them called off. |
| **Restore** | Grave Roster → **Called Off** | Undoes **Mark unavailable** for tonight. TM returns to the assignable pool. **Does not** put them back on slots—you assign them again. |

---

## 6. Coverage vs tasks (read this carefully)

These are **two different systems** on each card.

### Coverage (gold / accent bar at the **bottom** of the card)

Use coverage when a TM is **physically placed in one slot** but also **covering another** zone or RR that is thin or empty.

**How to add coverage:**

1. Open the Placement Pad on the **covering TM’s card** (the person doing the extra work).
2. Tap **Coverage** in the footer.
3. In the **Add coverage** grid, pick the zone or RR they are also covering (e.g. Z8).

**What you will see:**

- A **coverage bar** appears at the **very bottom** of the **source** card (the TM’s home slot).
- The bar label reads **`And Zone 8`**, **`And Restroom 7`**, etc.—not “Covering Z8”.
- The bar uses the **accent color** of the zone being covered (gold tint for standard zones).

**What coverage is NOT:**

- Coverage does **not** appear in the middle **task list** on the card.
- Coverage does **not** show in the **Tasks Pad**.
- Coverage does **not** show in the Placement Pad task rows (only regular tasks appear there).

To remove coverage, click **×** on the coverage bar.

### “Covered by” on empty target slots

When someone adds coverage pointing at an **empty** zone or RR, that **target** card shows a **Covered by** overlay in the name area:

- Label: **COVERED BY**
- TM name(s) doing the covering
- Position badges like **8A** or **8B** when two people share coverage on the same slot

Tap the overlay to jump to the covering TM’s slot. This is the **inverse** view of the coverage bar—not a second way to add coverage.

### Regular tasks (middle of the card)

Tasks are short reminders for that position (e.g. “Monitor Z8 — thin”, “Sweep at 2am”).

| Device | Gesture | Where |
|---|---|---|
| **iPad / tablet** | **Single tap** | Lower **task area** on the card |
| **Desktop** | **Double-click** | Lower **task area** on the card |

This opens the **Tasks Pad** flyout. You can also open it from the Placement Pad via **Add tasks** or by clicking an existing task row.

Tasks save separately from who is assigned. Use a task line when you want the **next supervisor** to see the plan—not when you mean “this TM is also covering another zone” (use **Coverage** for that).

---

## 7. When there are no replacements (most nights)

On most grave shifts, **On Sheet — Not Placed** will not save you. There is no bench of spare TMs waiting in the roster. That is normal.

### How to scan the board for someone to move

1. **Mark the call-off unavailable first** (Section 8, Step A) so their slots are empty and the roster is accurate.
2. **Look at the whole board**, not the roster:
   - Which zones are usually quieter or can run thin for a while?
   - Is anyone on **AUX** who could move to the floor?
   - Can an RR side spare someone briefly?
3. **Pull from the lightest spot** into the hole that matters most.
4. **Deal with the new hole** you created—move someone else, leave it thin for now, add **coverage**, or add a **task** note.

It is normal to run **lean** for part of the shift. Do not panic and call admin for every single gap if you have a workable reshuffle.

### Ways to add or stretch coverage

- **Swap** someone from another slot into the empty position (most common—see Section 8).
- **Drag** a TM from one card to another if that is faster than opening the pad.
- **Leave a zone thin** and add a **task** on the covering TM’s card so the plan is visible.
- Use **Coverage** + **Covered by** so empty slots show who is holding them.
- Use the **overlap sheet** (Section 10) if breaks or double-duty need to be reflected there.

### Quick decision: someone called off

```
Someone calls off
    │
    ├─ A. Pull from another zone / RR / AUX (MOST COMMON)
    │      → Swap or drag them into the hole
    │      → Backfill, thin out, or add Coverage on their card
    │
    ├─ B. Restore someone (they showed up or were marked off by mistake)
    │      → Grave Roster → Called Off → Restore → assign them
    │
    └─ C. Call admin (large gaps, eligibility questions, board won’t save)
```

---

## 8. Typical workflow: call-off coverage (real scenario)

Work in this order:

### Step A — Mark them unavailable

1. **If they are on a slot:** open that slot’s Placement Pad and click **Mark unavailable** (yellow button under their name).
2. They are **removed from every slot** on the board for tonight and appear under **Called Off** in the Grave Roster.

*(If you are in the TM picker during Assign/Swap, you can instead use **Mark unavailable tonight** and pick a reason.)*

### Step B — Reshuffle or add coverage (not “find a replacement”)

**Do not wait for On Sheet — Not Placed to bail you out.** Most nights you fix the hole by moving people who are **already on the board**.

1. Decide **which empty slot matters most** (the call-off’s zone, RR, etc.).
2. **Pick a TM to pull** from a lighter zone, RR, or AUX—scan the board first.
3. **Move them into the hole:**
   - Open the **target slot** → **Swap** → pick the TM you are moving, **or**
   - **Drag** them from their current card onto the empty slot.
4. **Handle the spot you emptied:**
   - Pull someone else into it (repeat Swap/drag),
   - Leave it thin and add **Coverage** on the TM who is doubling up, and/or
   - Add a **task** on their card explaining the plan,
   - Check **On Sheet — Not Placed** or **Restore** only if you know someone extra is actually available tonight.

### Example

> **Z4 called off** → Pull **Chen** from **Z8** (usually quieter) → **Swap** them into Z4 → Z8 is now empty → Open Chen’s Z4 pad → **Coverage** → pick **Z8** → Z4 shows an **`And Zone 8`** bar at the bottom; Z8 shows **Covered by Chen** → Add task **“Monitor Z8 — thin”** on Z4 if you want a written reminder.

Repeat until the floor has a workable layout. A few thin zones with clear coverage and task notes is often better than chasing a perfect fill from an empty roster.

---

## 9. Restore someone marked off (mistake or they showed up)

Use this when a TM was marked unavailable but **is working tonight** after all.

1. Open the **Grave Roster** (people icon).
2. Expand **Called Off** if it is collapsed.
3. Find their name and click **Restore**.
4. They disappear from **Called Off** and return to the normal assignable pool.
5. **Assign them to a slot**—via **Swap**, **Assign team member**, or drag onto the card. Restore alone does not place them on the board.

If you only needed to move someone off **one** position and they are still working, use **Clear** on that slot instead of **Mark unavailable**. If you already marked them off by mistake, **Restore** fixes the roster; then assign them where they belong.

---

## 10. Drag and drop (optional)

- **Between slots:** drag a TM from one card to another (fast reshuffle).
- **From roster:** drag a TM onto a slot when they are unplaced.
- **To unassign one slot:** use **Clear** in the Placement Pad (drag-back is less reliable on tablet).

You can do everything through the Placement Pad if you prefer tapping over dragging.

---

## 11. Breaks / overlap sheet

The **layers icon** in the floating nav switches between:

- **Deployment board** (main zones) — default view you will use most.
- **Overlap sheet** — break/overlap layout for the shift.

Click the same icon again to return to the deployment board. For call-off coverage, you usually stay on the **deployment board**, but use the overlap sheet if you need to reflect break coverage or double-duty there.

---

## 12. Print the floor sheet (if needed)

1. Open the **account menu** (your initials in the floating nav).
2. Choose **View print preview** to see the sheet on screen, or **Print** to open the print dialog.
3. Confirm the correct night(s) are selected before printing.

The print sheet shows assignments, tasks, coverage bars, and **Covered by** labels as the floor will see them on paper.

---

## 13. What you should not expect to do

With a standard **floor** account you typically **cannot**:

- Open **Settings** or admin tools
- Change the **master grave schedule** grid
- Run batch planning tools
- Edit a night that is **locked** or **read-only** for your role

If you need any of those, contact **admin**.

---

## 14. When to ask for help

Contact **admin** if:

- The board will not load or changes do not save
- You are unsure which TM is eligible for a restroom side or zone
- **Multiple call-offs** leave gaps you cannot reasonably cover by reshuffling (not just one thin zone)
- **Mark unavailable** or **Restore** fails, or the roster does not update after either action
- Coverage or **Covered by** labels look wrong after you reshuffle (e.g. duplicate position badges)

Running lean after a reshuffle is normal. Admin is for when the board itself is broken or the gap is bigger than moving people around can fix.

---

## 15. Sign out when done

1. Open the **account menu** (your initials in the floating nav).
2. Choose **Sign out**.

Always sign out when leaving the ops station so the next person must use their own PIN.

---

*Gun Lake Casino — Operations / ShiftBuilder. For account issues, contact admin.*