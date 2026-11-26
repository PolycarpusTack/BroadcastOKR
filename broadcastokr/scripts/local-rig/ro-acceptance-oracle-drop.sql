-- Tear-down for ro-acceptance-oracle.sql (A-2-T4). Run as SYSDBA on the local rig.
whenever sqlerror exit failure
begin
  for s in (select sid, serial# from v$session where username = 'BROKR_RO_WRITER') loop
    execute immediate 'alter system kill session ''' || s.sid || ',' || s.serial# || ''' immediate';
  end loop;
  execute immediate 'drop user brokr_ro_writer cascade';
exception when others then if sqlcode != -1918 then raise; end if;
end;
/
exit
