/**
 * Cockpit → tenant call over the operator channel (R6-1). One place for the
 * header, the timeout and the "what came back" shape, so every proxy route
 * forwards the tenant's own status and body rather than inventing its own.
 *
 * Throws on network failure (unreachable, timeout); the caller turns that into
 * a 502. A non-JSON body (an ingress error page, say) is folded into
 * `{ error }` so the cockpit UI always has something readable.
 */
async function callTenant({ instanceUrl, operatorToken }, method, path, body, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${instanceUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(operatorToken ? { 'X-Operator-Token': operatorToken } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; }
    catch { json = { error: text.slice(0, 200) }; }
    return { status: res.status, body: json };
  } finally {
    clearTimeout(timer);
  }
}

/** `https://host/` and `https://host` name the same instance. */
function normalizeInstanceUrl(value) {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/.test(url)) return null;
  return url;
}

module.exports = { callTenant, normalizeInstanceUrl };
