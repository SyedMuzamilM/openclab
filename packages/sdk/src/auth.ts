// DID Authentication Utilities
// Ed25519 signature verification for Cloudflare Workers

export interface DIDDocument {
  did: string;
  publicKey: string; // base58-encoded
  created: string;
}

export interface AuthHeaders {
  'X-Agent-DID': string;
  'X-Signature': string;
  'X-Timestamp': string;
  'X-Nonce': string;
}

// Base58 encoding/decoding
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(buffer: Uint8Array): string {
  const alphabet = BASE58_ALPHABET;
  let result = '';
  let value = BigInt(0);
  
  for (let i = 0; i < buffer.length; i++) {
    value = value * BigInt(256) + BigInt(buffer[i]);
  }
  
  while (value > BigInt(0)) {
    result = alphabet[Number(value % BigInt(58))] + result;
    value = value / BigInt(58);
  }
  
  // Add leading zeros
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    result = '1' + result;
  }
  
  return result;
}

export function base58Decode(str: string): Uint8Array {
  const alphabet = BASE58_ALPHABET;
  let value = BigInt(0);
  
  for (let i = 0; i < str.length; i++) {
    const charIndex = alphabet.indexOf(str[i]);
    if (charIndex === -1) throw new Error('Invalid base58 character');
    value = value * BigInt(58) + BigInt(charIndex);
  }
  
  // Convert to bytes
  const bytes: number[] = [];
  while (value > BigInt(0)) {
    bytes.unshift(Number(value % BigInt(256)));
    value = value / BigInt(256);
  }
  
  // Add leading zeros
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    bytes.unshift(0);
  }
  
  return new Uint8Array(bytes);
}

// Create signature payload
export function createSignaturePayload(
  method: string,
  path: string,
  contentType: string,
  timestamp: string,
  nonce: string,
  body: string | null
): string {
  const parts = [
    method.toUpperCase(),
    path,
    contentType,
    timestamp,
    nonce
  ];
  
  if (body) {
    parts.push(body);
  }
  
  return parts.join('\n');
}

// Import public key from base58
export async function importPublicKey(base58PublicKey: string): Promise<CryptoKey> {
  const publicKeyBytes = base58Decode(base58PublicKey);
  
  // Ed25519 public key is 32 bytes
  if (publicKeyBytes.length !== 32) {
    throw new Error('Invalid Ed25519 public key length');
  }
  
  return await crypto.subtle.importKey(
    'raw',
    publicKeyBytes,
    { name: 'Ed25519' },
    false,
    ['verify']
  );
}

// Verify signature
export async function verifySignature(
  publicKey: CryptoKey,
  signature: Uint8Array,
  payload: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  
  try {
    return await crypto.subtle.verify(
      'Ed25519',
      publicKey,
      signature,
      data
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// Verify request authentication
export async function verifyRequestAuth(
  request: Request,
  env: { DB: D1Database; NONCE_STORE?: KVNamespace },
  body?: string | null
): Promise<{ valid: boolean; did?: string; error?: string }> {
  const did = request.headers.get('X-Agent-DID');
  const signatureB58 = request.headers.get('X-Signature');
  const timestamp = request.headers.get('X-Timestamp');
  const nonce = request.headers.get('X-Nonce');
  
  if (!did || !signatureB58 || !timestamp || !nonce) {
    return { valid: false, error: 'Missing authentication headers' };
  }
  
  // Check timestamp (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp);
  const window = 300; // 5 minute window
  
  if (Math.abs(now - requestTime) > window) {
    return { valid: false, error: 'Request timestamp too old' };
  }
  
  // Check nonce uniqueness if KV store is available
  if (env.NONCE_STORE) {
    const nonceKey = `nonce:${did}:${nonce}`;
    const existingNonce = await env.NONCE_STORE.get(nonceKey);
    if (existingNonce) {
      return { valid: false, error: 'Nonce already used' };
    }
    // Store nonce with TTL matching the timestamp window
    await env.NONCE_STORE.put(nonceKey, '1', { expirationTtl: 600 });
  }
  
  // Get agent's public key from database
  const agent = await env.DB.prepare(
    'SELECT public_key FROM agents WHERE did = ?'
  ).bind(did).first<{ public_key: string }>();
  
  if (!agent) {
    return { valid: false, error: 'Agent not found' };
  }
  
  try {
    // Import public key
    const publicKey = await importPublicKey(agent.public_key);
    
    // Decode signature
    const signature = base58Decode(signatureB58);
    
    // Create payload
    const url = new URL(request.url);
    const requestBody = body !== undefined ? body : (request.body ? await request.clone().text() : null);
    const contentType = request.headers.get('Content-Type') || '';
    
    const payload = createSignaturePayload(
      request.method,
      url.pathname,
      contentType,
      timestamp,
      nonce,
      requestBody
    );
    
    // Verify signature
    const isValid = await verifySignature(publicKey, signature, payload);
    
    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
    }
    
    return { valid: true, did };
  } catch (error: any) {
    return { valid: false, error: `Verification failed: ${error.message}` };
  }
}

// Generate challenge for agent registration
export function generateChallenge(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base58Encode(array);
}

// Verify challenge signature during agent registration
export async function verifyChallenge(
  publicKeyB58: string,
  challenge: string,
  signatureB58: string
): Promise<boolean> {
  try {
    const publicKey = await importPublicKey(publicKeyB58);
    const signature = base58Decode(signatureB58);
    
    return await verifySignature(publicKey, signature, challenge);
  } catch (error) {
    return false;
  }
}
