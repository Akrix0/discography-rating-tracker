import { NavLink } from 'react-router-dom';
import { BarChart3, Disc3, LogOut, Music2, Settings, Users } from 'lucide-react';
import { ArtistDropdown } from './ArtistDropdown';
import { PreferencesToggle } from './PreferencesToggle';
import { useArtist } from '../context/ArtistContext';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';

export function Navbar() {
  const { selectedArtist, artists } = useArtist();
  const { user, logout } = useAuth();
  const { t } = usePreferences();

  const totalSongs = selectedArtist
    ? selectedArtist.totalSongs
    : artists.reduce((s, a) => s + a.totalSongs, 0);
  const ratedSongs = selectedArtist
    ? selectedArtist.ratedSongs
    : artists.reduce((s, a) => s + a.ratedSongs, 0);
  const pct = totalSongs > 0 ? Math.round((ratedSongs / totalSongs) * 1000) / 10 : 0;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all shrink-0 ${
      isActive
        ? 'bg-[#d95d4e]/15 text-[#f3efe6] border border-[#d95d4e]/40 shadow-[0_0_20px_rgba(217,93,78,0.12)]'
        : 'text-[#9ca3af] hover:text-[#f3efe6] hover:bg-white/5 border border-transparent'
    }`;

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl border-b border-white/[0.07]"
      style={{ backgroundColor: 'var(--bg-header)' }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <NavLink to="/artists" className="hidden sm:flex items-center gap-2.5 group shrink-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#d95d4e] to-[#e09f5a] flex items-center justify-center shadow-lg shadow-[#d95d4e]/20 group-hover:scale-105 transition-transform">
              <Disc3 className="w-5 h-5 text-[#0b0c10]" />
            </div>
          </NavLink>

          <ArtistDropdown />
        </div>

        <nav className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto py-1">
          <NavLink to="/artists" className={linkClass}>
            <Users className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">{t.navArtists}</span>
          </NavLink>
          <NavLink to="/" end className={linkClass}>
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{t.navOverview}</span>
          </NavLink>
          <NavLink to="/songs" className={linkClass}>
            <Music2 className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{t.navSongs}</span>
          </NavLink>
          <NavLink to="/releases" className={linkClass}>
            <Disc3 className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{t.navReleases}</span>
          </NavLink>
          <NavLink to="/settings" className={linkClass}>
            <Settings className="w-4 h-4 shrink-0" />
            <span className="hidden lg:inline">{t.navSettings}</span>
          </NavLink>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden xl:flex items-center gap-3 px-3 py-1.5 rounded-full bg-[#13151c] border border-white/[0.07]">
            <div className="text-xs text-[#9ca3af]">
              {t.ratedShort}{' '}
              <span className="font-mono-num text-[#f3efe6] font-semibold">
                {ratedSongs}/{totalSongs}
              </span>
            </div>
            <div className="w-14 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#d95d4e] to-[#e09f5a] transition-all duration-500"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <span className="font-mono-num text-xs text-[#e09f5a] font-medium">{pct}%</span>
          </div>

          <PreferencesToggle />

          {user && (
            <div className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl bg-[#13151c] border border-white/[0.08]">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-[#d95d4e]/25 text-[#d95d4e] text-[11px] font-bold flex items-center justify-center uppercase">
                  {user.displayName.slice(0, 1)}
                </div>
              )}
              <span className="hidden xl:inline text-xs font-medium text-[#e5e0d5] max-w-[100px] truncate">
                {user.displayName}
              </span>
              <button
                type="button"
                onClick={() => void logout()}
                title={t.logoutTitle}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-[#d95d4e] hover:bg-white/10 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
