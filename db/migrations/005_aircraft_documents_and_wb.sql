-- Airworthiness/document validity records and the weight & balance profile
-- (aircraft-fleet capability). Both are pilot-entered reference data: the
-- expiry/due status shown on screen is always derived from these dates at
-- render time (never stored), and the W&B profile is captured here for a
-- later change to compute against — no calculation happens in this schema.

-- One row per document kind (CofA, ARC, registration, insurance, radio
-- licence, noise certificate, mass & balance statement, ELT registration, …).
-- `expires_on` is nullable: a document kind that does not expire (e.g. the
-- certificate of registration) is recorded without one.
CREATE TABLE aircraft_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  aircraft_id uuid NOT NULL,
  kind text NOT NULL,
  reference text,
  issued_on date,
  expires_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Rejects a document whose aircraft_id belongs to a different pilot than
  -- this row's own pilot_id — the database enforces ownership consistency,
  -- not just the application (design decision 6).
  CONSTRAINT aircraft_documents_aircraft_pilot_fk
    FOREIGN KEY (aircraft_id, pilot_id) REFERENCES aircraft (id, pilot_id) ON DELETE CASCADE,
  CONSTRAINT aircraft_documents_dates_check
    CHECK (issued_on IS NULL OR expires_on IS NULL OR expires_on >= issued_on)
);

CREATE TRIGGER aircraft_documents_set_updated_at
  BEFORE UPDATE ON aircraft_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX aircraft_documents_aircraft_id_idx ON aircraft_documents (aircraft_id);

-- Weight & balance profile: one optional profile per aircraft, stored
-- directly on the aircraft row (an aircraft has at most one). A profile
-- "exists" when empty_weight is not null; the other fields may be entered
-- independently. Units are recorded alongside the values so nothing is ever
-- silently converted.
ALTER TABLE aircraft ADD COLUMN wb_empty_weight numeric(10, 2);
ALTER TABLE aircraft ADD COLUMN wb_empty_weight_arm numeric(10, 2);
ALTER TABLE aircraft ADD COLUMN wb_mtow numeric(10, 2);
ALTER TABLE aircraft ADD COLUMN wb_mlw numeric(10, 2);
ALTER TABLE aircraft ADD COLUMN wb_mzfw numeric(10, 2);
ALTER TABLE aircraft ADD COLUMN wb_usable_fuel_qty numeric(10, 2);
ALTER TABLE aircraft ADD COLUMN wb_usable_fuel_arm numeric(10, 2);
ALTER TABLE aircraft ADD COLUMN wb_mass_unit text;
ALTER TABLE aircraft ADD COLUMN wb_length_unit text;
ALTER TABLE aircraft ADD CONSTRAINT aircraft_wb_limits_check
  CHECK (wb_empty_weight IS NULL OR wb_mtow IS NULL OR wb_empty_weight <= wb_mtow);

-- Load stations: an ordered list of named stations, each with an arm and a
-- maximum weight.
CREATE TABLE aircraft_load_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  aircraft_id uuid NOT NULL,
  position integer NOT NULL,
  name text NOT NULL,
  arm numeric(10, 2) NOT NULL,
  max_weight numeric(10, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aircraft_load_stations_aircraft_pilot_fk
    FOREIGN KEY (aircraft_id, pilot_id) REFERENCES aircraft (id, pilot_id) ON DELETE CASCADE,
  CONSTRAINT aircraft_load_stations_position_unique UNIQUE (aircraft_id, position)
);

CREATE TRIGGER aircraft_load_stations_set_updated_at
  BEFORE UPDATE ON aircraft_load_stations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- CG envelope points: an ordered list of (weight, cg) pairs describing the
-- envelope polygon.
CREATE TABLE aircraft_cg_envelope_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  aircraft_id uuid NOT NULL,
  position integer NOT NULL,
  weight numeric(10, 2) NOT NULL,
  cg numeric(10, 3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aircraft_cg_points_aircraft_pilot_fk
    FOREIGN KEY (aircraft_id, pilot_id) REFERENCES aircraft (id, pilot_id) ON DELETE CASCADE,
  CONSTRAINT aircraft_cg_points_position_unique UNIQUE (aircraft_id, position)
);

CREATE TRIGGER aircraft_cg_envelope_points_set_updated_at
  BEFORE UPDATE ON aircraft_cg_envelope_points
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
