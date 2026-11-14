/* SHONOWEAR — English / हिन्दी switch.
 * The English text in the code is the key: t('Add to bag'). A string with no Hindi entry just shows in English, so nothing breaks.
 * Covers the shopping screens (menu, home, shop, product, bag, footer). Legal pages and long articles stay in English on purpose. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { HI } from './hi.js';

const KEY = 'sw_lang';
const DICT = { hi: HI };
export const LANGS = [['en', 'English'], ['hi', 'हिन्दी']];

export function translate(lang, text, vars) {
  let s = (DICT[lang] && DICT[lang][text]) || text;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}
function initial() {
  try { const v = localStorage.getItem(KEY); if (v && DICT[v]) return v; } catch { /* ignore */ }
  return 'en';
}

const Ctx = createContext({ lang: 'en', setLang: () => {}, t: (s, v) => translate('en', s, v) });
export function LangProvider({ children }) {
  const [lang, setLangState] = useState(initial);
  useEffect(() => { document.documentElement.lang = lang === 'hi' ? 'hi' : 'en'; }, [lang]);
  const setLang = useCallback((l) => { setLangState(l); try { localStorage.setItem(KEY, l); } catch { /* ignore */ } }, []);
  const value = useMemo(() => ({ lang, setLang, t: (s, v) => translate(lang, s, v) }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useT = () => useContext(Ctx).t;
export const useLang = () => useContext(Ctx);

/** Small EN | हिं switch for the header. */
export function LangToggle() {
  const { lang, setLang, t } = useLang();
  return (
    <div role="group" aria-label={t('Language')} style={{ display: 'flex', gap: 2, fontSize: 12 }}>
      {LANGS.map(([code, label]) => (
        <button key={code} type="button" lang={code} aria-pressed={lang === code} onClick={() => setLang(code)}
          style={{ border: 0, background: lang === code ? 'var(--text)' : 'transparent', color: lang === code ? 'var(--bg)' : 'var(--muted)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit', minHeight: 32 }}>{label}</button>
      ))}
    </div>
  );
}
