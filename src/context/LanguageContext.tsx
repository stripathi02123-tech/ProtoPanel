import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { LanguageCode, translations, LANGUAGES } from "../i18n/translations";

interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "protopanel_language";

const detectInitialLanguage = (): LanguageCode => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
    if (stored && LANGUAGES.some((l) => l.code === stored)) return stored;
  } catch (e) {}

  try {
    const browserLang = (navigator.language || "en").slice(0, 2).toLowerCase();
    if (LANGUAGES.some((l) => l.code === browserLang)) return browserLang as LanguageCode;
  } catch (e) {}

  return "en";
};

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguageState] = useState<LanguageCode>(detectInitialLanguage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch (e) {}
  }, [language]);

  const setLanguage = useCallback((lang: LanguageCode) => {
    setLanguageState(lang);
  }, []);

  const t = useCallback(
    (key: string): string => {
      const dict = translations[language] || translations.en;
      return dict[key] ?? translations.en[key] ?? key;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
};
