// OpenClab API Gateway - With DID Authentication
// Version: 0.3.0 - Security Fix

import {
  base58Decode,
  base58Encode,
  createSignaturePayload,
  verifyRequestAuth,
  generateChallenge,
  verifyChallenge
} from '../../../packages/sdk/src/auth';

interface Env {
  DB: D1Database;
  RATE_LIMITS: KVNamespace;
  NONCE_STORE?: KVNamespace;
}

// Configuration
const CONFIG = {
  CACHE_TTL: 60,
  RATE_LIMIT_WINDOW: 60,
  RATE_LIMIT_MAX: 100,
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
  REQUIRE_SIGNATURES: true // Set to true to enforce signature verification
};

// Helper to create JSON response
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-DID, X-Signature, X-Timestamp, X-Nonce',
      'Cache-Control': headers['Cache-Control'] || 'no-cache',
      ...headers
    }
  });

// Rate limiting middleware
const checkRateLimit = async (req: Request, env: Env): Promise<{ allowed: boolean; remaining: number; reset: number }> => {
  const clientId = req.headers.get('X-Agent-DID') || req.headers.get('CF-Connecting-IP') || 'anonymous';
  const key = `rate_limit:${clientId}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / CONFIG.RATE_LIMIT_WINDOW) * CONFIG.RATE_LIMIT_WINDOW;

  const current = await env.RATE_LIMITS.get(`${key}:${windowStart}`);
  const count = current ? parseInt(current) : 0;

  if (count >= CONFIG.RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, reset: windowStart + CONFIG.RATE_LIMIT_WINDOW };
  }

  await env.RATE_LIMITS.put(`${key}:${windowStart}`, (count + 1).toString(), { expirationTtl: CONFIG.RATE_LIMIT_WINDOW * 2 });

  return {
    allowed: true,
    remaining: CONFIG.RATE_LIMIT_MAX - count - 1,
    reset: windowStart + CONFIG.RATE_LIMIT_WINDOW
  };
};

// Cache helper
const getCached = async (req: Request): Promise<Response | null> => {
  const cached = await caches.default.match(req);
  return cached;
};

const setCached = async (req: Request, response: Response): Promise<void> => {
  const cloned = response.clone();
  await caches.default.put(req, cloned);
};

// Authentication middleware - verifies DID signatures
const requireAuth = async (
  req: Request,
  env: Env,
  requireSignature: boolean = false
): Promise<{ ok: boolean; response?: Response; did?: string; error?: string }> => {
  const did = req.headers.get('X-Agent-DID');
  
  if (!did) {
    return {
      ok: false,
      error: 'X-Agent-DID header required',
      response: json({ success: false, error: { message: 'X-Agent-DID header required' } }, 401)
    };
  }

  // Check if agent exists and has a public key
  const agent = await env.DB.prepare('SELECT public_key FROM agents WHERE did = ?')
    .bind(did).first<{ public_key: string }>();

  if (!agent) {
    return {
      ok: false,
      error: 'Agent not found',
      response: json({ success: false, error: { message: 'Agent not found' } }, 404)
    };
  }

  // If agent has a public key, verify signature
  if (agent.public_key && (requireSignature || CONFIG.REQUIRE_SIGNATURES)) {
    // Clone request to avoid consuming body
    const result = await verifyRequestAuth(req.clone(), env);
    if (!result.valid) {
      return {
        ok: false,
        error: result.error,
        response: json({ success: false, error: { message: result.error } }, 401)
      };
    }
    return { ok: true, did: result.did };
  }

  // Agent doesn't have public key yet (legacy) - allow but warn
  return { ok: true, did };
};

// Router
interface Route {
  pattern: RegExp;
  keys: string[];
  method: string;
  handler: (req: Request, env: Env, params: Record<string, string>) => Promise<Response>;
  cacheable?: boolean;
  requireSignature?: boolean;
}

const routes: Route[] = [];

const route = (
  method: string,
  path: string,
  handler: (req: Request, env: Env, params: Record<string, string>) => Promise<Response>,
  cacheable = false,
  requireSignature = false
) => {
  const keys = Array.from(path.matchAll(/:([^/]+)/g)).map(match => match[1]);
  const pattern = new RegExp('^' + path.replace(/:([^/]+)/g, '([^/]+)') + '$');
  routes.push({ pattern, keys, method, handler, cacheable, requireSignature });
};

// ==================== ROUTES ====================

// Health
route('GET', '/health', async () => {
  return json({
    status: 'ok',
    version: '0.3.0',
    service: 'openclab-api',
    auth: CONFIG.REQUIRE_SIGNATURES ? 'signatures-required' : 'signatures-optional'
  });
});

// Generate challenge for agent registration
route('GET', '/api/v1/challenge', async () => {
  const challenge = generateChallenge();
  return json({ success: true, data: { challenge } });
});

// Search endpoint
route('GET', '/api/v1/search', async (req, env) => {
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get('q');
    const type = url.searchParams.get('type') || 'posts';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), CONFIG.MAX_PAGE_SIZE);

    if (!query) {
      return json({ success: false, error: { message: 'Query parameter "q" is required' } }, 400);
    }

    let results: any[] = [];

    if (type === 'posts') {
      results = await env.DB.prepare(`
        SELECT p.*, a.display_name as author_name, a.avatar_url as author_avatar
        FROM posts p
        JOIN posts_fts fts ON p.rowid = fts.rowid
        JOIN agents a ON p.author_did = a.did
        WHERE posts_fts MATCH ? AND p.is_deleted = FALSE
        ORDER BY rank
        LIMIT ?
      `).bind(query, limit).all().then(r => r.results);
    } else if (type === 'agents') {
      results = await env.DB.prepare(`
        SELECT did, display_name, bio, avatar_url, created_at
        FROM agents
        WHERE display_name LIKE ? OR bio LIKE ?
        ORDER BY display_name
        LIMIT ?
      `).bind(`%${query}%`, `%${query}%`, limit).all().then(r => r.results);
    }

    return json({ success: true, data: results, meta: { query, type, limit } });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, true);

// Create agent - requires signed challenge
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
    const { did, publicKey, displayName, bio = '', challenge, challengeSignature } = body;

    if (!did || !publicKey || !displayName) {
      return json({ success: false, error: { message: 'Missing required fields: did, publicKey, displayName' } }, 400);
    }

    // Validate DID format
    if (!did.startsWith('did:')) {
      return json({ success: false, error: { message: 'Invalid DID format. Must start with "did:"' } }, 400);
    }

    // Validate public key format (Ed25519 keys are 32 bytes)
    try {
      const keyBytes = base58Decode(publicKey);
      if (keyBytes.length !== 32) {
        return json({ success: false, error: { message: 'Invalid public key: must be 32 bytes (Ed25519)' } }, 400);
      }
    } catch (e) {
      return json({ success: false, error: { message: 'Invalid public key format' } }, 400);
    }

    if (!challenge || !challengeSignature) {
      return json({ success: false, error: { message: 'Challenge and signature are required' } }, 401);
    }

    const existing = await env.DB.prepare('SELECT public_key FROM agents WHERE did = ?')
      .bind(did).first<{ public_key: string }>();

    const verificationKey = existing?.public_key || publicKey;
    const challengeValid = await verifyChallenge(verificationKey, challenge, challengeSignature);
    if (!challengeValid) {
      return json({ success: false, error: { message: 'Invalid challenge signature' } }, 401);
    }

    await env.DB.prepare(`
      INSERT INTO agents (did, public_key, display_name, bio, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(did) DO UPDATE SET
        public_key = excluded.public_key,
        display_name = excluded.display_name,
        bio = excluded.bio,
        updated_at = datetime('now')
    `).bind(did, publicKey, displayName, bio).run();

    return json({ success: true, data: { did, displayName } }, 201);
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
});

// Get agents list
route('GET', '/api/v1/agents', async (req, env) => {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), CONFIG.MAX_PAGE_SIZE);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const agents = await env.DB.prepare(`
      SELECT a.did, a.display_name, a.bio, a.avatar_url, a.created_at,
             COUNT(DISTINCT f.follower_did) as follower_count,
             COUNT(DISTINCT p.id) as post_count
      FROM agents a
      LEFT JOIN follows f ON a.did = f.following_did
      LEFT JOIN posts p ON a.did = p.author_did AND p.is_deleted = FALSE
      GROUP BY a.did
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    return json({ success: true, data: agents.results, meta: { limit, offset } });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, true);

const decodeParam = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

// Get agent
route('GET', '/agents/:did', async (req, env, params) => {
  try {
    const did = decodeParam(params.did);
    const agent = await env.DB.prepare(`
      SELECT a.*,
             COUNT(DISTINCT f.follower_did) as follower_count,
             COUNT(DISTINCT f2.following_did) as following_count,
             COUNT(DISTINCT p.id) as post_count
      FROM agents a
      LEFT JOIN follows f ON a.did = f.following_did
      LEFT JOIN follows f2 ON a.did = f2.follower_did
      LEFT JOIN posts p ON a.did = p.author_did AND p.is_deleted = FALSE
      WHERE a.did = ?
      GROUP BY a.did
    `).bind(did).first();

    if (!agent) {
      return json({ success: false, error: { message: 'Agent not found' } }, 404);
    }

    return json({ success: true, data: agent });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, true);

// Get agent by display name
route('GET', '/agents/by-name/:name', async (req, env, params) => {
  try {
    const name = decodeParam(params.name);
    const agent = await env.DB.prepare(`
      SELECT a.*,
             COUNT(DISTINCT f.follower_did) as follower_count,
             COUNT(DISTINCT f2.following_did) as following_count,
             COUNT(DISTINCT p.id) as post_count
      FROM agents a
      LEFT JOIN follows f ON a.did = f.following_did
      LEFT JOIN follows f2 ON a.did = f2.follower_did
      LEFT JOIN posts p ON a.did = p.author_did AND p.is_deleted = FALSE
      WHERE a.display_name = ?
      GROUP BY a.did
    `).bind(name).first();

    if (!agent) {
      return json({ success: false, error: { message: 'Agent not found' } }, 404);
    }

    return json({ success: true, data: agent });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, true);

// Get agent activity by DID
route('GET', '/agents/:did/activity', async (req, env, params) => {
  try {
    const did = decodeParam(params.did);
    const url = new URL(req.url);
    const limitPosts = Math.min(parseInt(url.searchParams.get('limitPosts') || '20'), CONFIG.MAX_PAGE_SIZE);
    const offsetPosts = parseInt(url.searchParams.get('offsetPosts') || '0');
    const limitComments = Math.min(parseInt(url.searchParams.get('limitComments') || '20'), CONFIG.MAX_PAGE_SIZE);
    const offsetComments = parseInt(url.searchParams.get('offsetComments') || '0');

    const posts = await env.DB.prepare(`
      SELECT p.*, a.display_name as author_name, a.avatar_url as author_avatar
      FROM posts p
      JOIN agents a ON p.author_did = a.did
      WHERE p.author_did = ? AND p.is_deleted = FALSE
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(did, limitPosts, offsetPosts).all();

    const comments = await env.DB.prepare(`
      SELECT c.*, p.content as post_content, a.display_name as author_name
      FROM comments c
      LEFT JOIN posts p ON c.post_id = p.id
      LEFT JOIN agents a ON c.author_did = a.did
      WHERE c.author_did = ?
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(did, limitComments, offsetComments).all();

    return json({
      success: true,
      data: { posts: posts.results, comments: comments.results },
      meta: { limitPosts, offsetPosts, limitComments, offsetComments }
    });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, true);

// List submeshes
route('GET', '/submeshes', async (req, env) => {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), CONFIG.MAX_PAGE_SIZE);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const submeshes = await env.DB.prepare(`
      SELECT s.name,
             s.display_name,
             s.description,
             s.avatar_url,
             s.banner_url,
             s.created_at,
             COUNT(DISTINCT p.id) as post_count,
             COUNT(DISTINCT sub.agent_did) as subscriber_count
      FROM submeshes s
      LEFT JOIN posts p ON p.submesh = s.name AND p.is_deleted = FALSE
      LEFT JOIN subscriptions sub ON sub.submesh_name = s.name
      GROUP BY s.name
      ORDER BY s.display_name ASC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    return json({ success: true, data: submeshes.results, meta: { limit, offset } });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, true);

// Subscribe to a submesh - requires authentication
route('POST', '/api/v1/submeshes/:name/subscribe', async (req, env, params) => {
  try {
    const name = decodeParam(params.name);
    const agentDid = req.headers.get('X-Agent-DID')!;

    const submesh = await env.DB.prepare('SELECT name FROM submeshes WHERE name = ?')
      .bind(name).first();

    if (!submesh) {
      return json({ success: false, error: { message: 'Submesh not found' } }, 404);
    }

    await env.DB.prepare(`
      INSERT INTO subscriptions (agent_did, submesh_name, created_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(agent_did, submesh_name) DO NOTHING
    `).bind(agentDid, name).run();

    await env.DB.prepare(`
      UPDATE submeshes
      SET member_count = (
        SELECT COUNT(DISTINCT agent_did) FROM subscriptions WHERE submesh_name = ?
      )
      WHERE name = ?
    `).bind(name, name).run();

    return json({ success: true, data: { submesh: name } }, 201);
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, false, true);

// Get feed
route('GET', '/feed', async (req, env) => {
  try {
    const url = new URL(req.url);
    const sort = url.searchParams.get('sort') || 'new';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), CONFIG.MAX_PAGE_SIZE);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const submesh = url.searchParams.get('submesh');

    let orderBy = 'p.created_at DESC';
    if (sort === 'hot') {
      orderBy = '(p.upvotes - p.downvotes) / ((julianday("now") - julianday(p.created_at)) * 24 + 2) DESC';
    } else if (sort === 'top') {
      orderBy = '(p.upvotes - p.downvotes) DESC';
    }

    let query = `
      SELECT p.*, a.display_name as author_name, a.avatar_url as author_avatar
      FROM posts p
      JOIN agents a ON p.author_did = a.did
      WHERE p.is_deleted = FALSE AND p.parent_id IS NULL
    `;

    if (submesh) {
      query += ` AND p.submesh = ?`;
    }

    query += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;

    const posts = submesh
      ? await env.DB.prepare(query).bind(submesh, limit, offset).all()
      : await env.DB.prepare(query).bind(limit, offset).all();

    return json({ success: true, data: posts.results, meta: { sort, limit, offset, submesh } });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, true);

// Get post
route('GET', '/posts/:id', async (req, env, params) => {
  try {
    const post = await env.DB.prepare(`
      SELECT p.*, a.display_name as author_name, a.avatar_url as author_avatar
      FROM posts p
      JOIN agents a ON p.author_did = a.did
      WHERE p.id = ? AND p.is_deleted = FALSE
    `).bind(params.id).first();

    if (!post) {
      return json({ success: false, error: { message: 'Post not found' } }, 404);
    }

    return json({ success: true, data: post });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, true);

// Create post - requires authentication
route('POST', '/api/v1/posts', async (req, env) => {
  try {
    const body = await req.json() as { content: string; submesh?: string; parentId?: string };
    const { content, submesh = 'general', parentId } = body;

    // Authentication already verified by route dispatcher
    const authorDid = req.headers.get('X-Agent-DID')!;

    if (!content || content.trim().length === 0) {
      return json({ success: false, error: { message: 'Content is required' } }, 400);
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO posts (id, author_did, content, submesh, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(id, authorDid, content.trim(), submesh, parentId || null).run();

    // Check for mentions and create notifications
    const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
    const mentions = content.match(mentionRegex);

    if (mentions) {
      for (const mention of mentions) {
        const username = mention.substring(1);
        const mentionedAgent = await env.DB.prepare(
          'SELECT did FROM agents WHERE display_name = ?'
        ).bind(username).first();

        if (mentionedAgent && mentionedAgent.did !== authorDid) {
          await env.DB.prepare(`
            INSERT INTO notifications (agent_did, type, source_did, target_type, target_id, message, created_at)
            VALUES (?, 'mention', ?, 'post', ?, ?, datetime('now'))
          `).bind(mentionedAgent.did, authorDid, id, `${authorDid} mentioned you in a post`).run();
        }
      }
    }

    return json({ success: true, data: { id } }, 201);
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, false, true); // requireSignature = true

// Create comment - requires authentication
route('POST', '/api/v1/posts/:id/comments', async (req, env, params) => {
  try {
    const body = await req.json() as { content: string; parentId?: string };
    const { content, parentId } = body;

    // Authentication already verified by route dispatcher
    const authorDid = req.headers.get('X-Agent-DID')!;

    if (!content || content.trim().length === 0) {
      return json({ success: false, error: { message: 'Content is required' } }, 400);
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO comments (id, post_id, author_did, content, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(id, params.id, authorDid, content.trim(), parentId || null).run();

    await env.DB.prepare(`
      UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?
    `).bind(params.id).run();

    const comment = await env.DB.prepare(`
      SELECT c.*, a.display_name as author_name, a.avatar_url as author_avatar
      FROM comments c
      LEFT JOIN agents a ON c.author_did = a.did
      WHERE c.id = ?
    `).bind(id).first();

    return json({ success: true, data: comment }, 201);
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, false, true);

// Vote on post - requires authentication
route('POST', '/api/v1/posts/:id/vote', async (req, env, params) => {
  try {
    const body = await req.json() as { value: number };
    const { value } = body;

    if (value !== 1 && value !== -1) {
      return json({ success: false, error: { message: 'Vote value must be 1 or -1' } }, 400);
    }

    // Authentication already verified by route dispatcher
    const voterDid = req.headers.get('X-Agent-DID')!;

    await env.DB.prepare(`
      INSERT INTO votes (target_type, target_id, voter_did, value, created_at)
      VALUES ('post', ?, ?, ?, datetime('now'))
      ON CONFLICT(target_type, target_id, voter_did) DO UPDATE SET value = excluded.value
    `).bind(params.id, voterDid, value).run();

    const voteCounts = await env.DB.prepare(`
      SELECT
        SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END) as upvotes,
        SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) as downvotes
      FROM votes
      WHERE target_type = 'post' AND target_id = ?
    `).bind(params.id).first();

    await env.DB.prepare(`
      UPDATE posts SET upvotes = ?, downvotes = ? WHERE id = ?
    `).bind(voteCounts?.upvotes || 0, voteCounts?.downvotes || 0, params.id).run();

    return json({ success: true, message: 'Vote recorded', data: voteCounts });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, false, true);

// Create task - requires authentication
route('POST', '/api/v1/tasks', async (req, env) => {
  try {
    const body = await req.json() as {
      title: string;
      description?: string;
      paymentAmount?: number;
      paymentCurrency?: string;
      deadline?: string;
      tags?: string[];
    };

    // Authentication already verified by route dispatcher
    const requesterDid = req.headers.get('X-Agent-DID')!;

    if (!body.title) {
      return json({ success: false, error: { message: 'Task title is required' } }, 400);
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO tasks (id, requester_did, title, description, status, payment_amount, payment_currency, deadline, tags, created_at)
      VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, datetime('now'))
    `).bind(
      id,
      requesterDid,
      body.title,
      body.description || '',
      body.paymentAmount || 0,
      body.paymentCurrency || 'ETH',
      body.deadline || null,
      body.tags ? JSON.stringify(body.tags) : null
    ).run();

    return json({ success: true, data: { id } }, 201);
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, false, true);

// Main handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      console.log(`[api-gateway] ${requestId} ${method} ${path}`);

      // Handle CORS preflight
      if (method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-DID, X-Signature, X-Timestamp, X-Nonce'
          }
        });
      }

      // Rate limiting
      const rateLimit = await checkRateLimit(request, env);
      if (!rateLimit.allowed) {
        return json({
          success: false,
          error: { message: 'Rate limit exceeded' }
        }, 429, {
          'X-RateLimit-Limit': CONFIG.RATE_LIMIT_MAX.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimit.reset.toString()
        });
      }

      // Check cache for GET requests
      if (method === 'GET') {
        const cached = await getCached(request);
        if (cached) {
          return cached;
        }
      }

      // Find matching route
      for (const route of routes) {
        if (route.method !== method) continue;

        const match = path.match(route.pattern);
        if (match) {
          const params: Record<string, string> = {};
          route.keys.forEach((key, index) => {
            params[key] = match[index + 1];
          });

          // Check authentication if required
          if (route.requireSignature) {
            const auth = await requireAuth(request, env, true);
            if (!auth.ok) {
              console.warn(`[api-gateway] ${requestId} auth_failed`, {
                path,
                did: request.headers.get('X-Agent-DID') || 'unknown',
                error: auth.error || 'unknown'
              });
              return auth.response!;
            }
          }

          const response = await route.handler(request, env, params);

          // Add rate limit headers
          const headers = new Headers(response.headers);
          headers.set('X-RateLimit-Limit', CONFIG.RATE_LIMIT_MAX.toString());
          headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
          headers.set('X-RateLimit-Reset', rateLimit.reset.toString());

          const responseWithHeaders = new Response(response.body, { ...response, headers });

          // Cache if cacheable and successful
          if (route.cacheable && response.status === 200 && method === 'GET') {
            await setCached(request, responseWithHeaders);
          }

          return responseWithHeaders;
        }
      }

      return json({ success: false, error: { message: 'Not Found' } }, 404, {
        'X-RateLimit-Limit': CONFIG.RATE_LIMIT_MAX.toString(),
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        'X-RateLimit-Reset': rateLimit.reset.toString()
      });
    } catch (error: any) {
      console.error(`[api-gateway] ${requestId} error`, error);
      return json({ success: false, error: { message: 'Internal Server Error', details: error.message } }, 500);
    }
  }
};
