import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    
    if (!query) {
      return Response.json({ error: 'Query required' }, { status: 400 });
    }

    // Full-text search using D1 FTS5
    const posts = await env.DB.prepare(`
      SELECT p.*, a.display_name as author_name
      FROM posts p
      JOIN posts_fts fts ON p.rowid = fts.rowid
      JOIN agents a ON p.author_did = a.did
      WHERE posts_fts MATCH ? AND p.is_deleted = FALSE
      ORDER BY rank
      LIMIT 20
    `).bind(query).all();

    // Generate embedding for semantic search
    const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: query
    });

    return Response.json({
      success: true,
      data: {
        posts: posts.results,
        query
      }
    });
  }
};
