import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export function PresenceTracker() {
  const location = useLocation();
  const { user, loadingAuth } = useAuth();
  const lastHeartbeatAtRef = useRef<number>(0);

  useEffect(() => {
    if (loadingAuth) return;
    lastHeartbeatAtRef.current = Date.now();
    void api
      .sendPresence({
        path: location.pathname,
        referrer: typeof document !== 'undefined' ? document.referrer : '',
        event: 'pageview',
      })
      .catch(() => {
        // Silent analytics failure should never affect UX
      });
  }, [location.pathname, user?.id, loadingAuth]);

  useEffect(() => {
    if (loadingAuth) return;

    const sendHeartbeat = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastHeartbeatAtRef.current < 15_000) return;
      lastHeartbeatAtRef.current = now;
      void api
        .sendPresence({
          path: location.pathname,
          event: 'heartbeat',
        })
        .catch(() => {});
    };

    const intervalId = window.setInterval(sendHeartbeat, 45_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [location.pathname, loadingAuth]);

  return null;
}
