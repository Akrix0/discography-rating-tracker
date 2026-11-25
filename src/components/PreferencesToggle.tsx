import { Moon, Sun } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';

export function PreferencesToggle() {
  const { lang, theme, setLang, toggleTheme, t } = usePreferences();

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div
        role="group"
        aria-label="Language"
        className="inline-flex rounded-lg bg-[#13151c] p-0.5 border border-white/10"
      >
        {(['uk', 'en'] as const).map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase transition-colors ${
              lang === code
                ? 'bg-[#d95d4e] text-white'
                : 'text-[#9ca3af] hover:text-[#f3efe6]'
            }`}
          >
            {code === 'uk' ? 'UA' : 'EN'}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? t.switchToLight : t.switchToDark}
        title={theme === 'dark' ? t.switchToLight : t.switchToDark}
        className="w-8 h-8 rounded-lg bg-[#13151c] hover:bg-white/10 border border-white/10 flex items-center justify-center text-[#e09f5a] transition-colors"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
    </div>
  );
}
