import { useState } from 'react';
import { AlertCircle, Loader2, Lock, Mail, User } from 'lucide-react';
import { PreferencesToggle } from '../components/PreferencesToggle';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';

export function AuthPage() {
  const { login, register } = useAuth();
  const { t } = usePreferences();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.authFallbackError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col px-4 py-6">
      <div className="w-full max-w-6xl mx-auto flex justify-end">
        <PreferencesToggle />
      </div>

      <div className="flex-1 flex items-center justify-center py-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-3">
            <img
              src="/favicon.svg"
              alt={t.appTitle}
              className="w-16 h-16 mx-auto rounded-2xl shadow-2xl shadow-black/40 border border-white/10"
            />
            <div>
              <h1 className="font-display text-xl sm:text-3xl font-bold text-[#f3efe6] break-words">
                {t.appTitle}
              </h1>
              <p className="text-xs sm:text-sm text-[#9ca3af] mt-1">{t.authSubtitle}</p>
            </div>
          </div>

          <div className="rounded-3xl bg-[#13151c] border border-white/[0.1] p-5 sm:p-7 shadow-2xl shadow-black/30 space-y-5">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#0b0c10] p-1 border border-white/[0.07]">
              {(
                [
                  { key: 'login', label: t.signIn },
                  { key: 'register', label: t.signUp },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setMode(tab.key);
                    setError(null);
                  }}
                  className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                    mode === tab.key
                      ? 'bg-[#d95d4e] text-white'
                      : 'text-[#9ca3af] hover:text-[#f3efe6]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs text-[#9ca3af] mb-1.5">
                    {t.displayNameLabel}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[#6b7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t.displayNamePlaceholder}
                      className="w-full h-11 pl-10 pr-3 rounded-xl bg-[#0b0c10] border border-white/10 text-sm text-[#f3efe6] focus:outline-none focus:border-[#e09f5a]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-[#9ca3af] mb-1.5">{t.emailLabel}</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#6b7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-11 pl-10 pr-3 rounded-xl bg-[#0b0c10] border border-white/10 text-sm text-[#f3efe6] focus:outline-none focus:border-[#e09f5a]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#9ca3af] mb-1.5">{t.passwordLabel}</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#6b7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={mode === 'register' ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === 'register' ? t.passwordMinHint : t.passwordPlaceholder
                    }
                    className="w-full h-11 pl-10 pr-3 rounded-xl bg-[#0b0c10] border border-white/10 text-sm text-[#f3efe6] focus:outline-none focus:border-[#e09f5a]"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-[#d95d4e]/15 border border-[#d95d4e]/40 p-3 flex items-start gap-2 text-xs text-[#e87c6f]">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-xl bg-[#d95d4e] hover:bg-[#c84d3e] disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[#d95d4e]/25"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{mode === 'login' ? t.submitLogin : t.submitRegister}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
