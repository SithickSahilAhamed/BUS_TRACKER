import crypto from 'crypto';

// ✅ SECURITY FIX: Require env vars, fail fast if not provided
const TOKEN_SECRET = (() => {
  const secret = process.env.TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      '❌ FATAL: TOKEN_SECRET env var not set or too short (min 32 chars). ' +
      'Set it in .env: TOKEN_SECRET=<long-random-string>'
    );
  }
  return secret;
})();

const PIN_SALT = (() => {
  const salt = process.env.PIN_SALT;
  if (!salt || salt.length < 16) {
    throw new Error(
      '❌ FATAL: PIN_SALT env var not set or too short (min 16 chars). ' +
      'Set it in .env: PIN_SALT=<random-string>'
    );
  }
  return salt;
})();

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export function hashPin(pin: string | number): string {
  return crypto.createHash('sha256').update(String(pin) + PIN_SALT).digest('hex');
}

export function createDriverToken(busId: string): string {
  const ts      = Date.now().toString();
  const payload = `${busId}:${ts}`;
  const sig     = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

export function verifyDriverToken(token: string): { busId: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const lastColon = decoded.lastIndexOf(':');
    const secondLastColon = decoded.lastIndexOf(':', lastColon - 1);
    const payload = decoded.substring(0, lastColon);
    const sig     = decoded.substring(lastColon + 1);
    const busId   = decoded.substring(0, secondLastColon);
    const ts      = parseInt(decoded.substring(secondLastColon + 1, lastColon));

    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    if (sig !== expected) return null;
    if (Date.now() - ts > TOKEN_TTL_MS) return null;
    return { busId };
  } catch {
    return null;
  }
}
