--
-- PostgreSQL database dump
--

\restrict WeHvtuleqwyoi1DQKE9sliqdwgEj0BkakJn6QPYhvlyHz6u6rhMU8xlSxOvdDgO

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cm2contractstatuslog; Type: TABLE; Schema: psi; Owner: -
--

CREATE TABLE psi.cm2contractstatuslog (
    oid bigint NOT NULL,
    obj_datecreated timestamp without time zone,
    obj_datemodified timestamp without time zone,
    obj_id_usercreated bigint,
    obj_id_usermodified bigint,
    classid numeric(22,0),
    csl_comment character varying(255),
    csl_id_contractstatus bigint,
    csl_date date,
    csl_id_user bigint,
    csl_id_broadcastrightgroup bigint,
    csl_id_contract bigint,
    csl_id_additionalagreement bigint,
    csl_id_streamingagreement bigint
)
WITH (fillfactor='90');


--
-- Name: mgxinstallationhistory; Type: TABLE; Schema: psi; Owner: -
--

CREATE TABLE psi.mgxinstallationhistory (
    oid bigint NOT NULL,
    obj_datecreated timestamp without time zone,
    obj_datemodified timestamp without time zone,
    obj_id_usercreated bigint,
    obj_id_usermodified bigint,
    ih_instalbuildver character varying(255),
    ih_instalbuildverfiltered character varying(255),
    ih_installationcn character varying(255),
    ih_installationosu character varying(255),
    ih_id_patch bigint,
    ih_installationremark character varying(4000),
    ih_installationtimestamp timestamp without time zone,
    ih_installationtype character varying(255),
    ih_installationversion character varying(255),
    ih_installationversionfiltered character varying(255),
    ih_installeddatabasehash character varying(255),
    ih_id_wowconfinsthist bigint
)
WITH (fillfactor='90');


--
-- Name: mm2mediaassetstatuslog; Type: TABLE; Schema: psi; Owner: -
--

CREATE TABLE psi.mm2mediaassetstatuslog (
    oid bigint NOT NULL,
    obj_datecreated timestamp without time zone,
    obj_datemodified timestamp without time zone,
    obj_id_usercreated bigint,
    obj_id_usermodified bigint,
    sl_id_owner bigint,
    sl_id_status bigint
)
WITH (fillfactor='90');


--
-- Name: psiprdstatlog; Type: TABLE; Schema: psi; Owner: -
--

CREATE TABLE psi.psiprdstatlog (
    oid bigint NOT NULL,
    obj_datecreated timestamp without time zone,
    obj_datemodified timestamp without time zone,
    obj_id_usercreated bigint,
    obj_id_usermodified bigint,
    prstat_comment character varying(4000),
    prstat_datechanged timestamp without time zone,
    product_ref bigint,
    prstat_productstat bigint,
    prstat_userchanged bigint
)
WITH (fillfactor='90');


--
-- Name: psiuser; Type: TABLE; Schema: psi; Owner: -
--

CREATE TABLE psi.psiuser (
    oid bigint NOT NULL,
    obj_datecreated timestamp without time zone,
    obj_datemodified timestamp without time zone,
    obj_id_usercreated bigint,
    obj_id_usermodified bigint,
    obj_id_globalcache bigint,
    usr_accesstype character varying(255),
    usr_allowperformancetracing smallint,
    usr_os_authentication smallint,
    usr_departmentaccess character varying(19),
    usr_email character varying(255),
    usr_emailfiltered character varying(255),
    usr_external_reference character varying(255),
    usr_isdisabled smallint,
    usr_isserveruser smallint,
    usr_lastlogontime timestamp without time zone,
    usr_memorysize numeric(22,0),
    usr_memorysizefor64bit numeric(22,0),
    usr_id_optionsgroup bigint,
    usr_passwordhasbeenreset smallint,
    usr_passwordrefreshdummy timestamp without time zone,
    usr_id_person bigint,
    usr_reportdebugmode character varying(255),
    usr_id_ssodomain bigint,
    usr_ssologinformat character varying(255),
    usr_thumbnail bytea,
    usr_tracesql smallint,
    usr_id_useridentification bigint,
    usr_aremediaassetsreadonly smallint,
    usr_viewmasusedforencoding smallint,
    usr_viewmaswithencoding smallint,
    usr_viewmaswithoutencoding smallint,
    usr_contractchannelaccess character varying(16),
    usr_id_bcmedium bigint,
    usr_id_defaultfinancialentity bigint,
    usr_financialentityaccess character varying(25),
    usr_medialibraryaccess character varying(255),
    usr_regulatoraccess character varying(18)
)
WITH (fillfactor='90');


--
-- Name: psiuseridentification; Type: TABLE; Schema: psi; Owner: -
--

CREATE TABLE psi.psiuseridentification (
    oid bigint NOT NULL,
    obj_datecreated timestamp without time zone,
    obj_datemodified timestamp without time zone,
    obj_id_usercreated bigint,
    obj_id_usermodified bigint,
    usi_firstname character varying(255),
    usi_firstnamefiltered character varying(255),
    usi_lastname character varying(255),
    usi_lastnamefiltered character varying(255),
    usi_id_user bigint,
    usi_username character varying(255),
    usi_usernamefiltered character varying(255)
)
WITH (fillfactor='90');


--
-- Name: t3tmetric; Type: TABLE; Schema: psi; Owner: -
--

CREATE TABLE psi.t3tmetric (
    oid bigint NOT NULL,
    t3m_dur_abouttocommitchanges bigint,
    t3m_dur_blockexecution bigint,
    t3m_buildversion character varying(255),
    t3m_dur_commit bigint,
    t3m_dialogwasopened smallint,
    t3m_dur_flushpendingchanges bigint,
    t3m_isimmediatetransaction smallint,
    t3m_ismultiuserupdate smallint,
    t3m_isservice smallint,
    t3m_memoryafter numeric(22,0),
    t3m_memorybefore numeric(22,0),
    t3m_memorychange numeric(22,0),
    t3m_nrofchanges numeric(22,0),
    t3m_nrofchangespersecond numeric(22,2),
    t3m_nrofdeletes numeric(22,0),
    t3m_nrofflushespersecond numeric(22,2),
    t3m_nrofinserts numeric(22,0),
    t3m_nrofmultiuserchanges numeric(22,0),
    t3m_nrofupdates numeric(22,0),
    t3m_t3changelogid numeric(22,0),
    t3m_dur_t3metriclog bigint,
    t3m_actionid character varying(255),
    t3m_applicationid character varying(255),
    t3m_codereference character varying(255),
    t3m_sessionid character varying(255),
    t3m_t3transactionsize numeric(22,0),
    t3m_timestamp timestamp without time zone,
    t3m_timestamp_day timestamp without time zone,
    t3m_timestamp_hour timestamp without time zone,
    t3m_timestamp_minute timestamp without time zone,
    t3m_dur_total bigint,
    t3m_dur_transaction bigint,
    t3m_username character varying(255)
)
WITH (fillfactor='90');


--
-- Name: t3ttablemetric; Type: TABLE; Schema: psi; Owner: -
--

CREATE TABLE psi.t3ttablemetric (
    oid bigint NOT NULL,
    t3mt_nrofdeletes numeric(22,0),
    t3mt_nrofinserts numeric(22,0),
    t3mt_nrofupdates numeric(22,0),
    t3mt_id_t3metric bigint,
    t3mt_tablename character varying(255)
)
WITH (fillfactor='90');


--
-- Name: wondaystatuslogentry; Type: TABLE; Schema: psi; Owner: -
--

CREATE TABLE psi.wondaystatuslogentry (
    oid bigint NOT NULL,
    obj_datecreated timestamp without time zone,
    obj_datemodified timestamp without time zone,
    obj_id_usercreated bigint,
    obj_id_usermodified bigint,
    dsl_id_channel bigint,
    dsl_id_daystatus bigint,
    dsl_timestamp timestamp without time zone,
    dsl_txdate date
)
WITH (fillfactor='90');


--
-- Name: woncrashreportlog; Type: TABLE; Schema: psilogging; Owner: -
--

CREATE TABLE psilogging.woncrashreportlog (
    oid bigint NOT NULL,
    obj_datecreated timestamp without time zone,
    obj_datemodified timestamp without time zone,
    obj_id_usercreated bigint,
    obj_id_usermodified bigint,
    wcr_bitness character varying(255),
    wcr_buildversion character varying(255),
    wcr_commandline character varying(4000),
    wcr_comment character varying(4000),
    wcr_computername character varying(255),
    wcr_connectorversionstring character varying(255),
    wcr_databasehash character varying(255),
    wcr_errorstring character varying(4000),
    wcr_framerate character varying(255),
    wcr_frameratemode character varying(255),
    wcr_minorversionstring character varying(255),
    wcr_oracleclientencoding character varying(255),
    wcr_oracleclientversion character varying(255),
    wcr_oracleserverencoding character varying(255),
    wcr_oracleserverversion character varying(4000),
    wcr_osusername character varying(255),
    wcr_possibleframerates character varying(255),
    wcr_sitename character varying(255),
    wcr_smalltalkversion character varying(255),
    wcr_stacktrace character varying(4000),
    wcr_timestamp timestamp without time zone,
    wcr_timezoneoffset character varying(255),
    wcr_utctimestamp timestamp without time zone,
    wcr_versionstring character varying(255),
    wcr_versionstringondb character varying(255),
    wcr_wcrcontents bytea,
    wcr_wcrfilename character varying(4000),
    wcr_wonusername character varying(255)
)
WITH (fillfactor='90');


--
-- Name: cm2contractstatuslog pk_cm2contractstatuslog; Type: CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.cm2contractstatuslog
    ADD CONSTRAINT pk_cm2contractstatuslog PRIMARY KEY (oid);


--
-- Name: mgxinstallationhistory pk_mgxinstallationhistory; Type: CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.mgxinstallationhistory
    ADD CONSTRAINT pk_mgxinstallationhistory PRIMARY KEY (oid);


--
-- Name: mm2mediaassetstatuslog pk_mm2mediaassetstatuslog; Type: CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.mm2mediaassetstatuslog
    ADD CONSTRAINT pk_mm2mediaassetstatuslog PRIMARY KEY (oid);


--
-- Name: psiprdstatlog pk_psiprdstatlog; Type: CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiprdstatlog
    ADD CONSTRAINT pk_psiprdstatlog PRIMARY KEY (oid);


--
-- Name: psiuser pk_psiuser; Type: CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuser
    ADD CONSTRAINT pk_psiuser PRIMARY KEY (oid);


--
-- Name: psiuseridentification pk_psiuseridentification; Type: CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuseridentification
    ADD CONSTRAINT pk_psiuseridentification PRIMARY KEY (oid);


--
-- Name: t3tmetric pk_t3tmetric; Type: CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.t3tmetric
    ADD CONSTRAINT pk_t3tmetric PRIMARY KEY (oid);


--
-- Name: t3ttablemetric pk_t3ttablemetric; Type: CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.t3ttablemetric
    ADD CONSTRAINT pk_t3ttablemetric PRIMARY KEY (oid);


--
-- Name: wondaystatuslogentry pk_wondaystatuslogentry; Type: CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.wondaystatuslogentry
    ADD CONSTRAINT pk_wondaystatuslogentry PRIMARY KEY (oid);


--
-- Name: psiuser uq_psiuser_externalreference; Type: CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuser
    ADD CONSTRAINT uq_psiuser_externalreference UNIQUE (usr_external_reference) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiuser uq_psiuser_useridentification; Type: CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuser
    ADD CONSTRAINT uq_psiuser_useridentification UNIQUE (usr_id_useridentification) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: woncrashreportlog pk_woncrashreportlog; Type: CONSTRAINT; Schema: psilogging; Owner: -
--

ALTER TABLE ONLY psilogging.woncrashreportlog
    ADD CONSTRAINT pk_woncrashreportlog PRIMARY KEY (oid);


--
-- Name: i10_usi_firstnamefiltered; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i10_usi_firstnamefiltered ON psi.psiuseridentification USING btree (usi_firstnamefiltered);


--
-- Name: i11_csl_user; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i11_csl_user ON psi.cm2contractstatuslog USING btree (csl_id_user);


--
-- Name: i11_mgxinstallationhistory_ins; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i11_mgxinstallationhistory_ins ON psi.mgxinstallationhistory USING btree (ih_id_patch);


--
-- Name: i11_psiprdstatlog_userchanged; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i11_psiprdstatlog_userchanged ON psi.psiprdstatlog USING btree (prstat_userchanged);


--
-- Name: i11_t3m_ismultiuserupdate; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i11_t3m_ismultiuserupdate ON psi.t3tmetric USING btree (t3m_ismultiuserupdate);


--
-- Name: i12_csl_additionalagreement; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i12_csl_additionalagreement ON psi.cm2contractstatuslog USING btree (csl_id_additionalagreement);


--
-- Name: i12_csl_broadcastrightgroup; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i12_csl_broadcastrightgroup ON psi.cm2contractstatuslog USING btree (csl_id_broadcastrightgroup);


--
-- Name: i12_csl_contract; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i12_csl_contract ON psi.cm2contractstatuslog USING btree (csl_id_contract);


--
-- Name: i12_csl_streamingagreement; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i12_csl_streamingagreement ON psi.cm2contractstatuslog USING btree (csl_id_streamingagreement);


--
-- Name: i12_usi_lastnamefiltered; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i12_usi_lastnamefiltered ON psi.psiuseridentification USING btree (usi_lastnamefiltered);


--
-- Name: i13_usi_user; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i13_usi_user ON psi.psiuseridentification USING btree (usi_id_user);


--
-- Name: i15_usi_usernamefiltered; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i15_usi_usernamefiltered ON psi.psiuseridentification USING btree (usi_usernamefiltered);


--
-- Name: i15_usr_emailfiltered; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i15_usr_emailfiltered ON psi.psiuser USING btree (usr_emailfiltered);


--
-- Name: i16_mgxinstallationhistory_ins; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i16_mgxinstallationhistory_ins ON psi.mgxinstallationhistory USING btree (ih_installationversionfiltered);


--
-- Name: i16_t3m_nrofchanges; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i16_t3m_nrofchanges ON psi.t3tmetric USING btree (t3m_nrofchanges);


--
-- Name: i19_t3m_nrofflushespersecond; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i19_t3m_nrofflushespersecond ON psi.t3tmetric USING btree (t3m_nrofflushespersecond);


--
-- Name: i21_mgxinstallationhistory_wow; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i21_mgxinstallationhistory_wow ON psi.mgxinstallationhistory USING btree (ih_id_wowconfinsthist);


--
-- Name: i26_usr_optionsgroup; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i26_usr_optionsgroup ON psi.psiuser USING btree (usr_id_optionsgroup);


--
-- Name: i29_t3m_t3transactionsessionid; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i29_t3m_t3transactionsessionid ON psi.t3tmetric USING btree (t3m_sessionid);


--
-- Name: i31_usr_person; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i31_usr_person ON psi.psiuser USING btree (usr_id_person);


--
-- Name: i32_t3m_timestamp; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i32_t3m_timestamp ON psi.t3tmetric USING btree (t3m_timestamp);


--
-- Name: i33_t3m_timestamp_day; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i33_t3m_timestamp_day ON psi.t3tmetric USING btree (t3m_timestamp_day);


--
-- Name: i34_t3m_timestamp_hour; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i34_t3m_timestamp_hour ON psi.t3tmetric USING btree (t3m_timestamp_hour);


--
-- Name: i35_t3m_timestamp_minute; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i35_t3m_timestamp_minute ON psi.t3tmetric USING btree (t3m_timestamp_minute);


--
-- Name: i36_t3m_totalduration; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i36_t3m_totalduration ON psi.t3tmetric USING btree (t3m_dur_total);


--
-- Name: i38_t3m_username; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i38_t3m_username ON psi.t3tmetric USING btree (t3m_username);


--
-- Name: i7_mediaassetsl_owner; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i7_mediaassetsl_owner ON psi.mm2mediaassetstatuslog USING btree (sl_id_owner);


--
-- Name: i7_t3mt_t3transactionmetric; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i7_t3mt_t3transactionmetric ON psi.t3ttablemetric USING btree (t3mt_id_t3metric);


--
-- Name: i7_usr_globalcache; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i7_usr_globalcache ON psi.psiuser USING btree (obj_id_globalcache);


--
-- Name: i8_mgxinstallationhistory_inst; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i8_mgxinstallationhistory_inst ON psi.mgxinstallationhistory USING btree (ih_instalbuildverfiltered);


--
-- Name: i8_t3mt_tablename; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i8_t3mt_tablename ON psi.t3ttablemetric USING btree (t3mt_tablename);


--
-- Name: i9_psiprdstatlog_product; Type: INDEX; Schema: psi; Owner: -
--

CREATE INDEX i9_psiprdstatlog_product ON psi.psiprdstatlog USING btree (product_ref);


--
-- Name: psiprdstatlog r10_prstat_producpsiprdstatlog; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiprdstatlog
    ADD CONSTRAINT r10_prstat_producpsiprdstatlog FOREIGN KEY (prstat_productstat) REFERENCES psi.psiproductstatus(lot_id_leafoftreepart) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: cm2contractstatuslog r11_csluser_csl; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.cm2contractstatuslog
    ADD CONSTRAINT r11_csluser_csl FOREIGN KEY (csl_id_user) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: mgxinstallationhistory r11_ihpatch_mgxinlationhistory; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.mgxinstallationhistory
    ADD CONSTRAINT r11_ihpatch_mgxinlationhistory FOREIGN KEY (ih_id_patch) REFERENCES psi.mgxinstallationpatch(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiprdstatlog r11_prstat_userchpsiprdstatlog; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiprdstatlog
    ADD CONSTRAINT r11_prstat_userchpsiprdstatlog FOREIGN KEY (prstat_userchanged) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: cm2contractstatuslog r12_csladditionalagreement_csl; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.cm2contractstatuslog
    ADD CONSTRAINT r12_csladditionalagreement_csl FOREIGN KEY (csl_id_additionalagreement) REFERENCES psi.cm2additionalagreement(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: cm2contractstatuslog r12_cslbroadcastrightgroup_csl; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.cm2contractstatuslog
    ADD CONSTRAINT r12_cslbroadcastrightgroup_csl FOREIGN KEY (csl_id_broadcastrightgroup) REFERENCES psi.cm2broadcastrightgroup(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: cm2contractstatuslog r12_cslcontract_csl; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.cm2contractstatuslog
    ADD CONSTRAINT r12_cslcontract_csl FOREIGN KEY (csl_id_contract) REFERENCES psi.cm2contract(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: cm2contractstatuslog r12_cslstreamingagreement_csl; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.cm2contractstatuslog
    ADD CONSTRAINT r12_cslstreamingagreement_csl FOREIGN KEY (csl_id_streamingagreement) REFERENCES psi.cm2streamingagreement(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiuseridentification r13_usiuser_usi; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuseridentification
    ADD CONSTRAINT r13_usiuser_usi FOREIGN KEY (usi_id_user) REFERENCES psi.psiuser(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: mgxinstallationhistory r21_ihwowconfinstlationhistory; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.mgxinstallationhistory
    ADD CONSTRAINT r21_ihwowconfinstlationhistory FOREIGN KEY (ih_id_wowconfinsthist) REFERENCES psi.wowconfiginsthist(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiuser r26_usroptionsgroup_usr; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuser
    ADD CONSTRAINT r26_usroptionsgroup_usr FOREIGN KEY (usr_id_optionsgroup) REFERENCES psi.wonoptionsgroup(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiuser r31_usrperson_usr; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuser
    ADD CONSTRAINT r31_usrperson_usr FOREIGN KEY (usr_id_person) REFERENCES psi.psiperson(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiuser r37_usrssodomain_usr; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuser
    ADD CONSTRAINT r37_usrssodomain_usr FOREIGN KEY (usr_id_ssodomain) REFERENCES psi.wonssodomain(lot_id_leafoftreepart) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiuser r41_usruseridentification_usr; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuser
    ADD CONSTRAINT r41_usruseridentification_usr FOREIGN KEY (usr_id_useridentification) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiuser r48_usrbcmedium_usr; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuser
    ADD CONSTRAINT r48_usrbcmedium_usr FOREIGN KEY (usr_id_bcmedium) REFERENCES psi.psibroadcastmedium(lot_id_leafoftreepart) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiuser r49_usrdefaultfinialentity_usr; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuser
    ADD CONSTRAINT r49_usrdefaultfinialentity_usr FOREIGN KEY (usr_id_defaultfinancialentity) REFERENCES psi.wonfinancialentity(lot_id_leafoftreepart) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: cm2contractstatuslog r4_objusercreated_csl; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.cm2contractstatuslog
    ADD CONSTRAINT r4_objusercreated_csl FOREIGN KEY (obj_id_usercreated) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: mm2mediaassetstatuslog r4_objusercreated_mediaassetsl; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.mm2mediaassetstatuslog
    ADD CONSTRAINT r4_objusercreated_mediaassetsl FOREIGN KEY (obj_id_usercreated) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiuseridentification r4_objusercreated_usi; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuseridentification
    ADD CONSTRAINT r4_objusercreated_usi FOREIGN KEY (obj_id_usercreated) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiuser r4_objusercreated_usr; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuser
    ADD CONSTRAINT r4_objusercreated_usr FOREIGN KEY (obj_id_usercreated) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: mgxinstallationhistory r4_objusercreatedlationhistory; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.mgxinstallationhistory
    ADD CONSTRAINT r4_objusercreatedlationhistory FOREIGN KEY (obj_id_usercreated) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiprdstatlog r4_objusercreatedpsiprdstatlog; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiprdstatlog
    ADD CONSTRAINT r4_objusercreatedpsiprdstatlog FOREIGN KEY (obj_id_usercreated) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: wondaystatuslogentry r4_objusercreatedtatuslogentry; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.wondaystatuslogentry
    ADD CONSTRAINT r4_objusercreatedtatuslogentry FOREIGN KEY (obj_id_usercreated) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: mm2mediaassetstatuslog r5_objusermodifie_mediaassetsl; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.mm2mediaassetstatuslog
    ADD CONSTRAINT r5_objusermodifie_mediaassetsl FOREIGN KEY (obj_id_usermodified) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: cm2contractstatuslog r5_objusermodified_csl; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.cm2contractstatuslog
    ADD CONSTRAINT r5_objusermodified_csl FOREIGN KEY (obj_id_usermodified) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiuseridentification r5_objusermodified_usi; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuseridentification
    ADD CONSTRAINT r5_objusermodified_usi FOREIGN KEY (obj_id_usermodified) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiuser r5_objusermodified_usr; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuser
    ADD CONSTRAINT r5_objusermodified_usr FOREIGN KEY (obj_id_usermodified) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: mgxinstallationhistory r5_objusermodifielationhistory; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.mgxinstallationhistory
    ADD CONSTRAINT r5_objusermodifielationhistory FOREIGN KEY (obj_id_usermodified) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiprdstatlog r5_objusermodifiepsiprdstatlog; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiprdstatlog
    ADD CONSTRAINT r5_objusermodifiepsiprdstatlog FOREIGN KEY (obj_id_usermodified) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: wondaystatuslogentry r5_objusermodifietatuslogentry; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.wondaystatuslogentry
    ADD CONSTRAINT r5_objusermodifietatuslogentry FOREIGN KEY (obj_id_usermodified) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: wondaystatuslogentry r7_dslchannel_wontatuslogentry; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.wondaystatuslogentry
    ADD CONSTRAINT r7_dslchannel_wontatuslogentry FOREIGN KEY (dsl_id_channel) REFERENCES psi.channel(lot_id_leafoftreepart) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiuser r7_objglobalcache_usr; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiuser
    ADD CONSTRAINT r7_objglobalcache_usr FOREIGN KEY (obj_id_globalcache) REFERENCES psi.t3globalcache(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: mm2mediaassetstatuslog r7_slowner_mediaassetsl; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.mm2mediaassetstatuslog
    ADD CONSTRAINT r7_slowner_mediaassetsl FOREIGN KEY (sl_id_owner) REFERENCES psi.mm2mediaasset(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: t3ttablemetric r7_t3mtt3metric_t3mt; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.t3ttablemetric
    ADD CONSTRAINT r7_t3mtt3metric_t3mt FOREIGN KEY (t3mt_id_t3metric) REFERENCES psi.t3tmetric(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: wondaystatuslogentry r8_dsldaystatus_wtatuslogentry; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.wondaystatuslogentry
    ADD CONSTRAINT r8_dsldaystatus_wtatuslogentry FOREIGN KEY (dsl_id_daystatus) REFERENCES psi.wondaystatus(lot_id_leafoftreepart) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: mm2mediaassetstatuslog r8_slstatus_mediaassetsl; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.mm2mediaassetstatuslog
    ADD CONSTRAINT r8_slstatus_mediaassetsl FOREIGN KEY (sl_id_status) REFERENCES psi.mm2mediaassetstatus(lot_id_leafoftreepart) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: cm2contractstatuslog r9_cslcontractstatus_csl; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.cm2contractstatuslog
    ADD CONSTRAINT r9_cslcontractstatus_csl FOREIGN KEY (csl_id_contractstatus) REFERENCES psi.cm2contractstatus(lot_id_leafoftreepart) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: psiprdstatlog r9_product_ref_psiprdstatlog; Type: FK CONSTRAINT; Schema: psi; Owner: -
--

ALTER TABLE ONLY psi.psiprdstatlog
    ADD CONSTRAINT r9_product_ref_psiprdstatlog FOREIGN KEY (product_ref) REFERENCES psi.psiproductpart(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: woncrashreportlog r4_objusercreated_wcr; Type: FK CONSTRAINT; Schema: psilogging; Owner: -
--

ALTER TABLE ONLY psilogging.woncrashreportlog
    ADD CONSTRAINT r4_objusercreated_wcr FOREIGN KEY (obj_id_usercreated) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: woncrashreportlog r5_objusermodified_wcr; Type: FK CONSTRAINT; Schema: psilogging; Owner: -
--

ALTER TABLE ONLY psilogging.woncrashreportlog
    ADD CONSTRAINT r5_objusermodified_wcr FOREIGN KEY (obj_id_usermodified) REFERENCES psi.psiuseridentification(oid) DEFERRABLE INITIALLY DEFERRED;


--
-- PostgreSQL database dump complete
--

\unrestrict WeHvtuleqwyoi1DQKE9sliqdwgEj0BkakJn6QPYhvlyHz6u6rhMU8xlSxOvdDgO

