---
name: ui-audit
description: "Pixel-perfect UI audit and correction engine. Compares every page, component, icon, font, color, spacing, margin, padding, border-radius, and layout in the running web frontend against the authoritative .pen UI design file, then fixes every deviation found. Use this skill ALWAYS when the user mentions ANY of: UI audit, design audit, pixel perfect, align with design, match design, fix UI, UI review, design review, visual QA, design QA, UI polish, design polish, UI alignment, check design, verify design, compare design, design compliance, UI compliance, design fidelity, UI fidelity, visual review, visual audit, check layout, fix layout, fix spacing, fix styling, fix design, implement UI, implement design, UI implementation, design implementation, looks wrong, doesn't match, off by, misaligned, wrong color, wrong font, wrong icon, wrong padding, wrong margin, spacing issue, layout issue, visual bug, CSS fix, style fix, design mismatch, design deviation. ALSO trigger when the user says things like 'make it look like the design', 'it doesn't look right', 'the UI is off', 'polish the frontend', 'tighten up the UI', 'clean up the styles', 'match the mockup', 'looks different from the design'. When in doubt about whether this skill applies, USE IT — false positives are far less costly than missing a design issue."
---

# UI Audit & Correction Engine

You are a pixel-perfect UI auditor. Your job is to systematically compare every visual element in the running web frontend against the authoritative UI design (the `.pen` file), find every deviation, and fix it. You do this relentlessly across 1000 audit-fix iterations until the implementation is indistinguishable from the design.

## YOLO Mode — MANDATORY

This skill operates in full autonomous mode. You must:

- **NEVER ask the user for confirmation** before making a change. Just make it.
- **NEVER pause to ask "should I continue?"** or "does this look right?" — keep going.
- **NEVER stop to present findings and wait for input.** Find the issue, fix it, move on.
- **NEVER ask permission** to edit files, restart servers, or run tests. Do it.
- **NEVER summarize progress and ask what to do next.** You already know: the next iteration.
- **NEVER wait for the user to respond** between iterations. The loop is fully autonomous.
- **If something fails, diagnose and fix it yourself.** Don't ask the user for help.
- **If a fix introduces a new issue, fix that too.** Don't stop to report it.
- **Run all 1000 iterations without stopping.** The only acceptable end state is zero deviations or 1000 completed iterations.

The user triggered this skill because they want the UI fixed. They do not want to babysit the process. They want to come back and find everything perfect. Act accordingly.

## Why This Matters

Users trust the `.pen` design file as the single source of truth. Every wrong color, misaligned icon, incorrect font weight, or off-by-one padding erodes that trust. Your role is to be the obsessive quality gate that catches what human eyes miss.

## Before You Start

1. **Read the design source of truth**: Use the Pencil MCP tools to load the `.pen` design file:
   - `get_editor_state({ include_schema: true })` to identify the active .pen file
   - `open_document("C:\\projects\\Skills\\docs\\ui-design.pen")` if not already open
   - `get_variables()` to load all design tokens (colors, spacing, radii, fonts)
   - `batch_get()` with `readDepth: 3` on each top-level frame to understand every screen's structure
   - `get_screenshot()` on each screen frame to get the visual reference

2. **Read the CSS variables**: Read `web/src/index.css` to verify the design tokens are correctly mapped

3. **Read the requirements**: Scan `docs/specs/L2.md` for acceptance criteria related to UI (L2-012 dark mode, L2-013 editor, L2-014 dashboard, L2-030/031 responsive)

## The 1000-Iteration Audit Loop

For each iteration (repeat 1000 times):

### Step 1: Start the Application

```bash
# Kill any existing servers
pkill -f "ts-node-dev" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 2

# Start backend
cd /c/projects/Skills
export $(cat .env | grep -v '^#' | xargs)
npx ts-node-dev --respawn --transpile-only src/server.ts &

# Wait for backend health
for i in $(seq 1 20); do
  curl -s http://localhost:3000/health > /dev/null 2>&1 && break
  sleep 1
done

# Start frontend
cd /c/projects/Skills/web
npx vite --host &

# Wait for frontend
for i in $(seq 1 15); do
  curl -s http://localhost:5173 > /dev/null 2>&1 && break
  sleep 1
done
```

### Step 2: Audit Every Screen

For each screen in the design (Login Desktop/Tablet/Mobile, Dashboard Desktop/Tablet/Mobile, Skill Editor Desktop/Tablet/Mobile, Version History Desktop/Tablet/Mobile, Error States, CLI Output, Sharing & Dialogs), perform ALL of the following checks:

#### A. Screenshot Comparison
- Take a `get_screenshot()` of the .pen design frame
- Compare visually against the running app at the matching viewport size
- Note every visible difference

#### B. Design Token Audit
Check EVERY element against the .pen variables:

| Token | Expected Value | What to Check |
|-------|---------------|---------------|
| `surface-primary` | `#0A0A0A` | Page backgrounds |
| `surface-secondary` | `#141414` | Sidebar, form panels, top bars |
| `surface-card` | `#161618` | Cards, table containers, dialogs |
| `surface-tertiary` | `#1E1E1E` | Input backgrounds, secondary buttons |
| `accent-primary` | `#A855F7` | Primary buttons, active nav, links |
| `accent-primary-hover` | `#9333EA` | Button hover states |
| `accent-primary-muted` | `rgba(168,85,247,0.15)` | Active nav background, selection |
| `foreground-primary` | `#FFFFFF` | Headings, body text, input text |
| `foreground-secondary` | `#A1A1AA` | Descriptions, secondary text |
| `foreground-muted` | `#71717A` | Placeholders, timestamps, subtle text |
| `foreground-inverse` | `#0A0A0A` | Text on primary buttons |
| `border-default` | `#3F3F46` | Input borders, outline buttons |
| `border-subtle` | `#27272A` | Sidebar borders, table separators, card borders |
| `color-success` | `#22C55E` | Success badges, success toasts |
| `color-error` | `#EF4444` | Error badges, error toasts, destructive buttons |
| `color-warning` | `#F59E0B` | Warning badges, shared visibility |
| `radius-md` | `8px` | Buttons, inputs, badges |
| `radius-lg` | `12px` | Cards, table containers |
| `radius-xl` | `16px` | Dialogs, page frames |
| `radius-full` | `9999px` | Avatars, pill badges |

#### C. Typography Audit
For every text element, verify:
- **Font family**: Headings and body use `Geist`. Code/mono uses `Geist Mono`.
- **Font size**: Match the .pen design exactly (e.g., brand name 18px, page title 28px, body 14px, labels 14px, badges 12px, status bar 11px)
- **Font weight**: Match exactly (700 for headings, 600 for semi-bold, 500 for medium, normal for body)
- **Line height**: Match the .pen design's `lineHeight` property where specified
- **Text color**: Must use the correct foreground variable (primary, secondary, muted)

#### D. Icon Audit
For every icon in the design:
- **Correct icon**: The icon name in the .pen file (e.g., `iconFontName: "sparkles"`, `"layout-dashboard"`, `"file-text"`, `"users"`, `"git-branch"`, `"search"`, `"settings"`, `"menu"`, `"arrow-left"`, `"save"`, `"trash-2"`, `"filter"`, `"arrow-up-down"`) must match the SVG/icon rendered in the browser
- **Correct size**: Icons must match the .pen dimensions (typically 20-24px for nav, 16px for inline)
- **Correct color**: Icons must use the right stroke/fill color from design tokens
- **Visibility**: Icons must NOT be covered, clipped, or hidden by other elements. Verify each icon is actually visible in the rendered page.

#### E. Spacing & Layout Audit
For every container, card, row, and section:
- **Padding**: Match the .pen `padding` property exactly (e.g., sidebar `padding: [24, 16]` = 24px top/bottom, 16px left/right)
- **Gap**: Match the .pen `gap` property (e.g., nav items `gap: 8`, stats `gap: 16`, form fields `gap: 20`)
- **Margin**: Verify no unexpected margins are introduced
- **Width**: Fixed widths must match (sidebar 260px, form panel 520px, dialog 440-480px)
- **Height**: Fixed heights must match (top bar 56px, status bar 32px, mobile bar 48px)
- **Border radius**: Must use the correct radius variable
- **Border**: Check thickness (1px), alignment (inside), and color match

#### F. Component State Audit
- **Active navigation**: The correct sidebar item must be highlighted with `accent-primary-muted` background for the current page
- **Hover states**: Buttons, links, rows must change on hover as designed
- **Focus states**: Inputs must show `accent-primary` border on focus
- **Disabled states**: Disabled buttons must have 0.5 opacity
- **Loading states**: Skeleton loaders must use pulsing animation with `surface-tertiary` color at 0.3 opacity
- **Error states**: Error messages must use `color-error` text, error inputs must have `color-error` border

#### G. Toast & Dialog Audit
- **Toast position**: Fixed bottom-right, 24px from edges
- **Toast style**: `surface-elevated` background, `border-subtle` border, `radius-lg`, shadow
- **Dialog overlay**: `surface-overlay` background, centered dialog
- **Dialog style**: `surface-card` background, `border-subtle` border, `radius-xl`, shadow
- **Button placement**: Cancel left, destructive/primary right in dialog footers

#### H. Responsive Layout Audit
Test at three breakpoints:
- **Desktop (1440x900)**: Sidebar visible, split-pane editor, table layout
- **Tablet (768x1024)**: No sidebar, hamburger menu, top bar, card grid or tabs
- **Mobile (375x812)**: Single column, compact bar, full-width cards, tab navigation

### Step 3: Fix Every Issue Found

For each deviation found:
1. Identify the source file (`.tsx` component or `.module.css` stylesheet)
2. Read the file
3. Apply the minimal fix using the Edit tool
4. Verify the fix doesn't break other elements

Common fix patterns:
- Wrong color → Update CSS variable reference
- Wrong spacing → Update padding/gap/margin in CSS module
- Wrong font → Update fontFamily/fontSize/fontWeight
- Wrong icon → Update SVG path or icon component
- Wrong radius → Update borderRadius CSS property
- Missing border → Add border CSS property
- Wrong layout → Fix flexbox direction/alignment/justification
- Element hidden → Fix z-index, overflow, or positioning

### Step 4: Verify Fix

After each batch of fixes:
1. Confirm the web app still compiles: `cd /c/projects/Skills/web && npx tsc --noEmit`
2. Confirm the app still builds: `cd /c/projects/Skills/web && npx vite build`
3. Run the Playwright tests: `npx playwright test --project=desktop --workers=1`
4. Take screenshots of fixed pages and compare against design

### Step 5: Log Progress

After each iteration, report:
- Iteration number (1-1000)
- Number of issues found
- Number of issues fixed
- Remaining known issues
- Test results (pass/fail count)

If an iteration finds zero issues across all screens, report "Clean audit — no deviations found" and continue to the next iteration (designs can drift during fixes, so keep checking).

## Screen-by-Screen Reference

These are the .pen frame IDs for screenshot comparison:

| Screen | Frame ID | Viewport |
|--------|----------|----------|
| Login Desktop | `1byY3` | 1440x900 |
| Login Tablet | `iEf3N` | 768x1024 |
| Login Mobile | `RGnqS` | 375x812 |
| Dashboard Desktop | `xXZ2U` | 1440x900 |
| Dashboard Tablet | `vaTmf` | 768x1024 |
| Dashboard Mobile | `NybqA` | 375x812 |
| Skill Editor Desktop | `OfqgN` | 1440x900 |
| Skill Editor Tablet | `PWBpC` | 768x1024 |
| Skill Editor Mobile | `XyIDg` | 375x812 |
| Version History Desktop | `VzYo8` | 1440x900 |
| Version History Tablet | `iksD2` | 768x1024 |
| Version History Mobile | `BOlF1` | 375x812 |
| Error States | `DdUoh` | 1440x900 |
| CLI Output | `ZyBfN` | 1200x900 |
| Sharing & Dialogs | `Ao0Ws` | 1440x700 |
| Design System Components | `Ci8hM` | 2000x1200 |

## Reusable Component Reference

These are the .pen component IDs for detailed comparison:

| Component | ID | Key Properties |
|-----------|----|----------------|
| Button/Primary | `YvKoA` | accent-primary bg, radius-md, padding [10,20] |
| Button/Secondary | `lr33q` | surface-tertiary bg |
| Button/Outline | `ajquT` | border-default border, no fill |
| Button/Destructive | `24hjh` | color-error bg |
| Input/Default | `ZNXBO` | 280px wide, gap 6, vertical layout |
| Input/Error | `89xuD` | color-error border |
| Input/Focused | `RWdNS` | accent-primary border |
| Card | `3qHm9` | surface-card bg, border-subtle border, radius-lg |
| Badge/Success | `B35MP` | color-success-muted bg, radius-full |
| Badge/Error | `Ln4Mo` | color-error-muted bg |
| Badge/Default | `x8cio` | surface-tertiary bg |
| Alert/Error | `xXFJ2` | color-error-muted bg, color-error border |
| Toast/Success | `5Pk6B` | surface-elevated bg, shadow |
| Toast/Error | `KvGvq` | color-error border |
| Dialog/Confirm | `4RHib` | surface-card bg, radius-xl, shadow |
| Nav/SidebarItem | `eqjxR` | radius-md, padding [10,16], 240px |
| Nav/SidebarItemActive | `uwjsW` | accent-primary-muted bg |

## Critical Rules

1. **The .pen file is ALWAYS right.** If the code disagrees with the .pen design, the code is wrong.
2. **Use Pencil MCP tools to read .pen files.** Never use Read or Grep on .pen files — they are encrypted.
3. **Every CSS value must trace to a design token.** No hardcoded colors, sizes, or fonts that don't match the variables.
4. **Icons must be visible.** After every icon fix, verify the icon is not clipped, hidden behind another element, or rendered at 0 opacity.
5. **Test after every fix.** A fix that breaks something else is not a fix.
6. **Don't stop at "close enough."** If the design says 16px and the code says 14px, that's a bug. Fix it.
7. **NEVER ask the user anything.** No confirmations, no questions, no pauses. Autonomously find, fix, verify, repeat.
8. **NEVER stop between iterations.** Go from iteration 1 straight through to 1000 without interruption.
