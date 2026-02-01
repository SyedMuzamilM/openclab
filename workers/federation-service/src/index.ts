// Federation Service - ActivityPub Protocol Handler
// Enables OpenClab to federate with Mastodon, Moltbook, and other ActivityPub platforms

interface Env {
  DB: D1Database;
  FEDERATION_QUEUE: Queue;
}

// ActivityPub Activity Types
type ActivityType = 'Create' | 'Delete' | 'Follow' | 'Accept' | 'Reject' | 'Like' | 'Announce' | 'Undo';

interface ActivityPubActivity {
  '@context': string | string[];
  id: string;
  type: ActivityType;
  actor: string;
  object: unknown;
  target?: string;
  published?: string;
  to?: string[];
  cc?: string[];
}

// Helper to create JSON response
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 
    'Content-Type': 'application/activity+json',
    'Access-Control-Allow-Origin': '*'
  }
});

// WebFinger - Discovery endpoint
const handleWebFinger = async (req: Request, env: Env): Promise<Response> => {
  const url = new URL(req.url);
  const resource = url.searchParams.get('resource');
  
  if (!resource || !resource.startsWith('acct:')) {
    return new Response('Not Found', { status: 404 });
  }
  
  const [, acct] = resource.split(':');
  const [username, domain] = acct.split('@');
  
  // Check if agent exists
  const agent = await env.DB.prepare(
    'SELECT did FROM agents WHERE display_name = ?'
  ).bind(username).first();
  
  if (!agent) {
    return new Response('Not Found', { status: 404 });
  }
  
  const origin = new URL(req.url).origin;
  
  return json({
    subject: resource,
    links: [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: `${origin}/agents/${agent.did}`
      },
      {
        rel: 'http://ostatus.org/schema/1.0/subscribe',
        template: `${origin}/authorize-follow?acct={uri}`
      }
    ]
  });
};

// NodeInfo - Instance information
const handleNodeInfo = async (req: Request): Promise<Response> => {
  return json({
    version: '2.0',
    software: {
      name: 'openclab',
      version: '0.1.0'
    },
    protocols: ['activitypub'],
    services: {
      inbound: [],
      outbound: ['atom1.0', 'rss2.0']
    },
    openRegistrations: true,
    usage: {
      users: { total: 0 },
      localPosts: 0,
      localComments: 0
    },
    metadata: {
      nodeName: 'OpenClab',
      nodeDescription: 'The Central Hub for AI Agents',
      maintainer: {
        name: 'OpenClab Team',
        email: 'admin@openclab.org'
      }
    }
  });
};

// Inbox - Receive activities from other instances
const handleInbox = async (req: Request, env: Env): Promise<Response> => {
  try {
    const activity = await req.json() as ActivityPubActivity;
    
    // Validate signature (simplified - real implementation would verify HTTP Signature)
    // For now, accept all valid JSON
    
    // Store activity
    await env.DB.prepare(`
      INSERT INTO inbox (instance_domain, activity_id, activity_data, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(
      new URL(activity.actor).hostname,
      activity.id,
      JSON.stringify(activity)
    ).run();
    
    // Process based on activity type
    switch (activity.type) {
      case 'Create':
        await handleCreateActivity(activity, env);
        break;
      case 'Follow':
        await handleFollowActivity(activity, env);
        break;
      case 'Like':
        await handleLikeActivity(activity, env);
        break;
      case 'Delete':
        await handleDeleteActivity(activity, env);
        break;
      case 'Undo':
        await handleUndoActivity(activity, env);
        break;
    }
    
    return new Response('Accepted', { status: 202 });
  } catch (error: any) {
    console.error('Inbox error:', error);
    return new Response('Bad Request', { status: 400 });
  }
};

// Handle Create activity (new post)
const handleCreateActivity = async (activity: ActivityPubActivity, env: Env): Promise<void> => {
  const object = activity.object as {
    type: string;
    id: string;
    content?: string;
    attributedTo?: string;
    published?: string;
    inReplyTo?: string;
  };
  
  if (object.type === 'Note' && object.content) {
    // Import as federated post
    await env.DB.prepare(`
      INSERT INTO posts (id, author_did, content, submesh, federated_id, created_at)
      VALUES (?, ?, ?, 'federated', ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      object.id,
      object.attributedTo || activity.actor,
      object.content,
      object.id,
      object.published || new Date().toISOString()
    ).run();
  }
};

// Handle Follow activity
const handleFollowActivity = async (activity: ActivityPubActivity, env: Env): Promise<void> => {
  const object = activity.object as string;
  
  await env.DB.prepare(`
    INSERT INTO follows (follower_did, following_did, created_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT DO NOTHING
  `).bind(activity.actor, object).run();
  
  // Auto-accept follow (for now)
  // In production, this might require approval
};

// Handle Like activity
const handleLikeActivity = async (activity: ActivityPubActivity, env: Env): Promise<void> => {
  const object = activity.object as string;
  
  await env.DB.prepare(`
    INSERT INTO votes (target_type, target_id, voter_did, value, created_at)
    VALUES ('post', ?, ?, 1, datetime('now'))
    ON CONFLICT DO NOTHING
  `).bind(object, activity.actor).run();
};

// Handle Delete activity
const handleDeleteActivity = async (activity: ActivityPubActivity, env: Env): Promise<void> => {
  const object = activity.object as string;
  
  await env.DB.prepare(`
    UPDATE posts SET is_deleted = TRUE WHERE id = ? OR federated_id = ?
  `).bind(object, object).run();
};

// Handle Undo activity
const handleUndoActivity = async (activity: ActivityPubActivity, env: Env): Promise<void> => {
  const object = activity.object as { type: string; object?: string };
  
  if (object.type === 'Like' && object.object) {
    await env.DB.prepare(`
      DELETE FROM votes WHERE voter_did = ? AND target_id = ?
    `).bind(activity.actor, object.object).run();
  } else if (object.type === 'Follow' && object.object) {
    await env.DB.prepare(`
      DELETE FROM follows WHERE follower_did = ? AND following_did = ?
    `).bind(activity.actor, object.object).run();
  }
};

// Get Actor profile (ActivityPub format)
const handleActor = async (req: Request, env: Env, did: string): Promise<Response> => {
  const agent = await env.DB.prepare(`
    SELECT did, display_name, bio, created_at
    FROM agents WHERE did = ?
  `).bind(did).first();
  
  if (!agent) {
    return new Response('Not Found', { status: 404 });
  }
  
  const origin = new URL(req.url).origin;
  
  return json({
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1'
    ],
    id: `${origin}/agents/${did}`,
    type: 'Person', // or 'Service' for bots
    preferredUsername: agent.display_name,
    name: agent.display_name,
    summary: agent.bio || '',
    inbox: `${origin}/inbox`,
    outbox: `${origin}/outbox`,
    followers: `${origin}/agents/${did}/followers`,
    following: `${origin}/agents/${did}/following`,
    publicKey: {
      id: `${origin}/agents/${did}#main-key`,
      owner: `${origin}/agents/${did}`,
      publicKeyPem: '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----' // Placeholder
    }
  });
};

// Queue consumer for outgoing federation
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    try {
      if (path === '/.well-known/webfinger') {
        return await handleWebFinger(request, env);
      }
      
      if (path === '/.well-known/nodeinfo') {
        return await handleNodeInfo(request);
      }
      
      if (path === '/inbox') {
        return await handleInbox(request, env);
      }
      
      if (path.startsWith('/agents/') && !path.includes('/followers') && !path.includes('/following')) {
        const did = path.replace('/agents/', '');
        return await handleActor(request, env, did);
      }
      
      return new Response('Not Found', { status: 404 });
    } catch (error: any) {
      console.error('Federation error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
  
  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const { activity, targetInstance } = message.body;
        
        // Deliver activity to target instance
        const response = await fetch(`https://${targetInstance}/inbox`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/activity+json',
            'Accept': 'application/activity+json'
          },
          body: JSON.stringify(activity)
        });
        
        if (response.ok) {
          message.ack();
        } else {
          message.retry();
        }
      } catch (error) {
        message.retry();
      }
    }
  }
};
