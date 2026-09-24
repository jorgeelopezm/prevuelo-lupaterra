-- Checklist runs (checklist-runs capability): one execution of a normal
-- checklist against a flight intent. `checklist_run_items` carries a
-- *snapshot* of the checklist's items at the moment the run started — a
-- copy of their text and position, not a live view — so that editing,
-- reordering, or deleting an item never rewrites an in-progress or completed
-- run (design decision 1, precedent: risk_assessments.aircraft_snapshot).
CREATE TABLE checklist_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  -- Nullable and ON DELETE SET NULL: deleting a checklist must not delete or
  -- alter its completed runs (aircraft-checklists: "Deleting a checklist
  -- preserves completed runs"). checklist_name is denormalized onto the run
  -- for exactly that case, so history keeps a name to show.
  checklist_id uuid,
  checklist_name text NOT NULL,
  flight_intent_id uuid NOT NULL,
  aircraft_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT checklist_runs_checklist_pilot_fk
    FOREIGN KEY (checklist_id, pilot_id) REFERENCES checklists (id, pilot_id) ON DELETE SET NULL,
  CONSTRAINT checklist_runs_flight_intent_pilot_fk
    FOREIGN KEY (flight_intent_id, pilot_id) REFERENCES flight_intents (id, pilot_id) ON DELETE CASCADE,
  -- Lets checklist_run_items declare a composite foreign key against
  -- (id, pilot_id), mirroring aircraft's own pattern.
  CONSTRAINT checklist_runs_id_pilot_id_unique UNIQUE (id, pilot_id)
);

CREATE INDEX checklist_runs_pilot_id_idx ON checklist_runs (pilot_id);
CREATE INDEX checklist_runs_aircraft_id_idx ON checklist_runs (aircraft_id);
CREATE INDEX checklist_runs_checklist_id_idx ON checklist_runs (checklist_id);

-- One open run per (pilot, flight intent, checklist) (design decision 6):
-- opening the run route resumes the existing open run rather than racing
-- itself across two tabs. A completed run (completed_at set) does not count
-- toward this constraint, so a new run may start once the previous one
-- against the same pair is complete.
CREATE UNIQUE INDEX checklist_runs_open_uniq ON checklist_runs (pilot_id, flight_intent_id, checklist_id)
  WHERE completed_at IS NULL;

CREATE TABLE checklist_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  -- Provenance only ("this confirmation came from that item") — never read
  -- for display text. ON DELETE SET NULL: deleting the source item must not
  -- touch a run that already snapshotted it.
  checklist_item_id uuid REFERENCES checklist_items(id) ON DELETE SET NULL,
  text text NOT NULL,
  position integer NOT NULL,
  checked_at timestamptz,
  CONSTRAINT checklist_run_items_run_pilot_fk
    FOREIGN KEY (run_id, pilot_id) REFERENCES checklist_runs (id, pilot_id) ON DELETE CASCADE
);

CREATE INDEX checklist_run_items_run_id_idx ON checklist_run_items (run_id);
