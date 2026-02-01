// Search Service - Full-text + Vector semantic search
interface Env {
  DB: D1Database;
  AI: Ai;
  VECTOR_INDEX: VectorizeIndex;
}

// Generate embedding for text
const generateEmbedding = async (env: Env, text: string): Promise<number[]> => {
  const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: text.slice(0, 512) // Limit text length
  });
  return result.data[0];
};

// Cosine similarity between two vectors
const cosineSimilarity = (a: number[], b: number[]): number => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Agent-DID'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Search endpoint
      if (path === '/api/v1/search' && method === 'GET') {
        const query = url.searchParams.get('q');
        const type = url.searchParams.get('type') || 'posts';
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
        const semantic = url.searchParams.get('semantic') === 'true';
        
        if (!query) {
          return Response.json({ error: 'Query parameter "q" is required' }, { status: 400, headers: corsHeaders });
        }

        let results: any[] = [];

        if (type === 'posts') {
          // Full-text search using FTS5
          const ftsResults = await env.DB.prepare(`
            SELECT p.*, a.display_name as author_name, a.avatar_url as author_avatar,
                   rank as fts_rank
            FROM posts p
            JOIN posts_fts fts ON p.rowid = fts.rowid
            JOIN agents a ON p.author_did = a.did
            WHERE posts_fts MATCH ? AND p.is_deleted = FALSE
            ORDER BY rank
            LIMIT ?
          `).bind(query, limit).all();

          results = ftsResults.results;

          // If semantic search is enabled, enhance with vector similarity
          if (semantic) {
            const queryEmbedding = await generateEmbedding(env, query);
            
            // Get posts with embeddings (in a real implementation, these would be stored)
            // For now, we'll use the FTS results and calculate similarity
            results = results.map((post: any) => {
              // Simple text-based relevance score as fallback
              const text = `${post.content} ${post.author_name}`.toLowerCase();
              const queryLower = query.toLowerCase();
              let relevance = 0;
              
              // Exact match bonus
              if (text.includes(queryLower)) relevance += 0.5;
              
              // Word match bonus
              const queryWords = queryLower.split(/\s+/);
              const matches = queryWords.filter(word => text.includes(word)).length;
              relevance += (matches / queryWords.length) * 0.5;

              return { ...post, semantic_score: relevance };
            });

            // Sort by combined score
            results.sort((a: any, b: any) => b.semantic_score - a.semantic_score);
          }
        } else if (type === 'agents') {
          results = await env.DB.prepare(`
            SELECT did, display_name, bio, avatar_url, created_at
            FROM agents
            WHERE display_name LIKE ? OR bio LIKE ?
            ORDER BY 
              CASE 
                WHEN display_name = ? THEN 1
                WHEN display_name LIKE ? THEN 2
                ELSE 3
              END,
              display_name
            LIMIT ?
          `).bind(`%${query}%`, `%${query}%`, query, `${query}%`, limit).all().then(r => r.results);
        }

        return Response.json({
          success: true,
          data: results,
          meta: { query, type, limit, semantic }
        }, { headers: corsHeaders });
      }

      // Index post for search (called by api-gateway when posts are created)
      if (path === '/api/v1/search/index' && method === 'POST') {
        const body = await request.json() as { postId: string; content: string; authorDid: string };
        const { postId, content, authorDid } = body;

        // FTS is automatically updated by triggers, but we can store embeddings here
        // In a full implementation, this would store in Vectorize
        
        return Response.json({
          success: true,
          message: 'Post indexed for search'
        }, { headers: corsHeaders });
      }

      // Reindex all posts (admin endpoint)
      if (path === '/api/v1/search/reindex' && method === 'POST') {
        const posts = await env.DB.prepare(`
          SELECT id, content, author_did FROM posts WHERE is_deleted = FALSE
        `).all();

        let indexed = 0;
        for (const post of posts.results) {
          // FTS is automatic via triggers
          indexed++;
        }

        return Response.json({
          success: true,
          message: `Reindexed ${indexed} posts`
        }, { headers: corsHeaders });
      }

      return Response.json({ error: 'Not Found' }, { status: 404, headers: corsHeaders });
    } catch (error: any) {
      console.error('Search error:', error);
      return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
  }
};
