-- Minimal WHATS'ON-shaped test schema (Oracle) for the local R1 rig.
-- Run as a DBA once:  CREATE USER psi IDENTIFIED BY psi;  GRANT CONNECT, RESOURCE, UNLIMITED TABLESPACE TO psi;
-- Then run this file as PSI (sqlplus psi/psi@//localhost:1521/XEPDB1 @psi-test-schema.oracle.sql)
-- Read-only account for the agent afterwards:
--   CREATE USER brokr_reader IDENTIFIED BY <pw>; GRANT CREATE SESSION TO brokr_reader;
--   GRANT SELECT ON psi.psichannel TO brokr_reader;  (repeat per table)

CREATE TABLE psichannel (
  ch_id            VARCHAR2(20) PRIMARY KEY,
  ch_description   VARCHAR2(100) NOT NULL,
  ch_internalvalue VARCHAR2(50),
  ch_kind          VARCHAR2(20)
);

CREATE TABLE psitransmission (
  tx_id            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tx_id_channel    VARCHAR2(20) REFERENCES psichannel(ch_id),
  tx_txdate        DATE NOT NULL,
  tx_livesubtitling NUMBER(1) DEFAULT 0,
  tx_icduration    NUMBER DEFAULT 0
);

CREATE TABLE psischedule (
  sch_id       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sch_isactive NUMBER(1) DEFAULT 1
);

CREATE TABLE psimaterialpart (
  mat_id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mat_readyforrep NUMBER(1) DEFAULT 0
);

INSERT INTO psichannel VALUES ('CH1', 'Een', 'EEN', 'TV');
INSERT INTO psichannel VALUES ('CH2', 'Canvas', 'CAN', 'TV');
INSERT INTO psichannel VALUES ('CH3', 'Radio 1', 'RA1', 'RADIO');

INSERT INTO psitransmission (tx_id_channel, tx_txdate, tx_livesubtitling, tx_icduration)
SELECT ch.ch_id, SYSDATE - lvl.n, MOD(lvl.n, 3), 900 + MOD(lvl.n * 37, 2400)
FROM psichannel ch
CROSS JOIN (SELECT LEVEL - 1 AS n FROM dual CONNECT BY LEVEL <= 28) lvl;

INSERT INTO psischedule (sch_isactive)
SELECT CASE WHEN MOD(LEVEL, 10) = 0 THEN 0 ELSE 1 END FROM dual CONNECT BY LEVEL <= 50;

INSERT INTO psimaterialpart (mat_readyforrep)
SELECT CASE WHEN MOD(LEVEL, 4) = 0 THEN 0 ELSE 1 END FROM dual CONNECT BY LEVEL <= 40;

COMMIT;
