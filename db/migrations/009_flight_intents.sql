-- Flight intent (flight-intent capability): the minimal planned-flight record
-- a risk assessment is created against. Deliberately minimal — aircraft,
-- planned date, departure/destination — so the future "New flight" feature
-- can become this table's primary writer without a breaking migration
-- (design.md: "the minimal seam for the future 'New flight' feature").
-- Immutable once other records reference it: no updated_at column, no update
-- path, and delete is only permitted while unreferenced (enforced by the repo
-- checking for referencing risk_assessments before deleting).
CREATE TABLE flight_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  aircraft_id uuid NOT NULL,
  planned_date date NOT NULL,
  departure_icao text NOT NULL,
  destination_icao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flight_intents_aircraft_pilot_fk
    FOREIGN KEY (aircraft_id, pilot_id) REFERENCES aircraft (id, pilot_id) ON DELETE CASCADE,
  -- Lets risk_assessments declare a composite foreign key against
  -- (id, pilot_id), so the database rejects a risk assessment whose flight
  -- intent belongs to a different pilot (mirrors aircraft's own pattern).
  CONSTRAINT flight_intents_id_pilot_id_unique UNIQUE (id, pilot_id)
);

CREATE INDEX flight_intents_pilot_id_idx ON flight_intents (pilot_id);
