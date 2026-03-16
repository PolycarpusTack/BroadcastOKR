# Mediagenix AIR Styleguide Application — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the BroadcastOKR app to match the Mediagenix AIR Platform Unified Design System — dark-first cobalt brand with IBM Plex + Space Grotesk + JetBrains Mono typography.

**Architecture:** Keep the existing Theme object + inline styles approach. Add CSS custom properties in globals.css for global concerns (focus, scrollbar, body). Update the Theme TypeScript object to use styleguide color values. Update all hardcoded colors across components to match the new palette.

**Tech Stack:** React 19, TypeScript, Vite 7, CSS custom properties, Google Fonts

**Spec:** `docs/superpowers/specs/2026-03-13-styleguide-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `index.html` | Font loading | Replace DM Sans with IBM Plex Sans + Space Grotesk + JetBrains Mono |
| `src/styles/globals.css` | CSS reset, vars, animations | Add `:root` design tokens, update body, scrollbar, focus ring |
| `src/constants/themes.ts` | Theme object values | Map all props to styleguide dark palette |
| `src/constants/priorities.ts` | Priority color config | Update 4 priority colors |
| `src/constants/statuses.ts` | Status color config | Update 5 status colors |
| `src/constants/roles.ts` | Role color config | Update 3 role colors |
| `src/constants/channels.ts` | Channel color config | Update 4 channel colors |
| `src/context/ThemeContext.tsx` | Theme provider | Default to dark, simplify |
| `src/utils/colors.ts` | Color utility functions | Update progress thresholds colors |
| `src/utils/dates.ts` | Urgency badge colors | Update badge bg/fg to styleguide triads |
| `src/utils/styles.ts` | Shared style helpers | Update cardStyle, selectStyle |
| `src/utils/__tests__/colors.test.ts` | Color util tests | Update expected color values |
| `src/utils/__tests__/dates.test.ts` | Date util tests | Update expected badge colors |
| `src/components/layout/Sidebar.tsx` | Sidebar nav | Update width to 256px, active indicator, fonts |
| `src/components/layout/Header.tsx` | Top header | Update fonts, brand color |
| `src/components/layout/AppShell.tsx` | Layout wrapper | Update sidebar width, body bg |
| `src/components/ui/Modal.tsx` | Dialog | Update shadow, border, overlay |
| `src/components/ui/ProgressBar.tsx` | Progress bars | Update track color |
| `src/components/ui/ChannelBadge.tsx` | Channel pills | Adopt pill border pattern |
| `src/components/ui/UrgencyBadge.tsx` | Urgency pills | Adopt pill border pattern |
| `src/components/ui/Avatar.tsx` | User avatars | Minor border/shadow update |
| `src/components/tasks/TaskCard.tsx` | Kanban card | Update card bg, font, badges |
| `src/components/tasks/TaskDetailModal.tsx` | Task detail | Update button/badge styles |
| `src/components/tasks/CreateTaskModal.tsx` | Create form | Update input/button styles |
| `src/components/toast/ToastContainer.tsx` | Toasts | Update colors |
| `src/components/activity/ActivityLog.tsx` | Activity panel | Update panel bg/border |
| `src/components/dev/PersonaPanel.tsx` | Dev panel | Remove dark toggle, update styles |
| `src/pages/DashboardPage.tsx` | Dashboard | Update stat cards, KPI cards, headings font |
| `src/pages/GoalsPage.tsx` | Goals | Update cards, buttons, badge styles |
| `src/pages/TasksPage.tsx` | Tasks | Update table, kanban, filter styles |
| `src/pages/TeamPage.tsx` | Team | Update cards, stat display |
| `src/pages/ReportsPage.tsx` | Reports | Update chart bars, KPI display |

---

## Chunk 1: Foundation (Fonts, CSS vars, Theme, Constants)

### Task 1: Update fonts in index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace the Google Fonts link**

Replace line 8:
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap" rel="stylesheet">
```
With:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Verify** — Run `npx vite --open`, confirm fonts load in Network tab (3 font families).

---

### Task 2: Add CSS custom properties and update globals.css

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add `:root` block with all design tokens**

Add after the `@import "tailwindcss";` line (before `@layer base`):

```css
:root {
  /* Surface System */
  --bg-base: #0B0F19;
  --bg-surface: #111827;
  --bg-raised: #1C2333;
  --bg-hover: #232E45;
  --bg-active: #2A3855;

  /* Borders */
  --border: #1F2D45;
  --border-mid: #2E3F5C;
  --border-hi: #3D5070;

  /* Text Hierarchy */
  --text-1: #F0F4FF;
  --text-2: #9BAAC4;
  --text-3: #5E6F8A;
  --text-dim: #3D4F68;

  /* Brand */
  --cobalt: #3805E3;
  --cobalt-mid: #5B33F0;
  --neon-green: #B3FC4F;

  /* Operational */
  --amber: #F59E0B;
  --amber-dim: #78490A;
  --amber-bg: #1A1205;
  --teal: #2DD4BF;
  --teal-dim: #0F5E56;
  --teal-bg: #051412;
  --red: #F87171;
  --red-dim: #7A1515;
  --red-bg: #1A0505;
  --blue: #60A5FA;
  --blue-dim: #1E3A6B;
  --blue-bg: #050D1A;
  --purple: #A78BFA;
  --purple-dim: #3D2070;
  --purple-bg: #0A0515;

  /* Semantic */
  --success: #10B981;
  --warning: #F59E0B;
  --error: #EF4444;
  --info: #3B82F6;

  /* Typography */
  --font-sans: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-head: 'Space Grotesk', sans-serif;
  --font-mono: 'JetBrains Mono', 'IBM Plex Mono', monospace;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;
  --radius-xl: 14px;

  /* Shadows */
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 20px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 40px rgba(0,0,0,0.5);
  --shadow-xl: 0 24px 64px rgba(0,0,0,0.6);

  /* Glows */
  --glow-cobalt: 0 0 20px rgba(56,5,227,0.3), 0 0 40px rgba(56,5,227,0.1);

  /* Transitions */
  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
}
```

- [ ] **Step 2: Update body styles in `@layer base`**

Replace the body block:
```css
body {
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  background: var(--bg-base);
  color: var(--text-1);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 3: Update focus-visible**

Replace:
```css
:focus-visible {
  outline: 2px solid var(--cobalt);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Add scrollbar styles and reduced motion**

Add after the `@layer base` block:
```css
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg-base); }
::-webkit-scrollbar-thumb { background: var(--border-mid); border-radius: 3px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: Update skip-link colors**

Replace `.skip-link` background:
```css
.skip-link {
  /* ... keep positioning ... */
  background: var(--cobalt);
  /* ... rest unchanged ... */
}
```

- [ ] **Step 6: Verify** — Run `npx vite --open`, body should show dark background (#0B0F19), IBM Plex Sans font.

---

### Task 3: Update Theme object

**Files:**
- Modify: `src/constants/themes.ts`

- [ ] **Step 1: Replace entire file content**

```ts
import type { Theme } from '../types';

const DARK: Theme = {
  bg: '#0B0F19',
  bgCard: '#111827',
  bgCardHover: '#232E45',
  bgSidebar: '#111827',
  bgSidebarActive: '#2A3855',
  bgInput: '#1C2333',
  bgMuted: '#1C2333',
  border: '#1F2D45',
  borderLight: '#1F2D45',
  borderInput: '#2E3F5C',
  text: '#F0F4FF',
  textSecondary: '#9BAAC4',
  textMuted: '#5E6F8A',
  textFaint: '#3D4F68',
  sidebarText: '#5E6F8A',
  sidebarTextActive: '#5B33F0',
  overlay: 'rgba(0,0,0,.7)',
  headerBg: '#111827',
  compliantBg: '#051412',
  compliantBorder: '#0F5E56',
  atRiskBg: '#1A0505',
  atRiskBorder: '#7A1515',
};

export const THEMES: { light: Theme; dark: Theme } = {
  light: DARK,
  dark: DARK,
};
```

- [ ] **Step 2: Verify** — Run `npx tsc --noEmit`. Zero errors.

---

### Task 4: Update color constants

**Files:**
- Modify: `src/constants/priorities.ts`
- Modify: `src/constants/statuses.ts`
- Modify: `src/constants/roles.ts`
- Modify: `src/constants/channels.ts`

- [ ] **Step 1: Update priorities.ts colors**

```
critical: color '#F87171' (was #ef4444)
high:     color '#F59E0B' (unchanged)
medium:   color '#60A5FA' (was #eab308)
low:      color '#2DD4BF' (was #22c55e)
```

- [ ] **Step 2: Update statuses.ts colors**

Read the file first to find the `STATUS_COLORS` record, then update:
```
backlog:     '#5E6F8A' (was #94a3b8)
todo:        '#60A5FA' (was #3b82f6)
in_progress: '#F59E0B' (was #f59e0b — unchanged)
review:      '#A78BFA' (was #8b5cf6)
done:        '#2DD4BF' (was #10b981)
```

- [ ] **Step 3: Update roles.ts colors**

```
owner:   '#5B33F0' (was #4f46e5)
manager: '#2DD4BF' (was #059669)
member:  '#F59E0B' (was #f59e0b — unchanged)
```

- [ ] **Step 4: Update channels.ts colors**

Read the file to see current channel colors, then update to styleguide palette:
```
VRT 1:         '#60A5FA' (blue)
VRT Canvas:    '#A78BFA' (purple)
VRT MAX:       '#F87171' (red)
VRT NWS FAST:  '#F59E0B' (amber)
```

- [ ] **Step 5: Verify** — Run `npx tsc --noEmit`. Zero errors.

---

### Task 5: Update ThemeContext to default dark

**Files:**
- Modify: `src/context/ThemeContext.tsx`

- [ ] **Step 1: Change default dark state**

Change line 14:
```ts
const [dark, setDark] = useState(true);
```
(was `useState(false)`)

- [ ] **Step 2: Verify** — Run `npx tsc --noEmit`. Zero errors.

---

### Task 6: Update color utility functions and tests

**Files:**
- Modify: `src/utils/colors.ts`
- Modify: `src/utils/__tests__/colors.test.ts`

- [ ] **Step 1: Read `src/utils/colors.ts`** to see current `progressColor` implementation.

- [ ] **Step 2: Update `progressColor` return values**

The function returns colors based on progress thresholds. Update:
```
>= 0.7: '#2DD4BF' (teal, was #10b981)
>= 0.4: '#F59E0B' (amber, was #f59e0b — may be unchanged)
< 0.4:  '#F87171' (red, was #ef4444)
```

- [ ] **Step 3: Update `kpiStatus` return colors**

```
'On Track': '#2DD4BF' (teal)
'At Risk':  '#F59E0B' (amber)
'Off':      '#F87171' (red)
```

- [ ] **Step 4: Update test expectations in `src/utils/__tests__/colors.test.ts`**

Read the test file. Update all color assertions to match new values. For example:
- `expect(progressColor(0.8)).toBe('#2DD4BF')` (was #10b981)
- `expect(kpiStatus(...).color).toBe('#2DD4BF')` (was #10b981)

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/utils/__tests__/colors.test.ts
```
Expected: All 13 tests pass.

---

### Task 7: Update urgency badge colors and tests

**Files:**
- Modify: `src/utils/dates.ts`
- Modify: `src/utils/__tests__/dates.test.ts`

- [ ] **Step 1: Read `src/utils/dates.ts`** and update `getUrgencyBadge` colors.

Update the return objects to use styleguide semantic triads:
```ts
// Not finite (invalid): neutral
{ text: '--', bg: '#1C2333', fg: '#5E6F8A', pulse: false }

// Overdue (< 0): red
{ text: '...d overdue', bg: '#F87171', fg: '#fff', pulse: true }

// Today (0): red
{ text: 'TODAY', bg: '#F87171', fg: '#fff', pulse: true }

// Tomorrow (1): amber
{ text: 'Tomorrow', bg: '#F59E0B', fg: '#000', pulse: false }

// 2-3 days: amber
{ text: '...d', bg: '#F59E0B', fg: '#000', pulse: false }

// 4-7 days: amber-dim/amber (dark always now)
{ text: '...d', bg: '#78490A', fg: '#F59E0B', pulse: false }

// 8+ days: neutral
{ text: '...d', bg: '#1C2333', fg: '#5E6F8A', pulse: false }
```

Since the app is now dark-only, remove the `dark` parameter branching — just use the dark values. The function signature stays the same for compatibility (`dark: boolean`) but the `dark` parameter is ignored (always uses dark palette).

- [ ] **Step 2: Update test expectations in `src/utils/__tests__/dates.test.ts`**

Update the dark theme test and any color-specific assertions.

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/utils/__tests__/dates.test.ts
```
Expected: All 9 tests pass.

---

### Task 8: Update shared style helpers

**Files:**
- Modify: `src/utils/styles.ts`

- [ ] **Step 1: Read `src/utils/styles.ts`** to see `cardStyle` and `selectStyle`.

- [ ] **Step 2: Update `cardStyle`**

```ts
export function cardStyle(theme: Theme): CSSProperties {
  return {
    background: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: 10,  // --radius-lg
    padding: '20px',
  };
}
```

- [ ] **Step 3: Update `selectStyle`**

```ts
export function selectStyle(theme: Theme): CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: 6,  // --radius-md
    border: `1px solid ${theme.border}`,
    background: theme.bgInput,
    color: theme.text,
    fontSize: '12.5px',
    fontFamily: "'IBM Plex Sans', sans-serif",
    outline: 'none',
  };
}
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit`. Zero errors.

- [ ] **Step 5: Commit**

```bash
git add index.html src/styles/globals.css src/constants/themes.ts src/constants/priorities.ts src/constants/statuses.ts src/constants/roles.ts src/constants/channels.ts src/context/ThemeContext.tsx src/utils/colors.ts src/utils/__tests__/colors.test.ts src/utils/dates.ts src/utils/__tests__/dates.test.ts src/utils/styles.ts
git commit -m "feat: apply Mediagenix AIR foundation — tokens, fonts, theme, colors"
```

---

## Chunk 2: Layout Components (Sidebar, Header, AppShell, Modal)

### Task 9: Update Sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Read `src/components/layout/Sidebar.tsx`** fully.

- [ ] **Step 2: Update sidebar width**

Change expanded width from `240` to `256`. Collapsed width stays at `64`.

- [ ] **Step 3: Update nav item fonts and styles**

For the sidebar brand/logo area at top:
- Font: `fontFamily: "'Space Grotesk', sans-serif"` for the app name
- Brand icon: use cobalt gradient background

For nav section labels (e.g., "NAVIGATION"):
- `fontSize: '9.5px'`
- `textTransform: 'uppercase'`
- `letterSpacing: '1.2px'`
- `color: '#3D4F68'` (text-dim)
- `fontWeight: 600`

For nav items:
- `fontSize: '12.5px'`
- `fontWeight: 500`
- `fontFamily: "'IBM Plex Sans', sans-serif"`

For active nav item:
- `background: '#2A3855'` (bg-active)
- `color: '#5B33F0'` (cobalt-mid)
- Add left accent bar: a `::before` pseudo or a div with `width: 3px, height: 16px, background: '#3805E3', borderRadius: '0 2px 2px 0'`
  Since we're using inline styles, add a small div before the icon.

- [ ] **Step 4: Update all hardcoded color values**

Replace:
- `#4f46e5` → `#3805E3` (cobalt) or `#5B33F0` (cobalt-mid) for accents
- `#10b981` → `#2DD4BF` (teal) for success indicators
- Any remaining indigo references

- [ ] **Step 5: Verify visually** — Run dev server, check sidebar renders with new colors and fonts.

---

### Task 10: Update Header

**Files:**
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Read `src/components/layout/Header.tsx`** fully.

- [ ] **Step 2: Update page title font**

The header shows the current page name. Update to:
- `fontFamily: "'Space Grotesk', sans-serif"`
- `fontWeight: 700`
- `letterSpacing: '-0.5px'`

- [ ] **Step 3: Update brand colors**

Replace `#4f46e5` references with `#3805E3` (cobalt).

- [ ] **Step 4: Update task count badge**

If there's a task count badge, use the pill pattern:
- `fontFamily: "'JetBrains Mono', monospace"`
- `fontSize: '10.5px'`
- `fontWeight: 600`

- [ ] **Step 5: Verify visually.**

---

### Task 11: Update AppShell

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Read `src/components/layout/AppShell.tsx`** fully.

- [ ] **Step 2: Update sidebar width reference**

Change the content area margin-left from `240` to `256` (matching new sidebar width).

- [ ] **Step 3: Update any hardcoded colors**

Replace any `#4f46e5` → `#3805E3`.

- [ ] **Step 4: Verify visually** — Content area should start at 256px from left.

---

### Task 12: Update Modal

**Files:**
- Modify: `src/components/ui/Modal.tsx`

- [ ] **Step 1: Read `src/components/ui/Modal.tsx`** fully.

- [ ] **Step 2: Update modal styles**

- Overlay: `rgba(0,0,0,.7)` (already correct from theme)
- Modal panel:
  - `background: theme.bgCard` (now #111827)
  - `border: 1px solid ${theme.border}` (now #1F2D45)
  - `borderRadius: 10` (radius-lg)
  - `boxShadow: '0 24px 64px rgba(0,0,0,0.6)'` (shadow-xl)
- Title font: `fontFamily: "'Space Grotesk', sans-serif"`, `fontWeight: 600`

- [ ] **Step 3: Verify** — Open any modal (create task), confirm dark styling.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Header.tsx src/components/layout/AppShell.tsx src/components/ui/Modal.tsx
git commit -m "feat: apply Mediagenix AIR layout — sidebar, header, modal"
```

---

## Chunk 3: UI Components (Badges, Progress, Avatar, Toast, Activity, PersonaPanel)

### Task 13: Update ChannelBadge to pill pattern

**Files:**
- Modify: `src/components/ui/ChannelBadge.tsx`

- [ ] **Step 1: Read `src/components/ui/ChannelBadge.tsx`** fully.

- [ ] **Step 2: Update styling to match styleguide pill pattern**

```ts
// The pill pattern: bg is channel color at 12% opacity, border at 30%, text is the color
style={{
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 9px',
  borderRadius: 12,
  fontSize: '10.5px',
  fontWeight: 600,
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: '0.3px',
  background: channel.color + '1F',  // ~12% opacity
  border: `1px solid ${channel.color}4D`,  // ~30% opacity
  color: channel.color,
  whiteSpace: 'nowrap',
}}
```

- [ ] **Step 3: Verify** — Check channel badges on Dashboard, Tasks pages.

---

### Task 14: Update UrgencyBadge to pill pattern

**Files:**
- Modify: `src/components/ui/UrgencyBadge.tsx`

- [ ] **Step 1: Read `src/components/ui/UrgencyBadge.tsx`** fully.

- [ ] **Step 2: Update styling**

Apply the same pill pattern with mono font:
```ts
fontFamily: "'JetBrains Mono', monospace",
fontSize: '10.5px',
fontWeight: 600,
borderRadius: 12,
```

The colors come from `getUrgencyBadge()` (already updated in Task 7), but add border: `1px solid` with slightly transparent version of bg color.

- [ ] **Step 3: Verify** — Check urgency badges on task cards and dashboard urgent tasks.

---

### Task 15: Update ProgressBar

**Files:**
- Modify: `src/components/ui/ProgressBar.tsx`

- [ ] **Step 1: Read `src/components/ui/ProgressBar.tsx`** fully.

- [ ] **Step 2: Update track background**

Change the track background to use `#1C2333` (bg-raised) instead of the theme's bgMuted. Since both now map to the same value, this may already be correct — verify and update if needed.

Default height should be `6` (styleguide's progress-bar height). Border radius: `3`.

- [ ] **Step 3: Verify** — Check progress bars on Dashboard goals and Reports page.

---

### Task 16: Update Avatar

**Files:**
- Modify: `src/components/ui/Avatar.tsx`

- [ ] **Step 1: Read `src/components/ui/Avatar.tsx`** fully.

- [ ] **Step 2: Minor updates**

- Font: `fontFamily: "'IBM Plex Sans', sans-serif"`
- Border: `2px solid #1F2D45` (border token, for contrast against dark bg)

- [ ] **Step 3: Verify** — Check avatars on team page and task cards.

---

### Task 17: Update ToastContainer

**Files:**
- Modify: `src/components/toast/ToastContainer.tsx`

- [ ] **Step 1: Read `src/components/toast/ToastContainer.tsx`** fully.

- [ ] **Step 2: Update toast styling**

- Border radius: `10` (radius-lg)
- Font: `fontFamily: "'IBM Plex Sans', sans-serif"`
- Add subtle border: `1px solid rgba(255,255,255,0.1)`
- Shadow: `0 8px 40px rgba(0,0,0,0.5)` (shadow-lg)

- [ ] **Step 3: Verify** — Trigger a toast (create a task), confirm styling.

---

### Task 18: Update ActivityLog panel

**Files:**
- Modify: `src/components/activity/ActivityLog.tsx`

- [ ] **Step 1: Read `src/components/activity/ActivityLog.tsx`** fully.

- [ ] **Step 2: Update panel styling**

- Background: `#111827` (bg-surface)
- Border: `1px solid #1F2D45`
- Title font: `fontFamily: "'Space Grotesk', sans-serif"`
- Timestamp font: `fontFamily: "'JetBrains Mono', monospace"`, `fontSize: '10.5px'`

- [ ] **Step 3: Verify** — Open activity log, check styling.

---

### Task 19: Update PersonaPanel (remove dark toggle)

**Files:**
- Modify: `src/components/dev/PersonaPanel.tsx`

- [ ] **Step 1: Read `src/components/dev/PersonaPanel.tsx`** fully.

- [ ] **Step 2: Remove the dark mode toggle**

Find the dark mode toggle button/switch and remove it. The app is now dark-only. Keep persona switching and stress test functionality.

- [ ] **Step 3: Update panel styling**

- Background: `#111827` (bg-surface)
- Border: `1px solid #1F2D45`
- Button colors: cobalt primary (`#3805E3`)

- [ ] **Step 4: Verify** — Open dev panel (should still work, minus dark toggle).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ChannelBadge.tsx src/components/ui/UrgencyBadge.tsx src/components/ui/ProgressBar.tsx src/components/ui/Avatar.tsx src/components/toast/ToastContainer.tsx src/components/activity/ActivityLog.tsx src/components/dev/PersonaPanel.tsx
git commit -m "feat: apply Mediagenix AIR UI components — pills, badges, progress, toast"
```

---

## Chunk 4: Task Components

### Task 20: Update TaskCard

**Files:**
- Modify: `src/components/tasks/TaskCard.tsx`

- [ ] **Step 1: Read `src/components/tasks/TaskCard.tsx`** fully.

- [ ] **Step 2: Update card styles**

- Background: `theme.bgCard` (#111827)
- Border: `1px solid ${theme.border}` (#1F2D45)
- Border radius: `10` (radius-lg)
- Hover: `background: theme.bgCardHover` (#232E45)
- Title font: `fontFamily: "'IBM Plex Sans', sans-serif"`, `fontWeight: 600`

- [ ] **Step 3: Update any hardcoded badge/pill colors**

Any inline badge styles should use the pill pattern with mono font.

- [ ] **Step 4: Verify** — Check kanban board, cards should have dark surface bg with subtle border.

---

### Task 21: Update TaskDetailModal

**Files:**
- Modify: `src/components/tasks/TaskDetailModal.tsx`

- [ ] **Step 1: Read `src/components/tasks/TaskDetailModal.tsx`** fully.

- [ ] **Step 2: Update status move buttons**

The "Move to" buttons should use the ghost button pattern:
- `background: transparent`
- `border: 1px solid ${STATUS_COLORS[s]}4D` (30% opacity)
- `color: STATUS_COLORS[s]`
- On these buttons, add hover translateY(-1px) if desired (optional, inline styles can't do :hover)

- [ ] **Step 3: Update subtask checkbox styling**

- Checked: `background: '#2DD4BF'` (teal, was #10b981)
- Border: `2px solid ${sub.done ? '#2DD4BF' : '#2E3F5C'}` (teal or border-mid)

- [ ] **Step 4: Verify** — Open a task detail, check all badges and buttons.

---

### Task 22: Update CreateTaskModal

**Files:**
- Modify: `src/components/tasks/CreateTaskModal.tsx`

- [ ] **Step 1: Read `src/components/tasks/CreateTaskModal.tsx`** fully.

- [ ] **Step 2: Update form input styles**

All inputs and selects should use:
- `background: '#1C2333'` (bg-raised)
- `border: 1px solid #1F2D45` (border)
- `borderRadius: 6` (radius-md)
- `fontSize: '12.5px'`
- `fontFamily: "'IBM Plex Sans', sans-serif"`

Form labels:
- `fontSize: '10.5px'`
- `textTransform: 'uppercase'`
- `letterSpacing: '0.6px'`
- `fontWeight: 600`

- [ ] **Step 3: Update primary button**

"Create Task" button:
- `background: '#3805E3'` (cobalt)
- `fontWeight: 600`

- [ ] **Step 4: Verify** — Open create task modal, check form styling.

- [ ] **Step 5: Commit**

```bash
git add src/components/tasks/TaskCard.tsx src/components/tasks/TaskDetailModal.tsx src/components/tasks/CreateTaskModal.tsx
git commit -m "feat: apply Mediagenix AIR task components — cards, detail, create form"
```

---

## Chunk 5: Page Components

### Task 23: Update DashboardPage

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Read `src/pages/DashboardPage.tsx`** fully.

- [ ] **Step 2: Update stat card icons**

The stat card icon circles should use cobalt gradient or semantic colors:
- Total Goals: `#5B33F0` (cobalt-mid)
- Active Tasks: `#2DD4BF` (teal)
- In Progress: `#F59E0B` (amber)
- Completed: `#2DD4BF` (teal)

- [ ] **Step 3: Update section headings**

All `<h3>` elements:
- `fontFamily: "'Space Grotesk', sans-serif"`
- `fontWeight: 600`
- `letterSpacing: '-0.3px'`

- [ ] **Step 4: Update KPI card font**

KPI values/numbers should use mono font:
- `fontFamily: "'JetBrains Mono', monospace"`

KPI names should use the card-title pattern:
- `fontFamily: "'Space Grotesk', sans-serif"`, `fontSize: '13px'`, `fontWeight: 600`

- [ ] **Step 5: Update hardcoded colors**

Replace:
- `#4f46e5` → `#5B33F0` (cobalt-mid)
- `#059669` → `#2DD4BF` (teal)
- `#7c3aed` → `#A78BFA` (purple)

- [ ] **Step 6: Verify** — Check dashboard renders with new colors and fonts.

---

### Task 24: Update GoalsPage

**Files:**
- Modify: `src/pages/GoalsPage.tsx`

- [ ] **Step 1: Read `src/pages/GoalsPage.tsx`** fully.

- [ ] **Step 2: Update "New Goal" button**

- `background: '#3805E3'` (cobalt, was #4f46e5)

- [ ] **Step 3: Update goal card styles**

- Border radius: `14` → `10` (radius-lg — was already 14/radius-xl, standardize to lg)
- Actually keep 14 (radius-xl) for major cards — this is fine

- [ ] **Step 4: Update create goal modal styles**

Form labels and inputs: same patterns as Task 22 (form inputs).
"Create Goal" button: `background: '#3805E3'` (cobalt).
KR labels: uppercase, 10.5px.

- [ ] **Step 5: Update check-in button**

- `background: '#2DD4BF'` (teal, was #10b981)

- [ ] **Step 6: Replace hardcoded colors**

- `#4f46e5` → `#3805E3` (primary buttons)
- `#10b981` → `#2DD4BF` (check-in, success)

- [ ] **Step 7: Verify** — Check goals page, expand a goal, check KR section.

---

### Task 25: Update TasksPage

**Files:**
- Modify: `src/pages/TasksPage.tsx`

- [ ] **Step 1: Read `src/pages/TasksPage.tsx`** fully.

- [ ] **Step 2: Update view toggle buttons**

Active view button:
- `background: '#3805E3'` (cobalt, was #4f46e5)

- [ ] **Step 3: Update kanban column headers**

Status dot glow effect (optional enhancement):
- Add `boxShadow` matching status color at 50% opacity, 6px spread

Column header label:
- `fontFamily: "'IBM Plex Sans', sans-serif"`, `fontWeight: 700`

- [ ] **Step 4: Update list view table**

Table headers:
- `background: '#1C2333'` (bg-raised)
- `fontSize: '10.5px'`
- `textTransform: 'uppercase'`
- `letterSpacing: '0.8px'`
- `fontWeight: 600`

Table rows hover:
- `background: '#232E45'` (bg-hover) — since inline styles can't do :hover, skip this or keep current approach

- [ ] **Step 5: Update "New Task" button**

- `background: '#3805E3'` (cobalt)

- [ ] **Step 6: Verify** — Check both kanban and list views.

---

### Task 26: Update TeamPage

**Files:**
- Modify: `src/pages/TeamPage.tsx`

- [ ] **Step 1: Read `src/pages/TeamPage.tsx`** fully.

- [ ] **Step 2: Update section headings**

- `fontFamily: "'Space Grotesk', sans-serif"`, `fontWeight: 600`

- [ ] **Step 3: Update stat numbers**

Member stat numbers (total tasks, active, done):
- `fontFamily: "'JetBrains Mono', monospace"`

- [ ] **Step 4: Replace hardcoded colors**

Replace any remaining `#4f46e5`, `#10b981`, etc.

- [ ] **Step 5: Verify** — Check team page renders correctly.

---

### Task 27: Update ReportsPage

**Files:**
- Modify: `src/pages/ReportsPage.tsx`

- [ ] **Step 1: Read `src/pages/ReportsPage.tsx`** fully.

- [ ] **Step 2: Update summary stat cards**

Icon circle colors:
- Completion Rate: `#2DD4BF` (teal, was #10b981)
- Total Tasks: `#5B33F0` (cobalt-mid, was #4f46e5)
- Overdue: keep red conditional logic, use `#F87171`
- Goals Tracked: `#A78BFA` (purple, was #7c3aed)

Stat values:
- `fontFamily: "'JetBrains Mono', monospace"` for the numbers

- [ ] **Step 3: Update section headings**

- `fontFamily: "'Space Grotesk', sans-serif"`, `fontWeight: 600`

- [ ] **Step 4: Update KPI card fonts**

Same as dashboard KPI cards:
- Values: mono font
- Names: Space Grotesk

- [ ] **Step 5: Update compliance badges**

"Compliant" / "At Risk" badges should use pill pattern:
- Compliant: `background: '#051412'`, `border: 1px solid #0F5E56`, `color: '#2DD4BF'`
- At Risk: `background: '#1A0505'`, `border: 1px solid #7A1515`, `color: '#F87171'`

- [ ] **Step 6: Verify** — Check reports page (switch to owner persona if needed for permissions).

- [ ] **Step 7: Commit**

```bash
git add src/pages/DashboardPage.tsx src/pages/GoalsPage.tsx src/pages/TasksPage.tsx src/pages/TeamPage.tsx src/pages/ReportsPage.tsx
git commit -m "feat: apply Mediagenix AIR page styles — dashboard, goals, tasks, team, reports"
```

---

## Chunk 6: Final Verification

### Task 28: Full test suite and type check

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript compilation**

```bash
npx tsc --noEmit
```
Expected: Zero errors.

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```
Expected: All tests pass. If WSL2 worker timeouts occur, run test groups separately:
```bash
npx vitest run src/utils/__tests__/
npx vitest run src/store/__tests__/
npx vitest run src/components/__tests__/ src/pages/__tests__/
```

- [ ] **Step 3: Visual smoke test**

Run `npx vite --open` and manually check:
1. Dashboard: dark bg, cobalt accents, teal/amber/red status colors, Space Grotesk headings, mono KPI values
2. Goals: expand a goal, check KR badges, check-in button is teal
3. Tasks: kanban view (dark cards, colored status dots), list view (dark table with uppercase headers), create task modal (dark inputs, cobalt button)
4. Team: member cards with role colors
5. Reports: switch to owner persona, verify charts, compliance badges
6. Sidebar: 256px width, cobalt active indicator, Space Grotesk app name
7. Toasts: create a task, verify toast styling

- [ ] **Step 4: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: styleguide application polish and fixups"
```
