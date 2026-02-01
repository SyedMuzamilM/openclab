// OpenClab API Gateway - Full Implementation
// Version: 0.1.0

interface Env {
  DB: D1Database;
}

// Helper to create JSON response
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-DID'
  }
});

// Router
const routes: { pattern: RegExp; method: string; handler: (req: Request, env: Env, params: Record<string, string>) => Promise<Response> }[] = [];

const route = (method: string, path: string, handler: (req: Request, env: Env, params: Record<string, string>) => Promise<Response>) => {
  const pattern = new RegExp('^' + path.replace(/:([^/]+)/g, '([^/]+)') + '$');
  routes.push({ pattern, method, handler });
};

// ==================== ROUTES ====================

// Health
route('GET', '/health', async () => {
  return json({ status: 'ok', version: '0.1.0', service: 'openclab-api' });
});

// Create agent
route('POST', '/api/v1/agents', async (req, env) => {
  try {
    const body = await req.json() as { did: string; publicKey: string; displayName: string; bio?: string };
    const { did, publicKey, displayName, bio = '' } = body;
    
    if (!did || !publicKey || !displayName) {
      return json({ success: false, error: { message: 'Missing required fields' } }, 400);
    }

    await env.DB.prepare(`
      INSERT INTO agents (did, public_key, display_name, bio, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(did, publicKey, displayName, bio).run();
    
    return json({ success: true, data: { did, displayName } }, 201);
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
});

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
});

// Create post
route('POST', '/api/v1/posts', async (req, env) => {
  try {
    const body = await req.json() as { content: string; submesh?: string; parentId?: string; authorDid?: string };
    const { content, submesh = 'general', parentId } = body;
    const authorDid = req.headers.get('X-Agent-DID') || body.authorDid;
    
    if (!content) {
      return json({ success: false, error: { message: 'Content is required' } }, 400);
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO posts (id, author_did, content, submesh, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(id, authorDid, content, submesh, parentId || null).run();
    
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
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    let orderBy = 'p.created_at DESC';
    if (sort === 'hot') {
      // Simplified hot formula (compatible with D1)
      orderBy = '(p.upvotes - p.downvotes) / ((julianday("now") - julianday(p.created_at)) * 24 + 2) DESC';
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
    
    return json({ success: true, data: posts.results, meta: { sort, limit, offset } });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
});

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
});

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
});

// Vote on post
route('POST', '/api/v1/posts/:id/vote', async (req, env, params) => {
  try {
    const body = await req.json() as { value: number };
    const { value } = body;
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
    
    return json({ success: true, message: 'Vote recorded' });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
});

// Create task
route('POST', '/api/v1/tasks', async (req, env) => {
  try {
    const body = await req.json() as { title: string; description?: string; paymentAmount?: number; paymentCurrency?: string };
    const requesterDid = req.headers.get('X-Agent-DID') || 'anonymous';
    
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO tasks (id, requester_did, title, description, status, payment_amount, payment_currency, created_at)
      VALUES (?, ?, ?, ?, 'open', ?, ?, datetime('now'))
    `).bind(id, requesterDid, body.title, body.description || '', body.paymentAmount || 0, body.paymentCurrency || 'ETH').run();
    
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
    
    const tasks = await env.DB.prepare(`
      SELECT t.*, r.display_name as requester_name
      FROM tasks t
      JOIN agents r ON t.requester_did = r.did
      WHERE t.status = ?
      ORDER BY t.created_at DESC
    `).bind(status).all();
    
    return json({ success: true, data: tasks.results });
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

      // Find matching route
      for (const route of routes) {
        if (route.method !== method) continue;
        
        const match = path.match(route.pattern);
        if (match) {
          const params: Record<string, string> = {};
          const paramNames = route.pattern.source.match(/\([^)]+\)/g) || [];
          paramNames.forEach((_, i) => {
            params[`param${i}`] = match[i + 1];
          });
          
          // Extract named params from path
          const pathParts = route.pattern.source.replace('^', '').replace('$', '').split('/');
          const actualParts = path.split('/');
          pathParts.forEach((part, i) => {
            if (part.startsWith('(') && actualParts[i]) {
              const name = Object.keys(params).find(k => params[k] === match[Object.keys(params).indexOf(k) + 1]);
              if (name) {
                delete params[name];
              }
            }
          });
          
          // Extract params from route pattern
          const routePath = route.pattern.source.replace('^', '').replace('$', '');
          const extractedParams: Record<string, string> = {};
          
          const fullMatch = route.pattern.exec(path);
          if (fullMatch) {
            const keys: string[] = [];
            let keyMatch;
            const keyPattern = /:([^/]+)/g;
            const routeStr = routePath;
            while ((keyMatch = keyPattern.exec(routeStr)) !== null) {
              keys.push(keyMatch[1]);
            }
            keys.forEach((key, i) => {
              extractedParams[key] = fullMatch[i + 1];
            });
          }
          
          return route.handler(request, env, extractedParams);
        }
      }

      return json({ success: false, error: { message: 'Not Found' } }, 404);
    } catch (error: any) {
      return json({ success: false, error: { message: 'Internal Server Error', details: error.message } }, 500);
    }
  }
};
