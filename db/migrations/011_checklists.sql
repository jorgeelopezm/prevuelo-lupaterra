-- Checklist library (aircraft-checklists capability): the pilot-owned
-- checklists and their items for one aircraft. Every aircraft is seeded with
-- the built-in generic GA template (src/platform/checklists/template.ts) at
-- creation time (design decision 3); this migration backfills the same seed
-- for aircraft recorded before this capability existed (design.md task 1.4).
-- `source` flips from 'template' to 'pilot' the moment the pilot edits a
-- checklist's name or any of its items (design decision: "Caveat disappears
-- once the pilot edits") — the repo, not this schema, enforces the flip.
CREATE TABLE checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  aircraft_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  -- At most one normal checklist per aircraft may carry 'preflight'
  -- (checklists_preflight_uniq below); nullable because most checklists
  -- carry no designation at all.
  role text,
  source text NOT NULL,
  -- Which template version this checklist was seeded from, or NULL for a
  -- checklist the pilot created directly. Never re-read after seeding — the
  -- template is never re-applied (design.md: "Template changes do not reach
  -- existing libraries").
  template_version integer,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checklists_aircraft_pilot_fk
    FOREIGN KEY (aircraft_id, pilot_id) REFERENCES aircraft (id, pilot_id) ON DELETE CASCADE,
  -- Lets checklist_items and checklist_runs declare a composite foreign key
  -- against (id, pilot_id), so the database rejects a child row whose
  -- checklist belongs to a different pilot (mirrors aircraft's own pattern).
  CONSTRAINT checklists_id_pilot_id_unique UNIQUE (id, pilot_id),
  CONSTRAINT checklists_kind_check CHECK (kind IN ('normal', 'emergency')),
  CONSTRAINT checklists_role_check CHECK (role IS NULL OR role = 'preflight'),
  CONSTRAINT checklists_source_check CHECK (source IN ('template', 'pilot'))
);

CREATE TRIGGER checklists_set_updated_at
  BEFORE UPDATE ON checklists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX checklists_aircraft_id_idx ON checklists (aircraft_id);

-- At most one checklist per aircraft may carry the pre-flight designation
-- (design decision 11); the seeded Preflight/Walkaround checklist carries it
-- from creation, and the pilot may move it to another normal checklist.
CREATE UNIQUE INDEX checklists_preflight_uniq ON checklists (aircraft_id) WHERE role = 'preflight';

CREATE TABLE checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  checklist_id uuid NOT NULL,
  text text NOT NULL,
  -- Reserved for challenge/response items (design.md open question 2);
  -- unused and unread in v1 — every item ships as flat text.
  response text,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checklist_items_checklist_pilot_fk
    FOREIGN KEY (checklist_id, pilot_id) REFERENCES checklists (id, pilot_id) ON DELETE CASCADE,
  CONSTRAINT checklist_items_id_pilot_id_unique UNIQUE (id, pilot_id)
);

CREATE TRIGGER checklist_items_set_updated_at
  BEFORE UPDATE ON checklist_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX checklist_items_checklist_id_idx ON checklist_items (checklist_id);

-- Backfill: seed every existing non-retired aircraft with the same generic
-- template a newly created aircraft receives (design.md task 1.4). Generated
-- from src/platform/checklists/template.ts by
-- scripts/generate-checklist-seed.mts — do not hand-edit the block below;
-- regenerate it with `npx tsx scripts/generate-checklist-seed.mts` and paste
-- the output back in if the template ever changes before this migration
-- ships. Forward-only: aircraft recorded after this migration are seeded by
-- the application (seedChecklistsForAircraft), and retired aircraft are not
-- backfilled.
-- BEGIN GENERATED BACKFILL
INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Antes del vuelo / Recorrido exterior', 'normal', 'preflight', 'template', 1, 0
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt');

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Retirar cubiertas, tapones y amarres'), (1, 'Verificar los documentos de a bordo (matrícula, certificados, manual)'), (2, 'Verificar cantidad y calidad del combustible en cada tanque'), (3, 'Verificar el nivel de aceite del motor'), (4, 'Inspeccionar la hélice y el capó del motor'), (5, 'Inspeccionar neumáticos, frenos y tren de aterrizaje'), (6, 'Verificar que las tomas estáticas y el tubo pitot estén libres de obstrucciones'), (7, 'Inspeccionar superficies de control y sus topes'), (8, 'Verificar luces, antenas y ELT'), (9, 'Purgar los sumideros de combustible'), (10, 'Verificar que el peso y balance estén dentro de límites')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt')
  AND c.name = 'Antes del vuelo / Recorrido exterior' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Antes de arrancar', 'normal', NULL, 'template', 1, 1
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt');

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Asientos, cinturones y puertas asegurados'), (1, 'Frenos — puestos'), (2, 'Interruptores eléctricos — apagados salvo los necesarios para el arranque'), (3, 'Selector de combustible — verificado'), (4, 'Área alrededor de la hélice — despejada'), (5, 'Avisar "despejando hélice" antes de arrancar')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt')
  AND c.name = 'Antes de arrancar' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Antes del despegue', 'normal', NULL, 'template', 1, 2
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt');

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Instrumentos y altímetro — verificados y ajustados'), (1, 'Prueba de motor y sistemas — dentro de límites'), (2, 'Controles de vuelo — libres y correctos'), (3, 'Compensador (trim) — ajustado para el despegue'), (4, 'Briefing de despegue — pista, velocidades y plan de emergencia'), (5, 'Transpondedor — encendido'), (6, 'Cinturones — abrochados')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt')
  AND c.name = 'Antes del despegue' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Crucero', 'normal', NULL, 'template', 1, 3
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt');

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Verificar parámetros del motor dentro de límites'), (1, 'Gestionar el combustible según lo planificado'), (2, 'Monitorear la posición y la navegación'), (3, 'Revisar las condiciones meteorológicas en ruta'), (4, 'Ajustar la mezcla según la altitud')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt')
  AND c.name = 'Crucero' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Antes de aterrizar', 'normal', NULL, 'template', 1, 4
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt');

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Obtener información del aeródromo (ATIS, viento, pista)'), (1, 'Selector de combustible — en la posición adecuada'), (2, 'Mezcla — enriquecida según corresponda'), (3, 'Tren y flaps — configurados para el aterrizaje'), (4, 'Cinturones — abrochados'), (5, 'Briefing de aproximación frustrada')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt')
  AND c.name = 'Antes de aterrizar' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Apagado y asegurado', 'normal', NULL, 'template', 1, 5
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt');

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Frenos — puestos'), (1, 'Sistemas eléctricos y aviónica — apagados en orden'), (2, 'Motor — apagado según procedimiento'), (3, 'Traba de controles — instalada'), (4, 'Aeronave — amarrada y protegida'), (5, 'Documentar el vuelo en la bitácora')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt')
  AND c.name = 'Apagado y asegurado' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Falla de motor — En vuelo', 'emergency', NULL, 'template', 1, 6
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt');

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Mantener el control de la aeronave — velocidad de mejor planeo'), (1, 'Buscar un área de aterrizaje adecuada'), (2, 'Intentar restablecer potencia si el tiempo lo permite (combustible, mezcla, magnetos)'), (3, 'Declarar emergencia por radio (7700 / MAYDAY)'), (4, 'Preparar a los ocupantes para el aterrizaje forzoso'), (5, 'Asegurar el área de aterrizaje antes del contacto')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt')
  AND c.name = 'Falla de motor — En vuelo' AND c.kind = 'emergency' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Incendio de motor — En vuelo', 'emergency', NULL, 'template', 1, 7
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt');

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Cortar el combustible al motor'), (1, 'Mezcla — cortada'), (2, 'Calefacción y ventilación de cabina — cerradas para evitar la entrada de humo'), (3, 'Interruptor maestro — según corresponda tras cortar el motor'), (4, 'Descender y buscar el aterrizaje más cercano'), (5, 'Declarar emergencia por radio')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt')
  AND c.name = 'Incendio de motor — En vuelo' AND c.kind = 'emergency' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Incendio eléctrico', 'emergency', NULL, 'template', 1, 8
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt');

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Interruptor maestro — apagado'), (1, 'Todos los interruptores eléctricos — apagados'), (2, 'Extintor — usar si hay fuego visible'), (3, 'Ventilación — abrir para disipar el humo una vez controlado el fuego'), (4, 'Aterrizar en el aeródromo más cercano')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale NOT IN ('en', 'pt')
  AND c.name = 'Incendio eléctrico' AND c.kind = 'emergency' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Preflight / Walkaround', 'normal', 'preflight', 'template', 1, 0
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'en';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Remove covers, plugs, and tie-downs'), (1, 'Check onboard documents (registration, certificates, manual)'), (2, 'Check fuel quantity and quality in each tank'), (3, 'Check engine oil level'), (4, 'Inspect the propeller and engine cowling'), (5, 'Inspect tires, brakes, and landing gear'), (6, 'Check that the static ports and pitot tube are free of obstructions'), (7, 'Inspect control surfaces and their stops'), (8, 'Check lights, antennas, and the ELT'), (9, 'Drain the fuel sumps'), (10, 'Verify weight and balance are within limits')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'en'
  AND c.name = 'Preflight / Walkaround' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Before Start', 'normal', NULL, 'template', 1, 1
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'en';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Seats, seatbelts, and doors secured'), (1, 'Brakes — set'), (2, 'Electrical switches — off except those needed for start'), (3, 'Fuel selector — checked'), (4, 'Area around the propeller — clear'), (5, 'Call "clear prop" before starting')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'en'
  AND c.name = 'Before Start' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Before Takeoff', 'normal', NULL, 'template', 1, 2
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'en';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Instruments and altimeter — checked and set'), (1, 'Engine and systems run-up — within limits'), (2, 'Flight controls — free and correct'), (3, 'Trim — set for takeoff'), (4, 'Takeoff briefing — runway, speeds, and emergency plan'), (5, 'Transponder — on'), (6, 'Seatbelts — fastened')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'en'
  AND c.name = 'Before Takeoff' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Cruise', 'normal', NULL, 'template', 1, 3
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'en';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Verify engine parameters are within limits'), (1, 'Manage fuel as planned'), (2, 'Monitor position and navigation'), (3, 'Review weather conditions along the route'), (4, 'Adjust mixture for altitude')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'en'
  AND c.name = 'Cruise' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Before Landing', 'normal', NULL, 'template', 1, 4
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'en';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Obtain aerodrome information (ATIS, wind, runway)'), (1, 'Fuel selector — in the appropriate position'), (2, 'Mixture — enriched as appropriate'), (3, 'Gear and flaps — configured for landing'), (4, 'Seatbelts — fastened'), (5, 'Go-around briefing')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'en'
  AND c.name = 'Before Landing' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Shutdown / Securing', 'normal', NULL, 'template', 1, 5
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'en';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Brakes — set'), (1, 'Electrical and avionics systems — shut down in order'), (2, 'Engine — shut down per procedure'), (3, 'Control lock — installed'), (4, 'Aircraft — tied down and secured'), (5, 'Record the flight in the logbook')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'en'
  AND c.name = 'Shutdown / Securing' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Engine Failure — Airborne', 'emergency', NULL, 'template', 1, 6
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'en';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Maintain aircraft control — best glide speed'), (1, 'Select a suitable landing area'), (2, 'Attempt to restore power if time allows (fuel, mixture, magnetos)'), (3, 'Declare an emergency by radio (7700 / MAYDAY)'), (4, 'Prepare occupants for the forced landing'), (5, 'Secure the landing area before touchdown')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'en'
  AND c.name = 'Engine Failure — Airborne' AND c.kind = 'emergency' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Engine Fire — In-Flight', 'emergency', NULL, 'template', 1, 7
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'en';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Shut off fuel to the engine'), (1, 'Mixture — cut off'), (2, 'Cabin heat and vents — closed to keep smoke out'), (3, 'Master switch — as appropriate after shutting down the engine'), (4, 'Descend and head for the nearest landing site'), (5, 'Declare an emergency by radio')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'en'
  AND c.name = 'Engine Fire — In-Flight' AND c.kind = 'emergency' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Electrical Fire', 'emergency', NULL, 'template', 1, 8
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'en';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Master switch — off'), (1, 'All electrical switches — off'), (2, 'Fire extinguisher — use if fire is visible'), (3, 'Ventilation — open to clear smoke once the fire is controlled'), (4, 'Land at the nearest aerodrome')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'en'
  AND c.name = 'Electrical Fire' AND c.kind = 'emergency' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Pré-voo / Inspeção externa', 'normal', 'preflight', 'template', 1, 0
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'pt';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Retirar coberturas, tampões e amarras'), (1, 'Verificar os documentos de bordo (matrícula, certificados, manual)'), (2, 'Verificar quantidade e qualidade do combustível em cada tanque'), (3, 'Verificar o nível de óleo do motor'), (4, 'Inspecionar a hélice e o capô do motor'), (5, 'Inspecionar pneus, freios e trem de aterragem'), (6, 'Verificar se as tomadas estáticas e o tubo pitot estão livres de obstruções'), (7, 'Inspecionar as superfícies de controlo e os seus limites'), (8, 'Verificar luzes, antenas e ELT'), (9, 'Drenar os sumidouros de combustível'), (10, 'Verificar se o peso e balanceamento estão dentro dos limites')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'pt'
  AND c.name = 'Pré-voo / Inspeção externa' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Antes de ligar', 'normal', NULL, 'template', 1, 1
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'pt';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Assentos, cintos e portas fixados'), (1, 'Freios — acionados'), (2, 'Interruptores elétricos — desligados exceto os necessários para ligar'), (3, 'Seletor de combustível — verificado'), (4, 'Área em torno da hélice — livre'), (5, 'Avisar "hélice livre" antes de ligar')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'pt'
  AND c.name = 'Antes de ligar' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Antes da decolagem', 'normal', NULL, 'template', 1, 2
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'pt';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Instrumentos e altímetro — verificados e ajustados'), (1, 'Verificação do motor e sistemas — dentro dos limites'), (2, 'Comandos de voo — livres e corretos'), (3, 'Compensador (trim) — ajustado para a decolagem'), (4, 'Briefing de decolagem — pista, velocidades e plano de emergência'), (5, 'Transponder — ligado'), (6, 'Cintos — apertados')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'pt'
  AND c.name = 'Antes da decolagem' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Cruzeiro', 'normal', NULL, 'template', 1, 3
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'pt';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Verificar os parâmetros do motor dentro dos limites'), (1, 'Gerir o combustível conforme planeado'), (2, 'Monitorizar a posição e a navegação'), (3, 'Rever as condições meteorológicas na rota'), (4, 'Ajustar a mistura em função da altitude')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'pt'
  AND c.name = 'Cruzeiro' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Antes de aterrar', 'normal', NULL, 'template', 1, 4
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'pt';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Obter informação do aeródromo (ATIS, vento, pista)'), (1, 'Seletor de combustível — na posição adequada'), (2, 'Mistura — enriquecida conforme necessário'), (3, 'Trem e flaps — configurados para a aterragem'), (4, 'Cintos — apertados'), (5, 'Briefing de aproximação frustrada')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'pt'
  AND c.name = 'Antes de aterrar' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Corte e segurança', 'normal', NULL, 'template', 1, 5
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'pt';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Freios — acionados'), (1, 'Sistemas elétricos e aviónicos — desligados por ordem'), (2, 'Motor — cortado conforme o procedimento'), (3, 'Bloqueio de comandos — instalado'), (4, 'Aeronave — amarrada e protegida'), (5, 'Registar o voo no diário de bordo')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'pt'
  AND c.name = 'Corte e segurança' AND c.kind = 'normal' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Falha de motor — Em voo', 'emergency', NULL, 'template', 1, 6
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'pt';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Manter o controlo da aeronave — velocidade de melhor planeio'), (1, 'Selecionar uma área de aterragem adequada'), (2, 'Tentar restabelecer potência se o tempo permitir (combustível, mistura, magnetos)'), (3, 'Declarar emergência por rádio (7700 / MAYDAY)'), (4, 'Preparar os ocupantes para a aterragem forçada'), (5, 'Preparar a área de aterragem antes do contacto')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'pt'
  AND c.name = 'Falha de motor — Em voo' AND c.kind = 'emergency' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Incêndio no motor — Em voo', 'emergency', NULL, 'template', 1, 7
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'pt';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Cortar o combustível ao motor'), (1, 'Mistura — cortada'), (2, 'Aquecimento e ventilação da cabina — fechados para evitar entrada de fumo'), (3, 'Interruptor geral — conforme apropriado após cortar o motor'), (4, 'Descer e dirigir-se para o local de aterragem mais próximo'), (5, 'Declarar emergência por rádio')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'pt'
  AND c.name = 'Incêndio no motor — Em voo' AND c.kind = 'emergency' AND c.template_version = 1;

INSERT INTO checklists (pilot_id, aircraft_id, name, kind, role, source, template_version, position)
SELECT a.pilot_id, a.id, 'Incêndio elétrico', 'emergency', NULL, 'template', 1, 8
FROM aircraft a JOIN pilots p ON p.id = a.pilot_id
WHERE a.retired_at IS NULL AND p.locale = 'pt';

INSERT INTO checklist_items (pilot_id, checklist_id, text, position)
SELECT c.pilot_id, c.id, v.text, v.position
FROM checklists c
JOIN aircraft a ON a.id = c.aircraft_id
JOIN pilots p ON p.id = a.pilot_id
CROSS JOIN (VALUES (0, 'Interruptor geral — desligado'), (1, 'Todos os interruptores elétricos — desligados'), (2, 'Extintor — usar se houver fogo visível'), (3, 'Ventilação — abrir para dissipar o fumo depois de controlado o fogo'), (4, 'Aterrar no aeródromo mais próximo')) AS v (position, text)
WHERE a.retired_at IS NULL AND p.locale = 'pt'
  AND c.name = 'Incêndio elétrico' AND c.kind = 'emergency' AND c.template_version = 1;
-- END GENERATED BACKFILL
