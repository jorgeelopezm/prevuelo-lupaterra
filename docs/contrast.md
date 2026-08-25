# Shell color-contrast verification (WCAG 2.1 AA)

Verified for every text token pairing used in the application shell and shared
component partials (`src/views/`). Contrast ratios computed per WCAG 2.1 §1.4.3
(luminance formula). All pairings used for body text (including the 10–11px
meta labels) meet **4.5:1 AA**; the computed script is
`scripts/contrast-check.mjs`.

Surfaces (from the design tokens in `src/assets/app.css`):

| Token | Hex |
| --- | --- |
| `canvas` | `#0d1219` |
| `sidebar` | `#070c12` |
| `surface` | `#0f1822` |
| `edge` | `#1a2535` |
| `accent` | `#2563eb` |

| Foreground | Use | Background | Ratio | Verdict |
| --- | --- | --- | --- | --- |
| `#ffffff` | headings, values | canvas | 18.79 | AA |
| `#ffffff` | headings, values | surface | 17.89 | AA |
| `#f1f5f9` (slate-100) | brand | sidebar | 17.91 | AA |
| `#e2e8f0` (slate-200) | body text | canvas | 15.24 | AA |
| `#e2e8f0` (slate-200) | body text | surface | 14.51 | AA |
| `#cbd5e1` (slate-300) | secondary text | surface | 12.05 | AA |
| `#94a3b8` (slate-400) | muted text | canvas | 7.33 | AA |
| `#94a3b8` (slate-400) | muted text | sidebar | 7.65 | AA |
| `#94a3b8` (slate-400) | muted text / meta labels | surface | 6.98 | AA |
| `#93c5fd` (blue-300) | active nav / links | surface | 9.92 | AA |
| `#93c5fd` (blue-300) | active nav | sidebar | 10.88 | AA |
| `#60a5fa` (blue-400) | links | surface | 7.04 | AA |
| `#ffffff` | text on accent buttons | accent | 5.17 | AA |
| `#6ee7b7` (emerald-300) | good status chip | surface | 11.73 | AA |
| `#fcd34d` (amber-300) | warn status chip | surface | 12.40 | AA |
| `#fca5a5` (red-300) | bad status chip | surface | 9.42 | AA |
| `#d8b4fe` (purple-300) | severe status chip | surface | 10.12 | AA |
| `#fde68a` (amber-200) | raw data text | surface | 14.36 | AA |

Note: the prototype's `slate-500`/`slate-600` meta labels fail AA against these
dark surfaces (3.2–4.1:1) and are **not** used in the shell — the shared
partials use `slate-400` instead. This is a deliberate deviation from the
prototype's typographic palette, recorded here per the design-system task.
