# Sub-project 0: Mediagenix AIR Styleguide — Design Spec

**Goal:** Restyle the entire BroadcastOKR app to match the Mediagenix AIR Platform Unified Design System — dark-first, cobalt brand, IBM Plex + Space Grotesk + JetBrains Mono typography, semantic color triads, glow effects, and component patterns.

**Reference:** `/mnt/c/Projects/unified-styleguide.html`

---

## 1. Architecture Decision: Theme Object vs CSS Custom Properties

**Decision: Hybrid approach.**

- Add all styleguide design tokens as CSS custom properties in `globals.css` (`:root` block)
- Simplify the `Theme` TypeScript interface to map to these tokens
- Components continue using the `theme` object from context (avoids rewriting every component to use `var()` strings)
- CSS vars used directly for global concerns: focus rings, scrollbars, animations, body background

**Rationale:** Keeps the migration incremental. Components still get typed theme values. Future sub-projects can gradually shift to CSS vars where beneficial.

## 2. Dark-Only Mode

The styleguide defines a dark palette only. The app will:
- Default to dark mode
- Remove the light theme entirely from `themes.ts`
- Keep the `ThemeContext` and `useTheme()` API (other components depend on it)
- The `dark` boolean stays `true` always; `setDark` becomes a no-op
- PersonaPanel dark toggle removed

**Why:** The styleguide has no light-mode token definitions. Building a light mode from scratch would be speculative.

## 3. Design Token Mapping

### Fonts (index.html)
Replace DM Sans with:
```
IBM Plex Sans (300,400,500,600,700)
Space Grotesk (300,400,500,600,700)
JetBrains Mono (400,500)
```

### CSS Custom Properties (globals.css :root)
All tokens from the styleguide's `:root` block — surfaces, borders, text hierarchy, brand palette, operational palette, semantic colors, gradients, spacing, radius, shadows, glows, transitions, z-index scale.

### Theme Object Mapping (themes.ts)
| Current Theme prop | Styleguide token | Value |
|---|---|---|
| `bg` | `--bg-base` | `#0B0F19` |
| `bgCard` | `--bg-surface` | `#111827` |
| `bgCardHover` | `--bg-hover` | `#232E45` |
| `bgSidebar` | `--bg-surface` | `#111827` |
| `bgSidebarActive` | `--bg-active` | `#2A3855` |
| `bgInput` | `--bg-raised` | `#1C2333` |
| `bgMuted` | `--bg-raised` | `#1C2333` |
| `border` | `--border` | `#1F2D45` |
| `borderLight` | `--border` | `#1F2D45` |
| `borderInput` | `--border-mid` | `#2E3F5C` |
| `text` | `--text-1` | `#F0F4FF` |
| `textSecondary` | `--text-2` | `#9BAAC4` |
| `textMuted` | `--text-3` | `#5E6F8A` |
| `textFaint` | `--text-dim` | `#3D4F68` |
| `sidebarText` | `--text-3` | `#5E6F8A` |
| `sidebarTextActive` | `--cobalt-mid` | `#5B33F0` |
| `overlay` | — | `rgba(0,0,0,.7)` |
| `headerBg` | `--bg-surface` | `#111827` |
| `compliantBg` | `--teal-bg` | `#051412` |
| `compliantBorder` | `--teal-dim` | `#0F5E56` |
| `atRiskBg` | `--red-bg` | `#1A0505` |
| `atRiskBorder` | `--red-dim` | `#7A1515` |

## 4. Color Constant Updates

### Brand primary
Replace all `#4f46e5` (indigo) with `#3805E3` (cobalt) or `#5B33F0` (cobalt-mid) for:
- Primary buttons
- Active sidebar indicator
- Focus rings
- Goal creation accent

### Status/semantic colors
| Current | Styleguide | Usage |
|---|---|---|
| `#10b981` (green) | `#2DD4BF` (teal) | Success, on-track, compliant |
| `#f59e0b` (amber) | `#F59E0B` (amber) | Warning, at-risk (same) |
| `#ef4444` (red) | `#F87171` (red) | Error, overdue, behind |
| `#7c3aed` (purple) | `#A78BFA` (purple) | Goals accent |
| `#3b82f6` (blue) | `#60A5FA` (blue) | Info |

### Priority colors (constants/priorities.ts)
- Critical: `#F87171` (red)
- High: `#F59E0B` (amber)
- Medium: `#60A5FA` (blue)
- Low: `#2DD4BF` (teal)

### Role colors (constants/roles.ts)
- Owner: `#5B33F0` (cobalt-mid)
- Manager: `#2DD4BF` (teal)
- Member: `#F59E0B` (amber)

### Status colors (constants/statuses.ts)
- Backlog: `#5E6F8A` (text-3)
- Todo: `#60A5FA` (blue)
- In Progress: `#F59E0B` (amber)
- Review: `#A78BFA` (purple)
- Done: `#2DD4BF` (teal)

## 5. Typography Updates

### Body text
- Font: `'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif`
- Base size: 14px
- Line height: 1.6

### Headings (section titles, page names)
- Font: `'Space Grotesk', sans-serif`
- Weights: 600-700
- Letter-spacing: -0.5px to -1.5px

### Data/metrics (KPI values, badge text, table numbers)
- Font: `'JetBrains Mono', 'IBM Plex Mono', monospace`
- Used for: KPI values, pill/badge text, timestamps, form labels (uppercase)

### Component mapping
| Element | Font | Size |
|---|---|---|
| Page title (Header) | Space Grotesk 700 | ~24px |
| Section headers (h3 in cards) | Space Grotesk 600 | 15px |
| Body text | IBM Plex Sans 400 | 13-14px |
| Labels (form, section) | IBM Plex Sans 600, uppercase | 10.5px |
| Badge/pill text | JetBrains Mono 600 | 10.5px |
| KPI values | JetBrains Mono 600 | 28px |
| Table headers | IBM Plex Sans 600, uppercase | 10.5px |
| Table cells | IBM Plex Sans 400 | 12.5px |

## 6. Component Styling Updates

### Buttons
- Primary: `background: #3805E3`, hover: `#5B33F0` with `box-shadow: 0 4px 14px rgba(56,5,227,0.35)` and `translateY(-1px)`
- Ghost: `background: transparent`, `border: 1px solid #2E3F5C`, `color: #9BAAC4`
- Danger: `background: #1A0505`, `border: 1px solid #7A1515`, `color: #F87171`
- Small: `padding: 4px 10px`, `font-size: 11px`

### Cards
- Background: `--bg-surface` (#111827)
- Border: `1px solid --border` (#1F2D45)
- Radius: `--radius-lg` (10px)

### Form inputs
- Background: `--bg-raised` (#1C2333)
- Border: `1px solid --border` (#1F2D45)
- Focus: `border-color: #3805E3; box-shadow: 0 0 0 3px rgba(56,5,227,0.15)`
- Radius: `--radius-md` (6px)
- Font: IBM Plex Sans, 12.5px

### Pills/badges
- Use semantic triad: `background: *-bg`, `border: 1px solid *-dim`, `color: *`
- Font: JetBrains Mono, 10.5px, weight 600
- Radius: 12px (pill shape)
- Channels, task types, priorities, urgency badges all adopt this pattern

### Data tables (list view)
- Header: `--bg-raised`, uppercase, 10.5px, letter-spacing 0.8px
- Cells: 12.5px, `color: --text-2`
- Row hover: `--bg-hover`
- Border: `1px solid --border`

### Progress bars
- Track: `--bg-raised` (#1C2333)
- Height: 6px
- Fill colors: teal (on-track), amber (at-risk), red (behind)

### Sidebar
- Width: 256px (expanded) — currently 240px
- Background: `--bg-surface`
- Active item: `--bg-active` + cobalt-mid text + left accent bar (3px cobalt)
- Nav labels: 9.5px uppercase, letter-spacing 1.2px, `--text-dim`

### Modal
- Overlay: `rgba(0,0,0,.7)`
- Background: `--bg-surface`
- Border: `1px solid --border`
- Shadow: `--shadow-xl`

### Scrollbar
- Track: `--bg-base`
- Thumb: `--border-mid`, radius 3px, width 6px

## 7. Animation/Transition Updates

- Focus ring: `2px solid #3805E3` (cobalt)
- Hover transitions: `150ms cubic-bezier(0.4, 0, 0.2, 1)`
- Button hover: `translateY(-1px)` + glow shadow
- Reduced motion: respect `prefers-reduced-motion`
- Keep existing animations (urgPulse, toast, slideIn, fadeIn)
- Add `pulse-dot` animation for status dots

## 8. Files Affected

| File | Change |
|---|---|
| `index.html` | Replace font link |
| `src/styles/globals.css` | Add `:root` CSS vars, update body, scrollbar, focus ring |
| `src/types/index.ts` | No change (Theme interface stays) |
| `src/constants/themes.ts` | Update both light/dark to use styleguide dark values (effectively single theme) |
| `src/constants/priorities.ts` | Update colors |
| `src/constants/statuses.ts` | Update colors |
| `src/constants/roles.ts` | Update colors |
| `src/constants/channels.ts` | Update colors |
| `src/context/ThemeContext.tsx` | Default dark=true, simplify |
| `src/components/layout/Sidebar.tsx` | Update width, styles, active indicator |
| `src/components/layout/Header.tsx` | Update fonts, brand color |
| `src/components/layout/AppShell.tsx` | Update sidebar width reference |
| `src/components/ui/Modal.tsx` | Update shadow, border |
| `src/components/ui/ProgressBar.tsx` | Update track color |
| `src/components/ui/Avatar.tsx` | Minor color updates |
| `src/components/ui/ChannelBadge.tsx` | Adopt pill pattern with border |
| `src/components/ui/SparkLine.tsx` | No change (colors come from props) |
| `src/components/ui/UrgencyBadge.tsx` | Adopt pill pattern |
| `src/components/tasks/TaskCard.tsx` | Update card styles |
| `src/components/tasks/TaskDetailModal.tsx` | Update badge/button styles |
| `src/components/tasks/CreateTaskModal.tsx` | Update form input styles |
| `src/components/toast/ToastContainer.tsx` | Minor color updates |
| `src/components/activity/ActivityLog.tsx` | Update panel styles |
| `src/components/dev/PersonaPanel.tsx` | Remove dark toggle, update styles |
| `src/pages/DashboardPage.tsx` | Update KPI cards, stat cards, section headers font |
| `src/pages/GoalsPage.tsx` | Update card styles, button colors, badge styles |
| `src/pages/TasksPage.tsx` | Update table styles, filter selects, kanban columns |
| `src/pages/TeamPage.tsx` | Update card styles |
| `src/pages/ReportsPage.tsx` | Update chart styles, KPI display |
| `src/utils/colors.ts` | Update progress color thresholds, status icon may stay |
| `src/utils/dates.ts` | Update urgency badge colors to teal/amber/red triads |
| `src/utils/styles.ts` | Update cardStyle, selectStyle to match styleguide |

## 9. Out of Scope

- Light mode (styleguide is dark-only)
- CSS-in-JS migration (keeping inline styles + theme object)
- Logo/favicon changes
- Layout restructuring (keeping existing sidebar/header/content layout)
