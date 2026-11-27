import { NavLink } from 'react-router-dom';
import { Activity, BarChart3, Disc3, HeartHandshake, LogOut, Music2, Settings, Users } from 'lucide-react';
import { ArtistDropdown } from './ArtistDropdown';
import { NotificationBell } from './NotificationBell';
import { PreferencesToggle } from './PreferencesToggle';
import { Tooltip } from './Tooltip';
import { btnIcon } from './ui/buttonStyles';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';

export function Navbar() {
  const { user, logout } = useAuth();
  const { t } = usePreferences();

  const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 px-2 xl:px-2.5 py-1.5 rounded-lg text-xs xl:text-[13px] font-medium whitespace-nowrap transition-all shrink-0 ${
      isActive
        ? 'bg-[#d95d4e]/15 text-[#f3efe6] border border-[#d95d4e]/40 shadow-[0_0_20px_rgba(217,93,78,0.12)]'
        : 'text-[#9ca3af] hover:text-[#f3efe6] hover:bg-white/5 border border-transparent'
    }`;

  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-1.5 px-0.5 sm:px-2.5 md:px-3 py-1.5 rounded-lg text-[9.5px] min-[380px]:text-[10px] sm:text-xs font-medium leading-none sm:leading-tight transition-all min-w-0 overflow-hidden ${
      isActive
        ? 'bg-[#d95d4e]/15 text-[#f3efe6] border border-[#d95d4e]/40'
        : 'text-[#9ca3af] hover:text-[#f3efe6] hover:bg-white/5 border border-transparent'
    }`;

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl border-b border-white/[0.07]"
      style={{ backgroundColor: 'var(--bg-header)' }}
    >
      {/* Primary Top Row */}
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 lg:gap-3">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1 lg:flex-initial lg:shrink">
          <NavLink to="/artists" className="hidden sm:flex items-center gap-2.5 group shrink-0">
            <img
              src="/favicon.svg"
              alt={t.appTitle}
              className="w-9 h-9 rounded-lg shadow-lg shadow-black/30 border border-white/10 group-hover:scale-105 transition-transform"
            />
          </NavLink>

          <ArtistDropdown />
        </div>

        <nav
          aria-label="Primary navigation"
          className="hidden lg:flex items-center gap-0.5 xl:gap-1 shrink-0"
        >
          <NavLink to="/artists" title={t.navArtists} className={desktopLinkClass}>
            <Users className="w-4 h-4 shrink-0" />
            <span>{t.navArtistsShort}</span>
          </NavLink>
          <NavLink to="/" end className={desktopLinkClass}>
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span>{t.navOverview}</span>
          </NavLink>
          <NavLink to="/songs" title={t.navSongs} className={desktopLinkClass}>
            <Music2 className="w-4 h-4 shrink-0" />
            <span>{t.navSongsShort}</span>
          </NavLink>
          <NavLink to="/releases" className={desktopLinkClass}>
            <Disc3 className="w-4 h-4 shrink-0" />
            <span>{t.navReleases}</span>
          </NavLink>
          <NavLink to="/friends" className={desktopLinkClass}>
            <HeartHandshake className="w-4 h-4 shrink-0" />
            <span>{t.navFriends}</span>
          </NavLink>
          <Tooltip content={t.navSettings} position="bottom">
            <NavLink to="/settings" aria-label={t.navSettings} className={desktopLinkClass}>
              <Settings className="w-4 h-4 shrink-0" />
              <span className="hidden xl:inline">{t.navSettingsShort}</span>
            </NavLink>
          </Tooltip>
        </nav>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {user?.isAdmin && (
            <Tooltip content={t.navAdmin} position="bottom" align="end">
              <NavLink
                to="/admin"
                aria-label={t.navAdmin}
                className={({ isActive }) =>
                  `${btnIcon} ${
                    isActive
                      ? 'bg-[#5fb38e]/20 text-[#5fb38e] border-[#5fb38e]/45'
                      : ''
                  }`
                }
              >
                <span className="relative flex items-center justify-center">
                  <Activity className="w-4 h-4 shrink-0 text-[#5fb38e]" />
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#5fb38e]" />
                </span>
              </NavLink>
            </Tooltip>
          )}

          <PreferencesToggle />

          {user && <NotificationBell />}

          {user && (
            <div className="flex items-center gap-1 sm:gap-1.5 p-0.5 sm:pl-1.5 sm:pr-1 sm:py-0.5 rounded-xl bg-[#13151c] border border-white/[0.08] min-w-0 shrink-0">
              <Tooltip content={t.navProfile} position="bottom" align="end">
                <NavLink
                  to="/profile"
                  aria-label={t.navProfile}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-1 py-0.5 rounded-lg transition-colors min-w-0 ${
                      isActive ? 'bg-white/10 text-[#e09f5a]' : 'hover:bg-white/10 text-[#e5e0d5]'
                    }`
                  }
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.displayName}
                      className="w-6 h-6 rounded-full object-cover shrink-0 border border-white/15"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[#d95d4e]/25 text-[#d95d4e] text-[11px] font-bold flex items-center justify-center uppercase shrink-0">
                      {user.displayName.slice(0, 1)}
                    </div>
                  )}
                  <span className="hidden xl:inline text-xs font-medium max-w-[84px] truncate">
                    {user.displayName}
                  </span>
                </NavLink>
              </Tooltip>
              <Tooltip content={t.logoutTitle} position="bottom" align="end">
                <button
                  type="button"
                  onClick={() => void logout()}
                  aria-label={t.logoutTitle}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-[#d95d4e] hover:bg-white/10 transition-all active:scale-[0.96] shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      {/* Mobile & Tablet Navigation Row (< 1024px) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden border-t border-white/[0.06]"
      >
        <div className="max-w-7xl mx-auto px-1 sm:px-6 py-1 grid grid-cols-6 gap-0.5 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-1.5">
          <NavLink to="/artists" className={mobileLinkClass}>
            <Users className="w-4 h-4 shrink-0" />
            <span className="md:hidden truncate max-w-full">{t.navArtistsShort}</span>
            <span className="hidden md:inline whitespace-nowrap">{t.navArtists}</span>
          </NavLink>
          <NavLink to="/" end className={mobileLinkClass}>
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span className="md:hidden truncate max-w-full">{t.navOverviewShort}</span>
            <span className="hidden md:inline whitespace-nowrap">{t.navOverview}</span>
          </NavLink>
          <NavLink to="/songs" className={mobileLinkClass}>
            <Music2 className="w-4 h-4 shrink-0" />
            <span className="md:hidden truncate max-w-full">{t.navSongsShort}</span>
            <span className="hidden md:inline whitespace-nowrap">{t.navSongs}</span>
          </NavLink>
          <NavLink to="/releases" className={mobileLinkClass}>
            <Disc3 className="w-4 h-4 shrink-0" />
            <span className="md:hidden truncate max-w-full">{t.navReleasesShort}</span>
            <span className="hidden md:inline whitespace-nowrap">{t.navReleases}</span>
          </NavLink>
          <NavLink to="/friends" className={mobileLinkClass}>
            <HeartHandshake className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-full md:whitespace-nowrap">{t.navFriends}</span>
          </NavLink>
          <NavLink to="/settings" className={mobileLinkClass}>
            <Settings className="w-4 h-4 shrink-0" />
            <span className="md:hidden truncate max-w-full">{t.navSettingsShort}</span>
            <span className="hidden md:inline whitespace-nowrap">{t.navSettings}</span>
          </NavLink>
        </div>
      </nav>
    </header>
  );
}
