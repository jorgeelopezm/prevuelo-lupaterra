import type { WeatherLocale } from './provider/types.js'

export interface DecodedSegment {
  /** Original token as it appeared in the raw report. */
  token: string
  /** Locale-appropriate explanation of the token. */
  note: string
}

export interface DecodedMetar {
  /** The raw report string, echoed back byte-for-byte unchanged. */
  raw: string
  locale: WeatherLocale
  /** Locale-appropriate explanatory prose assembled from the decoded tokens. */
  explanation: string
  /** One explanation per recognized token. */
  sections: DecodedSegment[]
  /** Whether at least one token was recognized. */
  decoded: boolean
}

const PHRASES: Record<WeatherLocale, Record<string, string>> = {
  es: {
    wind: 'viento de {dir}° a {speed} kt',
    wind_gust: 'viento de {dir}° a {speed} kt con ráfagas de {gust} kt',
    wind_vrb: 'viento variable a {speed} kt',
    vis: 'visibilidad {vis} m',
    cavok: 'techo y visibilidad buenos (CAVOK)',
    qnh: 'QNH {qnh} hPa',
    temp: 'temperatura {temp}°, punto de rocío {dew}°',
    cloud: 'nubes {cover} a {base} ft',
    cavok_cloud: 'sin nubes significativas',
    weather: '{weather}',
    nosig: 'sin cambios significativos (NOSIG)',
    tempo: 'cambios temporales previstos',
    becmg: 'cambio gradual previsto',
    rmk: 'observaciones (RMK)',
    no_tokens: 'no se ha podido decodificar el informe',
  },
  pt: {
    wind: 'vento de {dir}° a {speed} kt',
    wind_gust: 'vento de {dir}° a {speed} kt com rajadas de {gust} kt',
    wind_vrb: 'vento variável a {speed} kt',
    vis: 'visibilidade {vis} m',
    cavok: 'teto e visibilidade bons (CAVOK)',
    qnh: 'QNH {qnh} hPa',
    temp: 'temperatura {temp}°, ponto de orvalho {dew}°',
    cloud: 'nuvens {cover} a {base} ft',
    cavok_cloud: 'sem nuvens significativas',
    weather: '{weather}',
    nosig: 'sem mudanças significativas (NOSIG)',
    tempo: 'mudanças temporárias previstas',
    becmg: 'mudança gradual prevista',
    rmk: 'observações (RMK)',
    no_tokens: 'não foi possível decodificar o relatório',
  },
  en: {
    wind: 'wind from {dir}° at {speed} kt',
    wind_gust: 'wind from {dir}° at {speed} kt gusting {gust} kt',
    wind_vrb: 'variable wind at {speed} kt',
    vis: 'visibility {vis} m',
    cavok: 'ceiling and visibility OK (CAVOK)',
    qnh: 'QNH {qnh} hPa',
    temp: 'temperature {temp}°, dew point {dew}°',
    cloud: '{cover} clouds at {base} ft',
    cavok_cloud: 'no significant clouds',
    weather: '{weather}',
    nosig: 'no significant change (NOSIG)',
    tempo: 'temporary changes expected',
    becmg: 'gradual change expected',
    rmk: 'remarks (RMK)',
    no_tokens: 'could not decode the report',
  },
}

const CLOUD_COVER: Record<string, string> = {
  FEW: 'FEW',
  SCT: 'SCT',
  BKN: 'BKN',
  OVC: 'OVC',
}

const WEATHER_PHRASES: Record<string, Record<WeatherLocale, string>> = {
  RA: { es: 'lluvia', pt: 'chuva', en: 'rain' },
  DZ: { es: 'llovizna', pt: 'chuvisco', en: 'drizzle' },
  SN: { es: 'nieve', pt: 'neve', en: 'snow' },
  GR: { es: 'granizo', pt: 'granizo', en: 'hail' },
  GS: { es: 'granizo pequeño', pt: 'granizo pequeno', en: 'small hail' },
  TS: { es: 'tormenta', pt: 'trovoada', en: 'thunderstorm' },
  FG: { es: 'niebla', pt: 'nevoeiro', en: 'fog' },
  BR: { es: 'bruma', pt: 'névoa', en: 'mist' },
  HZ: { es: 'calima', pt: 'névoa seca', en: 'haze' },
  SH: { es: 'chubascos', pt: 'aguaceiros', en: 'showers' },
  FU: { es: 'humo', pt: 'fumo', en: 'smoke' },
  DU: { es: 'polvo', pt: 'poeira', en: 'dust' },
  SA: { es: 'arena', pt: 'areia', en: 'sand' },
  SQ: { es: 'turbonada', pt: 'turbonada', en: 'squall' },
  FC: { es: 'tromba marina', pt: 'tromba de água', en: 'funnel cloud' },
  SS: { es: 'tormenta de arena', pt: 'tempestade de areia', en: 'sandstorm' },
  DS: { es: 'tormenta de polvo', pt: 'tempestade de poeira', en: 'duststorm' },
  IC: { es: 'cristales de hielo', pt: 'cristais de gelo', en: 'ice crystals' },
  PL: { es: 'granos de hielo', pt: 'pelotas de gelo', en: 'ice pellets' },
  UP: {
    es: 'precipitación desconocida',
    pt: 'precipitação desconhecida',
    en: 'unknown precipitation',
  },
}

interface Phrase {
  key: string
  params?: Record<string, string>
}

function intensityPrefix(token: string): string {
  const head = token.slice(0, 2)
  if (head === '--') return 'very light '
  if (head === '++') return 'heavy '
  if (token[0] === '-') return 'light '
  if (token[0] === '+') return 'heavy '
  return ''
}

function weatherPhrase(token: string, locale: WeatherLocale): string {
  const intensity = intensityPrefix(token)
  const stripped = token.replace(/^[-+]+/, '').replace(/^(VC|RE)/, '')
  const proximity = token.startsWith('VC') ? ' in the vicinity' : ''
  let base = ''
  for (const key of Object.keys(WEATHER_PHRASES)) {
    if (stripped === key) {
      base = WEATHER_PHRASES[key]?.[locale] ?? token
      break
    }
  }
  // Two-code compounds like TSRA.
  if (!base && stripped.length >= 4) {
    base = [stripped.slice(0, 2), stripped.slice(2, 4)]
      .map((part) => WEATHER_PHRASES[part]?.[locale] ?? '')
      .filter(Boolean)
      .join(' + ')
  }
  if (!base) return ''
  return `${intensity}${base}${proximity}`.trim()
}

function decodeToken(token: string, locale: WeatherLocale): Phrase | null {
  // Wind group: 27012KT, 27012G20KT, VRB05KT.
  const wind = /^(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/.exec(token)
  if (wind) {
    const dir = wind[1] as string
    const speed = wind[2] as string
    const gust = wind[3]
    if (dir === 'VRB') return { key: 'wind_vrb', params: { speed } }
    return gust
      ? { key: 'wind_gust', params: { dir, speed, gust } }
      : { key: 'wind', params: { dir, speed } }
  }

  // Visibility in meters.
  if (/^\d{4}$/.test(token)) return { key: 'vis', params: { vis: token } }
  if (token === 'CAVOK') return { key: 'cavok' }

  // QNH.
  const qnh = /^Q(\d{4})$/.exec(token)
  if (qnh) return { key: 'qnh', params: { qnh: qnh[1] as string } }

  // Temperature / dew point.
  const temp = /^(M?\d{2})\/(M?\d{2})$/.exec(token)
  if (temp) return { key: 'temp', params: { temp: temp[1] as string, dew: temp[2] as string } }

  // Clouds.
  const cloud = /^(FEW|SCT|BKN|OVC)(\d{3})$/.exec(token)
  if (cloud) {
    const cover = CLOUD_COVER[cloud[1] as string] ?? (cloud[1] as string)
    return { key: 'cloud', params: { cover, base: cloud[2] as string } }
  }
  if (/^(NSC|SKC|CLR)$/.test(token)) return { key: 'cavok_cloud' }

  // Trends and remarks.
  if (token === 'NOSIG') return { key: 'nosig' }
  if (token === 'TEMPO') return { key: 'tempo' }
  if (token === 'BECMG') return { key: 'becmg' }
  if (token === 'RMK') return { key: 'rmk' }

  // Weather phenomena (RA, -RA, +TSRA, VCSH, …).
  if (/^[-+]*(VC)?([A-Z]{2,4})$/.test(token) && weatherPhrase(token, locale)) {
    return { key: 'weather', params: { weather: weatherPhrase(token, locale) } }
  }

  return null
}

/**
 * Decode a raw METAR report into locale-appropriate explanatory text. The raw
 * report string is echoed back unchanged; the decoder is a pure function over
 * the caller-supplied report, so it never touches a provider.
 */
export function decodeMetar(raw: string, locale: WeatherLocale): DecodedMetar {
  const tokens = raw.split(/\s+/).filter(Boolean)
  const sections: DecodedSegment[] = []
  for (const token of tokens) {
    const phrase = decodeToken(token, locale)
    if (phrase) {
      const template = PHRASES[locale][phrase.key]
      if (!template) continue
      let note = template
      for (const [param, value] of Object.entries(phrase.params ?? {})) {
        note = note.replace(`{${param}}`, value)
      }
      sections.push({ token, note })
    }
  }

  const decoded = sections.length > 0
  const explanation = decoded
    ? `${sections.map((s) => s.note).join('; ')}.`
    : (PHRASES[locale].no_tokens as string)

  return { raw, locale, explanation, sections, decoded }
}
