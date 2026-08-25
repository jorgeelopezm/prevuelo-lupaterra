import { useState, createContext, useContext, type ReactNode } from 'react'
import { type Lang, LANG_LABELS, useTrans } from './i18n'

// ─── Lang context ─────────────────────────────────────────────────────────────
const LangCtx = createContext<{ lang: Lang; t: (k: string) => string }>({
  lang: 'en', t: k => k,
})
const useLang = () => useContext(LangCtx)

// ─── Types ────────────────────────────────────────────────────────────────────
type NavItem = 'dashboard' | 'weather' | 'checklists' | 'risk' | 'aircraft' | 'documents'

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  home:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path d="M3 12L12 3l9 9"/><path d="M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9"/></svg>,
  cloud:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path d="M17.5 19H9a7 7 0 110-14 6.97 6.97 0 016.3 4A5 5 0 1117.5 19z"/></svg>,
  list:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path d="M9 6h11M9 12h11M9 18h11M5 6v.01M5 12v.01M5 18v.01"/></svg>,
  shield:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  plane:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>,
  book:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>,
  check:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5"><path d="M20 6L9 17l-5-5"/></svg>,
  chevronRight: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path d="M9 18l6-6-6-6"/></svg>,
  alert:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  info:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  send:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  trend:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  fuel:         () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path d="M3 22V8l6-6h8l4 4v16H3z"/><path d="M10 22V16h4v6"/><path d="M13 2v4h4"/></svg>,
  wrench:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
  globe:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>,
}

// ─── Status chip ──────────────────────────────────────────────────────────────
type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR'
const categoryStyle: Record<FlightCategory, string> = {
  VFR:  'bg-emerald-900/50 text-emerald-300 border-emerald-700/60',
  MVFR: 'bg-amber-900/50 text-amber-300 border-amber-700/60',
  IFR:  'bg-red-900/50 text-red-300 border-red-700/60',
  LIFR: 'bg-purple-900/50 text-purple-300 border-purple-700/60',
}
function CategoryBadge({ cat }: { cat: FlightCategory }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold font-data tracking-wider ${categoryStyle[cat]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cat === 'VFR' ? 'bg-emerald-400' : cat === 'MVFR' ? 'bg-amber-400' : cat === 'IFR' ? 'bg-red-400' : 'bg-purple-400'}`} />
      {cat}
    </span>
  )
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-[#0f1822] border border-[#1a2535] rounded-lg ${className}`}>{children}</div>
}

function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-bold text-white">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const NAV_DEFS: { id: NavItem; tkey: string; icon: () => ReactNode }[] = [
  { id: 'dashboard',  tkey: 'nav.home',       icon: Icon.home },
  { id: 'weather',    tkey: 'nav.weather',    icon: Icon.cloud },
  { id: 'checklists', tkey: 'nav.checklists', icon: Icon.list },
  { id: 'risk',       tkey: 'nav.risk',       icon: Icon.shield },
  { id: 'aircraft',   tkey: 'nav.aircraft',   icon: Icon.plane },
  { id: 'documents',  tkey: 'nav.documents',  icon: Icon.book },
]

function Sidebar({
  active, setActive, lang, setLang,
}: {
  active: NavItem; setActive: (n: NavItem) => void
  lang: Lang; setLang: (l: Lang) => void
}) {
  const { t } = useLang()
  return (
    <aside className="w-56 flex-shrink-0 bg-[#070c12] border-r border-[#1a2535] flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[#1a2535]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Icon.plane />
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-wide">PREFLIGHT</div>
            <div className="text-[10px] text-slate-500 font-data tracking-widest">RISK MGMT</div>
          </div>
        </div>
      </div>

      {/* Active aircraft */}
      <div className="mx-3 mt-3 mb-1 px-3 py-2 rounded bg-[#0f1822] border border-[#1a2535]">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">{t('nav.active_ac')}</div>
        <div className="text-sm font-semibold text-white font-data">N4521G</div>
        <div className="text-[11px] text-slate-400">Cessna 172S</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {NAV_DEFS.map(item => (
          <button key={item.id} onClick={() => setActive(item.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-sm transition-all ${
              active === item.id
                ? 'bg-blue-600/20 text-blue-300 border border-blue-600/40'
                : 'text-slate-400 hover:bg-[#111d2c] hover:text-slate-200 border border-transparent'
            }`}>
            <item.icon />
            <span className="font-medium">{t(item.tkey)}</span>
          </button>
        ))}
      </nav>

      {/* Language switcher */}
      <div className="px-3 py-3 border-t border-[#1a2535]">
        <div className="flex items-center gap-1.5 mb-2 text-slate-500">
          <Icon.globe />
          <span className="text-[10px] uppercase tracking-widest">{t('nav.language')}</span>
        </div>
        <div className="flex gap-1">
          {(Object.keys(LANG_LABELS) as Lang[]).map(l => (
            <button key={l} onClick={() => setLang(l)}
              className={`flex-1 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-all ${
                lang === l ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300 bg-[#0f1822] border border-[#1a2535] hover:border-slate-500'
              }`}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Pilot */}
      <div className="px-4 py-3 border-t border-[#1a2535]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">MK</div>
          <div>
            <div className="text-xs font-semibold text-slate-300">M. Kowalski</div>
            <div className="text-[10px] text-slate-500">PPL · 312 hrs TT</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN 1 — Dashboard
// ═══════════════════════════════════════════════════════════════════════════════
function Dashboard({ setActive }: { setActive: (n: NavItem) => void }) {
  const { t } = useLang()

  const quickItems = [
    { nav: 'weather' as NavItem,    tkey: 'dash.weather_label',    status: 'VFR',  color: 'emerald', detail: 'KBOS — SKC OVC015', sub: '12 NOTAMs active' },
    { nav: 'risk' as NavItem,       tkey: 'dash.risk_label',       status: 'LOW',  color: 'emerald', detail: 'Score 22 / 100', sub: 'Last updated 08:14' },
    { nav: 'aircraft' as NavItem,   tkey: 'dash.aircraft_label',   status: 'OK',   color: 'emerald', detail: 'N4521G — C172S', sub: '18 hrs to oil change' },
    { nav: 'checklists' as NavItem, tkey: 'dash.checklists_label', status: 'PEND', color: 'amber',   detail: 'Preflight incomplete', sub: '0 / 22 items done' },
  ]

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-[11px] text-slate-500 font-data tracking-widest uppercase mb-1">{t('dash.date')}</div>
          <h1 className="text-2xl font-bold text-white">{t('dash.title')}</h1>
          <p className="text-slate-400 text-sm mt-1">{t('dash.subtitle')}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-900/30 border border-emerald-700/50">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-300 font-bold text-sm tracking-wide">{t('dash.go')}</span>
          </div>
          <div className="text-[10px] text-slate-600 font-data">{t('dash.decision')}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {quickItems.map(item => (
          <button key={item.nav} onClick={() => setActive(item.nav)}
            className="text-left p-4 rounded-lg bg-[#0f1822] border border-[#1a2535] hover:border-blue-600/40 hover:bg-[#111d2c] transition-all group">
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">{t(item.tkey)}</span>
              <span className={`text-[10px] font-bold font-data px-2 py-0.5 rounded border ${
                item.color === 'emerald'
                  ? 'text-emerald-300 bg-emerald-900/40 border-emerald-700/50'
                  : 'text-amber-300 bg-amber-900/40 border-amber-700/50'
              }`}>{item.status}</span>
            </div>
            <div className="text-sm font-semibold text-slate-200">{item.detail}</div>
            <div className="text-xs text-slate-500 mt-0.5">{item.sub}</div>
            <div className="mt-3 text-[11px] text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              {t('btn.open')} <Icon.chevronRight />
            </div>
          </button>
        ))}
      </div>

      <Card className="p-4 mb-4 border-amber-700/40">
        <div className="flex items-start gap-3">
          <div className="text-amber-400 mt-0.5"><Icon.alert /></div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber-300 mb-1">{t('dash.notam_heading')}</div>
            <div className="text-xs text-slate-400 font-data">{t('dash.notam_text')}</div>
          </div>
          <button onClick={() => setActive('weather')} className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap">{t('dash.view_notams')}</button>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {[
          { labelKey: 'dash.fuel_label', valueKey: 'dash.fuel_value', subKey: 'dash.fuel_sub', icon: <Icon.fuel /> },
          { labelKey: 'dash.mx_label',   valueKey: 'dash.mx_value',   subKey: 'dash.mx_sub',   icon: <Icon.wrench /> },
          { labelKey: 'dash.last_flt_label', valueKey: 'dash.last_flt_value', subKey: 'dash.last_flt_sub', icon: <Icon.trend /> },
        ].map(s => (
          <Card key={s.labelKey} className="p-3.5">
            <div className="flex items-center gap-2 mb-2 text-slate-500">{s.icon}<span className="text-xs uppercase tracking-wide">{t(s.labelKey)}</span></div>
            <div className="text-base font-bold text-slate-200 font-data">{t(s.valueKey)}</div>
            <div className="text-xs text-slate-500 mt-0.5">{t(s.subKey)}</div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN 2 — Weather & NOTAMs
// ═══════════════════════════════════════════════════════════════════════════════
const AIRPORTS = ['KBOS', 'KORH', 'KJFK', 'KORD'] as const
type Airport = typeof AIRPORTS[number]

const WEATHER_STATIC: Record<Airport, {
  category: FlightCategory
  metar_raw: string
  taf_raw: string
  notams: { id: string; raw: string; severity: 'info' | 'warn' | 'critical'; decodedKey: string }[]
  metarDecodedKey: string
  tafDecodedKey: string
}> = {
  KBOS: {
    category: 'VFR',
    metar_raw: 'METAR KBOS 221456Z 27015KT 10SM FEW045 SCT250 22/10 A2998 RMK AO2 SLP148 T02220100',
    taf_raw: `TAF KBOS 221130Z 2212/2318 27012KT 9999 FEW045 SCT250\n  TEMPO 2215/2219 27018G28KT 6000 -SHRA BKN030\n  FM222000 28008KT 9999 FEW060 SCT250\n  FM230200 VRB03KT 9000 FEW100`,
    metarDecodedKey: 'wx.kbos.metar_decoded',
    tafDecodedKey:   'wx.kbos.taf_decoded',
    notams: [
      { id: '!BOS 07/042', raw: '!BOS 07/042 BOS RWY 04R/22L CLSD WEF 2607221400-2607222200', severity: 'warn',     decodedKey: 'wx.kbos.n0_decoded' },
      { id: '!BOS 07/031', raw: '!BOS 07/031 BOS TWY B BTN TWY A AND TWY C CLSD',              severity: 'info',     decodedKey: 'wx.kbos.n1_decoded' },
      { id: '!BOS 07/018', raw: '!BOS 07/018 BOS APRON NORTHEAST APRON LTNG U/S',               severity: 'info',     decodedKey: 'wx.kbos.n2_decoded' },
    ],
  },
  KORH: {
    category: 'MVFR',
    metar_raw: 'METAR KORH 221455Z 19012KT 5SM BR OVC012 18/15 A2995 RMK AO2 SLP139',
    taf_raw: `TAF KORH 221130Z 2212/2318 19012KT 5000 BR OVC012\n  TEMPO 2213/2217 4000 -DZ OVC008\n  FM221800 21008KT 8000 BKN020\n  FM230000 VRB04KT 9999 FEW030`,
    metarDecodedKey: 'wx.korh.metar_decoded',
    tafDecodedKey:   'wx.korh.taf_decoded',
    notams: [
      { id: '!ORH 07/009', raw: '!ORH 07/009 ORH ILS RWY 29 U/S',     severity: 'critical', decodedKey: 'wx.korh.n0_decoded' },
      { id: '!ORH 07/003', raw: '!ORH 07/003 ORH PAPI RWY 11 U/S',    severity: 'warn',     decodedKey: 'wx.korh.n1_decoded' },
    ],
  },
  KJFK: {
    category: 'VFR',
    metar_raw: 'METAR KJFK 221451Z 26018KT 10SM SKC 24/08 A2996 RMK AO2 SLP142 T02390083',
    taf_raw: `TAF KJFK 221130Z 2212/2318 26015KT 9999 SKC\n  FM231200 24010KT 9999 FEW040`,
    metarDecodedKey: 'wx.kjfk.metar_decoded',
    tafDecodedKey:   'wx.kjfk.taf_decoded',
    notams: [
      { id: '!JFK 07/055', raw: '!JFK 07/055 JFK RWY 13L/31R CLSD', severity: 'warn', decodedKey: 'wx.kjfk.n0_decoded' },
    ],
  },
  KORD: {
    category: 'IFR',
    metar_raw: 'METAR KORD 221452Z 18022G32KT 3SM -RA OVC005 16/14 A2981 RMK AO2 SLP094 P0002',
    taf_raw: `TAF KORD 221130Z 2212/2318 18022G35KT 3000 -RA OVC005\n  FM222000 20015KT 5000 -RASN OVC010\n  FM230600 24010KT 9999 BKN030`,
    metarDecodedKey: 'wx.kord.metar_decoded',
    tafDecodedKey:   'wx.kord.taf_decoded',
    notams: [
      { id: '!ORD 07/112', raw: '!ORD 07/112 ORD SIGMET CONVECTIVE WS 0009', severity: 'critical', decodedKey: 'wx.kord.n0_decoded' },
      { id: '!ORD 07/098', raw: '!ORD 07/098 ORD RWY 10R/28L CLSD',         severity: 'info',     decodedKey: 'wx.kord.n1_decoded' },
    ],
  },
}

function RawPlainToggle({ mode, setMode }: { mode: 'raw' | 'decoded'; setMode: (m: 'raw' | 'decoded') => void }) {
  const { t } = useLang()
  return (
    <div className="flex rounded overflow-hidden border border-[#1a2535] text-xs">
      <button onClick={() => setMode('decoded')} className={`px-3 py-1 font-medium transition-colors ${mode === 'decoded' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{t('btn.plain')}</button>
      <button onClick={() => setMode('raw')}     className={`px-3 py-1 font-medium transition-colors ${mode === 'raw'     ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{t('btn.raw')}</button>
    </div>
  )
}

function Weather() {
  const { t } = useLang()
  const [airport, setAirport] = useState<Airport>('KBOS')
  const [metarMode, setMetarMode] = useState<'raw' | 'decoded'>('decoded')
  const [tafMode,   setTafMode]   = useState<'raw' | 'decoded'>('decoded')
  const [notamMode, setNotamMode] = useState<'raw' | 'decoded'>('decoded')
  const data = WEATHER_STATIC[airport]

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <PageHeader title={t('wx.title')} subtitle={t('wx.subtitle')} />

      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm text-slate-500 font-medium">{t('wx.airport_route')}</span>
        <div className="flex gap-2">
          {AIRPORTS.map(ap => (
            <button key={ap} onClick={() => setAirport(ap)}
              className={`px-3 py-1.5 rounded border text-sm font-data font-medium transition-all ${
                airport === ap ? 'bg-blue-600/20 border-blue-600/50 text-blue-300' : 'border-[#1a2535] text-slate-400 hover:border-slate-500 hover:text-slate-200'
              }`}>{ap}</button>
          ))}
        </div>
        <div className="ml-auto"><CategoryBadge cat={data.category} /></div>
      </div>

      {/* METAR */}
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('wx.metar_label')}</span>
            <span className="text-xs text-slate-600 font-data">· {airport} · 14:56Z</span>
          </div>
          <RawPlainToggle mode={metarMode} setMode={setMetarMode} />
        </div>
        <div className={`text-sm leading-relaxed whitespace-pre-wrap ${metarMode === 'raw' ? 'font-data text-amber-200' : 'text-slate-300'}`}>
          {metarMode === 'raw' ? data.metar_raw : t(data.metarDecodedKey)}
        </div>
      </Card>

      {/* TAF */}
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('wx.taf_label')}</span>
            <span className="text-xs text-slate-600 font-data">· {airport} · Valid 2212/2318</span>
          </div>
          <RawPlainToggle mode={tafMode} setMode={setTafMode} />
        </div>
        <div className={`text-sm leading-relaxed whitespace-pre-wrap ${tafMode === 'raw' ? 'font-data text-amber-200' : 'text-slate-300'}`}>
          {tafMode === 'raw' ? data.taf_raw : t(data.tafDecodedKey)}
        </div>
      </Card>

      {/* NOTAMs */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('wx.notam_label')}</span>
            <span className="text-xs text-slate-600">{data.notams.length} {t('wx.notams_active')}</span>
          </div>
          <RawPlainToggle mode={notamMode} setMode={setNotamMode} />
        </div>
        <div className="space-y-2">
          {data.notams.map(n => (
            <div key={n.id} className={`rounded p-3 border-l-2 ${
              n.severity === 'critical' ? 'border-l-red-500 bg-red-950/30' :
              n.severity === 'warn'     ? 'border-l-amber-500 bg-amber-950/30' :
                                         'border-l-slate-600 bg-slate-800/30'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-data text-xs text-slate-500">{n.id}</span>
                {n.severity === 'critical' && <span className="text-[10px] font-bold text-red-400 bg-red-900/50 px-1.5 py-0.5 rounded uppercase">{t('wx.critical')}</span>}
                {n.severity === 'warn'     && <span className="text-[10px] font-bold text-amber-400 bg-amber-900/50 px-1.5 py-0.5 rounded uppercase">{t('wx.advisory')}</span>}
              </div>
              <div className={`text-sm ${notamMode === 'raw' ? 'font-data text-amber-200' : 'text-slate-300'}`}>
                {notamMode === 'raw' ? n.raw : t(n.decodedKey)}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN 3 — Checklists
// ═══════════════════════════════════════════════════════════════════════════════
const AIRCRAFT_FLEET = [
  { tail: 'N4521G', type: 'Cessna 172S' },
  { tail: 'N7893K', type: 'Piper PA-28-181' },
  { tail: 'N1032B', type: 'Beechcraft A36 Bonanza' },
]

const CHECKLIST_META = {
  normal: [
    'Preflight / Walkaround', 'Before Start', 'Before Takeoff',
    'Cruise', 'Before Landing', 'Shutdown / Securing',
  ],
  emergency: [
    'Engine Failure — Airborne', 'Engine Fire — In-Flight', 'Electrical Fire',
  ],
}

type ChecklistGroup = 'normal' | 'emergency'

function Checklists() {
  const { t } = useLang()
  const allItems: string[][] = JSON.parse(t('cl.items'))

  const [selectedAircraft,  setSelectedAircraft]  = useState(0)
  const [selectedGroup,     setSelectedGroup]      = useState<ChecklistGroup>('normal')
  const [selectedChecklist, setSelectedChecklist]  = useState(0)
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  const normalCount    = CHECKLIST_META.normal.length
  const listIndex      = selectedGroup === 'normal' ? selectedChecklist : normalCount + selectedChecklist
  const list           = allItems[listIndex] ?? []
  const checkedCount   = list.filter((_, i) => checked[`${selectedGroup}-${selectedChecklist}-${i}`]).length
  const complete       = list.length > 0 && checkedCount === list.length

  const toggle = (i: number) => {
    const key = `${selectedGroup}-${selectedChecklist}-${i}`
    setChecked(p => ({ ...p, [key]: !p[key] }))
  }
  const resetList = () => {
    const updates: Record<string, boolean> = {}
    list.forEach((_, i) => { updates[`${selectedGroup}-${selectedChecklist}-${i}`] = false })
    setChecked(p => ({ ...p, ...updates }))
  }
  const listName = selectedGroup === 'normal'
    ? CHECKLIST_META.normal[selectedChecklist]
    : CHECKLIST_META.emergency[selectedChecklist]

  return (
    <div className="flex h-full">
      {/* Fleet */}
      <div className="w-44 flex-shrink-0 border-r border-[#1a2535] p-3 space-y-1">
        <div className="text-[10px] text-slate-600 uppercase tracking-widest px-2 py-1">{t('cl.title')}</div>
        {AIRCRAFT_FLEET.map((ac, i) => (
          <button key={ac.tail} onClick={() => setSelectedAircraft(i)}
            className={`w-full text-left px-2.5 py-2.5 rounded transition-all ${selectedAircraft === i ? 'bg-blue-600/20 border border-blue-600/40' : 'hover:bg-[#0f1822] border border-transparent'}`}>
            <div className="text-xs font-bold font-data text-slate-200">{ac.tail}</div>
            <div className="text-[10px] text-slate-500">{ac.type}</div>
          </button>
        ))}
      </div>

      {/* Checklist selector */}
      <div className="w-52 flex-shrink-0 border-r border-[#1a2535] p-3 space-y-0.5">
        <div className="text-[10px] text-slate-600 uppercase tracking-widest px-2 py-1">{AIRCRAFT_FLEET[selectedAircraft].tail}</div>
        <div className="text-[10px] text-slate-600 uppercase tracking-widest px-2 pt-2">{t('cl.normal')}</div>
        {CHECKLIST_META.normal.map((name, i) => (
          <button key={name} onClick={() => { setSelectedGroup('normal'); setSelectedChecklist(i) }}
            className={`w-full text-left px-2.5 py-2 rounded text-xs transition-all ${selectedGroup === 'normal' && selectedChecklist === i ? 'bg-blue-600/20 border border-blue-600/40 text-blue-300' : 'text-slate-400 hover:bg-[#0f1822] border border-transparent hover:text-slate-200'}`}>
            {name}
          </button>
        ))}
        <div className="text-[10px] text-red-500 uppercase tracking-widest px-2 pt-3 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{t('cl.emergency')}
        </div>
        {CHECKLIST_META.emergency.map((name, i) => (
          <button key={name} onClick={() => { setSelectedGroup('emergency'); setSelectedChecklist(i) }}
            className={`w-full text-left px-2.5 py-2 rounded text-xs transition-all ${selectedGroup === 'emergency' && selectedChecklist === i ? 'bg-red-900/30 border border-red-700/50 text-red-300' : 'text-red-400/70 hover:bg-red-950/30 border border-transparent hover:text-red-300'}`}>
            {name}
          </button>
        ))}
      </div>

      {/* Checklist items */}
      <div className="flex-1 p-6 overflow-auto">
        {selectedGroup === 'emergency' && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-700/50 flex items-center gap-3">
            <Icon.alert />
            <span className="text-sm text-red-300 font-semibold">{t('cl.emergency_banner')}</span>
          </div>
        )}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">{listName}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{AIRCRAFT_FLEET[selectedAircraft].tail} — {AIRCRAFT_FLEET[selectedAircraft].type}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-bold font-data text-slate-300">{checkedCount} / {list.length}</div>
              <div className="text-xs text-slate-600">{t('lbl.complete')}</div>
            </div>
            <button onClick={resetList} className="text-xs text-slate-500 hover:text-slate-300 border border-[#1a2535] px-2 py-1 rounded hover:border-slate-500 transition-all">{t('btn.reset')}</button>
          </div>
        </div>

        <div className="w-full h-1.5 bg-[#1a2535] rounded-full mb-5 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${list.length > 0 ? (checkedCount / list.length) * 100 : 0}%`, backgroundColor: complete ? '#22c55e' : '#3b82f6' }} />
        </div>

        {complete && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-900/30 border border-emerald-700/50 flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0"><Icon.check /></div>
            <span className="text-sm text-emerald-300 font-semibold">{t('cl.all_done')}</span>
          </div>
        )}

        <div className="space-y-1.5">
          {list.map((item, i) => {
            const key = `${selectedGroup}-${selectedChecklist}-${i}`
            const isChecked = !!checked[key]
            return (
              <button key={i} onClick={() => toggle(i)}
                className={`w-full flex items-start gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                  isChecked ? 'bg-emerald-900/20 border-emerald-800/40'
                  : selectedGroup === 'emergency' ? 'bg-[#0f1822] border-[#1a2535] hover:border-red-800/40'
                  : 'bg-[#0f1822] border-[#1a2535] hover:border-blue-700/40'
                }`}>
                <div className={`w-5 h-5 flex-shrink-0 mt-0.5 rounded border-2 flex items-center justify-center transition-all ${
                  isChecked ? 'bg-emerald-500 border-emerald-500'
                  : selectedGroup === 'emergency' ? 'border-red-600/50'
                  : 'border-[#2a3a52]'
                }`}>
                  {isChecked && <Icon.check />}
                </div>
                <span className={`text-sm leading-snug ${isChecked ? 'line-through text-slate-500' : 'text-slate-300'}`}>{item}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN 4 — Risk Assessment
// ═══════════════════════════════════════════════════════════════════════════════
type RiskLevel = 0 | 1 | 2

interface RiskQuestionDef { id: string; domainKey: string; questionKey: string; labelsKey: string; scores: [number, number, number] }

const RISK_QUESTIONS: RiskQuestionDef[] = [
  { id: 'illness',    domainKey: 'risk.d_pilot', questionKey: 'risk.q_illness',    labelsKey: 'risk.l_illness',    scores: [0, 8, 20] },
  { id: 'medication', domainKey: 'risk.d_pilot', questionKey: 'risk.q_medication', labelsKey: 'risk.l_medication', scores: [0, 5, 20] },
  { id: 'stress',     domainKey: 'risk.d_pilot', questionKey: 'risk.q_stress',     labelsKey: 'risk.l_stress',     scores: [0, 5, 15] },
  { id: 'alcohol',    domainKey: 'risk.d_pilot', questionKey: 'risk.q_alcohol',    labelsKey: 'risk.l_alcohol',    scores: [0, 10, 25] },
  { id: 'fatigue',    domainKey: 'risk.d_pilot', questionKey: 'risk.q_fatigue',    labelsKey: 'risk.l_fatigue',    scores: [0, 8, 18] },
  { id: 'emotion',    domainKey: 'risk.d_pilot', questionKey: 'risk.q_emotion',    labelsKey: 'risk.l_emotion',    scores: [0, 5, 15] },
  { id: 'weather',    domainKey: 'risk.d_env',   questionKey: 'risk.q_weather',    labelsKey: 'risk.l_weather',    scores: [0, 10, 20] },
  { id: 'terrain',    domainKey: 'risk.d_env',   questionKey: 'risk.q_terrain',    labelsKey: 'risk.l_terrain',    scores: [0, 5, 12] },
  { id: 'pressure',   domainKey: 'risk.d_ext',   questionKey: 'risk.q_pressure',   labelsKey: 'risk.l_pressure',   scores: [0, 8, 18] },
  { id: 'night',      domainKey: 'risk.d_ext',   questionKey: 'risk.q_night',      labelsKey: 'risk.l_night',      scores: [0, 5, 12] },
]

const AC_TELEM = { cht_max: 378, hours_to_mx: 18.2, fuel_usable: 38.5, fuel_required: 18.0 }

function RiskAssessment() {
  const { t } = useLang()
  const [answers, setAnswers] = useState<Record<string, RiskLevel>>({})
  const [submitted, setSubmitted] = useState(false)

  const totalAnswered = Object.keys(answers).length
  const questionScore = RISK_QUESTIONS.reduce((a, q) => a + (answers[q.id] !== undefined ? q.scores[answers[q.id]] : 0), 0)
  const chtRisk   = AC_TELEM.cht_max > 395 ? 10 : AC_TELEM.cht_max > 380 ? 5 : 0
  const mxRisk    = AC_TELEM.hours_to_mx < 5 ? 15 : AC_TELEM.hours_to_mx < 15 ? 5 : 0
  const fuelRisk  = AC_TELEM.fuel_usable < AC_TELEM.fuel_required * 1.25 ? 10 : 0
  const aircraftScore = chtRisk + mxRisk + fuelRisk
  const totalScore = questionScore + aircraftScore
  const pct = Math.round((totalScore / 160) * 100)
  const riskLabel = totalScore <= 30 ? t('risk.low') : totalScore <= 60 ? t('risk.medium') : t('risk.high')
  const riskColor = totalScore <= 30 ? 'emerald' : totalScore <= 60 ? 'amber' : 'red'
  const riskMsg   = totalScore <= 30 ? t('risk.low_msg') : totalScore <= 60 ? t('risk.medium_msg') : t('risk.high_msg')

  const topFactors = RISK_QUESTIONS
    .filter(q => answers[q.id] !== undefined && q.scores[answers[q.id]] >= 8)
    .map(q => ({ label: q.id, score: q.scores[answers[q.id]] }))
    .sort((a, b) => b.score - a.score).slice(0, 3)

  const domains = [...new Set(RISK_QUESTIONS.map(q => q.domainKey))]

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <PageHeader title={t('risk.title')} subtitle={t('risk.subtitle')} />

      {/* Telemetry */}
      <Card className="p-4 mb-6">
        <div className="text-xs text-slate-500 uppercase tracking-widest mb-3">{t('risk.ac_telemetry')}</div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { labelKey: 'risk.max_cht',    value: `${AC_TELEM.cht_max}°F`,   subKey: 'risk.limit',       subVal: '400°F',    ok: AC_TELEM.cht_max < 395 },
            { labelKey: 'risk.hours_to_mx',value: `${AC_TELEM.hours_to_mx} hrs`, subKey: 'risk.oil_interval', subVal: '',      ok: AC_TELEM.hours_to_mx > 10 },
            { labelKey: 'risk.fuel_req',   value: `${AC_TELEM.fuel_usable} / ${AC_TELEM.fuel_required} USG`, subKey: 'risk.fuel_reserve', subVal: '', ok: true },
          ].map(s => (
            <div key={s.labelKey} className={`rounded p-2.5 border ${s.ok ? 'border-emerald-800/40 bg-emerald-950/20' : 'border-amber-700/40 bg-amber-950/20'}`}>
              <div className="text-[10px] text-slate-500 mb-1">{t(s.labelKey)}</div>
              <div className="font-data text-sm font-bold text-slate-200">{s.value}</div>
              <div className="text-[10px] text-slate-600 mt-0.5">{t(s.subKey)}{s.subVal ? ` ${s.subVal}` : ''}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
          <Icon.info /> {t('risk.ac_score')} <span className="font-data font-bold text-slate-300">{aircraftScore} {t('risk.pts')}</span>
        </div>
      </Card>

      {/* Questions */}
      {domains.map(domain => (
        <Card key={domain} className="p-4 mb-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t(domain)}</div>
          <div className="space-y-4">
            {RISK_QUESTIONS.filter(q => q.domainKey === domain).map(q => {
              const labels: string[] = JSON.parse(t(q.labelsKey))
              return (
                <div key={q.id}>
                  <p className="text-sm text-slate-300 mb-2">{t(q.questionKey)}</p>
                  <div className="flex gap-2">
                    {([0, 1, 2] as RiskLevel[]).map(lvl => (
                      <button key={lvl} onClick={() => setAnswers(p => ({ ...p, [q.id]: lvl }))}
                        className={`flex-1 py-2 px-2 rounded border text-xs text-center transition-all ${
                          answers[q.id] === lvl
                            ? lvl === 0 ? 'bg-emerald-900/50 border-emerald-600/60 text-emerald-300'
                              : lvl === 1 ? 'bg-amber-900/50 border-amber-600/60 text-amber-300'
                              : 'bg-red-900/50 border-red-600/60 text-red-300'
                            : 'border-[#1a2535] text-slate-500 hover:border-slate-500 hover:text-slate-300'
                        }`}>
                        {labels[lvl]}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      ))}

      <button onClick={() => setSubmitted(true)}
        disabled={totalAnswered < RISK_QUESTIONS.length}
        className={`w-full py-3 rounded-lg font-semibold text-sm mb-6 transition-all ${
          totalAnswered >= RISK_QUESTIONS.length
            ? 'bg-blue-600 hover:bg-blue-500 text-white'
            : 'bg-[#0f1822] text-slate-600 border border-[#1a2535] cursor-not-allowed'
        }`}>
        {totalAnswered >= RISK_QUESTIONS.length ? t('btn.submit') : `${t('risk.answer_all')} (${totalAnswered} / ${RISK_QUESTIONS.length})`}
      </button>

      {submitted && totalAnswered >= RISK_QUESTIONS.length && (
        <Card className={`p-6 border-2 ${riskColor === 'emerald' ? 'border-emerald-700/60' : riskColor === 'amber' ? 'border-amber-700/60' : 'border-red-700/60'}`}>
          <div className="flex items-start gap-6">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <svg viewBox="0 0 100 60" className="w-28">
                <path d="M10 55 A45 45 0 0 1 90 55" fill="none" stroke="#1a2535" strokeWidth="8" strokeLinecap="round" />
                <path d="M10 55 A45 45 0 0 1 90 55" fill="none"
                  stroke={riskColor === 'emerald' ? '#22c55e' : riskColor === 'amber' ? '#f59e0b' : '#ef4444'}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${Math.min(pct, 100) * 1.41} 141`} />
              </svg>
              <div className="font-data text-2xl font-bold text-white">{totalScore}</div>
              <div className="text-xs text-slate-500">{t('lbl.of')} 160 {t('risk.pts')}</div>
            </div>
            <div className="flex-1">
              <div className={`text-2xl font-bold mb-1 ${riskColor === 'emerald' ? 'text-emerald-400' : riskColor === 'amber' ? 'text-amber-400' : 'text-red-400'}`}>{riskLabel}</div>
              <p className="text-sm text-slate-400 mb-3">{riskMsg}</p>
              {topFactors.length > 0 && (
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-1.5">{t('risk.top_factors')}</div>
                  {topFactors.map(f => (
                    <div key={f.label} className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-data text-slate-400 capitalize w-20">{f.label}</span>
                      <div className="flex-1 h-1 bg-[#1a2535] rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${(f.score / 25) * 100}%` }} />
                      </div>
                      <span className="text-xs font-data text-slate-400">{f.score} {t('risk.pts')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN 5 — Aircraft & Logbook
// ═══════════════════════════════════════════════════════════════════════════════
const ENGINE_DATA = [
  { label: 'CHT 1', value: 355, min: 200, max: 500, limit: 420, unit: '°F' },
  { label: 'CHT 2', value: 362, min: 200, max: 500, limit: 420, unit: '°F' },
  { label: 'CHT 3', value: 378, min: 200, max: 500, limit: 420, unit: '°F' },
  { label: 'CHT 4', value: 341, min: 200, max: 500, limit: 420, unit: '°F' },
  { label: 'EGT 1', value: 1340, min: 1000, max: 1600, limit: 1550, unit: '°F' },
  { label: 'EGT 2', value: 1358, min: 1000, max: 1600, limit: 1550, unit: '°F' },
  { label: 'EGT 3', value: 1372, min: 1000, max: 1600, limit: 1550, unit: '°F' },
  { label: 'EGT 4', value: 1319, min: 1000, max: 1600, limit: 1550, unit: '°F' },
  { label: 'Oil Temp', value: 192, min: 100, max: 250, limit: 245, unit: '°F' },
  { label: 'Oil Pres', value: 74,  min: 25,  max: 100, limit: 90,   unit: 'PSI' },
]

const RECENT_FLIGHTS = [
  { date: '21 Jul', from: 'KBOS', to: 'KMHT', hobbs: '0.9', tach: '0.8', pax: 1 },
  { date: '18 Jul', from: 'KMHT', to: 'KBOS', hobbs: '0.9', tach: '0.8', pax: 1 },
  { date: '15 Jul', from: 'KBOS', to: 'KORH', hobbs: '0.6', tach: '0.5', pax: 2 },
  { date: '10 Jul', from: 'KORH', to: 'KBOS', hobbs: '0.7', tach: '0.6', pax: 2 },
  { date: '04 Jul', from: 'KBOS', to: 'KACK', hobbs: '1.4', tach: '1.2', pax: 3 },
]

const MX_ITEMS = [
  { item: 'Oil Change',          due: '18.2 hrs',    hobbs: '1,222 hrs', status: 'ok' },
  { item: 'Annual Inspection',   due: '01 Feb 2027', hobbs: '—',         status: 'ok' },
  { item: 'ELT Battery',         due: '15 Oct 2026', hobbs: '—',         status: 'warn' },
  { item: 'Transponder Test',    due: '31 Dec 2026', hobbs: '—',         status: 'ok' },
  { item: 'Pitot/Static Cert.',  due: '31 Dec 2026', hobbs: '—',         status: 'ok' },
]

function Aircraft() {
  const { t } = useLang()
  const [selectedAc, setSelectedAc] = useState(0)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <PageHeader title={t('ac.title')} />

      <div className="flex gap-2 mb-6">
        {AIRCRAFT_FLEET.map((ac, i) => (
          <button key={ac.tail} onClick={() => setSelectedAc(i)}
            className={`px-4 py-2 rounded border text-sm transition-all ${selectedAc === i ? 'bg-blue-600/20 border-blue-600/50 text-blue-300' : 'border-[#1a2535] text-slate-400 hover:text-slate-200 hover:border-slate-500'}`}>
            <span className="font-data font-bold">{ac.tail}</span>
            <span className="text-slate-500 text-xs"> — {ac.type}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { labelKey: 'ac.hobbs', value: '1,203.7', sub: '+0.9 last flight' },
          { labelKey: 'ac.tach',  value: '1,186.3', sub: '+0.8 last flight' },
          { labelKey: 'ac.fuel',  value: '38.5 USG', sub: '~5.8 hrs endurance' },
        ].map(s => (
          <Card key={s.labelKey} className="p-4">
            <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">{t(s.labelKey)}</div>
            <div className="text-2xl font-bold font-data text-white">{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.sub}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Engine strip */}
        <Card className="p-4">
          <div className="text-xs text-slate-500 uppercase tracking-widest mb-3">{t('ac.engine')}</div>
          <div className="space-y-2">
            {ENGINE_DATA.map(e => {
              const pct = ((e.value - e.min) / (e.max - e.min)) * 100
              const limitPct = ((e.limit - e.min) / (e.max - e.min)) * 100
              const warn = pct > limitPct * 0.95
              return (
                <div key={e.label} className="flex items-center gap-3">
                  <span className="text-[10px] font-data text-slate-500 w-14">{e.label}</span>
                  <div className="flex-1 relative h-2 bg-[#1a2535] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: warn ? '#f59e0b' : '#3b82f6' }} />
                    <div className="absolute top-0 h-full w-0.5 bg-red-500/60" style={{ left: `${limitPct}%` }} />
                  </div>
                  <span className={`text-[11px] font-data font-bold w-16 text-right ${warn ? 'text-amber-400' : 'text-slate-400'}`}>{e.value}{e.unit}</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Maintenance */}
        <Card className="p-4">
          <div className="text-xs text-slate-500 uppercase tracking-widest mb-3">{t('ac.maintenance')}</div>
          <div className="space-y-2.5">
            {MX_ITEMS.map(m => (
              <div key={m.item} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${m.status === 'ok' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="text-xs text-slate-300">{m.item}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-data text-slate-400">{m.due}</div>
                  {m.hobbs !== '—' && <div className="text-[10px] text-slate-600">{m.hobbs}</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent flights */}
      <Card className="p-4">
        <div className="text-xs text-slate-500 uppercase tracking-widest mb-3">{t('ac.recent')} — {AIRCRAFT_FLEET[selectedAc].tail}</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-600 border-b border-[#1a2535]">
              {[t('ac.date'), t('ac.route'), t('ac.hobbs_col'), t('ac.tach_col'), t('ac.pax')].map((h, i) => (
                <th key={i} className={`py-1.5 font-medium ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RECENT_FLIGHTS.map((f, i) => (
              <tr key={i} className="border-b border-[#1a2535]/50 hover:bg-[#111d2c] transition-colors">
                <td className="py-2 text-slate-500 font-data">{f.date}</td>
                <td className="py-2 text-slate-300 font-data">{f.from} → {f.to}</td>
                <td className="py-2 text-right font-data text-slate-400">{f.hobbs} hr</td>
                <td className="py-2 text-right font-data text-slate-400">{f.tach} hr</td>
                <td className="py-2 text-right text-slate-500">{f.pax}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN 6 — Documents & AIS
// ═══════════════════════════════════════════════════════════════════════════════
const DOCUMENTS = [
  { category: 'Pilot Operating Handbooks', items: ['N4521G — Cessna 172S POH (Rev. 2023)', 'N7893K — PA-28-181 Archer POH (Rev. 2021)', 'N1032B — A36 Bonanza POH (Rev. 2022)'] },
  { category: 'Standard Operating Procedures', items: ['Club SOP v4.2 — General Operating Rules', 'SOP — Mountain Flying Supplement', 'SOP — Night Currency Requirements', 'SOP — Passenger Briefing Checklist'] },
  { category: 'AIS Publications', items: ['AIP EN ROUTE SUPPLEMENT (NOTAM)', 'ENR 1.1 — General Rules of the Air', 'ENR 2.1 — Airspace Classification', 'AD 2 — Aerodrome Section (KBOS)'] },
  { category: 'Regulatory', items: ['FAR Part 61 — Certification of Pilots', 'FAR Part 91 — General Operating Rules', 'FAR Part 830 — NTSB Notification Procedures', 'Advisory Circular AC 91-73B'] },
]

function Documents() {
  const { t } = useLang()
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [inputVal, setInputVal] = useState('')

  const chat = [
    { role: 'user' as const, text: t('doc.q1') },
    { role: 'assistant' as const, text: t('doc.a1'), citations: JSON.parse(t('doc.c1')) as string[] },
    { role: 'user' as const, text: t('doc.q2') },
    { role: 'assistant' as const, text: t('doc.a2'), citations: JSON.parse(t('doc.c2')) as string[] },
  ]

  return (
    <div className="flex h-full">
      <div className="w-64 flex-shrink-0 border-r border-[#1a2535] p-3 overflow-auto">
        <div className="text-[10px] text-slate-600 uppercase tracking-widest px-2 py-1 mb-2">{t('doc.library')}</div>
        {DOCUMENTS.map(cat => (
          <div key={cat.category} className="mb-3">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 mb-1">{cat.category}</div>
            {cat.items.map(doc => (
              <button key={doc} onClick={() => setSelectedDoc(doc)}
                className={`w-full text-left px-2.5 py-2 rounded text-xs transition-all ${selectedDoc === doc ? 'bg-blue-600/20 border border-blue-600/40 text-blue-300' : 'text-slate-400 hover:bg-[#0f1822] border border-transparent hover:text-slate-200'}`}>
                {doc}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col">
        <div className="px-6 py-4 border-b border-[#1a2535]">
          <h2 className="text-base font-bold text-white">{t('doc.title')}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{t('doc.subtitle')}</p>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          {chat.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-2xl">
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center"><Icon.book /></div>
                    <span className="text-xs text-slate-500 font-medium">{t('doc.sender')}</span>
                  </div>
                )}
                <div className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600/20 border border-blue-600/30 text-slate-200'
                    : 'bg-[#0f1822] border border-[#1a2535] text-slate-300'
                }`}>
                  {msg.text.split('\n').map((line, j) => {
                    const html = line.replace(/\*\*(.*?)\*\*/g, (_, t) => `<strong class="text-white font-semibold">${t}</strong>`)
                    return <p key={j} dangerouslySetInnerHTML={{ __html: html }} className={j > 0 ? 'mt-2' : ''} />
                  })}
                  {msg.citations && (
                    <div className="mt-3 pt-3 border-t border-[#1a2535] space-y-1">
                      {msg.citations.map(c => (
                        <div key={c} className="flex items-center gap-1.5 text-xs text-blue-400">
                          <Icon.info /><span className="font-data">{c}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div className="text-center text-xs text-slate-600 italic">{t('doc.end')}</div>
        </div>

        <div className="px-6 py-4 border-t border-[#1a2535]">
          <div className="flex gap-3">
            <input value={inputVal} onChange={e => setInputVal(e.target.value)}
              placeholder={t('doc.placeholder')}
              className="flex-1 bg-[#0f1822] border border-[#1a2535] rounded-lg px-4 py-2.5 text-sm text-slate-300 placeholder-slate-600 outline-none focus:border-blue-600/50 transition-colors" />
            <button className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium">
              <Icon.send /> {t('btn.ask')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [activeNav, setActiveNav] = useState<NavItem>('dashboard')
  const [lang, setLang] = useState<Lang>('en')
  const t = useTrans(lang)

  return (
    <LangCtx.Provider value={{ lang, t }}>
      <div className="flex h-screen bg-[#0d1219] text-slate-200 overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <Sidebar active={activeNav} setActive={setActiveNav} lang={lang} setLang={setLang} />
        <main className="flex-1 overflow-auto">
          {activeNav === 'dashboard'  && <Dashboard setActive={setActiveNav} />}
          {activeNav === 'weather'    && <Weather />}
          {activeNav === 'checklists' && <Checklists />}
          {activeNav === 'risk'       && <RiskAssessment />}
          {activeNav === 'aircraft'   && <Aircraft />}
          {activeNav === 'documents'  && <Documents />}
        </main>
      </div>
    </LangCtx.Provider>
  )
}
