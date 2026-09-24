/**
 * Built-in generic general-aviation checklist template (aircraft-checklists
 * capability). Seeded into a pilot-owned copy at aircraft-creation time
 * (design decision 3) and, for pre-existing aircraft, by migration 011's
 * backfill — never re-applied afterwards (design decision 4). Content here
 * is generic GA procedure text, not transcribed from any specific POH/AFM,
 * and deliberately avoids performance figures tied to one aircraft type.
 *
 * `TEMPLATE_VERSION` is bumped whenever this content changes; existing rows
 * carry the version they were seeded at and are never rewritten.
 */
export const TEMPLATE_VERSION = 1

export interface TemplateLocaleText {
  es: string
  en: string
  pt: string
}

export interface TemplateItem {
  position: number
  text: TemplateLocaleText
}

export interface TemplateChecklist {
  position: number
  kind: 'normal' | 'emergency'
  role: 'preflight' | null
  name: TemplateLocaleText
  items: TemplateItem[]
}

function items(list: ReadonlyArray<TemplateLocaleText>): TemplateItem[] {
  return list.map((text, position) => ({ position, text }))
}

export const GENERIC_GA_TEMPLATE: readonly TemplateChecklist[] = [
  {
    position: 0,
    kind: 'normal',
    role: 'preflight',
    name: {
      es: 'Antes del vuelo / Recorrido exterior',
      en: 'Preflight / Walkaround',
      pt: 'Pré-voo / Inspeção externa',
    },
    items: items([
      {
        es: 'Retirar cubiertas, tapones y amarres',
        en: 'Remove covers, plugs, and tie-downs',
        pt: 'Retirar coberturas, tampões e amarras',
      },
      {
        es: 'Verificar los documentos de a bordo (matrícula, certificados, manual)',
        en: 'Check onboard documents (registration, certificates, manual)',
        pt: 'Verificar os documentos de bordo (matrícula, certificados, manual)',
      },
      {
        es: 'Verificar cantidad y calidad del combustible en cada tanque',
        en: 'Check fuel quantity and quality in each tank',
        pt: 'Verificar quantidade e qualidade do combustível em cada tanque',
      },
      {
        es: 'Verificar el nivel de aceite del motor',
        en: 'Check engine oil level',
        pt: 'Verificar o nível de óleo do motor',
      },
      {
        es: 'Inspeccionar la hélice y el capó del motor',
        en: 'Inspect the propeller and engine cowling',
        pt: 'Inspecionar a hélice e o capô do motor',
      },
      {
        es: 'Inspeccionar neumáticos, frenos y tren de aterrizaje',
        en: 'Inspect tires, brakes, and landing gear',
        pt: 'Inspecionar pneus, freios e trem de aterragem',
      },
      {
        es: 'Verificar que las tomas estáticas y el tubo pitot estén libres de obstrucciones',
        en: 'Check that the static ports and pitot tube are free of obstructions',
        pt: 'Verificar se as tomadas estáticas e o tubo pitot estão livres de obstruções',
      },
      {
        es: 'Inspeccionar superficies de control y sus topes',
        en: 'Inspect control surfaces and their stops',
        pt: 'Inspecionar as superfícies de controlo e os seus limites',
      },
      {
        es: 'Verificar luces, antenas y ELT',
        en: 'Check lights, antennas, and the ELT',
        pt: 'Verificar luzes, antenas e ELT',
      },
      {
        es: 'Purgar los sumideros de combustible',
        en: 'Drain the fuel sumps',
        pt: 'Drenar os sumidouros de combustível',
      },
      {
        es: 'Verificar que el peso y balance estén dentro de límites',
        en: 'Verify weight and balance are within limits',
        pt: 'Verificar se o peso e balanceamento estão dentro dos limites',
      },
    ]),
  },
  {
    position: 1,
    kind: 'normal',
    role: null,
    name: { es: 'Antes de arrancar', en: 'Before Start', pt: 'Antes de ligar' },
    items: items([
      {
        es: 'Asientos, cinturones y puertas asegurados',
        en: 'Seats, seatbelts, and doors secured',
        pt: 'Assentos, cintos e portas fixados',
      },
      { es: 'Frenos — puestos', en: 'Brakes — set', pt: 'Freios — acionados' },
      {
        es: 'Interruptores eléctricos — apagados salvo los necesarios para el arranque',
        en: 'Electrical switches — off except those needed for start',
        pt: 'Interruptores elétricos — desligados exceto os necessários para ligar',
      },
      {
        es: 'Selector de combustible — verificado',
        en: 'Fuel selector — checked',
        pt: 'Seletor de combustível — verificado',
      },
      {
        es: 'Área alrededor de la hélice — despejada',
        en: 'Area around the propeller — clear',
        pt: 'Área em torno da hélice — livre',
      },
      {
        es: 'Avisar "despejando hélice" antes de arrancar',
        en: 'Call "clear prop" before starting',
        pt: 'Avisar "hélice livre" antes de ligar',
      },
    ]),
  },
  {
    position: 2,
    kind: 'normal',
    role: null,
    name: { es: 'Antes del despegue', en: 'Before Takeoff', pt: 'Antes da decolagem' },
    items: items([
      {
        es: 'Instrumentos y altímetro — verificados y ajustados',
        en: 'Instruments and altimeter — checked and set',
        pt: 'Instrumentos e altímetro — verificados e ajustados',
      },
      {
        es: 'Prueba de motor y sistemas — dentro de límites',
        en: 'Engine and systems run-up — within limits',
        pt: 'Verificação do motor e sistemas — dentro dos limites',
      },
      {
        es: 'Controles de vuelo — libres y correctos',
        en: 'Flight controls — free and correct',
        pt: 'Comandos de voo — livres e corretos',
      },
      {
        es: 'Compensador (trim) — ajustado para el despegue',
        en: 'Trim — set for takeoff',
        pt: 'Compensador (trim) — ajustado para a decolagem',
      },
      {
        es: 'Briefing de despegue — pista, velocidades y plan de emergencia',
        en: 'Takeoff briefing — runway, speeds, and emergency plan',
        pt: 'Briefing de decolagem — pista, velocidades e plano de emergência',
      },
      {
        es: 'Transpondedor — encendido',
        en: 'Transponder — on',
        pt: 'Transponder — ligado',
      },
      {
        es: 'Cinturones — abrochados',
        en: 'Seatbelts — fastened',
        pt: 'Cintos — apertados',
      },
    ]),
  },
  {
    position: 3,
    kind: 'normal',
    role: null,
    name: { es: 'Crucero', en: 'Cruise', pt: 'Cruzeiro' },
    items: items([
      {
        es: 'Verificar parámetros del motor dentro de límites',
        en: 'Verify engine parameters are within limits',
        pt: 'Verificar os parâmetros do motor dentro dos limites',
      },
      {
        es: 'Gestionar el combustible según lo planificado',
        en: 'Manage fuel as planned',
        pt: 'Gerir o combustível conforme planeado',
      },
      {
        es: 'Monitorear la posición y la navegación',
        en: 'Monitor position and navigation',
        pt: 'Monitorizar a posição e a navegação',
      },
      {
        es: 'Revisar las condiciones meteorológicas en ruta',
        en: 'Review weather conditions along the route',
        pt: 'Rever as condições meteorológicas na rota',
      },
      {
        es: 'Ajustar la mezcla según la altitud',
        en: 'Adjust mixture for altitude',
        pt: 'Ajustar a mistura em função da altitude',
      },
    ]),
  },
  {
    position: 4,
    kind: 'normal',
    role: null,
    name: { es: 'Antes de aterrizar', en: 'Before Landing', pt: 'Antes de aterrar' },
    items: items([
      {
        es: 'Obtener información del aeródromo (ATIS, viento, pista)',
        en: 'Obtain aerodrome information (ATIS, wind, runway)',
        pt: 'Obter informação do aeródromo (ATIS, vento, pista)',
      },
      {
        es: 'Selector de combustible — en la posición adecuada',
        en: 'Fuel selector — in the appropriate position',
        pt: 'Seletor de combustível — na posição adequada',
      },
      {
        es: 'Mezcla — enriquecida según corresponda',
        en: 'Mixture — enriched as appropriate',
        pt: 'Mistura — enriquecida conforme necessário',
      },
      {
        es: 'Tren y flaps — configurados para el aterrizaje',
        en: 'Gear and flaps — configured for landing',
        pt: 'Trem e flaps — configurados para a aterragem',
      },
      {
        es: 'Cinturones — abrochados',
        en: 'Seatbelts — fastened',
        pt: 'Cintos — apertados',
      },
      {
        es: 'Briefing de aproximación frustrada',
        en: 'Go-around briefing',
        pt: 'Briefing de aproximação frustrada',
      },
    ]),
  },
  {
    position: 5,
    kind: 'normal',
    role: null,
    name: { es: 'Apagado y asegurado', en: 'Shutdown / Securing', pt: 'Corte e segurança' },
    items: items([
      { es: 'Frenos — puestos', en: 'Brakes — set', pt: 'Freios — acionados' },
      {
        es: 'Sistemas eléctricos y aviónica — apagados en orden',
        en: 'Electrical and avionics systems — shut down in order',
        pt: 'Sistemas elétricos e aviónicos — desligados por ordem',
      },
      {
        es: 'Motor — apagado según procedimiento',
        en: 'Engine — shut down per procedure',
        pt: 'Motor — cortado conforme o procedimento',
      },
      {
        es: 'Traba de controles — instalada',
        en: 'Control lock — installed',
        pt: 'Bloqueio de comandos — instalado',
      },
      {
        es: 'Aeronave — amarrada y protegida',
        en: 'Aircraft — tied down and secured',
        pt: 'Aeronave — amarrada e protegida',
      },
      {
        es: 'Documentar el vuelo en la bitácora',
        en: 'Record the flight in the logbook',
        pt: 'Registar o voo no diário de bordo',
      },
    ]),
  },
  {
    position: 6,
    kind: 'emergency',
    role: null,
    name: {
      es: 'Falla de motor — En vuelo',
      en: 'Engine Failure — Airborne',
      pt: 'Falha de motor — Em voo',
    },
    items: items([
      {
        es: 'Mantener el control de la aeronave — velocidad de mejor planeo',
        en: 'Maintain aircraft control — best glide speed',
        pt: 'Manter o controlo da aeronave — velocidade de melhor planeio',
      },
      {
        es: 'Buscar un área de aterrizaje adecuada',
        en: 'Select a suitable landing area',
        pt: 'Selecionar uma área de aterragem adequada',
      },
      {
        es: 'Intentar restablecer potencia si el tiempo lo permite (combustible, mezcla, magnetos)',
        en: 'Attempt to restore power if time allows (fuel, mixture, magnetos)',
        pt: 'Tentar restabelecer potência se o tempo permitir (combustível, mistura, magnetos)',
      },
      {
        es: 'Declarar emergencia por radio (7700 / MAYDAY)',
        en: 'Declare an emergency by radio (7700 / MAYDAY)',
        pt: 'Declarar emergência por rádio (7700 / MAYDAY)',
      },
      {
        es: 'Preparar a los ocupantes para el aterrizaje forzoso',
        en: 'Prepare occupants for the forced landing',
        pt: 'Preparar os ocupantes para a aterragem forçada',
      },
      {
        es: 'Asegurar el área de aterrizaje antes del contacto',
        en: 'Secure the landing area before touchdown',
        pt: 'Preparar a área de aterragem antes do contacto',
      },
    ]),
  },
  {
    position: 7,
    kind: 'emergency',
    role: null,
    name: {
      es: 'Incendio de motor — En vuelo',
      en: 'Engine Fire — In-Flight',
      pt: 'Incêndio no motor — Em voo',
    },
    items: items([
      {
        es: 'Cortar el combustible al motor',
        en: 'Shut off fuel to the engine',
        pt: 'Cortar o combustível ao motor',
      },
      { es: 'Mezcla — cortada', en: 'Mixture — cut off', pt: 'Mistura — cortada' },
      {
        es: 'Calefacción y ventilación de cabina — cerradas para evitar la entrada de humo',
        en: 'Cabin heat and vents — closed to keep smoke out',
        pt: 'Aquecimento e ventilação da cabina — fechados para evitar entrada de fumo',
      },
      {
        es: 'Interruptor maestro — según corresponda tras cortar el motor',
        en: 'Master switch — as appropriate after shutting down the engine',
        pt: 'Interruptor geral — conforme apropriado após cortar o motor',
      },
      {
        es: 'Descender y buscar el aterrizaje más cercano',
        en: 'Descend and head for the nearest landing site',
        pt: 'Descer e dirigir-se para o local de aterragem mais próximo',
      },
      {
        es: 'Declarar emergencia por radio',
        en: 'Declare an emergency by radio',
        pt: 'Declarar emergência por rádio',
      },
    ]),
  },
  {
    position: 8,
    kind: 'emergency',
    role: null,
    name: { es: 'Incendio eléctrico', en: 'Electrical Fire', pt: 'Incêndio elétrico' },
    items: items([
      {
        es: 'Interruptor maestro — apagado',
        en: 'Master switch — off',
        pt: 'Interruptor geral — desligado',
      },
      {
        es: 'Todos los interruptores eléctricos — apagados',
        en: 'All electrical switches — off',
        pt: 'Todos os interruptores elétricos — desligados',
      },
      {
        es: 'Extintor — usar si hay fuego visible',
        en: 'Fire extinguisher — use if fire is visible',
        pt: 'Extintor — usar se houver fogo visível',
      },
      {
        es: 'Ventilación — abrir para disipar el humo una vez controlado el fuego',
        en: 'Ventilation — open to clear smoke once the fire is controlled',
        pt: 'Ventilação — abrir para dissipar o fumo depois de controlado o fogo',
      },
      {
        es: 'Aterrizar en el aeródromo más cercano',
        en: 'Land at the nearest aerodrome',
        pt: 'Aterrar no aeródromo mais próximo',
      },
    ]),
  },
]
