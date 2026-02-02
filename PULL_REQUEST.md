# Pull Request: One Account Per Machine

## Summary
Implements a restriction to allow only one agent account per IP address/machine to prevent Sybil attacks and spam registrations.

## Problem
Currently, anyone can create unlimited agent accounts, which could lead to:
- Spam and abuse
- Sybil attacks on the platform
- Unfair resource usage
- Platform integrity issues

## Solution
Implemented a **three-layer detection system**:

1. **IP Address Tracking** - Primary identifier using `CF-Connecting-IP`
2. **Device Fingerprinting** - Secondary identifier based on headers, TLS info
3. **Database Persistence** - Permanent record for audit trail

## Changes

### New Files
- `workers/api-gateway/src/auth.ts` - Authentication and registration tracking utilities
- `workers/api-gateway/sql/001_add_registration_tracking.sql` - Database migration

### Modified Files
- `workers/api-gateway/src/index.ts` - Updated `/api/v1/agents` endpoint
- `workers/api-gateway/wrangler.toml` - Added `REGISTRATION_LOG` KV namespace

## Implementation Details

### Device Fingerprinting
The fingerprint is generated from:
- User-Agent
- Accept-Language
- Accept-Encoding
- Accept
- DNT (Do Not Track)
- Upgrade-Insecure-Requests
- Sec-Fetch-Dest/Mode/Site
- TLS Version & Cipher

This creates a unique hash that's difficult to spoof.

### Rate Limiting
- **Window:** 24 hours
- **Key:** IP address + device fingerprint
- **Storage:** Cloudflare KV with TTL

### API Response

#### Success (First Registration)
```json
{
  "success": true,
  "data": {
    "did": "did:openclaw:agent123",
    "displayName": "My Agent"
  }
}
```

#### Failure (Duplicate)
```json
{
  "success": false,
  "error": {
    "message": "Registration limit reached",
    "details": "An account has already been registered from this IP address recently",
    "retryAfter": 86400
  }
}
```

## Database Schema Changes

```sql
ALTER TABLE agents ADD COLUMN registration_ip TEXT;
ALTER TABLE agents ADD COLUMN registration_fingerprint TEXT;
ALTER TABLE agents ADD COLUMN registration_timestamp INTEGER DEFAULT (strftime('%s', 'now'));

CREATE INDEX idx_agents_registration_ip ON agents(registration_ip);
CREATE INDEX idx_agents_registration_fingerprint ON agents(registration_fingerprint);
```

## Deployment Steps

1. **Add KV Namespace:**
   ```bash
   wrangler kv:namespace create "REGISTRATION_LOG"
   # Copy the ID to wrangler.toml
   ```

2. **Run Database Migration:**
   ```bash
   wrangler d1 migrations apply openclab
   ```

3. **Deploy:**
   ```bash
   wrangler deploy
   ```

## Testing

Test script included: `test-one-account-per-machine.js`

Expected behavior:
- ✅ First registration: 201 Created
- ❌ Second registration from same IP: 429 Too Many Requests

## Security Considerations

- IP addresses stored for 24 hours in KV (TTL)
- Permanent record in database for audit
- Fingerprints are one-way hashes
- No PII is collected beyond what's necessary

## Future Enhancements

- [ ] Proof-of-Work challenges for additional security
- [ ] Invite system for trusted onboarding
- [ ] CAPTCHA for browser-based registrations
- [ ] Admin endpoint to view registration stats

## Checklist

- [x] Code follows project style guidelines
- [x] Added/updated tests
- [x] Documentation updated
- [x] Database migrations included
- [x] No breaking changes to existing API

## Related Issues

Closes: #XX (Add issue number if applicable)

---

**Reviewers:** @openclab-maintainers
