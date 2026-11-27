import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, HeartHandshake, Loader2, UserPlus, X } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import type { NotificationItem } from '../types';
import { Tooltip } from './Tooltip';
import { btnIcon } from './ui/buttonStyles';

export function NotificationBell() {
  const { user } = useAuth();
  const { t } = usePreferences();

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyFollowId, setBusyFollowId] = useState<number | null>(null);
  const [liveToast, setLiveToast] = useState<NotificationItem | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(false);
  const hadFirstConnectRef = useRef(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const formatAgo = useCallback(
    (iso: string) => {
      const diffSec = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
      if (!Number.isFinite(diffSec) || diffSec < 15) return t.justNow;
      if (diffSec < 60) return t.secAgo(diffSec);
      const mins = Math.floor(diffSec / 60);
      if (mins < 60) return t.minAgo(mins);
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return t.hrAgo(hrs);
      return t.dayAgo(Math.floor(hrs / 24));
    },
    [t]
  );

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.getNotifications();
      setUnreadCount(res.unreadCount);
      setItems(res.notifications);
    } catch {
      // ignore transient network errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    hadFirstConnectRef.current = false;
    void loadNotifications();

    const onSocialUpdated = () => {
      void loadNotifications();
    };
    window.addEventListener('dtr:social-updated', onSocialUpdated);

    const es = new EventSource('/api/social/notifications/stream', { withCredentials: true });
    let toastTimer: number | null = null;

    es.addEventListener('connected', () => {
      if (hadFirstConnectRef.current) {
        void loadNotifications();
      }
      hadFirstConnectRef.current = true;
    });

    es.addEventListener('notification', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as {
          unreadCount: number;
          notification: NotificationItem;
        };
        if (!payload?.notification) return;
        setUnreadCount(Number(payload.unreadCount || 0));
        setItems((prev) => {
          const filtered = prev.filter((item) => item.id !== payload.notification.id);
          return [payload.notification, ...filtered].slice(0, 35);
        });
        window.dispatchEvent(new CustomEvent('dtr:social-updated'));
        if (!openRef.current) {
          setLiveToast(payload.notification);
          if (toastTimer) window.clearTimeout(toastTimer);
          toastTimer = window.setTimeout(() => setLiveToast(null), 5500);
        }
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener('unread_sync', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as { unreadCount: number };
        const nextUnread = Number(payload?.unreadCount ?? 0);
        setUnreadCount(nextUnread);
        if (nextUnread === 0) {
          setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
        }
      } catch {
        // ignore malformed event
      }
    });

    return () => {
      window.removeEventListener('dtr:social-updated', onSocialUpdated);
      if (toastTimer) window.clearTimeout(toastTimer);
      es.close();
    };
  }, [user?.id, loadNotifications]);

  // Close popover on outside click / Escape
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    try {
      const res = await api.markNotificationsRead();
      setUnreadCount(res.unreadCount);
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
    } catch {
      // ignore
    }
  }, []);

  // Automatically clear badge shortly after opening the bell popover
  useEffect(() => {
    if (!open || unreadCount === 0) return;
    const timer = window.setTimeout(() => {
      void handleMarkAllRead();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [open, unreadCount, handleMarkAllRead]);

  const handleFollowBack = async (notif: NotificationItem) => {
    setBusyFollowId(notif.actor.id);
    try {
      await api.followUser(notif.actor.slug || notif.actor.id);
      setItems((prev) =>
        prev.map((item) =>
          item.actor.id === notif.actor.id
            ? {
                ...item,
                actor: {
                  ...item.actor,
                  iFollow: true,
                  isFriend: item.actor.followsMe,
                },
              }
            : item
        )
      );
      window.dispatchEvent(new CustomEvent('dtr:social-updated'));
    } finally {
      setBusyFollowId(null);
    }
  };

  if (!user) return null;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <Tooltip content={t.notificationsTitle} position="bottom" align="end">
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setLiveToast(null);
          }}
          aria-label={t.notificationsTitle}
          aria-expanded={open}
          className={`${btnIcon} relative ${
            open ? 'bg-[#e09f5a]/20 text-[#e09f5a] border-[#e09f5a]/45' : ''
          }`}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span
              data-testid="notif-unread-badge"
              className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#d95d4e] text-white text-[10px] font-bold font-mono-num flex items-center justify-center shadow"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </Tooltip>

      {open && (
        <div
          role="dialog"
          aria-label={t.notificationsTitle}
          className="fixed left-3 right-3 top-14 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 max-h-[75vh] flex flex-col rounded-2xl bg-[#13151c] border border-white/15 shadow-2xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#e09f5a]" />
              <span className="text-sm font-bold text-[#f3efe6]">{t.notificationsTitle}</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono-num font-bold bg-[#d95d4e]/20 text-[#e87c6f] border border-[#d95d4e]/35">
                  {unreadCount}
                </span>
              )}
            </div>

            {items.some((i) => !i.isRead) && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="text-[11px] font-medium text-[#5fb38e] hover:underline inline-flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{t.markAllReadBtn}</span>
              </button>
            )}
          </div>

          <div className="overflow-y-auto divide-y divide-white/[0.06]">
            {loading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#e09f5a]" />
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-[#9ca3af]">{t.noNotifications}</div>
            ) : (
              items.map((n) => {
                const actorPath = `/users/${n.actor.slug || n.actor.id}`;
                const busy = busyFollowId === n.actor.id;
                return (
                  <div
                    key={n.id}
                    className={`p-3.5 flex items-start gap-3 transition-colors ${
                      n.isRead ? 'bg-transparent' : 'bg-[#d95d4e]/[0.06]'
                    }`}
                  >
                    <Link
                      to={actorPath}
                      onClick={() => setOpen(false)}
                      className="shrink-0 mt-0.5"
                    >
                      {n.actor.avatarUrl ? (
                        <img
                          src={n.actor.avatarUrl}
                          alt={n.actor.displayName}
                          className="w-9 h-9 rounded-xl object-cover border border-white/10"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-[#d95d4e]/20 border border-[#d95d4e]/30 flex items-center justify-center font-bold text-xs text-[#e09f5a] uppercase">
                          {n.actor.displayName.slice(0, 1)}
                        </div>
                      )}
                    </Link>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="text-xs text-[#e5e0d5] leading-snug break-words">
                        <Link
                          to={actorPath}
                          onClick={() => setOpen(false)}
                          className="font-bold text-[#f3efe6] hover:text-[#e09f5a] transition-colors"
                        >
                          {n.actor.displayName}
                        </Link>{' '}
                        <span className="font-mono-num text-[11px] text-[#6b7280]">
                          @{n.actor.slug}
                        </span>{' '}
                        <span className="text-[#9ca3af]">
                          {n.type === 'became_friends' ? t.notifBecameFriends : t.notifFollowedYou}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono-num text-[#6b7280]">
                          {n.type === 'became_friends' ? (
                            <HeartHandshake className="w-3 h-3 text-[#5fb38e]" />
                          ) : (
                            <UserPlus className="w-3 h-3 text-[#e09f5a]" />
                          )}
                          <span>{formatAgo(n.createdAt)}</span>
                        </span>

                        {n.actor.isFriend ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#5fb38e]/15 text-[#5fb38e] border border-[#5fb38e]/30 inline-flex items-center gap-1">
                            <HeartHandshake className="w-3 h-3" />
                            {t.friendsBadge}
                          </span>
                        ) : !n.actor.iFollow ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleFollowBack(n)}
                            className="h-7 px-2.5 rounded-lg bg-[#d95d4e] hover:bg-[#c84d3e] disabled:opacity-50 text-white text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                          >
                            {busy ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <UserPlus className="w-3 h-3" />
                            )}
                            <span>{t.followBackBtn}</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {liveToast && !open && (
        <div
          role="status"
          className="fixed bottom-4 right-3 left-3 sm:left-auto sm:w-88 z-50 rounded-2xl bg-[#13151c] border border-[#e09f5a]/45 shadow-2xl p-3.5 flex items-start gap-3"
        >
          <div className="w-8 h-8 rounded-xl bg-[#e09f5a]/20 text-[#e09f5a] flex items-center justify-center shrink-0">
            {liveToast.type === 'became_friends' ? (
              <HeartHandshake className="w-4 h-4 text-[#5fb38e]" />
            ) : (
              <Bell className="w-4 h-4" />
            )}
          </div>
          <Link
            to={`/users/${liveToast.actor.slug || liveToast.actor.id}`}
            onClick={() => setLiveToast(null)}
            className="min-w-0 flex-1 text-xs"
          >
            <div className="font-semibold text-[#e09f5a]">{t.liveToastTitle}</div>
            <div className="text-[#f3efe6] mt-0.5 break-words">
              <span className="font-bold">{liveToast.actor.displayName}</span>{' '}
              <span className="text-[#9ca3af]">
                {liveToast.type === 'became_friends' ? t.notifBecameFriends : t.notifFollowedYou}
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setLiveToast(null)}
            aria-label={t.close}
            className="text-[#6b7280] hover:text-[#f3efe6] p-0.5 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
