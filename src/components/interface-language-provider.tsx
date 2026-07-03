"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_INTERFACE_LANGUAGE,
  getInterfaceCopy,
  INTERFACE_LANGUAGE_STORAGE_KEY,
  normalizeInterfaceLanguage,
  type InterfaceCopy,
  type InterfaceLanguage,
} from "@/lib/interface-language";

type InterfaceLanguageContextValue = {
  language: InterfaceLanguage;
  setLanguage: (language: InterfaceLanguage) => void;
  copy: InterfaceCopy;
};

const InterfaceLanguageContext =
  createContext<InterfaceLanguageContextValue | null>(null);

export function InterfaceLanguageProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [language, setLanguageState] = useState<InterfaceLanguage>(
    DEFAULT_INTERFACE_LANGUAGE,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const storedLanguage = window.localStorage.getItem(
          INTERFACE_LANGUAGE_STORAGE_KEY,
        );
        setLanguageState(normalizeInterfaceLanguage(storedLanguage));
      } catch {
        setLanguageState(DEFAULT_INTERFACE_LANGUAGE);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((nextLanguage: InterfaceLanguage) => {
    const normalized = normalizeInterfaceLanguage(nextLanguage);
    setLanguageState(normalized);

    try {
      window.localStorage.setItem(INTERFACE_LANGUAGE_STORAGE_KEY, normalized);
    } catch {
      // The interface can still update when localStorage is unavailable.
    }
  }, []);

  const value = useMemo<InterfaceLanguageContextValue>(
    () => ({
      language,
      setLanguage,
      copy: getInterfaceCopy(language),
    }),
    [language, setLanguage],
  );

  return (
    <InterfaceLanguageContext.Provider value={value}>
      {children}
    </InterfaceLanguageContext.Provider>
  );
}

export function useInterfaceLanguage() {
  const context = useContext(InterfaceLanguageContext);

  if (!context) {
    throw new Error(
      "useInterfaceLanguage must be used inside InterfaceLanguageProvider.",
    );
  }

  return context;
}
