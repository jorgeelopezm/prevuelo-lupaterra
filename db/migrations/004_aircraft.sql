-- Aircraft: the pilot-owned aircraft record. Registration is unique per pilot
-- (not globally — two different pilots may each log the same registration),
-- compared case- and separator-insensitively via the functional index below,
-- and only among an aircraft's non-retired aircraft (a retired registration
-- may be reused). `opening_*` columns are the airframe/engine/tach/landing
-- readings the aircraft had when the pilot began logging it in this
-- application; the current totals are always derived from these plus the
-- pilot's logged flights (flight_entries, migration 006) — never stored here.
CREATE TABLE aircraft (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  registration text NOT NULL,
  icao_type text NOT NULL,
  manufacturer text NOT NULL,
  model text NOT NULL,
  serial_number text,
  class_category text,
  engine text,
  propeller text,
  year_of_manufacture integer,
  home_base text,
  nickname text,
  opening_airframe_hours numeric(10, 2),
  opening_engine_hours numeric(10, 2),
  opening_tach_hours numeric(10, 2),
  opening_landings integer,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Lets child tables declare a composite foreign key against (id, pilot_id),
  -- so the database itself rejects a child row whose aircraft belongs to a
  -- different pilot than the child's own pilot_id (design decision 6).
  CONSTRAINT aircraft_id_pilot_id_unique UNIQUE (id, pilot_id)
);

CREATE TRIGGER aircraft_set_updated_at
  BEFORE UPDATE ON aircraft
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX aircraft_pilot_id_idx ON aircraft (pilot_id);

-- Per-pilot registration uniqueness, comparing only letters/digits, case-
-- insensitively, and only among non-retired aircraft (design decision 7).
CREATE UNIQUE INDEX aircraft_pilot_registration_uniq ON aircraft (
  pilot_id,
  upper(regexp_replace(registration, '[^A-Za-z0-9]', '', 'g'))
) WHERE retired_at IS NULL;

-- The pilot's active-aircraft designation (design decision 5). Nullable: a
-- pilot with no aircraft, or who has chosen none, has no active aircraft.
-- `ON DELETE SET NULL` clears the designation if the aircraft row is deleted;
-- retiring an aircraft (an application-level state change, not a delete)
-- clears it explicitly in the same transaction as the retirement.
ALTER TABLE pilots ADD COLUMN active_aircraft_id uuid REFERENCES aircraft(id) ON DELETE SET NULL;
