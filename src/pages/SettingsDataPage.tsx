import { useEffect, useState } from 'react';
import {
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { api } from '../api';
import { useArtist } from '../context/ArtistContext';
import { useAuth } from '../context/AuthContext';

const SAMPLE_CSV = `release_title,release_category,release_type,release_date,release_spotify_url,song_title,version_tag,duration_ms,song_spotify_url
Demo Single,Singles,single,2026-01-01,,New Bonus Song,,195000,`;

const SAMPLE_JSON = JSON.stringify(
  {
    releases: [
      {
        title: 'Custom Rare EP',
        category: 'Other',
        release_type: 'ep',
        release_date: '2026-01-01',
        tracks: [
          {
            title: 'Unreleased Track Example',
            duration_ms: 210000,
          },
        ],
      },
    ],
  },
  null,
  2
);

export function SettingsDataPage() {
  const { artists, selectedArtistId, refreshArtists } = useArtist();
  const { user, refreshMe } = useAuth();
  const [targetArtistId, setTargetArtistId] = useState<number>(
    selectedArtistId || artists[0]?.id || 1
  );

  // Account & Security state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [accountEmail, setAccountEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setAccountEmail(user.email);
    }
  }, [user]);

  // Spotify Web API credentials state
  const [hasSpotifyApi, setHasSpotifyApi] = useState(false);
  const [maskedCid, setMaskedCid] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [savingSpotify, setSavingSpotify] = useState(false);
  const [spotifyMsg, setSpotifyMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Import & Backup state
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [rawInput, setRawInput] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  useEffect(() => {
    if (selectedArtistId) setTargetArtistId(selectedArtistId);
    else if (artists[0]?.id) setTargetArtistId(artists[0].id);
  }, [selectedArtistId, artists]);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setHasSpotifyApi(s.hasSpotifyApi);
        setMaskedCid(s.spotifyClientIdMasked);
      })
      .catch(() => {});
  }, []);

  const handleSaveSpotify = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSpotify(true);
    setSpotifyMsg(null);
    try {
      const res = await api.saveSpotifySettings(clientId, clientSecret);
      setHasSpotifyApi(res.hasSpotifyApi);
      setMaskedCid(res.spotifyClientIdMasked || null);
      setClientId('');
      setClientSecret('');
      setSpotifyMsg({
        type: 'ok',
        text: res.hasSpotifyApi
          ? 'Ключі Spotify Web API перевірено та збережено! Тепер усі нові виконавці та синхронізація матимуть 100% покриття Spotify.'
          : 'Ключі Spotify Web API очищено. Працює автономний режим без ключів.',
      });
    } catch (err) {
      setSpotifyMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Помилка перевірки ключів',
      });
    } finally {
      setSavingSpotify(false);
    }
  };

  const handleClearSpotify = async () => {
    setSavingSpotify(true);
    setSpotifyMsg(null);
    try {
      await api.saveSpotifySettings('', '');
      setHasSpotifyApi(false);
      setMaskedCid(null);
      setSpotifyMsg({ type: 'ok', text: 'Ключі Spotify Web API видалено.' });
    } finally {
      setSavingSpotify(false);
    }
  };

  const handleImportCatalog = async () => {
    setImportResult(null);
    setImportError(null);
    try {
      const res = await api.importCatalog(targetArtistId, format, rawInput);
      setImportResult(
        `Успішно імпортовано! Додано релізів: ${res.addedReleases}, нових пісень: ${res.addedSongs}, зв’язків: ${res.linkedTracks}.`
      );
      setRawInput('');
      await refreshArtists();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Помилка імпорту');
    }
  };

  const handleFileUpload = (file: File | undefined) => {
    if (!file) return;
    setFormat(file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setRawInput(reader.result);
    };
    reader.readAsText(file);
  };

  const handleExportBackup = async () => {
    const data = await api.exportUserData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `discography-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupMsg('Повну резервну копію оцінок і нотаток усіх виконавців збережено у файл.');
  };

  const handleRestoreBackup = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const res = await api.importUserData(parsed);
        setBackupMsg(`Відновлено оцінок: ${res.restoredRatings}, нотаток: ${res.restoredNotes}.`);
        await refreshArtists();
      } catch (err) {
        setBackupMsg(err instanceof Error ? err.message : 'Не вдалося прочитати файл');
      }
    };
    reader.readAsText(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      await api.updateProfile({
        displayName,
        email: accountEmail,
        ...(newPassword ? { currentPassword, newPassword } : {}),
      });
      await refreshMe();
      setCurrentPassword('');
      setNewPassword('');
      setProfileMsg({ type: 'ok', text: 'Налаштування акаунту та безпеки оновлено.' });
    } catch (err) {
      setProfileMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Не вдалося оновити профіль',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#f3efe6]">
          Акаунт, безпека та дані
        </h1>
        <p className="text-sm text-[#9ca3af] mt-1">
          Керуйте вашим профілем, прив’язкою пошти, ключами Spotify Web API та резервними копіями.
        </p>
      </div>

      {/* Account & Security */}
      <section className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-[#e09f5a]" />
            <h2 className="font-display text-lg font-bold text-[#f3efe6]">Акаунт і безпека</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#5fb38e]/15 text-[#7cc9a7] border border-[#5fb38e]/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              AES-256-GCM шифрування
            </span>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#9ca3af] mb-1">Ім’я / нікнейм</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-[#0b0c10] border border-white/10 text-sm text-[#f3efe6] focus:outline-none focus:border-[#e09f5a]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#9ca3af] mb-1">Електронна пошта</label>
            <input
              type="email"
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-[#0b0c10] border border-white/10 text-sm text-[#f3efe6] focus:outline-none focus:border-[#e09f5a]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#9ca3af] mb-1">
              Поточний пароль (якщо змінюєте пароль)
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-10 px-3 rounded-xl bg-[#0b0c10] border border-white/10 text-sm text-[#f3efe6] focus:outline-none focus:border-[#e09f5a]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#9ca3af] mb-1">
              Новий пароль (мін. 8 символів, залиште порожнім щоб не змінювати)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Новий пароль"
              className="w-full h-10 px-3 rounded-xl bg-[#0b0c10] border border-white/10 text-sm text-[#f3efe6] focus:outline-none focus:border-[#e09f5a]"
            />
          </div>

          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={savingProfile}
              className="px-4 py-2 rounded-xl bg-[#e09f5a] hover:bg-[#d18f49] disabled:opacity-50 text-[#0b0c10] text-sm font-bold inline-flex items-center gap-2 transition-colors"
            >
              {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Зберегти профіль</span>
            </button>
          </div>
        </form>

        {profileMsg && (
          <div
            className={`text-xs flex items-center gap-2 ${
              profileMsg.type === 'ok' ? 'text-[#5fb38e]' : 'text-[#e87c6f]'
            }`}
          >
            {profileMsg.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{profileMsg.text}</span>
          </div>
        )}
      </section>

      {/* Optional Spotify Web API Keys */}
      <section className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#1DB954]" />
            <h2 className="font-display text-lg font-bold text-[#f3efe6]">
              Spotify Web API (опціонально)
            </h2>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
              hasSpotifyApi
                ? 'bg-[#5fb38e]/15 text-[#7cc9a7] border-[#5fb38e]/35'
                : 'bg-white/5 text-[#9ca3af] border-white/10'
            }`}
          >
            {hasSpotifyApi ? `Підключено (${maskedCid})` : 'Автономний режим (без ключів)'}
          </span>
        </div>

        <p className="text-sm text-[#9ca3af] leading-relaxed">
          Застосунок працює одразу без ключів через публічні дані та вбудовані плеєри. Проте якщо ви хочете отримувати{' '}
          <strong className="text-[#f3efe6]">100% усіх альбомів, синглів і Spotify-плеєрів</strong> для будь-яких, навіть нішевих або українських виконавців:
        </p>
        <ol className="text-xs text-[#9ca3af] list-decimal list-inside space-y-1 bg-[#0b0c10]/60 rounded-xl p-3.5 border border-white/[0.06]">
          <li>
            Відкрийте{' '}
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1DB954] hover:underline"
            >
              developer.spotify.com/dashboard
            </a>{' '}
            і натисніть <strong>Create app</strong> (Redirect URI можна вказати <code>http://localhost:5173</code>).
          </li>
          <li>Скопіюйте <strong>Client ID</strong> та <strong>Client secret</strong> у форму нижче.</li>
          <li>Натисніть «Перевірити та зберегти» — після цього для вже доданих гуртів можна натиснути «Перевірити нові релізи».</li>
        </ol>

        <form onSubmit={handleSaveSpotify} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Spotify Client ID"
            className="h-10 px-3 rounded-xl bg-[#0b0c10] border border-white/10 text-sm text-[#f3efe6] focus:outline-none focus:border-[#1DB954]"
          />
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Spotify Client Secret"
            className="h-10 px-3 rounded-xl bg-[#0b0c10] border border-white/10 text-sm text-[#f3efe6] focus:outline-none focus:border-[#1DB954]"
          />
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={savingSpotify || !clientId.trim() || !clientSecret.trim()}
              className="px-4 py-2 rounded-xl bg-[#1DB954] hover:bg-[#1aa34a] disabled:opacity-40 text-[#0b0c10] text-sm font-bold inline-flex items-center gap-2 transition-colors"
            >
              {savingSpotify && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Перевірити та зберегти ключі</span>
            </button>
            {hasSpotifyApi && (
              <button
                type="button"
                onClick={handleClearSpotify}
                className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs text-[#d1d5db]"
              >
                Очистити ключі
              </button>
            )}
          </div>
        </form>

        {spotifyMsg && (
          <div
            className={`text-xs flex items-center gap-2 ${
              spotifyMsg.type === 'ok' ? 'text-[#5fb38e]' : 'text-[#e87c6f]'
            }`}
          >
            {spotifyMsg.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{spotifyMsg.text}</span>
          </div>
        )}
      </section>

      {/* Multi-Artist Backup */}
      <section className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-[#5fb38e]" />
          <h2 className="font-display text-lg font-bold text-[#f3efe6]">
            Резервна копія оцінок і нотаток
          </h2>
        </div>
        <p className="text-sm text-[#9ca3af]">
          Усі дані зберігаються локально у файлі <code className="text-[#e09f5a]">data/tracker.sqlite</code>. Ви можете експортувати або відновити оцінки по всіх виконавцях одним JSON-файлом.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportBackup}
            className="px-4 py-2 rounded-xl bg-[#5fb38e]/15 hover:bg-[#5fb38e]/25 border border-[#5fb38e]/40 text-sm font-medium text-[#7cc9a7] inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Експортувати оцінки (JSON)
          </button>

          <label className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-sm font-medium text-[#f3efe6] inline-flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>Відновити з JSON</span>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => handleRestoreBackup(e.target.files?.[0])}
            />
          </label>
        </div>
        {backupMsg && <p className="text-xs text-[#5fb38e]">{backupMsg}</p>}
      </section>

      {/* Manual JSON/CSV Import into selected artist */}
      <section className="rounded-2xl bg-[#13151c] border border-white/[0.08] p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#e09f5a]" />
            <h2 className="font-display text-lg font-bold text-[#f3efe6]">
              Ручний імпорт треків (JSON / CSV)
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Виконавець для імпорту"
              value={targetArtistId}
              onChange={(e) => setTargetArtistId(Number(e.target.value))}
              className="h-8 px-2.5 rounded-lg bg-[#0b0c10] border border-white/10 text-xs text-[#f3efe6]"
            >
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            <div className="inline-flex rounded-xl bg-[#0b0c10] p-1 border border-white/[0.08]">
              {(['json', 'csv'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormat(fmt)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase ${
                    format === fmt ? 'bg-[#d95d4e] text-white' : 'text-[#9ca3af]'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-[#f3efe6] cursor-pointer inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            <span>Завантажити файл (.json / .csv)</span>
            <input
              type="file"
              accept=".json,.csv"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files?.[0])}
            />
          </label>
          <button
            type="button"
            onClick={() => setRawInput(format === 'csv' ? SAMPLE_CSV : SAMPLE_JSON)}
            className="text-[#e09f5a] hover:underline"
          >
            Вставити приклад {format.toUpperCase()}
          </button>
        </div>

        <textarea
          rows={7}
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder={
            format === 'csv'
              ? 'release_title,release_category,release_type,release_date,release_spotify_url,song_title,version_tag,duration_ms,song_spotify_url'
              : '{ "releases": [ ... ] }'
          }
          className="w-full rounded-xl bg-[#0b0c10] border border-white/10 p-3 font-mono-num text-xs text-[#f3efe6] focus:outline-none focus:border-[#e09f5a]"
        />

        <button
          type="button"
          onClick={handleImportCatalog}
          disabled={!rawInput.trim()}
          className="px-5 py-2.5 rounded-xl bg-[#d95d4e] hover:bg-[#c84d3e] disabled:opacity-40 text-sm font-semibold text-white transition-colors"
        >
          Імпортувати до каталогу виконавця
        </button>

        {importResult && (
          <div className="flex items-center gap-2 text-sm text-[#5fb38e]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{importResult}</span>
          </div>
        )}
        {importError && (
          <div className="flex items-center gap-2 text-sm text-[#e87c6f]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{importError}</span>
          </div>
        )}
      </section>
    </div>
  );
}
