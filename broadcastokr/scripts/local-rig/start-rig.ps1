<#
.SYNOPSIS
  Start (or stop) the R1 local validation rig on this PC — no Docker, no admin.

  Keycloak (native, port 8081), the cockpit (:3100) and tenant0 (:3101) bridges,
  and the connector agent, each detached with stdout/stderr in its own log and
  its pid in a .pid file. Idempotent: anything already listening is left alone.

  Register once as a logon task so the unattended run survives a reboot:
    schtasks /Create /TN "BrOKR local rig" /SC ONLOGON /TR "pwsh -NoProfile -File C:\path\to\scripts\local-rig\start-rig.ps1" /F

  What it does NOT do: start the Oracle Windows services (that needs an elevated
  shell — `Start-Service OracleServiceLOCAL, OracleOraDB19Home1TNSListener`); it
  only reports them. Postgres runs as an auto-start service already.

.PARAMETER Stop
  Stop every rig process started by this script (by pid file).
#>
[CmdletBinding()]
param([switch]$Stop)

$ErrorActionPreference = 'Continue'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$Rig = Join-Path $Root 'local-rig'
$KcVersion = (Get-Content (Join-Path $Rig 'keycloak\VERSION') -ErrorAction SilentlyContinue)
$Kc = Join-Path $Rig "keycloak\keycloak-$KcVersion"
$JavaHome = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.6.7-hotspot'

function Listening([int]$port) {
  [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

# NB: the parameter must not be called $args — PowerShell reserves that name and
# silently drops the value, which launched a bare `node` REPL instead of the
# bridge on 2026-09-03 (finding 34).
function Start-Detached($name, $file, $argList, $cwd, $logDir, $envVars) {
  foreach ($k in $envVars.Keys) { Set-Item -Path "Env:$k" -Value $envVars[$k] }
  $p = Start-Process -FilePath $file -ArgumentList $argList -WorkingDirectory $cwd `
    -RedirectStandardOutput (Join-Path $logDir "$name.out.log") `
    -RedirectStandardError (Join-Path $logDir "$name.err.log") `
    -WindowStyle Hidden -PassThru
  $p.Id | Set-Content (Join-Path $logDir "$name.pid")
  Write-Host "  started $name (pid $($p.Id))"
}

function Stop-ByPidFile($pidFile) {
  if (Test-Path $pidFile) {
    $id = Get-Content $pidFile
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    Remove-Item $pidFile -Force
    Write-Host "  stopped pid $id ($pidFile)"
  }
}

if ($Stop) {
  Write-Host 'Stopping the rig…'
  foreach ($f in @("$Rig\agent\agent.pid", "$Rig\tenant0\bridge.pid", "$Rig\cockpit\bridge.pid", "$Rig\keycloak\keycloak.pid")) { Stop-ByPidFile $f }
  # kc.bat spawns java as a child; make sure the listener is gone
  Get-NetTCPConnection -State Listen -LocalPort 8081 -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  return
}

Write-Host "BrOKR local rig — $Root"

# Oracle: report only (services need an elevated shell)
$ora = Get-Service OracleServiceLOCAL, OracleOraDB19Home1TNSListener -ErrorAction SilentlyContinue
foreach ($s in $ora) { Write-Host ("  {0,-32} {1}" -f $s.Name, $s.Status) }
if ($ora | Where-Object Status -ne 'Running') {
  Write-Warning 'Oracle is not running: the Oracle binding will fail until `Start-Service OracleServiceLOCAL, OracleOraDB19Home1TNSListener` runs from an elevated shell.'
}

# Keycloak (native): realm import, port 8081 because 8080 is taken on this PC
if (Listening 8081) { Write-Host '  keycloak already listening on 8081' }
elseif (-not (Test-Path "$Kc\bin\kc.bat")) { Write-Warning "Keycloak not found at $Kc — see readiness-instructions §R1 step 1" }
else {
  Start-Detached 'keycloak' "$Kc\bin\kc.bat" @('start-dev', '--import-realm', '--http-port', '8081') $Kc "$Rig\keycloak" @{
    JAVA_HOME = $JavaHome; KC_BOOTSTRAP_ADMIN_USERNAME = 'admin'; KC_BOOTSTRAP_ADMIN_PASSWORD = 'admin'
  }
}

# Bridges: the instance .env is the whole configuration (node --env-file)
foreach ($inst in @(@{ name = 'cockpit'; port = 3100 }, @{ name = 'tenant0'; port = 3101 })) {
  if (Listening $inst.port) { Write-Host "  $($inst.name) already listening on $($inst.port)"; continue }
  Start-Detached 'bridge' 'node' @("--env-file=$Rig\$($inst.name)\.env", 'bridge/server.cjs') $Root "$Rig\$($inst.name)" @{}
}

# Agent: needs the instance up; AGENT_DATA_KEY unlocks enc:v1: passwords in agent-config.json
$deadline = (Get-Date).AddSeconds(30)
while (-not (Listening 3101) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 1 }
$agentPid = Get-Content "$Rig\agent\agent.pid" -ErrorAction SilentlyContinue
if ($agentPid -and (Get-Process -Id $agentPid -ErrorAction SilentlyContinue)) { Write-Host "  agent already running (pid $agentPid)" }
else {
  Start-Detached 'agent' 'node' @('bridge/agent.cjs', 'run', '--dir', "$Rig\agent") $Root "$Rig\agent" @{
    AGENT_DATA_KEY = (Get-Content "$Rig\agent\AGENT_DATA_KEY" -Raw).Trim()
  }
}

Write-Host 'Rig up: http://localhost:3100 (cockpit) · http://localhost:3101 (tenant0) · http://localhost:8081 (Keycloak)'
