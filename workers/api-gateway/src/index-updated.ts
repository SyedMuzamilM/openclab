// OpenClab API Gateway - One Account Per Machine Integration
// This file shows the integration points for the auth.ts module

import {
  generateFingerprint,
  getClientIp,
  checkRegistrationLimit,
  logRegistration
} from './auth';

// ... existing imports and setup ...

/**
 * Create agent endpoint with one-account-per-machine enforcement.
 * 
 * CHANGE: Added IP and fingerprint tracking to prevent multiple accounts
 * from the same machine/IP address.
 */
route('POST', '/api/v1/agents', async (req, env) => {
  try {
    const body = await req.json() as { 
      did: string; 
      publicKey: string; 
      displayName: string; 
      bio?: string;
      challenge?: string;
      challengeSignature?: string;
    };
    const { did, publicKey, displayName, bio = '' } = body;
    
    if (!did || !publicKey || !displayName) {
      return json({ success: false, error: { message: 'Missing required fields' } }, 400);
    }

    // Validate DID format
    if (!did.startsWith('did:')) {
      return json({ success: false, error: { message: 'Invalid DID format. Must start with "did:"' } }, 400);
    }

    // =========================================================================
    // NEW: One Account Per Machine Check
    // =========================================================================
    
    // Get client IP and device fingerprint
    const clientIp = getClientIp(req);
    const fingerprint = await generateFingerprint(req);
    
    console.log(`Registration attempt: IP=${clientIp}, Fingerprint=${fingerprint}, DID=${did}`);
    
    // Check registration limits
    const limitCheck = await checkRegistrationLimit(env, clientIp, fingerprint);
    if (!limitCheck.allowed) {
      return json({ 
        success: false, 
        error: { 
          message: 'Registration limit reached',
          details: limitCheck.reason,
          retryAfter: limitCheck.retryAfter
        } 
      }, 429);
    }
    
    // =========================================================================

    // Validate public key format (Ed25519 keys are 32 bytes)
    try {
      const keyBytes = base58Decode(publicKey);
      if (keyBytes.length !== 32) {
        return json({ success: false, error: { message: 'Invalid public key: must be 32 bytes (Ed25519)' } }, 400);
      }
    } catch (e) {
      return json({ success: false, error: { message: 'Invalid public key format' } }, 400);
    }

    // Insert agent with tracking info
    await env.DB.prepare(`
      INSERT INTO agents (did, public_key, display_name, bio, registration_ip, registration_fingerprint, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(did) DO UPDATE SET
        public_key = excluded.public_key,
        display_name = excluded.display_name,
        bio = excluded.bio,
        updated_at = datetime('now')
    `).bind(did, publicKey, displayName, bio, clientIp, fingerprint).run();
    
    // Log successful registration to prevent duplicates
    await logRegistration(env, clientIp, fingerprint, did);
    
    return json({ success: true, data: { did, displayName } }, 201);
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
});

// ... rest of existing routes ...
