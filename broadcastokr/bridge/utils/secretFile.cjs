/**
 * Files only their owner may read: the agent's identity, its data key and its
 * config (R4, security design review E2).
 *
 * POSIX: written 0600 and chmod-ed again, because `mode` on writeFileSync only
 * applies when the file is created. Windows ignores mode bits, so the file's
 * ACL is replaced instead: inheritance removed, full control for the current
 * user, SYSTEM and Administrators only (`icacls`). If that fails the write still
 * succeeds and the caller gets `protected: false` with the reason, so an
 * operator sees the gap instead of a silent "0600" that NTFS never honoured.
 */
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

// Well-known SIDs: the names are localised ("SYSTEM", "Administrators"), the SIDs are not
const WINDOWS_KEEP = ['*S-1-5-18', '*S-1-5-32-544'];

function currentWindowsUser() {
  const { username } = os.userInfo();
  const domain = process.env.USERDOMAIN;
  return domain ? `${domain}\\${username}` : username;
}

function protectFile(file) {
  if (process.platform !== 'win32') {
    fs.chmodSync(file, 0o600);
    return { protected: true, how: 'mode 0600' };
  }
  try {
    const grants = [currentWindowsUser(), ...WINDOWS_KEEP].flatMap((who) => ['/grant:r', `${who}:F`]);
    execFileSync('icacls', [file, '/inheritance:r', ...grants], { stdio: 'pipe', windowsHide: true });
    return { protected: true, how: 'ACL: owner, SYSTEM, Administrators' };
  } catch (err) {
    return { protected: false, how: `icacls failed: ${String(err.stderr || err.message).trim().split('\n')[0]}` };
  }
}

/** Write and restrict a secret file. Created 0600 so it is never briefly world-readable on POSIX. */
function writeSecretFile(file, content) {
  fs.writeFileSync(file, content, { mode: 0o600 });
  return protectFile(file);
}

/** Who else can read it — POSIX only; null when nothing is wrong or it cannot be told. */
function exposure(file) {
  if (process.platform === 'win32') return null;
  const mode = fs.statSync(file).mode & 0o777;
  return mode & 0o077 ? `mode ${mode.toString(8).padStart(4, '0')} — run: chmod 600 ${file}` : null;
}

module.exports = { writeSecretFile, protectFile, exposure, currentWindowsUser };
