import type { EngineChannel } from '../../../../platform/fleet/types.js'
import type { ChannelMapResult, EngineDataFormat } from './types.js'

/**
 * Generic header-name matcher: the fallback format used when no
 * manufacturer-specific detector claims the file (design decision 9 — a
 * named JPI/Garmin/Dynon-class detector needs a real export sample to build
 * against; only this generic one ships in this change, deliberately, per
 * `design.md`'s open question). Recognizes the channel-name conventions
 * common across engine-monitor CSV exports: `CHT1`..`CHT6`, `EGT1`..`EGT6`,
 * oil temperature/pressure, RPM, manifold pressure, fuel flow/remaining, bus
 * voltage, and outside air temperature — with an optional trailing unit in
 * parentheses, e.g. `CHT1(F)`.
 */
const TIME_PATTERN = /^(time|sec|secs|seconds|elapsed)$/i

interface Rule {
  pattern: RegExp
  key: string
  label: string
  defaultUnit: string
  perCylinder: boolean
}

const RULES: Rule[] = [
  { pattern: /^cht\s*(\d)?$/i, key: 'cht', label: 'CHT', defaultUnit: '°F', perCylinder: true },
  { pattern: /^egt\s*(\d)?$/i, key: 'egt', label: 'EGT', defaultUnit: '°F', perCylinder: true },
  {
    pattern: /^(oilt|oil ?temp)$/i,
    key: 'oil_temp',
    label: 'Oil Temp',
    defaultUnit: '°F',
    perCylinder: false,
  },
  {
    pattern: /^(oilp|oil ?press(ure)?|oilpsi)$/i,
    key: 'oil_pressure',
    label: 'Oil Pressure',
    defaultUnit: 'PSI',
    perCylinder: false,
  },
  { pattern: /^rpm$/i, key: 'rpm', label: 'RPM', defaultUnit: 'RPM', perCylinder: false },
  {
    pattern: /^map$/i,
    key: 'manifold_pressure',
    label: 'Manifold Pressure',
    defaultUnit: 'inHg',
    perCylinder: false,
  },
  {
    pattern: /^(ff|fuel ?flow)$/i,
    key: 'fuel_flow',
    label: 'Fuel Flow',
    defaultUnit: 'GPH',
    perCylinder: false,
  },
  {
    pattern: /^(fqty|fuel ?qty|fuel ?remaining)$/i,
    key: 'fuel_remaining',
    label: 'Fuel Remaining',
    defaultUnit: 'gal',
    perCylinder: false,
  },
  {
    pattern: /^(volts?|bus ?volts?)$/i,
    key: 'bus_voltage',
    label: 'Bus Voltage',
    defaultUnit: 'V',
    perCylinder: false,
  },
  { pattern: /^oat$/i, key: 'oat', label: 'OAT', defaultUnit: '°F', perCylinder: false },
]

/** Splits a header like `CHT1(F)` into its name and an optional unit. */
function splitUnit(header: string): { name: string; unit: string | null } {
  const match = /^(.*?)\(([^)]+)\)\s*$/.exec(header.trim())
  if (!match) return { name: header.trim(), unit: null }
  return { name: (match[1] as string).trim(), unit: (match[2] as string).trim() }
}

function matchChannel(
  header: string,
): { rule: Rule; cylinder: number | null; unit: string | null } | null {
  const { name, unit } = splitUnit(header)
  for (const rule of RULES) {
    const match = rule.pattern.exec(name)
    if (match) {
      const cylinder = rule.perCylinder && match[1] ? Number(match[1]) : null
      return { rule, cylinder, unit }
    }
  }
  return null
}

function mapChannels(headers: string[]): ChannelMapResult {
  let timeColumnIndex: number | null = null
  const channels: ChannelMapResult['channels'] = []
  const ignoredColumns: string[] = []

  headers.forEach((header, columnIndex) => {
    if (TIME_PATTERN.test(header.trim())) {
      if (timeColumnIndex === null) timeColumnIndex = columnIndex
      return
    }
    const matched = matchChannel(header)
    if (!matched) {
      ignoredColumns.push(header)
      return
    }
    const channel: EngineChannel = {
      key: matched.cylinder ? `${matched.rule.key}${matched.cylinder}` : matched.rule.key,
      label: matched.cylinder ? `${matched.rule.label} ${matched.cylinder}` : matched.rule.label,
      unit: matched.unit ?? matched.rule.defaultUnit,
      cylinder: matched.cylinder,
    }
    channels.push({ columnIndex, channel })
  })

  return { timeColumnIndex, channels, ignoredColumns }
}

export const genericFormat: EngineDataFormat = {
  id: 'generic',
  label: 'Generic engine monitor export',
  detect(headers) {
    return mapChannels(headers).channels.length > 0
  },
  mapChannels,
}
