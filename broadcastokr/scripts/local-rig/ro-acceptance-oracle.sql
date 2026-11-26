-- A-2-T4: disposable, write-capable Oracle account for the read-only acceptance test
-- (bridge/__tests__/oracle-readonly-acceptance.test.cjs). Run as SYSDBA on the local rig only:
--   sqlplus -s -L "/ as sysdba" @scripts/local-rig/ro-acceptance-oracle.sql <password>
-- Tear down with ro-acceptance-oracle-drop.sql. Never run this against a customer database.
whenever sqlerror exit failure
set verify off feedback off

begin
  execute immediate 'drop user brokr_ro_writer cascade';
exception when others then if sqlcode != -1918 then raise; end if;
end;
/

create user brokr_ro_writer identified by "&1" quota 10m on users default tablespace users;
grant create session, create table, create sequence, create procedure to brokr_ro_writer;
-- The Oracle counterpart of a PostgreSQL advisory lock: a session-level user lock.
grant execute on sys.dbms_lock to brokr_ro_writer;

create table brokr_ro_writer.review_only (id number primary key, v varchar2(20));
insert into brokr_ro_writer.review_only values (1, 'a');
insert into brokr_ro_writer.review_only values (2, 'b');
insert into brokr_ro_writer.review_only values (3, 'c');
commit;
create sequence brokr_ro_writer.review_seq;

-- Writes the scanner cannot see: the bridge only ever sends "SELECT f() FROM DUAL".
create or replace function brokr_ro_writer.brokr_touch return number is
begin
  insert into brokr_ro_writer.review_only values (100 + (select count(*) from brokr_ro_writer.review_only), 'x');
  return 1;
end;
/
create or replace function brokr_ro_writer.brokr_touch_autonomous return number is
  pragma autonomous_transaction;
begin
  insert into brokr_ro_writer.review_only values (200 + (select count(*) from brokr_ro_writer.review_only), 'auto');
  commit;
  return 1;
end;
/
create or replace function brokr_ro_writer.brokr_user_lock return number is
  rc integer;
begin
  rc := dbms_lock.request(id => 424242, lockmode => dbms_lock.x_mode, timeout => 0, release_on_commit => false);
  return rc;
end;
/
exit
