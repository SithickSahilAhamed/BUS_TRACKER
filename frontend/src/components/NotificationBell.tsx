/**
 * In-app Notification Center (PROJECT_SPEC.md section 7 — see CLAUDE.md for
 * why this is in-app, not push). Merges two live streams: notifications
 * aimed at this specific user, and ones broadcast to everyone with their
 * role (e.g. all admins get SOS alerts).
 *
 * `hideTrigger` lets a mobile page's bottom-nav "Alerts" tab open this same
 * panel (and its live subscriptions) via the exposed ref, instead of
 * duplicating a second bell/subscription pair — see MobileBottomNav.
 */

import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import IconBell from '~icons/material-symbols/notifications-outline';
import IconClose from '~icons/material-symbols/close';
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

export interface NotificationBellHandle {
  open: () => void;
}

interface NotificationBellProps {
  hideTrigger?: boolean;
}

export const NotificationBell = forwardRef<NotificationBellHandle, NotificationBellProps>(
  ({ hideTrigger }, ref) => {
    const { user, profile } = useAuth();
    const [byUid, setByUid] = useState<AppNotification[]>([]);
    const [byRole, setByRole] = useState<AppNotification[]>([]);
    const [open, setOpen] = useState(false);

    useImperativeHandle(ref, () => ({ open: () => setOpen(true) }));

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
      <div className="relative">
        {!hideTrigger && (
          <button
            className="relative w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"
            onClick={() => setOpen((o) => !o)}
            aria-label="Notifications"
          >
            <IconBell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-error text-on-error text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-surface">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        )}

        {open && (
          <>
            <div className="fixed inset-0 z-[599]" onClick={() => setOpen(false)} />
            <div className="fixed sm:absolute inset-x-4 sm:inset-x-auto top-16 sm:top-auto sm:right-0 sm:mt-2 w-auto sm:w-80 max-h-[70vh] overflow-y-auto bg-surface-container-lowest border border-outline-variant shadow-overlay rounded-xl z-[600]">
              <div className="flex items-center justify-between px-md py-sm border-b border-outline-variant sticky top-0 bg-surface-container-lowest">
                <span className="font-title-lg text-title-lg text-primary">Notifications</span>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
                >
                  <IconClose className="w-4 h-4" />
                </button>
              </div>
              {notifications.length === 0 ? (
                <p className="p-lg text-center text-body-md text-on-surface-variant">Nothing yet.</p>
              ) : (
                notifications.slice(0, 30).map((n) => (
                  <div
                    key={n.id}
                    className={`px-md py-sm border-b border-outline-variant last:border-0 cursor-pointer hover:bg-surface-container-low ${
                      n.read ? '' : 'bg-secondary-fixed/40'
                    }`}
                    onClick={() => handleOpenNotification(n)}
                  >
                    <div className="font-body-md text-body-md font-bold text-on-surface">{n.title}</div>
                    <div className="text-body-md text-on-surface-variant">{n.body}</div>
                    <div className="text-label-md text-on-surface-variant mt-xs">{timeAgo(n.createdAt)}</div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    );
  }
);
NotificationBell.displayName = 'NotificationBell';
