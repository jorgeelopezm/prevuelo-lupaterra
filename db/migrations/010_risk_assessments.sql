-- Pre-flight risk assessment (preflight-risk-assessment capability): one
-- immutable record per completed IMSAFE/PAVE evaluation. `answers` and
-- `domain_scores` are stored as JSONB documents (design.md: item weights and
-- thresholds live in code, not the database — these columns are the record of
-- what was asked and computed at submission time, not a live-recomputed
-- view). `aircraft_snapshot` is a point-in-time copy of the Aircraft domain's
-- auto-scored fleet data, not a live join (design.md: "Aircraft domain
-- auto-score is a snapshot, not a live join") — a past evaluation must keep
-- showing what was actually known when the pilot made the go/no-go call even
-- if the aircraft's logged data changes later.
CREATE TABLE risk_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  flight_intent_id uuid NOT NULL,
  answers jsonb NOT NULL,
  domain_scores jsonb NOT NULL,
  overall_score integer NOT NULL,
  verdict text NOT NULL,
  aircraft_snapshot jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_assessments_flight_intent_pilot_fk
    FOREIGN KEY (flight_intent_id, pilot_id)
    REFERENCES flight_intents (id, pilot_id) ON DELETE CASCADE,
  CONSTRAINT risk_assessments_verdict_check
    CHECK (verdict IN ('low', 'medium', 'high'))
);

CREATE INDEX risk_assessments_flight_intent_id_idx ON risk_assessments (flight_intent_id);
CREATE INDEX risk_assessments_pilot_id_idx ON risk_assessments (pilot_id);
