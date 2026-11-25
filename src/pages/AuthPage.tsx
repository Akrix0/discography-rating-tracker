import { useState } from 'react';
import {
  AlertCircle,
  Disc3,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function AuthPage() {
  const { login, register } = useAuth();

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
      setError(err instanceof Error ? err.message : 'Помилка авторизації');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-[#d95d4e] to-[#e09f5a] flex items-center justify-center shadow-2xl shadow-[#d95d4e]/30">
            <Disc3 className="w-8 h-8 text-[#0b0c10]" />
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#f3efe6]">
              Discography &amp; Rating
            </h1>
            <p className="text-xs sm:text-sm text-[#9ca3af] mt-1">
              Особистий захищений музичний архів • Хмарна база Turso
            </p>
          </div>
        </div>

        <div className="rounded-3xl bg-[#13151c] border border-white/[0.1] p-6 sm:p-7 shadow-2xl shadow-black/60 space-y-5">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#0b0c10] p-1 border border-white/[0.07]">
            {(
              [
                { key: 'login', label: 'Вхід' },
                { key: 'register', label: 'Реєстрація' },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setMode(t.key);
                  setError(null);
                }}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                  mode === t.key
                    ? 'bg-[#d95d4e] text-white'
                    : 'text-[#9ca3af] hover:text-[#f3efe6]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div>
                <label className="block text-xs text-[#9ca3af] mb-1.5">Ім’я або нікнейм</label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#6b7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Наприклад, Олександр"
                    className="w-full h-11 pl-10 pr-3 rounded-xl bg-[#0b0c10] border border-white/10 text-sm text-[#f3efe6] focus:outline-none focus:border-[#e09f5a]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs text-[#9ca3af] mb-1.5">Електронна пошта</label>
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
              <label className="block text-xs text-[#9ca3af] mb-1.5">Пароль</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#6b7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={mode === 'register' ? 8 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Мінімум 8 символів' : 'Ваш пароль'}
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
              <span>{mode === 'login' ? 'Увійти в акаунт' : 'Створити акаунт'}</span>
            </button>
          </form>

          <div className="pt-2 border-t border-white/[0.06] flex items-center justify-center gap-2 text-[11px] text-[#6b7280]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#5fb38e]" />
            <span>Паролі (scrypt), нотатки й ключі зашифровані (AES-256-GCM)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
