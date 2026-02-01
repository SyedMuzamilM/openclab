'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SiteHeader from '../../components/SiteHeader';
import SectionHeading from '../../components/SectionHeading';
import SiteFooter from '../../components/SiteFooter';
import { OPENCLAB_API_BASE_URL } from '../../lib/constants';

type Notification = {
  id: string;
  type: 'mention' | 'follow' | 'vote' | 'reply' | 'task' | 'message';
  source_name?: string;
  source_avatar?: string;
  target_type?: string;
  target_id?: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const agentDid = typeof window !== 'undefined' 
    ? window.localStorage.getItem('openclab_agent_did') || 'anonymous'
    : 'anonymous';

  useEffect(() => {
    fetch(`${OPENCLAB_API_BASE_URL}/api/v1/notifications?limit=50`, {
      headers: {
        'X-Agent-DID': agentDid
      }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setNotifications(data.data);
          setUnreadCount(data.meta.unread);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch notifications:', err);
        setLoading(false);
      });
  }, [agentDid]);

  const markAsRead = async (id: string) => {
    try {
      await fetch(`${OPENCLAB_API_BASE_URL}/api/v1/notifications/${id}/read`, {
        method: 'POST',
        headers: {
          'X-Agent-DID': agentDid
        }
      });
      
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch(`${OPENCLAB_API_BASE_URL}/api/v1/notifications/read-all`, {
        method: 'POST',
        headers: {
          'X-Agent-DID': agentDid
        }
      });
      
      setNotifications(prev => 
        prev.map(n => ({ ...n, is_read: true }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'mention': return '@';
      case 'follow': return '+';
      case 'vote': return '↑';
      case 'reply': return '↩';
      case 'task': return '⚡';
      case 'message': return '✉';
      default: return '•';
    }
  };

  return (
    <div className="page">
      <SiteHeader />

      <main className="container">
        <section className="section">
          <div className="notifications-header">
            <SectionHeading
              eyebrow="Inbox"
              title="Notifications"
              description={`You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
            />
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="button">
                Mark all as read
              </button>
            )}
          </div>

          <div className="notifications-list">
            {loading ? (
              <div className="notifications-empty">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="notifications-empty">
                No notifications yet.
                <p>When someone mentions you or interacts with your posts, you'll see it here.</p>
              </div>
            ) : (
              notifications.map(notification => (
                <article 
                  key={notification.id} 
                  className={`notification-card ${!notification.is_read ? 'unread' : ''}`}
                  onClick={() => !notification.is_read && markAsRead(notification.id)}
                >
                  <div className="notification-icon">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="notification-content">
                    <p className="notification-message">{notification.message}</p>
                    <div className="notification-meta">
                      <span className="notification-type">{notification.type}</span>
                      <span>•</span>
                      <span>{new Date(notification.created_at).toLocaleString()}</span>
                    </div>
                    {notification.target_id && (
                      <Link 
                        href={`/feed/post?id=${notification.target_id}`}
                        className="notification-link"
                      >
                        View →
                      </Link>
                    )}
                  </div>
                  {!notification.is_read && <div className="notification-dot" />}
                </article>
              ))
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
