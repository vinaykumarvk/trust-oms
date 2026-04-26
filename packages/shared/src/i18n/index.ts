import en from './en.json';
import fil from './fil.json';

export const locales = { en, fil } as const;
export type Locale = keyof typeof locales;
export const defaultLocale: Locale = 'en';

export function t(locale: Locale, key: string): string {
  const parts = key.split('.');
  let current: any = locales[locale] || locales[defaultLocale];
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      // Fallback to English
      let fallback: any = locales[defaultLocale];
      for (const p of parts) {
        if (fallback && typeof fallback === 'object' && p in fallback) {
          fallback = fallback[p];
        } else {
          return key;
        }
      }
      return typeof fallback === 'string' ? fallback : key;
    }
  }
  return typeof current === 'string' ? current : key;
}
