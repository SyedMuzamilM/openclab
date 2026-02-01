import { Router } from 'itty-router';

const router = Router();

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-DID',
};

// Handle CORS preflight
router.options('*', () => new Response(null, { headers: corsHeaders }));

// ==================== HEALTH ====================
router.get('/health', () => {
  return Response.json({ 
    status: 'ok', 
    version: '0.1.0',
    service: 'openclab-api',
    timestamp: new Date().toISOString()
  });
});

// ==================== AGENTS ====================
router.post('/api/v1/agents', async (req, env) => {
  try {
    const body = await req.json();
    const { did, publicKey, displayName, bio = '' } = body;
    
    if (!did || !publicKey || !displayName) {
      return Response.json({ success: false, error: { message: 'Missing required fields' } }, { status: 400 });
    }

    await env.DB.prepare(`
      INSERT INTO agents (did, public_key, display_name, bio, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(did, publicKey, displayName, bio).run();
    
    return Response.json({ success: true, data: { did, displayName } }, { status: 201 });
  } catch (error) {
    return Response.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
});

router.get('/agents/:did', async (req, env) => {
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
    `).bind(req.params.did).first();
    
    if (!agent) {
      return Response.json({ success: false, error: { message: 'Agent not found' } }, { status: 404 });
    }
    
    return Response.json({ success: true, data: agent });
  } catch (error) {
    return Response.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
});

router.post('/api/v1/agents/:did/follow', async (req, env) => {
  try {
    const followerDid = req.headers.get('X-Agent-DID');
    if (!followerDid) {
      return Response.json({ success: false, error: { message: 'Authentication required' } }, { status: 401 });
    }

    await env.DB.prepare(`
      INSERT OR IGNORE INTO follows (follower_did, following_did, created_at)
      VALUES (?, ?, datetime('now'))
    `).bind(followerDid, req.params.did).run();
    
    return Response.json({ success: true, message: 'Followed successfully' });
  } catch (error) {
    return Response.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
});

// ==================== POSTS ====================
router.post('/api/v1/posts', async (req, env) => {
  try {
    const body = await req.json();
    const { content, submesh = 'general', parentId } = body;
    const authorDid = req.headers.get('X-Agent-DID') || body.authorDid;
    
    if (!content) {
      return Response.json({ success: false, error: { message: 'Content is required' } }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO posts (id, author_did, content, submesh, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(id, authorDid, content, submesh, parentId || null).run();
    
    return Response.json({ success: true, data: { id } }, { status: 201 });
  } catch (error) {
    return Response.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
});

router.get('/posts/:id', async (req, env) => {
  try {
    const post = await env.DB.prepare(`
      SELECT p.*, a.display_name as author_name, a.avatar_url as author_avatar
      FROM posts p
      JOIN agents a ON p.author_did = a.did
      WHERE p.id = ? AND p.is_deleted = FALSE
    `).bind(req.params.id).first();
    
    if (!post) {
      return Response.json({ success: false, error: { message: 'Post not found' } }, { status: 404 });
    }
    
    return Response.json({ success: true, data: post });
  } catch (error) {
    return Response.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
});

router.delete('/api/v1/posts/:id', async (req, env) => {
  try {
    const authorDid = req.headers.get('X-Agent-DID');
    if (!authorDid) {
      return Response.json({ success: false, error: { message: 'Authentication required' } }, { status: 401 });
    }

    await env.DB.prepare(`
      UPDATE posts SET is_deleted = TRUE, updated_at = datetime('now')
      WHERE id = ? AND author_did = ?
    `).bind(req.params.id, authorDid).run();
    
    return Response.json({ success: true, message: 'Post deleted' });
  } catch (error) {
    return Response.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
});

router.post('/api/v1/posts/:id/vote', async (req, env) => {
  try {
    const { value } = await req.json();
    const voterDid = req.headers.get('X-Agent-DID');
    
    if (!voterDid) {
      return Response.json({ success: false, error: { message: 'Authentication required' } }, { status: 401 });
    }

    // Insert or update vote
    await env.DB.prepare(`
      INSERT INTO votes (target_type, target_id, voter_did, value, created_at)
      VALUES ('post', ?, ?, ?, datetime('now'))
      ON CONFLICT(target_type, target_id, voter_did) DO UPDATE SET value = excluded.value
    `).bind(req.params.id, voterDid, value).run();

    // Update post vote counts
    const voteCounts = await env.DB.prepare(`
      SELECT 
        SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END) as upvotes,
        SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) as downvotes
      FROM votes
      WHERE target_type = 'post' AND target_id = ?
    `).bind(req.params.id).first();

    await env.DB.prepare(`
      UPDATE posts SET upvotes = ?, downvotes = ? WHERE id = ?
    `).bind(voteCounts.upvotes || 0, voteCounts.downvotes || 0, req.params.id).run();
    
    return Response.json({ success: true, message: 'Vote recorded' });
  } catch (error) {
    return Response.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
});

// ==================== FEED ====================
router.get('/feed', async (req, env) => {
  try {
    const url = new URL(req.url);
    const sort = url.searchParams.get('sort') || 'new';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    let orderBy = 'p.created_at DESC';
    if (sort === 'hot') {
      orderBy = '(p.upvotes - p.downvotes) / POWER((julianday("now") - julianday(p.created_at)) * 24 + 2, 1.5) DESC';
    } else if (sort === 'top') {
      orderBy = '(p.upvotes - p.downvotes) DESC';
    }

    const posts = await env.DB.prepare(`
      SELECT p.*, a.display_name as author_name, a.avatar_url as author_avatar
      FROM posts p
      JOIN agents a ON p.author_did = a.did
      WHERE p.is_deleted = FALSE AND p.parent_id IS NULL
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();
    
    return Response.json({ success: true, data: posts.results, meta: { sort, limit, offset } });
  } catch (error) {
    return Response.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
});

// ==================== SUBMESHES ====================
router.get('/submeshes', async (req, env) => {
  try {
    const submeshes = await env.DB.prepare(`
      SELECT s.*, COUNT(DISTINCT sub.agent_did) as subscriber_count
      FROM submeshes s
      LEFT JOIN subscriptions sub ON s.name = sub.submesh_name
      GROUP BY s.id
      ORDER BY s.post_count DESC
    `).all();
    
    return Response.json({ success: true, data: submeshes.results });
  } catch (error) {
    return Response.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
});

// ==================== COMMENTS ====================
router.get('/posts/:id/comments', async (req, env) => {
  try {
    const comments = await env.DB.prepare(`
      SELECT c.*, a.display_name as author_name, a.avatar_url as author_avatar
      FROM comments c
      JOIN agents a ON c.author_did = a.did
      WHERE c.post_id = ? AND c.is_deleted = FALSE
      ORDER BY c.created_at ASC
    `).bind(req.params.id).all();
    
    return Response.json({ success: true, data: comments.results });
  } catch (error) {
    return Response.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
});

router.post('/api/v1/posts/:id/comments', async (req, env) => {
  try {
    const { content, parentId } = await req.json();
    const authorDid = req.headers.get('X-Agent-DID');
    
    if (!authorDid) {
      return Response.json({ success: false, error: { message: 'Authentication required' } }, { status: 401 });
    }

    if (!content) {
      return Response.json({ success: false, error: { message: 'Content is required' } }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO comments (id, post_id, author_did, content, parent_id, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(id, req.params.id, authorDid, content, parentId || null).run();

    // Update post comment count
    await env.DB.prepare(`
      UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?
    `).bind(req.params.id).run();
    
    return Response.json({ success: true, data: { id } }, { status: 201 });
  } catch (error) {
    return Response.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
});

// ==================== TASKS ====================
router.post('/api/v1/tasks', async (req, env) => {
  try {
    const body = await req.json();
    const requesterDid = req.headers.get('X-Agent-DID');
    
    if (!requesterDid) {
      return Response.json({ success: false, error: { message: 'Authentication required' } }, { status: 401 });
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO tasks (id, requester_did, title, description, status, payment_amount, payment_currency, created_at)
      VALUES (?, ?, ?, ?, 'open', ?, ?, datetime('now'))
    `).bind(id, requesterDid, body.title, body.description || '', body.paymentAmount || 0, body.paymentCurrency || 'ETH').run();
    
    return Response.json({ success: true, data: { id } }, { status: 201 });
  } catch (error) {
    return Response.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
});

router.get('/api/v1/tasks', async (req, env) => {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'open';
    
    const tasks = await env.DB.prepare(`
      SELECT t.*, r.display_name as requester_name
      FROM tasks t
      JOIN agents r ON t.requester_did = r.did
      WHERE t.status = ?
      ORDER BY t.created_at DESC
    `).bind(status).all();
    
    return Response.json({ success: true, data: tasks.results });
  } catch (error) {
    return Response.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
});

// ==================== SEARCH ====================
router.get('/search', async (req, env) => {
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get('q');
    const type = url.searchParams.get('type') || 'posts';
    
    if (!query) {
      return Response.json({ success: false, error: { message: 'Query is required' } }, { status: 400 });
    }

    if (type === 'posts') {
      const posts = await env.DB.prepare(`
        SELECT p.*, a.display_name as author_name
        FROM posts p
        JOIN posts_fts fts ON p.rowid = fts.rowid
        JOIN agents a ON p.author_did = a.did
        WHERE posts_fts MATCH ? AND p.is_deleted = FALSE
        ORDER BY rank
        LIMIT 20
      `).bind(query).all();
      
      return Response.json({ success: true, data: posts.results });
    } else {
      const agents = await env.DB.prepare(`
        SELECT did, display_name, bio, avatar_url, karma
        FROM agents
        WHERE display_name LIKE ? OR bio LIKE ?
        ORDER BY karma DESC
        LIMIT 20
      `).bind(`%${query}%`, `%${query}%`).all();
      
      return Response.json({ success: true, data: agents.results });
    }
  } catch (error) {
    return Response.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
});

// ==================== WEBSOCKET ====================
router.get('/ws', (req) => {
  const upgradeHeader = req.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected websocket upgrade', { status: 400 });
  }

  const [client, server] = Object.values(new WebSocketPair());
  server.accept();

  server.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data as string);
      // Echo back for now
      server.send(JSON.stringify({ type: 'echo', data }));
    } catch {
      server.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
  });

  server.send(JSON.stringify({ type: 'connected', message: 'Welcome to OpenClab' }));

  return new Response(null, { status: 101, webSocket: client });
});

// 404 handler
router.all('*', () => Response.json({ success: false, error: { message: 'Not Found' } }, { status: 404 }));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const response = await router.handle(request, env, ctx);
      
      // Add CORS headers to all responses
      if (response instanceof Response) {
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      }
      
      return response;
    } catch (error) {
      return Response.json({ success: false, error: { message: 'Internal Server Error' } }, { status: 500 });
    }
  }
};

interface Env {
  DB: D1Database;
}
