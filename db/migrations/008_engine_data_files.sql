-- Imported avionics engine-monitor data (engine-data-import capability). At
-- most one file per flight entry. Samples are stored as one compact
-- column-oriented JSONB series per file, not as per-sample rows (design
-- decision 8) — the screen only ever renders per-channel min/max/last over
-- the whole flight, and a one-hour flight at 1 Hz across a dozen channels
-- would otherwise be tens of thousands of rows for a read pattern that never
-- queries an individual sample. The raw file itself is not retained after
-- parsing — only its provenance (name, size, digest, format, import time).
CREATE TABLE engine_data_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  flight_entry_id uuid NOT NULL REFERENCES flight_entries(id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  byte_size integer NOT NULL,
  content_digest text NOT NULL,
  detected_format text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  -- Recognized channel descriptors: [{ key, label, unit, cylinder }].
  channels jsonb NOT NULL,
  -- Column-oriented series: { t: number[], values: { [channelKey]: number[] } }.
  series jsonb NOT NULL,
  ignored_columns text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One import per flight entry (design decision 8): re-importing replaces it
  -- (application-level delete-then-insert), never accumulates.
  CONSTRAINT engine_data_files_flight_entry_unique UNIQUE (flight_entry_id)
);

CREATE TRIGGER engine_data_files_set_updated_at
  BEFORE UPDATE ON engine_data_files
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pilot-entered per-channel limits (engine-data-import spec: "Limits are
-- shown only when the pilot has entered them" — never inferred from the
-- aircraft type or the data itself). Stored as JSONB keyed by channel:
-- { cht: 420, egt: 1550, oil_temp: 245, oil_pressure: 100, ... }, unit
-- implied by the channel (matches whatever unit that channel's imported
-- samples are recorded in — no conversion is ever applied, per the spec).
ALTER TABLE aircraft ADD COLUMN engine_limits jsonb;
