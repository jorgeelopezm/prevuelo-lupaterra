// Computes WCAG 2.1 AA contrast ratios for the shell's text token pairings.
function luminance(hex) {
  const c = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
function ratio(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const canvas = '#0d1219'
const sidebar = '#070c12'
const surface = '#0f1822'
const edge = '#1a2535'
const accent = '#2563eb'

const pairs = [
  ['#ffffff', 'white on canvas', canvas],
  ['#ffffff', 'white on surface', surface],
  ['#f1f5f9', 'slate-100 on sidebar', sidebar],
  ['#e2e8f0', 'slate-200 body on canvas', canvas],
  ['#e2e8f0', 'slate-200 body on surface', surface],
  ['#cbd5e1', 'slate-300 secondary on surface', surface],
  ['#94a3b8', 'slate-400 muted on canvas', canvas],
  ['#94a3b8', 'slate-400 muted on sidebar', sidebar],
  ['#94a3b8', 'slate-400 muted on surface', surface],
  ['#64748b', 'slate-500 tertiary on sidebar', sidebar],
  ['#64748b', 'slate-500 tertiary on surface', surface],
  ['#64748b', 'slate-500 tertiary on edge', edge],
  ['#93c5fd', 'blue-300 active nav on surface', surface],
  ['#93c5fd', 'blue-300 active nav on sidebar', sidebar],
  ['#60a5fa', 'blue-400 links on surface', surface],
  ['#ffffff', 'white on accent button', accent],
  ['#6ee7b7', 'emerald-300 good chip on surface', surface],
  ['#fcd34d', 'amber-300 warn chip on surface', surface],
  ['#fca5a5', 'red-300 bad chip on surface', surface],
  ['#d8b4fe', 'purple-300 severe chip on surface', surface],
  ['#fde68a', 'amber-200 raw data on surface', surface],
  ['#475569', 'slate-600 muted meta on sidebar', sidebar],
]

for (const [fg, use, bg] of pairs) {
  const r = ratio(fg, bg)
  console.log(`${use.padEnd(36)} ${r.toFixed(2).padStart(6)}  ${r >= 4.5 ? 'AA' : r >= 3 ? 'AA-large' : 'FAIL'}`)
}
