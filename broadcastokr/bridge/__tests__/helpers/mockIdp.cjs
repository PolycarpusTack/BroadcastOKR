const http = require('http');
const crypto = require('crypto');

/**
 * Minimal spec-correct OIDC provider for tests: discovery, JWKS, and a token
 * endpoint issuing RS256-signed id_tokens. The authorization endpoint is never
 * actually fetched by the bridge (the browser would visit it) — tests jump
 * straight to the callback with a code.
 */
function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function startMockIdp({ clientId }) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  let issuer = '';
  const codes = new Map(); // code → claims to issue

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, issuer);

    if (url.pathname === '/.well-known/openid-configuration') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
        id_token_signing_alg_values_supported: ['RS256'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      }));
    }

    if (url.pathname === '/jwks') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ keys: [jwk] }));
    }

    if (url.pathname === '/token' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const claims = codes.get(params.get('code'));
        if (!claims) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'invalid_grant' }));
        }
        const now = Math.floor(Date.now() / 1000);
        const header = b64url(JSON.stringify({ alg: 'RS256', kid: 'test-key' }));
        const payload = b64url(JSON.stringify({
          iss: issuer, aud: clientId, sub: claims.sub,
          name: claims.name, email: claims.email,
          iat: now, exp: now + 300,
        }));
        const signature = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), privateKey);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          access_token: crypto.randomBytes(16).toString('hex'),
          token_type: 'Bearer',
          expires_in: 300,
          id_token: `${header}.${payload}.${b64url(signature)}`,
        }));
      });
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      issuer = `http://127.0.0.1:${server.address().port}`;
      resolve({
        issuer,
        /** Register a user and get a one-time code for the callback. */
        issueCode(claims) {
          const code = crypto.randomBytes(12).toString('hex');
          codes.set(code, claims);
          return code;
        },
        close: () => server.close(),
      });
    });
  });
}

module.exports = { startMockIdp };
