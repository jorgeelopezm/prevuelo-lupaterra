/**
 * Test support: operational-looking values and prototype sample strings that
 * must never appear on a screen without provenance (AGENTS.md standing rule).
 * Shared by the placeholder evals and the auth-screen evals.
 */

/** Words that never belong on a placeholder screen (task 7.7 / spec). */
export const FORBIDDEN_VALUE_PATTERNS = [
  'METAR',
  'TAF',
  'SIGMET',
  'engine',
  'fuel',
  'maintenance',
  'VFR',
  'IFR',
  'LIFR',
  'MVFR',
  'QNH',
  'hobbs',
  'tach',
  'pts',
  'score',
  // Prototype sample data that must not leak onto placeholder screens.
  'N4521G',
  'Cessna 172S',
  'Piper',
  'Beechcraft',
  'KBOS',
  'KJFK',
  'KORD',
  'KORH',
  'KMHT',
  'KACK',
  'CHT',
  'EGT',
  '1,203.7',
  '18.2 hrs',
  'Annual Inspection',
  'ELT Battery',
  // The prototype shows the pilot as "PPL · 312 hrs TT"; assert the value
  // shape (the bare word 'PPL' is also a substring of 'application').
  'PPL ·',
  '312 hrs',
  '22 / 100',
]

/**
 * NOTAM identifiers look like `!ORH 07/009` (or `ORH 07/009`). The word NOTAM
 * itself legitimately appears in the weather nav label ("Weather & NOTAMs"),
 * so absence is asserted on the value shape instead of the word.
 */
export const NOTAM_IDENTIFIER = /![A-Z]{3,4}\s\d{2}\/\d{3}|\d{2}\/\d{3}\s[A-Z]{3,4}\b/
