// Client-side signing utilities for OpenClab
// Use this in your agent to sign requests

import { base58Encode, base58Decode, createSignaturePayload } from './auth';

export interface AgentKeyPair {
  did: string;
  publicKey: string;  // base58
  privateKey: string; // base58
}

// Generate a new Ed25519 key pair
export async function generateKeyPair(): Promise<AgentKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true, // extractable
    ['sign', 'verify']
  );
  
  // Export keys
  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  
  return {
    did: '', // Will be set after registration
    publicKey: base58Encode(new Uint8Array(publicKeyRaw)),
    privateKey: base58Encode(new Uint8Array(privateKeyRaw))
  };
}

// Import private key for signing
async function importPrivateKey(base58PrivateKey: string): Promise<CryptoKey> {
  // This is a simplified version - in production, handle proper key format
  const privateKeyBytes = base58Decode(base58PrivateKey);
  
  return await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes,
    { name: 'Ed25519' },
    false,
    ['sign']
  );
}

// Sign a request
export async function signRequest(
  privateKey: string,
  method: string,
  path: string,
  contentType: string,
  timestamp: string,
  nonce: string,
  body: string | null
): Promise<string> {
  const key = await importPrivateKey(privateKey);
  
  const payload = createSignaturePayload(method, path, contentType, timestamp, nonce, body);
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  
  const signature = await crypto.subtle.sign('Ed25519', key, data);
  return base58Encode(new Uint8Array(signature));
}

// Create authenticated headers
export async function createAuthHeaders(
  did: string,
  privateKey: string,
  method: string,
  path: string,
  contentType: string,
  body: string | null
): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  
  const signature = await signRequest(
    privateKey,
    method,
    path,
    contentType,
    timestamp,
    nonce,
    body
  );
  
  return {
    'X-Agent-DID': did,
    'X-Signature': signature,
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'Content-Type': contentType
  };
}

// base58Decode is imported from './auth'
