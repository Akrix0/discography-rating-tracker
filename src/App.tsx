import { Loader2 } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ArtistProvider } from './context/ArtistContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PreferencesProvider, usePreferences } from './context/PreferencesContext';
import { Navbar } from './components/Navbar';
import { AddArtistModal } from './components/AddArtistModal';
import { ArtistsHubPage } from './pages/ArtistsHubPage';
import { ArtistDashboardPage } from './pages/ArtistDashboardPage';
import { SongsPage } from './pages/SongsPage';
import { ReleasesPage } from './pages/ReleasesPage';
import { ReleaseDetailPage } from './pages/ReleaseDetailPage';
import { SettingsDataPage } from './pages/SettingsDataPage';
import { AuthPage } from './pages/AuthPage';

function AppRoutes() {
  const { user, loadingAuth } = useAuth();
  const { t } = usePreferences();

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#9ca3af] gap-2.5 text-sm">
        <Loader2 className="w-5 h-5 animate-spin text-[#e09f5a]" />
        <span>{t.checkingSession}</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <ArtistProvider>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <AddArtistModal />

        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-8">
          <Routes>
            <Route path="/" element={<ArtistDashboardPage />} />
            <Route path="/artists" element={<ArtistsHubPage />} />
            <Route path="/songs" element={<SongsPage />} />
            <Route path="/releases" element={<ReleasesPage />} />
            <Route path="/releases/:idOrSlug" element={<ReleaseDetailPage />} />
            <Route path="/settings" element={<SettingsDataPage />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <footer className="border-t border-white/[0.06] py-5 text-center text-xs text-[#6b7280]">
          Discography &amp; Rating Tracker
        </footer>
      </div>
    </ArtistProvider>
  );
}

export function App() {
  return (
    <PreferencesProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </PreferencesProvider>
  );
}

export default App;
