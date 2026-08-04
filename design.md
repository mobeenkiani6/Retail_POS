# Nycto Retail POS — Design System

Source of truth for visual language across the POS. Tokens live in `frontend/src/index.css` (`@theme`). Prefer those CSS variables / Tailwind classes over one-off hex values.

## Brand

| Item | Value |
|------|--------|
| Product name | **Nycto Retail** |
| Tagline | Enterprise POS Platform |
| Positioning | Modern SaaS retail terminal — zinc neutrals, blue accent, soft elevation |

Do not revive legacy “Soot Shoot” charcoal/gold styling (`soot-*`, `brand-*`, `gold-*` in `tailwind.config.ts` / unused `BaseLayout`) on new screens.

## Principles

1. **One composition** — each screen has a clear purpose; avoid dashboard clutter on transactional pages (checkout, GRN).
2. **Token first** — use `accent-*`, `neutral-*`, `surface`, `canvas`, `border`, `muted`, semantic colors.
3. **Soft, not heavy** — prefer `shadow-soft` / `rounded-xl`–`rounded-2xl` over deep multi-layer shadows.
4. **Light and dark** — support both via `.dark` surface overrides; never hard-code only one mode.
5. **Touch-friendly** — interactive controls meet `.touch-target` (44×44px) where operators tap.

## Color

### Accent (primary actions)

| Token | Hex | Use |
|-------|-----|-----|
| `accent-50` … `accent-400` | `#eff6ff` → `#60a5fa` | Soft fills, focus rings |
| `accent-500` | `#3b82f6` | Highlights, icons |
| `accent-600` | `#2563eb` | **Primary CTAs** |
| `accent-700` | `#1d4ed8` | Hover / pressed |
| `accent-800` … `900` | `#1e40af` → `#1e3a8a` | Emphasis text |

### Neutrals (zinc)

`neutral-950` `#09090b` → `neutral-50` `#fafafa`

### Semantic

| Token | Hex |
|-------|-----|
| `success` | `#10b981` (+ `success-soft`) |
| `warning` | `#f59e0b` (+ `warning-soft`) |
| `danger` | `#ef4444` (+ `danger-soft`) |
| `info` | `#3b82f6` (+ `info-soft`) |

### Surfaces

| Token | Light | Dark (`.dark`) |
|-------|-------|----------------|
| `canvas` | `#f4f4f5` | `#09090b` |
| `canvas-subtle` | `#fafafa` | `#0f0f12` |
| `surface` | `#ffffff` | `#18181b` |
| `surface-elevated` | `#ffffff` | `#1f1f23` |
| `border` | `#e4e4e7` | `#27272a` |
| `foreground` | `#18181b` | `#fafafa` |
| `foreground-secondary` | `#52525b` | `#a1a1aa` |
| `muted` | `#71717a` | `#a1a1aa` |

## Typography

| Role | Stack |
|------|--------|
| UI / body | `"Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif` (`font-sans`) |
| Mono (IDs, SKUs, UUIDs) | `"JetBrains Mono", "SF Mono", ui-monospace, monospace` (`font-mono`) |

Guidelines:

- Page titles: `text-2xl` / `text-3xl`, `font-bold`, `tracking-tight`
- Section labels: small caps style via `text-xs font-semibold uppercase tracking-wider text-muted`
- Body: `text-sm` / `text-base`, `text-foreground` / `text-muted`
- Prefer `.text-gradient` for rare hero emphasis only (auth / marketing), not in dense POS tables

## Radius & elevation

| Token | Value |
|-------|--------|
| `rounded-sm` … `2xl` | `0.5rem` → `1.5rem` |
| Cards / modals | `rounded-xl` or `rounded-2xl` |
| Inputs / buttons | `rounded-xl` / `rounded-lg` |

Shadows: `shadow-xs`, `shadow-soft`, `shadow-md`, `shadow-lg`, `shadow-glass`, `shadow-glow` — use soft elevation by default.

## Layout

- App chrome: `AppShell` — ~260px left nav, brand mark, role-filtered links, theme toggle
- Page padding: `p-6 lg:p-8`; section gaps `gap-4` / `gap-6`; header margin `mb-8`
- Auth: `AuthLayout` — ambient accent blurs + glass panel; keep marketing copy short

## Components (`src/components/ui/`)

Reuse before inventing:

| Component | Role |
|-----------|------|
| `Button` | Primary / secondary / danger actions |
| `Input`, `SearchInput` | Forms (or `.input-base` / `.input-search`) |
| `Card` / `.surface-card` | Content surfaces |
| `Modal` | Focused dialogs |
| `PageHeader` | Title + actions row |
| `Badge`, `StatusBadge` | Status chips |
| `StatCard` | KPI tiles (ops / BI only) |
| `DataTable`, `EmptyState`, `Skeleton` | Lists & loading |
| `AuthLayout` | Login / setup |

Icons: **lucide-react** only. Motion: **Framer Motion** for intentional enter/exit — not decorative noise.

## Utility classes (do use)

- `.surface-card` — bordered elevated panel
- `.glass-card` — blurred auth / overlay panels
- `.input-base`, `.input-search`
- `.touch-target`
- `.text-gradient`
- Animations: `.animate-fade-in`, `.animate-scale-in`, `.animate-slide-in`, `.animate-shimmer`

## Theme toggle

`useTheme` / `ThemeProvider`: `light` | `dark` | `system`. Toggle lives in shell and auth.

## Branch / POS scoping (product UX)

This POS is **single-branch**. Surfaces that mention branches should:

- Show one branch name + hex id (settings)
- Never offer branch switchers or “create another branch”
- Treat the hex id as admin-panel identity (mono, copyable)

## Do / Don’t

**Do**

- Match accent `#2563eb` CTAs and zinc canvas
- Keep checkout and inventory dense but scannable
- Use semantic soft backgrounds for alerts (`*-soft`)

**Don’t**

- Introduce purple/indigo gradient themes, terracotta cream, or broadsheet newspaper layouts
- Add card stacks in heroes / auth for decoration
- Use undefined legacy classes (`brand-*`, `gold-*`, `soot-*`) on live routes
- Mix int branch IDs into UI copy — always hex id strings

## File map

| Concern | Path |
|---------|------|
| Tokens & utilities | `frontend/src/index.css` |
| Theme hook | `frontend/src/hooks/useTheme.ts` |
| Shell | `frontend/src/layouts/AppShell.tsx` |
| UI kit | `frontend/src/components/ui/` |

When adding UI, update this document only if tokens or principles change — not for every screen.
