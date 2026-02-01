import type { DurableObjectState, WebSocket } from '@cloudflare/workers-types';

export interface Env {
  // Durable Object environment
}

interface Connection {
  ws: WebSocket;
  agentDid: string;
  status: 'online' | 'away' | 'busy';
}

export class PresenceDO {
  private state: DurableObjectState;
  private connections: Map<string, Connection> = new Map();
  private agentConnections: Map<string, Set<string>> = new Map(); // agentDid -> connectionIds

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/ws') {
      return this.handleWebSocket(request);
    }

    if (path === '/status') {
      return this.getStatus();
    }

    if (path === '/broadcast') {
      return this.handleBroadcast(request);
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected websocket', { status: 400 });
    }

    // Get agent DID from query params
    const url = new URL(request.url);
    const agentDid = url.searchParams.get('did');
    
    if (!agentDid) {
      return new Response('Missing did parameter', { status: 400 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    const connectionId = crypto.randomUUID();

    // Accept the WebSocket
    server.accept();

    // Store connection
    const connection: Connection = {
      ws: server,
      agentDid,
      status: 'online'
    };

    this.connections.set(connectionId, connection);

    // Track agent connections
    if (!this.agentConnections.has(agentDid)) {
      this.agentConnections.set(agentDid, new Set());
    }
    this.agentConnections.get(agentDid)!.add(connectionId);

    // Update agent status
    await this.state.storage.put(`status:${agentDid}`, {
      status: 'online',
      lastSeen: Date.now()
    });

    // Notify followers of online status
    this.broadcastToFollowers(agentDid, {
      type: 'presence',
      agentDid,
      status: 'online'
    });

    // Handle messages
    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        await this.handleMessage(connectionId, data);
      } catch (error) {
        server.send(JSON.stringify({ error: 'Invalid message' }));
      }
    });

    // Handle close
    server.addEventListener('close', async () => {
      await this.removeConnection(connectionId);
    });

    // Send welcome message
    server.send(JSON.stringify({
      type: 'connected',
      connectionId
    }));

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleMessage(connectionId: string, data: unknown): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const message = data as { type: string; payload?: unknown };

    switch (message.type) {
      case 'ping':
        connection.ws.send(JSON.stringify({ type: 'pong' }));
        break;

      case 'status':
        // Update status (online, away, busy)
        const status = (message.payload as { status: string }).status;
        if (['online', 'away', 'busy'].includes(status)) {
          connection.status = status as 'online' | 'away' | 'busy';
          await this.state.storage.put(`status:${connection.agentDid}`, {
            status,
            lastSeen: Date.now()
          });
          this.broadcastToFollowers(connection.agentDid, {
            type: 'presence',
            agentDid: connection.agentDid,
            status
          });
        }
        break;

      case 'subscribe':
        // Subscribe to agent updates
        const { agentDid } = message.payload as { agentDid: string };
        await this.subscribeToAgent(connectionId, agentDid);
        break;

      case 'unsubscribe':
        const { agentDid: unsubAgent } = message.payload as { agentDid: string };
        await this.unsubscribeFromAgent(connectionId, unsubAgent);
        break;

      case 'typing':
        // Typing indicator
        const { conversationId, isTyping } = message.payload as { conversationId: string; isTyping: boolean };
        this.broadcastToConversation(conversationId, {
          type: 'typing',
          agentDid: connection.agentDid,
          conversationId,
          isTyping
        });
        break;

      case 'broadcast':
        // Broadcast to all connections of this agent
        this.broadcastToAgent(connection.agentDid, message.payload);
        break;
    }
  }

  private async removeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Remove from agent connections
    const agentConns = this.agentConnections.get(connection.agentDid);
    if (agentConns) {
      agentConns.delete(connectionId);
      
      // If no more connections, mark as offline
      if (agentConns.size === 0) {
        await this.state.storage.put(`status:${connection.agentDid}`, {
          status: 'offline',
          lastSeen: Date.now()
        });

        this.broadcastToFollowers(connection.agentDid, {
          type: 'presence',
          agentDid: connection.agentDid,
          status: 'offline'
        });
      }
    }

    this.connections.delete(connectionId);
  }

  private async subscribeToAgent(connectionId: string, agentDid: string): Promise<void> {
    // Get current subscriptions for this connection
    const key = `subscriptions:${connectionId}`;
    const subs = await this.state.storage.get<Set<string>>(key) || new Set();
    subs.add(agentDid);
    await this.state.storage.put(key, subs);

    // Send current status
    const status = await this.state.storage.get<{ status: string; lastSeen: number }>(`status:${agentDid}`);
    const connection = this.connections.get(connectionId);
    if (connection && status) {
      connection.ws.send(JSON.stringify({
        type: 'presence',
        agentDid,
        status: status.status,
        lastSeen: status.lastSeen
      }));
    }
  }

  private async unsubscribeFromAgent(connectionId: string, agentDid: string): Promise<void> {
    const key = `subscriptions:${connectionId}`;
    const subs = await this.state.storage.get<Set<string>>(key) || new Set();
    subs.delete(agentDid);
    await this.state.storage.put(key, subs);
  }

  private broadcastToFollowers(agentDid: string, message: unknown): void {
    // In production, this would look up followers from D1
    // For now, broadcast to all connections that have subscribed to this agent
    this.connections.forEach((conn, connId) => {
      this.state.storage.get<Set<string>>(`subscriptions:${connId}`).then(subs => {
        if (subs && subs.has(agentDid)) {
          conn.ws.send(JSON.stringify(message));
        }
      });
    });
  }

  private broadcastToConversation(conversationId: string, message: unknown): void {
    // Broadcast to all participants of a conversation
    // In production, this would look up participants from D1
    this.connections.forEach(conn => {
      conn.ws.send(JSON.stringify(message));
    });
  }

  private broadcastToAgent(agentDid: string, message: unknown): void {
    const connIds = this.agentConnections.get(agentDid);
    if (!connIds) return;

    connIds.forEach(connId => {
      const conn = this.connections.get(connId);
      if (conn) {
        conn.ws.send(JSON.stringify(message));
      }
    });
  }

  private async getStatus(): Promise<Response> {
    const status: Record<string, unknown> = {};
    
    for (const [agentDid] of this.agentConnections) {
      const agentStatus = await this.state.storage.get(`status:${agentDid}`);
      status[agentDid] = agentStatus;
    }

    return new Response(JSON.stringify({
      connections: this.connections.size,
      agents: this.agentConnections.size,
      status
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    // Admin endpoint to broadcast messages
    const data = await request.json() as { agentDid: string; message: unknown };
    
    this.broadcastToAgent(data.agentDid, data.message);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export default {
  async fetch(request: Request, env: { PRESENCE: DurableObjectNamespace }): Promise<Response> {
    const url = new URL(request.url);
    
    // Get or create Durable Object
    const id = env.PRESENCE.idFromName('global');
    const presence = env.PRESENCE.get(id);
    
    return presence.fetch(request);
  }
};
