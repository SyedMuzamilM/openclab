// Registration tracking and device fingerprinting
// This module implements one-account-per-machine protection

export interface Env {
  DB: D1Database;
  RATE_LIMITS: KVNamespace;
  REGISTRATION_LOG: KVNamespace;
}

/**
 * Generate a device fingerprint from request characteristics.
 * This creates a unique hash based on headers and TLS info.
 */
export async function generateFingerprint(request: Request): Promise<string> {
  const characteristics = [
    request.headers.get('User-Agent') || '',
    request.headers.get('Accept-Language') || '',
    request.headers.get('Accept-Encoding') || '',
    request.headers.get('Accept') || '',
    request.headers.get('DNT') || '',
    request.headers.get('Upgrade-Insecure-Requests') || '',
    request.headers.get('Sec-Fetch-Dest') || '',
    request.headers.get('Sec-Fetch-Mode') || '',
    request.headers.get('Sec-Fetch-Site') || '',
    // @ts-ignore - Cloudflare-specific properties
    request.cf?.tlsVersion || '',
    // @ts-ignore
    request.cf?.tlsCipher || '',
  ];
  
  const combined = characteristics.join('|');
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

/**
 * Get the client's real IP address from various headers.
 * Cloudflare sets CF-Connecting-IP, fallback to X-Forwarded-For.
 */
export function getClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 
         request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 
         request.headers.get('X-Real-IP') ||
         'unknown';
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number;
}

/**
 * Check if registration is allowed for this IP/fingerprint.
 * Implements the one-account-per-machine policy with a 24-hour window.
 */
export async function checkRegistrationLimit(
  env: Env,
  ip: string,
  fingerprint: string
): Promise<LimitCheckResult> {
  const REGISTRATION_WINDOW = 86400; // 24 hours in seconds
  
  // Check IP-based limit
  const ipKey = `reg_ip:${ip}`;
  const existingIp = await env.REGISTRATION_LOG.get(ipKey);
  if (existingIp) {
    return { 
      allowed: false, 
      reason: 'An account has already been registered from this IP address recently',
      retryAfter: REGISTRATION_WINDOW
    };
  }
  
  // Check fingerprint-based limit
  const fpKey = `reg_fp:${fingerprint}`;
  const existingFp = await env.REGISTRATION_LOG.get(fpKey);
  if (existingFp) {
    return { 
      allowed: false, 
      reason: 'An account has already been registered from this device recently',
      retryAfter: REGISTRATION_WINDOW
    };
  }
  
  // Check database for recent registration from this IP
  const dbCheck = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM agents WHERE registration_ip = ? AND created_at > datetime("now", "-24 hours")'
  ).bind(ip).first<{ count: number }>();
  
  if (dbCheck && dbCheck.count > 0) {
    return { 
      allowed: false, 
      reason: 'Recent registration detected from this IP address',
      retryAfter: REGISTRATION_WINDOW
    };
  }
  
  return { allowed: true };
}

/**
 * Log a successful registration to prevent duplicates.
 * Stores in KV with 24-hour TTL for quick lookups.
 */
export async function logRegistration(
  env: Env,
  ip: string,
  fingerprint: string,
  did: string,
  ttlSeconds: number = 86400
): Promise<void> {
  await env.REGISTRATION_LOG.put(`reg_ip:${ip}`, did, { expirationTtl: ttlSeconds });
  await env.REGISTRATION_LOG.put(`reg_fp:${fingerprint}`, did, { expirationTtl: ttlSeconds });
}
