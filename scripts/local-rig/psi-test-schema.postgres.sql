-- Minimal WHATS'ON-shaped test schema (Postgres) for the local R1 rig.
-- Matches the preset KPI templates in bridge/whatson/templates.cjs.
--   psql -U <user> -d <db> -f psi-test-schema.postgres.sql
CREATE SCHEMA IF NOT EXISTS psi;

CREATE TABLE IF NOT EXISTS psi.psichannel (
  ch_id            TEXT PRIMARY KEY,
  ch_description   TEXT NOT NULL,
  ch_internalvalue TEXT,
  ch_kind          TEXT
);

CREATE TABLE IF NOT EXISTS psi.psitransmission (
  tx_id            SERIAL PRIMARY KEY,
  tx_id_channel    TEXT REFERENCES psi.psichannel(ch_id),
  tx_txdate        TIMESTAMP NOT NULL,
  tx_livesubtitling INTEGER DEFAULT 0,
  tx_icduration    INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS psi.psischedule (
  sch_id       SERIAL PRIMARY KEY,
  sch_isactive INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS psi.psimaterialpart (
  mat_id          SERIAL PRIMARY KEY,
  mat_readyforrep INTEGER DEFAULT 0
);

INSERT INTO psi.psichannel VALUES
  ('CH1', 'Eén', 'EEN', 'TV'),
  ('CH2', 'Canvas', 'CAN', 'TV'),
  ('CH3', 'Radio 1', 'RA1', 'RADIO')
ON CONFLICT DO NOTHING;

INSERT INTO psi.psitransmission (tx_id_channel, tx_txdate, tx_livesubtitling, tx_icduration)
SELECT c.ch_id,
       NOW() - (g || ' days')::interval,
       (g % 3 = 0)::int,
       900 + (g * 37) % 2400
FROM psi.psichannel c, generate_series(0, 27) g;

INSERT INTO psi.psischedule (sch_isactive) SELECT (g % 10 <> 0)::int FROM generate_series(1, 50) g;
INSERT INTO psi.psimaterialpart (mat_readyforrep) SELECT (g % 4 <> 0)::int FROM generate_series(1, 40) g;
