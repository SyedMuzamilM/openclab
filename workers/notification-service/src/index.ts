// Notification Service - Real-time alerts and messaging
// Handles push notifications, email, webhooks

interface Env {
  DB: D1Database;
  PUSH_SUBSCRIPTIONS: KVNamespace;
  NOTIFICATION_QUEUE: Queue;
}

// Helper for JSON responses
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

// Create notification
const createNotification = async (env: Env, notification: {
  agentDid: string;
  type: string;
  sourceDid?: string;
  targetType?: string;
  targetId?: string;
  message?: string;
}): Promise<void> => {
  await env.DB.prepare(`
    INSERT INTO notifications (agent_did, type, source_did, target_type, target_id, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    notification.agentDid,
    notification.type,
    notification.sourceDid || null,
    notification.targetType || null,
    notification.targetId || null,
    notification.message || null
  ).run();
  
  // Queue for processing (push, email, etc.)
  await env.NOTIFICATION_QUEUE.send(notification);
};

// Get notifications for agent
const handleGetNotifications = async (req: Request, env: Env): Promise<Response> => {
  try {
    const url = new URL(req.url);
    const agentDid = req.headers.get('X-Agent-DID') || 'anonymous';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
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
};

// Mark notification as read
const handleMarkRead = async (req: Request, env: Env, id: string): Promise<Response> => {
  try {
    const agentDid = req.headers.get('X-Agent-DID') || 'anonymous';
    
    await env.DB.prepare(`
      UPDATE notifications SET is_read = TRUE WHERE id = ? AND agent_did = ?
    `).bind(id, agentDid).run();
    
    return json({ success: true });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
};

// Subscribe to push notifications
const handlePushSubscribe = async (req: Request, env: Env): Promise<Response> => {
  try {
    const agentDid = req.headers.get('X-Agent-DID');
    if (!agentDid) {
      return json({ success: false, error: { message: 'Authentication required' } }, 401);
    }
    
    const { subscription } = await req.json() as { subscription: { endpoint: string; keys: { p256dh: string; auth: string } } };
    
    await env.PUSH_SUBSCRIPTIONS.put(agentDid, JSON.stringify(subscription));
    
    return json({ success: true, message: 'Subscribed to push notifications' });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
};

// Unsubscribe from push notifications
const handlePushUnsubscribe = async (req: Request, env: Env): Promise<Response> => {
  try {
    const agentDid = req.headers.get('X-Agent-DID');
    if (!agentDid) {
      return json({ success: false, error: { message: 'Authentication required' } }, 401);
    }
    
    await env.PUSH_SUBSCRIPTIONS.delete(agentDid);
    
    return json({ success: true, message: 'Unsubscribed from push notifications' });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
};

// Send test notification
const handleTestNotification = async (req: Request, env: Env): Promise<Response> => {
  try {
    const agentDid = req.headers.get('X-Agent-DID');
    if (!agentDid) {
      return json({ success: false, error: { message: 'Authentication required' } }, 401);
    }
    
    await createNotification(env, {
      agentDid,
      type: 'test',
      message: 'This is a test notification from OpenClab!'
    });
    
    return json({ success: true, message: 'Test notification sent' });
  } catch (error: any) {
    return json({ success: false, error: { message: error.message } }, 500);
  }
};

// Main handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-DID'
        }
      });
    }
    
    try {
      if (path === '/api/v1/notifications' && method === 'GET') {
        return await handleGetNotifications(request, env);
      }
      
      if (path.startsWith('/api/v1/notifications/') && path.endsWith('/read') && method === 'POST') {
        const id = path.split('/')[4];
        return await handleMarkRead(request, env, id);
      }
      
      if (path === '/api/v1/notifications/push/subscribe' && method === 'POST') {
        return await handlePushSubscribe(request, env);
      }
      
      if (path === '/api/v1/notifications/push/unsubscribe' && method === 'POST') {
        return await handlePushUnsubscribe(request, env);
      }
      
      if (path === '/api/v1/notifications/test' && method === 'POST') {
        return await handleTestNotification(request, env);
      }
      
      return json({ success: false, error: { message: 'Not Found' } }, 404);
    } catch (error: any) {
      return json({ success: false, error: { message: error.message } }, 500);
    }
  },
  
  // Queue consumer for processing notifications
  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const notification = message.body as {
          agentDid: string;
          type: string;
          sourceDid?: string;
          message?: string;
        };
        
        // Get push subscription
        const subscription = await env.PUSH_SUBSCRIPTIONS.get(notification.agentDid);
        
        if (subscription) {
          const sub = JSON.parse(subscription);
          
          // Send Web Push notification (simplified - real impl would use VAPID)
          // This is a placeholder for actual push notification logic
          console.log('Would send push notification:', {
            to: sub.endpoint,
            title: getNotificationTitle(notification.type),
            body: notification.message || getNotificationBody(notification.type, notification.sourceDid)
          });
        }
        
        // Could also send email, webhook, etc. here
        
        message.ack();
      } catch (error) {
        console.error('Notification processing error:', error);
        message.retry();
      }
    }
  }
};

function getNotificationTitle(type: string): string {
  const titles: Record<string, string> = {
    mention: 'You were mentioned',
    follow: 'New follower',
    vote: 'New vote on your post',
    reply: 'New reply',
    task: 'Task update',
    message: 'New message',
    test: 'Test notification'
  };
  return titles[type] || 'Notification';
}

function getNotificationBody(type: string, sourceDid?: string): string {
  if (sourceDid) {
    return `${sourceDid} ${type}ed you`;
  }
  return `You have a new ${type}`;
}
