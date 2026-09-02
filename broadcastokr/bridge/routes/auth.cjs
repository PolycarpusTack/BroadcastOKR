const { createRouter } = require('../utils/router.cjs');
const { parseCookies, serializeCookie, clearCookie } = require('../utils/cookies.cjs');
const { SESSION_COOKIE, createSession, getSession, deleteSession, upsertSsoUser } = require('../sessions.cjs');
const { ROLE_PERMS } = require('../permissions.cjs');
const { MODE } = require('../editions.cjs');
const { audit } = require('../audit.cjs');

const FLOW_COOKIE = 'brokr_auth_flow';

/**
 * OIDC Authorization Code + PKCE sign-in for cloud modes.
 * openid-client v6 is ESM-only — loaded lazily via dynamic import; discovery
 * runs once on first use and is retried on failure.
 */
function createAuthRouter(db, oidcEnv) {
  const router = createRouter();
  let oidcConfigPromise = null;

  async function getOidc() {
    if (!oidcConfigPromise) {
      oidcConfigPromise = (async () => {
        const oidc = await import('openid-client');
        const config = await oidc.discovery(
          new URL(oidcEnv.issuer), oidcEnv.clientId, oidcEnv.clientSecret,
          undefined,
          oidcEnv.allowInsecure ? { execute: [oidc.allowInsecureRequests] } : undefined,
        );
        return { oidc, config };
      })().catch((err) => {
        oidcConfigPromise = null;
        throw err;
      });
    }
    return oidcConfigPromise;
  }

  const secureCookies = () => oidcEnv.baseUrl.startsWith('https://');

  router.get('/login', async (req, res) => {
    try {
      const { oidc, config } = await getOidc();
      const codeVerifier = oidc.randomPKCECodeVerifier();
      const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
      const state = oidc.randomState();

      const url = oidc.buildAuthorizationUrl(config, {
        redirect_uri: `${oidcEnv.baseUrl}/api/auth/callback`,
        scope: 'openid profile email',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
      });

      res.setHeader('Set-Cookie', serializeCookie(
        FLOW_COOKIE, JSON.stringify({ codeVerifier, state }),
        { maxAge: 600, secure: secureCookies() },
      ));
      res.redirect(url.href);
    } catch (err) {
      console.error('OIDC login failed:', err.message);
      res.status(502).json({ error: 'Identity provider unavailable' });
    }
  });

  router.get('/callback', async (req, res) => {
    try {
      const flowRaw = parseCookies(req)[FLOW_COOKIE];
      if (!flowRaw) return res.status(400).json({ error: 'Sign-in flow expired — try again' });
      const { codeVerifier, state } = JSON.parse(flowRaw);

      const { oidc, config } = await getOidc();
      const currentUrl = new URL(`${oidcEnv.baseUrl}${req.originalUrl}`);
      const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedState: state,
      });

      const claims = tokens.claims();
      const user = upsertSsoUser(db, {
        issuer: claims.iss,
        sub: claims.sub,
        name: claims.name,
        email: claims.email,
      });

      const sessionId = createSession(db, user.id);
      audit(db, { user: { id: user.id } }, 'Signed in via SSO');
      res.setHeader('Set-Cookie', [
        serializeCookie(SESSION_COOKIE, sessionId, { secure: secureCookies() }),
        clearCookie(FLOW_COOKIE),
      ]);
      res.redirect('/');
    } catch (err) {
      console.error('OIDC callback failed:', err.message);
      res.status(401).json({ error: 'Sign-in failed' });
    }
  });

  router.post('/logout', (req, res) => {
    const sessionId = parseCookies(req)[SESSION_COOKIE];
    if (sessionId) {
      const session = getSession(db, sessionId);
      if (session) audit(db, { user: { id: session.userId } }, 'Signed out');
      deleteSession(db, sessionId);
    }
    res.setHeader('Set-Cookie', clearCookie(SESSION_COOKIE));
    res.json({ ok: true });
  });

  router.get('/me', (req, res) => {
    const session = getSession(db, parseCookies(req)[SESSION_COOKIE]);
    if (!session) return res.status(401).json({ error: 'Not signed in' });
    const user = db.prepare('SELECT id, name, role, av, color, dept, title, email FROM users WHERE id = ?')
      .get(session.userId);
    res.json({ user, role: session.role, permissions: ROLE_PERMS[session.role], mode: MODE });
  });

  return router;
}

module.exports = { createAuthRouter, SESSION_COOKIE };
