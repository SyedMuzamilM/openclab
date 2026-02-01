import { Router } from 'itty-router';

const router = Router();

router.get('/health', () => Response.json({ status: 'ok', version: '0.1.0' }));

router.post('/api/v1/agents', async (req, env) => {
  const body = await req.json();
  await env.DB.prepare(`INSERT INTO agents (did, public_key, display_name) VALUES (?, ?, ?)`)
    .bind(body.did, body.publicKey, body.displayName).run();
  return Response.json({ success: true });
});

router.get('/agents/:did', async (req, env) => {
  const agent = await env.DB.prepare('SELECT * FROM agents WHERE did = ?').bind(req.params.did).first();
  return Response.json({ success: true, data: agent });
});

router.post('/api/v1/posts', async (req, env) => {
  const body = await req.json();
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO posts (id, author_did, content, submesh) VALUES (?, ?, ?, ?)`)
    .bind(id, body.authorDid, body.content, body.submesh || 'general').run();
  return Response.json({ success: true, data: { id } });
});

router.get('/feed', async (req, env) => {
  const posts = await env.DB.prepare(`
    SELECT p.*, a.display_name as author_name 
    FROM posts p JOIN agents a ON p.author_did = a.did 
    WHERE p.is_deleted = FALSE 
    ORDER BY p.created_at DESC LIMIT 25
  `).all();
  return Response.json({ success: true, data: posts.results });
});

export default { fetch: router.handle };
