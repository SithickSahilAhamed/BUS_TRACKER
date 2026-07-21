/**
 * In-app Notification Center (PROJECT_SPEC.md section 7 — see CLAUDE.md for
 * why this is in-app, not push). Merges two live streams: notifications
 * aimed at this specific user, and ones broadcast to everyone with their
 * role (e.g. all admins get SOS alerts).
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeToMyNotifications, subscribeToRoleNotifications, markNotificationRead } from '../services/firestore';
import type { AppNotification } from '../types';

const timeAgo = (ts: AppNotification['createdAt']): string => {
  if (!ts) return 'just now';
  const secs = Math.round((Date.now() - ts.toDate().getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return ts.toDate().toLocaleDateString();
};

export const NotificationBell: React.FC = () => {
  const { user, profile } = useAuth();
  const [byUid, setByUid] = useState<AppNotification[]>([]);
  const [byRole, setByRole] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    return subscribeToMyNotifications(user.uid, setByUid, () => {});
  }, [user]);

  useEffect(() => {
    if (!profile) return;
    return subscribeToRoleNotifications(profile.role, setByRole, () => {});
  }, [profile]);

  const notifications = [...byUid, ...byRole].sort(
    (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)
  );
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleOpenNotification = (n: AppNotification) => {
    if (!n.read) markNotificationRead(n.id).catch(() => {});
  };

  return (
    <div className="notif-bell-wrapper">
      <button className="notif-bell-button" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        🔔
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 599 }} onClick={() => setOpen(false)} />
          <div className="notif-panel">
            <div className="notif-panel-header">
              <span>Notifications</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>✕</button>
            </div>
            {notifications.length === 0 ? (
              <p className="notif-empty">Nothing yet.</p>
            ) : (
              notifications.slice(0, 30).map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${n.read ? '' : 'notif-item-unread'}`}
                  onClick={() => handleOpenNotification(n)}
                >
                  <div className="notif-item-title">{n.title}</div>
                  <div className="notif-item-body">{n.body}</div>
                  <div className="notif-item-time">{timeAgo(n.createdAt)}</div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
