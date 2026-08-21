import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { zh, en } from '../locales/translations';

type Language = 'zh' | 'en';
interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined as LanguageContextType | undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>('zh');

  const t = (key: string, params?: Record<string, string>): string => {
    const keys = key.split('.');
    let value: unknown = language === 'zh' ? zh : en;
    
    for (const k of keys) {
      if (value !== null && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return key; // Fallback to key if not found
      }
    }

    if (typeof value === 'string' && params) {
        let text = value;
        for (const [paramKey, paramValue] of Object.entries(params)) {
            text = text.replace(`{${paramKey}}`, paramValue);
        }
        return text;
    }

    return typeof value === 'string' ? value : key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

// Context providers conventionally colocate their hook; only the provider is mounted by React.
// eslint-disable-next-line react-refresh/only-export-components
export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
