-- Flight logbook (flight-logbook capability). One row per leg flown or per
-- FSTD session, discriminated by `kind` (design decision 1): a flight session
-- carries `aircraft_id` and no device columns; an FSTD session carries the
-- device columns and no aircraft. All durations are stored as integer
-- minutes (design decision 2) so summing thousands of rows stays exact; the
-- form converts decimal hours / h:mm at the parse boundary.
--
-- Each entry records the pilot function it was flown in (`pilot_function`) —
-- the FCL.050 model of one function per logged leg — so "sum of function
-- times exceeds total" can never arise: the entire `total_minutes` counts
-- toward exactly one function bucket.
CREATE TABLE flight_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  aircraft_id uuid,
  kind text NOT NULL,
  flight_date date NOT NULL,
  departure_aerodrome text,
  departure_time time,
  arrival_aerodrome text,
  arrival_time time,
  pilot_function text NOT NULL,
  single_engine boolean,
  multi_engine boolean,
  total_minutes integer NOT NULL,
  night_minutes integer NOT NULL DEFAULT 0,
  ifr_minutes integer NOT NULL DEFAULT 0,
  cross_country_minutes integer NOT NULL DEFAULT 0,
  instrument_minutes integer NOT NULL DEFAULT 0,
  hobbs_out numeric(10, 2),
  hobbs_in numeric(10, 2),
  tach_out numeric(10, 2),
  tach_in numeric(10, 2),
  fuel_uplift numeric(10, 2),
  fuel_burn numeric(10, 2),
  day_landings integer NOT NULL DEFAULT 0,
  night_landings integer NOT NULL DEFAULT 0,
  passengers integer NOT NULL DEFAULT 0,
  remarks text,
  device_type text,
  device_qualification text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flight_entries_aircraft_pilot_fk
    FOREIGN KEY (aircraft_id, pilot_id) REFERENCES aircraft (id, pilot_id) ON DELETE CASCADE,
  CONSTRAINT flight_entries_kind_check CHECK (kind IN ('flight', 'fstd')),
  -- A flight session has an aircraft and no device columns; an FSTD session
  -- has device columns and no aircraft (design decision 1).
  CONSTRAINT flight_entries_kind_shape_check CHECK (
    (kind = 'flight' AND aircraft_id IS NOT NULL AND device_type IS NULL AND device_qualification IS NULL)
    OR
    (kind = 'fstd' AND aircraft_id IS NULL AND device_type IS NOT NULL)
  ),
  CONSTRAINT flight_entries_pilot_function_check
    CHECK (pilot_function IN ('pic', 'spic', 'sic', 'dual', 'instructor')),
  CONSTRAINT flight_entries_total_minutes_check CHECK (total_minutes > 0),
  CONSTRAINT flight_entries_night_minutes_check
    CHECK (night_minutes >= 0 AND night_minutes <= total_minutes),
  CONSTRAINT flight_entries_ifr_minutes_check
    CHECK (ifr_minutes >= 0 AND ifr_minutes <= total_minutes),
  CONSTRAINT flight_entries_cross_country_minutes_check
    CHECK (cross_country_minutes >= 0 AND cross_country_minutes <= total_minutes),
  CONSTRAINT flight_entries_instrument_minutes_check
    CHECK (instrument_minutes >= 0 AND instrument_minutes <= total_minutes),
  CONSTRAINT flight_entries_landings_check
    CHECK (day_landings >= 0 AND night_landings >= 0 AND passengers >= 0),
  CONSTRAINT flight_entries_hobbs_check CHECK (hobbs_in IS NULL OR hobbs_out IS NULL OR hobbs_in >= hobbs_out),
  CONSTRAINT flight_entries_tach_check CHECK (tach_in IS NULL OR tach_out IS NULL OR tach_in >= tach_out)
);

CREATE TRIGGER flight_entries_set_updated_at
  BEFORE UPDATE ON flight_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Reverse-chronological listing and per-aircraft/per-pilot aggregate queries.
CREATE INDEX flight_entries_pilot_date_idx ON flight_entries (pilot_id, flight_date DESC);
CREATE INDEX flight_entries_aircraft_date_idx ON flight_entries (aircraft_id, flight_date DESC)
  WHERE aircraft_id IS NOT NULL;
