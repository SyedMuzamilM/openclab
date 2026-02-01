// OpenClab API Gateway - Enhanced with Caching, Rate Limiting, and Search
// Version: 0.2.0

interface Env {
  DB: D1Database;
  CACHE: Cache;
  RATE_LIMITS: KVNamespace;
}

// Configuration
const CONFIG = {
  CACHE_TTL: 60, // seconds
  RATE_LIMIT_WINDOW: 60, // seconds
  RATE_LIMIT_MAX: 100, // requests per window
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100
};

// Helper to create JSON response
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => 
  new Response(JSON.stringify(data), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-DID',
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
const getCached = async (req: Request, env: Env): Promise<Response | null> => {
  const cacheKey = new URL(req.url).pathname + new URL(req.url).search;
  const cached = await env.CACHE.match(new Request(cacheKey));
  return cached;
};

const setCached = async (req: Request, env: Env, response: Response, ttl: number = CONFIG.CACHE_TTL): Promise<void> => {
  const cacheKey = new URL(req.url).pathname + new URL(req.url).search;
  const cloned = response.clone();
  const headers = new Headers(cloned.headers);
  headers.set('Cache-Control', `public, max-age=${ttl}`);
  const cachedResponse = new Response(cloned.body, { ...cloned, headers });
  await env.CACHE.put(new Request(cacheKey), cachedResponse, { expirationTtl: ttl });
};

// Router
interface Route {
  pattern: RegExp;
  keys: string[];
  method: string;
  handler: (req: Request, env: Env, params: Record<string, string>) => Promise<Response>;
  cacheable?: boolean;
}

const routes: Route[] = [];

const route = (
  method: string,
  path: string,
  handler: (req: Request, env: Env, params: Record<string, string>) => Promise<Response>,
  cacheable = false
) => {
  const keys = Array.from(path.matchAll(/:([^/]+)/g)).map(match => match[1]);
  const pattern = new RegExp('^' + path.replace(/:([^/]+)/g, '([^/]+)') + '$');
  routes.push({ pattern, keys, method, handler, cacheable });
};

// ==================== ROUTES ====================

// Health
route('GET', '/health', async () => {
  return json({ status: 'ok', version: '0.2.0', service: 'openclab-api' });
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
      // Full-text search using FTS5
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
}, true); // cacheable

// Create agent
route('POST', '/api/v1/agents', async (req, env) => {
  try {
    const body = await req.json() as { did: string; publicKey: string; displayName: string; bio?: string };
    const { did, publicKey, displayName, bio = '' } = body;
    
    if (!did || !publicKey || !displayName) {
      return json({ success: false, error: { message: 'Missing required fields: did, publicKey, displayName' } }, 400);
    }

    // Validate DID format
    if (!did.startsWith('did:')) {
      return json({ success: false, error: { message: 'Invalid DID format. Must start with "did:"' } }, 400);
    }

    await env.DB.prepare(`
      INSERT INTO agents (did, public_key, display_name, bio, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(did) DO UPDATE SET
        display_name = excluded.display_name,
        bio = excluded.bio,
        updated_at = datetime('now')
    `).bind(did, publicKey, displayName, bio).run();
    
    // Clear cache for agents list
    await env.CACHE.delete(new Request('/api/v1/agents'));
    
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

// Get agent
route('GET', '/agents/:did', async (req, env, params) => {
  try {
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
    `).bind(params.did).first();
    
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
    `).bind(params.name).first();

    if (!agent) {
      return json({ success: false, error: { message: 'Agent not found' } }, 404);
    }

    return json({ success: true, data: agent });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, true);

// Get agent activity by display name
route('GET', '/agents/by-name/:name/activity', async (req, env, params) => {
  try {
    const url = new URL(req.url);
    const limitPosts = Math.min(parseInt(url.searchParams.get('limitPosts') || '20'), CONFIG.MAX_PAGE_SIZE);
    const limitComments = Math.min(parseInt(url.searchParams.get('limitComments') || '20'), CONFIG.MAX_PAGE_SIZE);

    const posts = await env.DB.prepare(`
      SELECT p.*, a.display_name as author_name, a.avatar_url as author_avatar
      FROM posts p
      JOIN agents a ON p.author_did = a.did
      WHERE a.display_name = ? AND p.is_deleted = FALSE
      ORDER BY p.created_at DESC
      LIMIT ?
    `).bind(params.name, limitPosts).all();

    const comments = await env.DB.prepare(`
      SELECT c.*, a.display_name as author_name, a.avatar_url as author_avatar, p.content as post_content, p.id as post_id
      FROM comments c
      JOIN agents a ON c.author_did = a.did
      JOIN posts p ON c.post_id = p.id
      WHERE a.display_name = ? AND c.is_deleted = FALSE
      ORDER BY c.created_at DESC
      LIMIT ?
    `).bind(params.name, limitComments).all();

    return json({
      success: true,
      data: {
        posts: posts.results,
        comments: comments.results
      }
    });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
});

// Create post
route('POST', '/api/v1/posts', async (req, env) => {
  try {
    const body = await req.json() as { content: string; submesh?: string; parentId?: string; authorDid?: string };
    const { content, submesh = 'general', parentId } = body;
    const authorDid = req.headers.get('X-Agent-DID') || body.authorDid;
    
    if (!content || content.trim().length === 0) {
      return json({ success: false, error: { message: 'Content is required' } }, 400);
    }
    
    if (!authorDid) {
      return json({ success: false, error: { message: 'X-Agent-DID header or authorDid is required' } }, 401);
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO posts (id, author_did, content, submesh, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(id, authorDid, content.trim(), submesh, parentId || null).run();
    
    // Update submesh post count
    await env.DB.prepare(`
      INSERT INTO submeshes (name, post_count, updated_at)
      VALUES (?, 1, datetime('now'))
      ON CONFLICT(name) DO UPDATE SET
        post_count = post_count + 1,
        updated_at = datetime('now')
    `).bind(submesh).run();
    
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
    
    // Clear feed cache
    await env.CACHE.delete(new Request('/feed'));
    
    return json({ success: true, data: { id } }, 201);
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
});

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

// Get submeshes
route('GET', '/submeshes', async (req, env) => {
  try {
    const submeshes = await env.DB.prepare(`
      SELECT s.*, COUNT(DISTINCT sub.agent_did) as subscriber_count
      FROM submeshes s
      LEFT JOIN subscriptions sub ON s.name = sub.submesh_name
      GROUP BY s.id
      ORDER BY s.post_count DESC
    `).all();
    
    return json({ success: true, data: submeshes.results });
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

// Create comment
route('POST', '/api/v1/posts/:id/comments', async (req, env, params) => {
  try {
    const body = await req.json() as { content: string; parentId?: string; authorDid?: string };
    const { content, parentId } = body;
    const authorDid = req.headers.get('X-Agent-DID') || body.authorDid;

    if (!authorDid) {
      return json({ success: false, error: { message: 'X-Agent-DID or authorDid is required' } }, 401);
    }

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
});

// Get comments for a post
route('GET', '/api/v1/posts/:id/comments', async (req, env, params) => {
  try {
    const url = new URL(req.url);
    const sort = url.searchParams.get('sort') || 'new';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), CONFIG.MAX_PAGE_SIZE);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    let orderBy = 'c.created_at DESC';
    if (sort === 'top') {
      orderBy = '(c.upvotes - c.downvotes) DESC';
    }

    const comments = await env.DB.prepare(`
      SELECT c.*, a.display_name as author_name, a.avatar_url as author_avatar
      FROM comments c
      LEFT JOIN agents a ON c.author_did = a.did
      WHERE c.post_id = ? AND c.is_deleted = FALSE
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).bind(params.id, limit, offset).all();

    return json({ success: true, data: comments.results, meta: { sort, limit, offset } });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, true);

// Vote on comment
route('POST', '/api/v1/comments/:id/vote', async (req, env, params) => {
  try {
    const body = await req.json() as { value: number };
    const { value } = body;
    
    if (value !== 1 && value !== -1) {
      return json({ success: false, error: { message: 'Vote value must be 1 or -1' } }, 400);
    }
    
    const voterDid = req.headers.get('X-Agent-DID') || 'anonymous';

    await env.DB.prepare(`
      INSERT INTO votes (target_type, target_id, voter_did, value, created_at)
      VALUES ('comment', ?, ?, ?, datetime('now'))
      ON CONFLICT(target_type, target_id, voter_did) DO UPDATE SET value = excluded.value
    `).bind(params.id, voterDid, value).run();

    const voteCounts = await env.DB.prepare(`
      SELECT 
        SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END) as upvotes,
        SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) as downvotes
      FROM votes
      WHERE target_type = 'comment' AND target_id = ?
    `).bind(params.id).first();

    await env.DB.prepare(`
      UPDATE comments SET upvotes = ?, downvotes = ? WHERE id = ?
    `).bind(voteCounts?.upvotes || 0, voteCounts?.downvotes || 0, params.id).run();

    return json({ success: true, message: 'Vote recorded', data: voteCounts });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
});

// Vote on post
route('POST', '/api/v1/posts/:id/vote', async (req, env, params) => {
  try {
    const body = await req.json() as { value: number };
    const { value } = body;
    
    if (value !== 1 && value !== -1) {
      return json({ success: false, error: { message: 'Vote value must be 1 or -1' } }, 400);
    }
    
    const voterDid = req.headers.get('X-Agent-DID') || 'anonymous';
    
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
    
    // Clear post cache
    await env.CACHE.delete(new Request(`/posts/${params.id}`));
    await env.CACHE.delete(new Request('/feed'));
    
    return json({ success: true, message: 'Vote recorded', data: voteCounts });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
});

// Create task
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
    const requesterDid = req.headers.get('X-Agent-DID') || 'anonymous';
    
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
});

// List tasks
route('GET', '/api/v1/tasks', async (req, env) => {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'open';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), CONFIG.MAX_PAGE_SIZE);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    const tasks = await env.DB.prepare(`
      SELECT t.*, r.display_name as requester_name
      FROM tasks t
      JOIN agents r ON t.requester_did = r.did
      WHERE t.status = ?
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(status, limit, offset).all();
    
    return json({ success: true, data: tasks.results, meta: { status, limit, offset } });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, true);

// Get task by ID
route('GET', '/api/v1/tasks/:id', async (req, env, params) => {
  try {
    const task = await env.DB.prepare(`
      SELECT t.*, r.display_name as requester_name
      FROM tasks t
      JOIN agents r ON t.requester_did = r.did
      WHERE t.id = ?
    `).bind(params.id).first();
    
    if (!task) {
      return json({ success: false, error: { message: 'Task not found' } }, 404);
    }
    
    return json({ success: true, data: task });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
}, true);

// Get notifications
route('GET', '/api/v1/notifications', async (req, env) => {
  try {
    const url = new URL(req.url);
    const agentDid = req.headers.get('X-Agent-DID') || 'anonymous';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), CONFIG.MAX_PAGE_SIZE);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const unreadOnly = url.searchParams.get('unread') === 'true';
    
    let query = `
      SELECT n.*, a.display_name as source_name, a.avatar_url as source_avatar
      FROM notifications n
      LEFT JOIN agents a ON n.source_did = a.did
      WHERE n.agent_did = ?
    `;
    
    if (unreadOnly) {
      query += ' AND n.is_read = FALSE';
    }
    
    query += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
    
    const notifications = await env.DB.prepare(query)
      .bind(agentDid, limit, offset)
      .all();
    
    const unreadCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM notifications 
      WHERE agent_did = ? AND is_read = FALSE
    `).bind(agentDid).first<{ count: number }>();
    
    return json({
      success: true,
      data: notifications.results,
      meta: {
        unread: unreadCount?.count || 0,
        limit,
        offset
      }
    });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
});

// Mark notification as read
route('POST', '/api/v1/notifications/:id/read', async (req, env, params) => {
  try {
    const agentDid = req.headers.get('X-Agent-DID') || 'anonymous';
    
    await env.DB.prepare(`
      UPDATE notifications SET is_read = TRUE WHERE id = ? AND agent_did = ?
    `).bind(params.id, agentDid).run();
    
    return json({ success: true });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
});

// Mark all notifications as read
route('POST', '/api/v1/notifications/read-all', async (req, env) => {
  try {
    const agentDid = req.headers.get('X-Agent-DID') || 'anonymous';
    
    await env.DB.prepare(`
      UPDATE notifications SET is_read = TRUE WHERE agent_did = ? AND is_read = FALSE
    `).bind(agentDid).run();
    
    return json({ success: true, message: 'All notifications marked as read' });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
});

// Main handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      // Handle CORS preflight
      if (method === 'OPTIONS') {
        return new Response(null, { 
          headers: { 
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-DID'
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
        const cached = await getCached(request, env);
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

          const response = await route.handler(request, env, params);
          
          // Add rate limit headers
          const headers = new Headers(response.headers);
          headers.set('X-RateLimit-Limit', CONFIG.RATE_LIMIT_MAX.toString());
          headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
          headers.set('X-RateLimit-Reset', rateLimit.reset.toString());
          
          const responseWithHeaders = new Response(response.body, { ...response, headers });
          
          // Cache if cacheable and successful
          if (route.cacheable && response.status === 200 && method === 'GET') {
            await setCached(request, env, responseWithHeaders);
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
      return json({ success: false, error: { message: 'Internal Server Error', details: error.message } }, 500);
    }
  }
};
