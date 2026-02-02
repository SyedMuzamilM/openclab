import { describe, expect, it, beforeEach } from 'vitest';
import { webcrypto, randomUUID } from 'node:crypto';
import worker from '../src/index';
import { generateKeyPair, createAuthHeaders } from '../../../packages/sdk/src/client';
import { base58Decode, base58Encode } from '../../../packages/sdk/src/auth';

if (!globalThis.crypto?.subtle) {
  globalThis.crypto = webcrypto as any;
}
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = randomUUID;
}

class CacheMock {
  async match() {
    return null;
  }
  async put() {}
}

class KVMock {
  private store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
}

class D1Statement {
  private params: unknown[] = [];
  constructor(private db: D1Mock, private sql: string) {}
  bind(...args: unknown[]) {
    this.params = args;
    return this;
  }
  async run() {
    return this.db.run(this.sql, this.params);
  }
  async all() {
    return this.db.all(this.sql, this.params);
  }
  async first<T = unknown>() {
    return this.db.first<T>(this.sql, this.params);
  }
}

class D1Mock {
  private agents = new Map<string, {
    did: string;
    public_key: string;
    display_name: string;
    bio?: string;
    registration_ip?: string;
    registration_fingerprint?: string;
    created_at?: string;
  }>();
  private posts = new Map<string, { id: string; author_did: string; content: string; submesh: string; parent_id?: string | null }>();

  prepare(sql: string) {
    return new D1Statement(this, sql);
  }

  async exec() {}

  async run(sql: string, params: unknown[]) {
    if (/INSERT INTO agents/i.test(sql)) {
      if (params.length >= 6) {
        const [did, publicKey, displayName, bio, registrationIp, registrationFingerprint] = params as [
          string,
          string,
          string,
          string,
          string,
          string
        ];
        this.agents.set(did, {
          did,
          public_key: publicKey,
          display_name: displayName,
          bio,
          registration_ip: registrationIp,
          registration_fingerprint: registrationFingerprint,
          created_at: new Date().toISOString()
        });
      } else {
        const [did, publicKey, displayName, bio] = params as [string, string, string, string];
        this.agents.set(did, { did, public_key: publicKey, display_name: displayName, bio, created_at: new Date().toISOString() });
      }
      return { success: true };
    }
    if (/INSERT INTO posts/i.test(sql)) {
      const [id, authorDid, content, submesh, parentId] = params as [string, string, string, string, string | null];
      this.posts.set(id, { id, author_did: authorDid, content, submesh, parent_id: parentId });
      return { success: true };
    }
    return { success: true };
  }

  async first<T>(sql: string, params: unknown[]) {
    if (/SELECT public_key FROM agents/i.test(sql)) {
      const [did] = params as [string];
      const agent = this.agents.get(did);
      return (agent ? { public_key: agent.public_key } : null) as T | null;
    }
    if (/SELECT did FROM agents WHERE display_name/i.test(sql)) {
      const [displayName] = params as [string];
      for (const agent of this.agents.values()) {
        if (agent.display_name === displayName) {
          return { did: agent.did } as T;
        }
      }
      return null;
    }
    if (/SELECT COUNT\(\*\) as count FROM agents WHERE registration_ip/i.test(sql)) {
      const [registrationIp] = params as [string];
      let count = 0;
      for (const agent of this.agents.values()) {
        if (agent.registration_ip === registrationIp) {
          count += 1;
        }
      }
      return { count } as T;
    }
    return null;
  }

  async all() {
    return { results: [] };
  }
}

type TestEnv = {
  DB: D1Mock;
  RATE_LIMITS: KVMock;
  REGISTRATION_LOG: KVMock;
  NONCE_STORE?: KVMock;
};

const createEnv = (): TestEnv => ({
  DB: new D1Mock(),
  RATE_LIMITS: new KVMock(),
  REGISTRATION_LOG: new KVMock()
});

async function fetchWorker(request: Request, env: TestEnv) {
  return worker.fetch(request, env as unknown as Record<string, unknown>);
}

async function signChallenge(privateKey: string, challenge: string) {
  const privateKeyBytes = base58Decode(privateKey);
  const key = await crypto.subtle.importKey('pkcs8', privateKeyBytes, { name: 'Ed25519' }, false, ['sign']);
  const payload = new TextEncoder().encode(challenge);
  const signature = await crypto.subtle.sign('Ed25519', key, payload);
  return base58Encode(new Uint8Array(signature));
}

beforeEach(() => {
  if (!globalThis.caches) {
    globalThis.caches = { default: new CacheMock() } as any;
  }
});

describe('agent auth and posting', () => {
  it('registers agent with challenge and allows signed post', async () => {
    const env = createEnv();
    const keys = await generateKeyPair();
    const did = `did:example:${crypto.randomUUID()}`;

    const challengeResponse = await fetchWorker(new Request('http://localhost/api/v1/challenge'), env);
    expect(challengeResponse.status).toBe(200);
    const challengePayload = await challengeResponse.json();

    const challengeSignature = await signChallenge(keys.privateKey, challengePayload.data.challenge);
    const registerBody = {
      did,
      publicKey: keys.publicKey,
      displayName: 'TestAgent',
      challenge: challengePayload.data.challenge,
      challengeSignature
    };

    const registerResponse = await fetchWorker(new Request('http://localhost/api/v1/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerBody)
    }), env);

    expect(registerResponse.status).toBe(201);
    const registerJson = await registerResponse.json();
    expect(registerJson.success).toBe(true);

    const postBody = JSON.stringify({ content: 'Hello mesh', submesh: 'general' });
    const authHeaders = await createAuthHeaders(
      did,
      keys.privateKey,
      'POST',
      '/api/v1/posts',
      'application/json',
      postBody
    );

    const postResponse = await fetchWorker(new Request('http://localhost/api/v1/posts', {
      method: 'POST',
      headers: authHeaders,
      body: postBody
    }), env);

    expect(postResponse.status).toBe(201);
    const postJson = await postResponse.json();
    expect(postJson.success).toBe(true);
    expect(postJson.data.id).toBeTruthy();
  });

  it('rejects posts without signature headers', async () => {
    const env = createEnv();
    const keys = await generateKeyPair();
    const did = `did:example:${crypto.randomUUID()}`;

    const challengeResponse = await fetchWorker(new Request('http://localhost/api/v1/challenge'), env);
    const challengePayload = await challengeResponse.json();
    const challengeSignature = await signChallenge(keys.privateKey, challengePayload.data.challenge);

    await fetchWorker(new Request('http://localhost/api/v1/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        did,
        publicKey: keys.publicKey,
        displayName: 'UnsignedAgent',
        challenge: challengePayload.data.challenge,
        challengeSignature
      })
    }), env);

    const postBody = JSON.stringify({ content: 'Missing signature', submesh: 'general' });
    const postResponse = await fetchWorker(new Request('http://localhost/api/v1/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-DID': did
      },
      body: postBody
    }), env);

    expect(postResponse.status).toBe(401);
    const postJson = await postResponse.json();
    expect(postJson.success).toBe(false);
  });

  it('enforces one-account-per-machine on registration', async () => {
    const env = createEnv();
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'OpenClabTestAgent',
      'CF-Connecting-IP': '203.0.113.10'
    };

    const keys1 = await generateKeyPair();
    const did1 = `did:example:${crypto.randomUUID()}`;
    const challengeResponse1 = await fetchWorker(new Request('http://localhost/api/v1/challenge'), env);
    const challengePayload1 = await challengeResponse1.json();
    const signature1 = await signChallenge(keys1.privateKey, challengePayload1.data.challenge);

    const registerResponse1 = await fetchWorker(new Request('http://localhost/api/v1/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        did: did1,
        publicKey: keys1.publicKey,
        displayName: 'FirstAgent',
        challenge: challengePayload1.data.challenge,
        challengeSignature: signature1
      })
    }), env);

    expect(registerResponse1.status).toBe(201);

    const keys2 = await generateKeyPair();
    const did2 = `did:example:${crypto.randomUUID()}`;
    const challengeResponse2 = await fetchWorker(new Request('http://localhost/api/v1/challenge'), env);
    const challengePayload2 = await challengeResponse2.json();
    const signature2 = await signChallenge(keys2.privateKey, challengePayload2.data.challenge);

    const registerResponse2 = await fetchWorker(new Request('http://localhost/api/v1/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        did: did2,
        publicKey: keys2.publicKey,
        displayName: 'SecondAgent',
        challenge: challengePayload2.data.challenge,
        challengeSignature: signature2
      })
    }), env);

    expect(registerResponse2.status).toBe(429);
    const registerJson2 = await registerResponse2.json();
    expect(registerJson2.success).toBe(false);
  });
});
