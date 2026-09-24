-- Maintenance tracking (maintenance-tracking capability): pilot-entered
-- reminder items with a date-based and/or hours-based due condition. The
-- remaining-time/remaining-hours countdown is always computed at render time
-- from these due conditions plus the aircraft's derived hour total (see
-- flight-logbook's aircraftTotals) — never stored here.
CREATE TABLE maintenance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  aircraft_id uuid NOT NULL,
  description text NOT NULL,
  due_on date,
  due_at_hours numeric(10, 2),
  -- Which of the aircraft's derived hour totals due_at_hours is measured
  -- against (airframe or tach — the two totals flight-logbook derives).
  hours_basis text,
  recurrence_months integer,
  recurrence_hours numeric(10, 2),
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_items_aircraft_pilot_fk
    FOREIGN KEY (aircraft_id, pilot_id) REFERENCES aircraft (id, pilot_id) ON DELETE CASCADE,
  -- At least one due condition is required (spec: "Item with no due condition").
  CONSTRAINT maintenance_items_due_condition_check
    CHECK (due_on IS NOT NULL OR due_at_hours IS NOT NULL),
  CONSTRAINT maintenance_items_hours_basis_check
    CHECK (due_at_hours IS NULL OR hours_basis IN ('airframe', 'tach'))
);

CREATE TRIGGER maintenance_items_set_updated_at
  BEFORE UPDATE ON maintenance_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX maintenance_items_aircraft_id_idx ON maintenance_items (aircraft_id);

-- Completion history: recurring items roll forward (a new due condition is
-- computed from the completion values plus the recurrence interval, not
-- stored as a fabricated "next due" row) while every past completion stays
-- visible (spec: "Completion history").
CREATE TABLE maintenance_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  maintenance_item_id uuid NOT NULL REFERENCES maintenance_items(id) ON DELETE CASCADE,
  completed_on date NOT NULL,
  completed_at_hours numeric(10, 2),
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX maintenance_completions_item_id_idx ON maintenance_completions (maintenance_item_id);
