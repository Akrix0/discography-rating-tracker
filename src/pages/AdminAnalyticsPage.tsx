import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  Eye,
  Globe2,
  Loader2,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tablet,
  UserCheck,
  Users,
} from 'lucide-react';
import { api } from '../api';
import { usePreferences } from '../context/PreferencesContext';
import type { AdminAnalyticsResponse, AdminVisitorSession } from '../types';

function DeviceIcon({ type }: { type: string | null }) {
  if (type === 'mobile') return <Smartphone className="w-3.5 h-3.5 text-[#e09f5a] shrink-0" />;
  if (type === 'tablet') return <Tablet className="w-3.5 h-3.5 text-[#5fb38e] shrink-0" />;
  return <Monitor className="w-3.5 h-3.5 text-[#9ca3af] shrink-0" />;
}

export function AdminAnalyticsPage() {
  const { t, lang } = usePreferences();
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.getAdminAnalytics();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorText);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t.errorText]);

  useEffect(() => {
    void loadAnalytics(false);
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadAnalytics(true);
      }
    }, 20_000);
    return () => window.clearInterval(id);
  }, [loadAnalytics]);

  const formatRelative = (iso: string | null): string => {
    if (!iso) return t.neverVisited;
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (diffSec < 25) return t.justNow;
    if (diffSec < 60) return t.secAgo(diffSec);
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return t.minAgo(diffMin);
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return t.hrAgo(diffHr);
    return t.dayAgo(Math.floor(diffHr / 24));
  };

  const formatDateTime = (iso: string): string => {
    try {
      return new Intl.DateTimeFormat(lang === 'uk' ? 'uk-UA' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso.slice(0, 16).replace('T', ' ');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-24 rounded-3xl bg-[#13151c] border border-white/5" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-[#13151c] border border-white/5" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl bg-[#13151c] border border-[#d95d4e]/40 p-6 text-center">
        <p className="text-[#e87c6f] font-medium">{error || t.errorText}</p>
      </div>
    );
  }

  const maxViews = Math.max(1, ...data.dailySeries.map((d) => d.pageViews));
  const { summary } = data;

  const renderVisitorIdentity = (v: AdminVisitorSession) => {
    if (v.userId && v.displayName) {
      return (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-[#f3efe6] truncate">{v.displayName}</span>
            {v.isAdmin && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#5fb38e]/20 text-[#5fb38e] border border-[#5fb38e]/35">
                ADMIN
              </span>
            )}
          </div>
          <div className="text-[11px] text-[#9ca3af] truncate">{v.email}</div>
        </div>
      );
    }
    return (
      <div className="min-w-0">
        <div className="text-sm font-medium text-[#d1d5db] truncate">
          {t.guestLabel} <span className="font-mono-num text-xs text-[#9ca3af]">#{v.visitorIdShort}</span>
        </div>
        {v.referrer && (
          <div className="text-[11px] text-[#6b7280] truncate">{v.referrer}</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#5fb38e]/15 border border-[#5fb38e]/30 text-[11px] font-semibold text-[#5fb38e] mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Owner Only</span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold text-[#f3efe6] break-words">
            {t.adminTitle}
          </h1>
          <p className="text-xs sm:text-sm text-[#9ca3af] mt-1">{t.adminSub}</p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-[11px] text-[#6b7280] hidden sm:inline">{t.autoRefreshHint}</span>
          <button
            type="button"
            onClick={() => void loadAnalytics(true)}
            disabled={refreshing}
            className="h-9 px-3.5 rounded-xl bg-[#13151c] hover:bg-[#1a1d27] border border-white/10 text-xs font-medium text-[#f3efe6] inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
          >
            {refreshing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#5fb38e]" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-[#5fb38e]" />
            )}
            <span>{t.refresh}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl bg-[#13151c] border border-[#5fb38e]/30 p-3.5 sm:p-5 flex flex-col justify-between gap-2 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs text-[#9ca3af] font-medium truncate">
              {t.onlineNowCard}
            </span>
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#5fb38e] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#5fb38e]" />
            </span>
          </div>
          <div>
            <div className="font-mono-num text-2xl sm:text-3xl font-bold text-[#5fb38e]">
              {summary.onlineTotal}
            </div>
            <div className="text-[11px] text-[#9ca3af] mt-1 leading-tight">
              {t.onlineSplitSub(summary.onlineUsers, summary.onlineGuests)}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-3.5 sm:p-5 flex flex-col justify-between gap-2 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs text-[#9ca3af] font-medium truncate">
              {t.visitors24hCard}
            </span>
            <Eye className="w-4 h-4 text-[#e09f5a] shrink-0" />
          </div>
          <div>
            <div className="font-mono-num text-2xl sm:text-3xl font-bold text-[#f3efe6]">
              {summary.visitors24h}
            </div>
            <div className="text-[11px] text-[#9ca3af] mt-1 leading-tight">
              {t.viewsSub(summary.pageViews24h)}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-3.5 sm:p-5 flex flex-col justify-between gap-2 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs text-[#9ca3af] font-medium truncate">
              {t.visitors7dCard}
            </span>
            <BarChart3 className="w-4 h-4 text-[#d95d4e] shrink-0" />
          </div>
          <div>
            <div className="font-mono-num text-2xl sm:text-3xl font-bold text-[#e09f5a]">
              {summary.visitors7d}
            </div>
            <div className="text-[11px] text-[#9ca3af] mt-1 leading-tight">
              {t.allTimeVisitorsSub(summary.visitors30d, summary.totalVisitorsAllTime)}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-3.5 sm:p-5 flex flex-col justify-between gap-2 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs text-[#9ca3af] font-medium truncate">
              {t.registeredUsersCard}
            </span>
            <Users className="w-4 h-4 text-[#7fa8d9] shrink-0" />
          </div>
          <div>
            <div className="font-mono-num text-2xl sm:text-3xl font-bold text-[#f3efe6]">
              {summary.totalUsers}
            </div>
            <div className="text-[11px] text-[#9ca3af] mt-1 leading-tight">
              {t.ratingsTotalSub(
                summary.totalSongRatings + summary.totalReleaseRatings,
                summary.totalNotes
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Active Right Now */}
      <section className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Activity className="w-5 h-5 text-[#5fb38e] shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6]">
              {t.whoIsOnlineTitle}
            </h2>
          </div>
          <span className="font-mono-num text-xs px-2.5 py-1 rounded-full bg-[#5fb38e]/15 text-[#5fb38e] border border-[#5fb38e]/30">
            {data.onlineNow.length}
          </span>
        </div>

        {data.onlineNow.length === 0 ? (
          <div className="rounded-xl bg-[#0b0c10]/60 border border-dashed border-white/10 p-6 text-center text-sm text-[#9ca3af]">
            {t.nobodyOnline}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.onlineNow.map((s) => (
              <div
                key={s.visitorIdShort + s.lastSeenAt}
                className="rounded-xl bg-[#0b0c10]/70 border border-white/[0.07] p-3.5 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="mt-1 w-2 h-2 rounded-full bg-[#5fb38e] shrink-0" />
                  {renderVisitorIdentity(s)}
                </div>

                <div className="text-right shrink-0 space-y-1">
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.06] font-mono-num text-[11px] text-[#e09f5a]">
                    {s.currentPath}
                  </div>
                  <div className="flex items-center justify-end gap-1.5 text-[11px] text-[#9ca3af]">
                    <DeviceIcon type={s.deviceType} />
                    <span>
                      {s.os} • {s.browser}
                    </span>
                    {s.country && (
                      <span className="px-1.5 py-0.2 rounded bg-white/[0.06] font-mono-num text-[10px]">
                        {s.country}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono-num text-[#6b7280]">
                    {formatRelative(s.lastSeenAt)} • {s.pageViews} {t.viewsShortWord}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 14-Day Traffic Chart + Breakdowns */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 rounded-2xl bg-[#13151c] border border-white/[0.08] p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6]">
              {t.dailyTrafficTitle}
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-[#9ca3af]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#e09f5a]" />
                {t.uniqueVisitorsLabel}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#d95d4e]/75" />
                {t.pageViewsLabel}
              </span>
            </div>
          </div>

          <div className="h-44 flex items-end gap-1.5 sm:gap-2 pt-4 pb-1">
            {data.dailySeries.map((day) => {
              const viewsH = Math.max(day.pageViews > 0 ? 8 : 2, Math.round((day.pageViews / maxViews) * 100));
              const visH = Math.max(day.uniqueVisitors > 0 ? 8 : 2, Math.round((day.uniqueVisitors / maxViews) * 100));
              return (
                <div
                  key={day.date}
                  title={`${day.date}: ${day.uniqueVisitors} ${t.uniqueVisitorsLabel.toLowerCase()}, ${day.pageViews} ${t.pageViewsLabel.toLowerCase()}`}
                  className="flex-1 h-full flex flex-col justify-end items-center gap-1 group min-w-0"
                >
                  <div className="w-full flex-1 flex items-end justify-center gap-0.5 sm:gap-1">
                    <div
                      className="flex-1 max-w-[10px] rounded-t bg-[#e09f5a] transition-all group-hover:brightness-110"
                      style={{ height: `${visH}%` }}
                    />
                    <div
                      className="flex-1 max-w-[10px] rounded-t bg-[#d95d4e]/75 transition-all group-hover:brightness-110"
                      style={{ height: `${viewsH}%` }}
                    />
                  </div>
                  <span className="font-mono-num text-[9px] text-[#6b7280] leading-none">
                    {day.date.slice(8)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl bg-[#13151c] border border-white/[0.08] p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#9ca3af] mb-2">
                {t.devicesBreakdown}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {data.breakdowns.devices.map((d) => (
                  <span
                    key={d.label}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0b0c10]/70 border border-white/[0.07] text-xs text-[#f3efe6]"
                  >
                    <DeviceIcon type={d.label} />
                    <span className="capitalize">{d.label}</span>
                    <span className="font-mono-num text-[#e09f5a] font-semibold">{d.count}</span>
                  </span>
                ))}
                {data.breakdowns.browsers.map((b) => (
                  <span
                    key={b.label}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0b0c10]/70 border border-white/[0.07] text-xs text-[#d1d5db]"
                  >
                    <span>{b.label}</span>
                    <span className="font-mono-num text-[#5fb38e] font-semibold">{b.count}</span>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#9ca3af] mb-2 flex items-center gap-1.5">
                <Globe2 className="w-3.5 h-3.5" />
                <span>{t.countriesBreakdown}</span>
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {data.breakdowns.countries.map((c) => (
                  <span
                    key={c.label}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-xs text-[#d1d5db] font-mono-num"
                  >
                    <span>{c.label}</span>
                    <span className="text-[#e09f5a] font-semibold">{c.count}</span>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#9ca3af] mb-2">
                {t.topPagesBreakdown}
              </h3>
              <div className="space-y-1.5">
                {data.breakdowns.topPaths.slice(0, 5).map((p) => (
                  <div key={p.path} className="flex items-center justify-between text-xs">
                    <span className="font-mono-num text-[#d1d5db] truncate pr-2">{p.path}</span>
                    <span className="font-mono-num text-[#9ca3af] shrink-0">{p.views}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Registered Users */}
      <section className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <UserCheck className="w-5 h-5 text-[#e09f5a] shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6]">
              {t.allUsersTitle} ({data.users.length})
            </h2>
          </div>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {data.users.map((u) => (
            <div
              key={u.id}
              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#d95d4e]/15 border border-[#d95d4e]/30 flex items-center justify-center font-bold text-xs text-[#e09f5a] uppercase shrink-0">
                  {u.displayName.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono-num text-[11px] text-[#6b7280]">#{u.id}</span>
                    <span className="font-semibold text-sm text-[#f3efe6] truncate">
                      {u.displayName}
                    </span>
                    {u.isAdmin && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#5fb38e]/20 text-[#5fb38e] border border-[#5fb38e]/35">
                        ADMIN
                      </span>
                    )}
                    {u.isOnline && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#5fb38e]/15 text-[#5fb38e]">
                        {t.onlineBadge}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#9ca3af] truncate">{u.email}</div>
                  <div className="text-[11px] text-[#6b7280] flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5 font-mono-num">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRelative(u.lastSeenAt)}
                    </span>
                    {u.lastPath && <span className="text-[#e09f5a]">{u.lastPath}</span>}
                    {u.deviceType && (
                      <span className="inline-flex items-center gap-1">
                        <DeviceIcon type={u.deviceType} />
                        {u.os} • {u.browser}
                      </span>
                    )}
                    {u.country && <span>{u.country}</span>}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono-num shrink-0">
                <span className="px-2 py-1 rounded-lg bg-[#0b0c10]/70 border border-white/[0.06] text-[#d1d5db]">
                  {u.artistsCount} {t.artistsShortWord}
                </span>
                <span className="px-2 py-1 rounded-lg bg-[#0b0c10]/70 border border-white/[0.06] text-[#5fb38e]">
                  {u.songRatingsCount + u.releaseRatingsCount} {t.ratingsShortWord}
                </span>
                <span className="px-2 py-1 rounded-lg bg-[#0b0c10]/70 border border-white/[0.06] text-[#e09f5a]">
                  {u.notesCount} {t.notesShortWord}
                </span>
                <span className="px-2 py-1 rounded-lg bg-[#0b0c10]/70 border border-white/[0.06] text-[#9ca3af]">
                  {u.totalPageViews} {t.viewsShortWord}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Visitors Log (includes guests on /login) */}
      <section className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-4 sm:p-6 space-y-4">
        <h2 className="font-display text-base sm:text-lg font-bold text-[#f3efe6]">
          {t.recentVisitorsTitle}
        </h2>

        <div className="divide-y divide-white/[0.06]">
          {data.recentVisitors.map((v) => (
            <div
              key={`${v.visitorIdShort}-${v.firstSeenAt}`}
              className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    v.isOnline ? 'bg-[#5fb38e]' : 'bg-[#4b5563]'
                  }`}
                />
                {renderVisitorIdentity(v)}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono-num text-[#9ca3af] shrink-0">
                <span className="px-2 py-0.5 rounded bg-white/[0.05] text-[#e09f5a]">
                  {v.currentPath}
                </span>
                <span className="inline-flex items-center gap-1">
                  <DeviceIcon type={v.deviceType} />
                  {v.os} • {v.browser}
                </span>
                {v.country && <span>{v.country}</span>}
                <span>
                  {v.pageViews} {t.viewsShortWord}
                </span>
                <span className="text-[#6b7280]">{formatDateTime(v.lastSeenAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
