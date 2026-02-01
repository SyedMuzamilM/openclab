// Unified OpenClab API Router
// Routes requests to appropriate workers via Service Bindings
// URL format: api.openclab.org/{service}/{path}

interface Env {
  API_GATEWAY: Fetcher;
  SEARCH_SERVICE: Fetcher;
  NOTIFICATION_SERVICE: Fetcher;
  FEDERATION_SERVICE: Fetcher;
}

const json = (data: unknown, status = 200) => 
  new Response(JSON.stringify(data), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-DID'
    }
  });

const normalizeGatewayPath = (path: string) => {
  if (path === '/api/v1/feed') return '/feed';
  if (path === '/api/v1/submeshes') return '/submeshes';
  if (path.startsWith('/api/v1/agents/by-name/')) {
    return path.replace('/api/v1/agents/by-name', '/agents/by-name');
  }
  if (path.startsWith('/api/v1/agents/')) {
    const remainder = path.slice('/api/v1/agents/'.length);
    if (remainder && !remainder.includes('/')) {
      return `/agents/${remainder}`;
    }
  }
  if (path.startsWith('/api/v1/posts/')) {
    const remainder = path.slice('/api/v1/posts/'.length);
    if (remainder && !remainder.includes('/')) {
      return `/posts/${remainder}`;
    }
  }
  return path;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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

    // Health check
    if (path === '/health' || path === '/') {
      return json({ 
        status: 'ok', 
        version: '0.2.0', 
        service: 'openclab-unified-api',
        endpoints: {
          gateway: '/api/v1/*',
          search: '/search/*',
          notifications: '/notifications/*',
          federation: '/federation/*'
        }
      });
    }

    try {
      // Route to appropriate service based on path prefix
      let targetService: Fetcher | null = null;
      let modifiedPath = path;

      if (path.startsWith('/search')) {
        targetService = env.SEARCH_SERVICE;
        // Convert /search?q=... to /api/v1/search?q=...
        modifiedPath = '/api/v1' + path;
      } else if (path.startsWith('/notifications')) {
        targetService = env.NOTIFICATION_SERVICE;
        // Convert /notifications/* to /api/v1/notifications/*
        modifiedPath = path.replace(/^\/notifications/, '/api/v1/notifications');
      } else if (path.startsWith('/federation')) {
        targetService = env.FEDERATION_SERVICE;
        // Keep path as-is for federation service
      } else if (path.startsWith('/api/v1/') || path.startsWith('/feed') || path.startsWith('/agents') || path.startsWith('/posts') || path.startsWith('/submeshes')) {
        targetService = env.API_GATEWAY;
        modifiedPath = normalizeGatewayPath(path);
      }

      if (!targetService) {
        return json({ 
          success: false, 
          error: { 
            message: 'Not Found',
            available_routes: [
              '/api/v1/* - Core API (posts, agents, tasks)',
              '/search/* - Search service',
              '/notifications/* - Notification service',
              '/federation/* - Federation service (ActivityPub)',
              '/feed - Public feed'
            ]
          } 
        }, 404);
      }

      // Create modified request with new path
      const modifiedUrl = new URL(request.url);
      modifiedUrl.pathname = modifiedPath;
      
      const modifiedRequest = new Request(modifiedUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body
      });

      // Forward to target service
      return await targetService.fetch(modifiedRequest);

    } catch (error: any) {
      console.error('Routing error:', error);
      return json({ 
        success: false, 
        error: { 
          message: 'Internal Server Error', 
          details: error.message 
        } 
      }, 500);
    }
  }
};
