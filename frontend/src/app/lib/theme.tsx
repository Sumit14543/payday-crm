import { createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useMemo, useState, useCallback } from "react";

type Theme = "light" | "dark";

type ThemeContextValue = {
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  theme: Theme;
  toggleTheme: () => void;
};

const THEME_STORAGE_KEY = "waqt-crm-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

const getStoredTheme = (): Theme | null => {
  if (typeof window === "undefined") return null;
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === "dark" || storedTheme === "light" ? storedTheme : null;
};

const getPreferredTheme = (): Theme => {
  return "light";
};

const applyThemeClass = (theme: Theme) => {
  if (typeof document === "undefined") return;

  let css = document.getElementById("disable-theme-transitions") as HTMLStyleElement | null;
  if (!css) {
    css = document.createElement("style");
    css.id = "disable-theme-transitions";
    css.appendChild(
      document.createTextNode(
        `*, *::before, *::after { -webkit-transition: none !important; -moz-transition: none !important; -o-transition: none !important; -ms-transition: none !important; transition: none !important; }`
      )
    );
    document.head.appendChild(css);
  }

  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  document.documentElement.style.colorScheme = theme;

  void document.body.offsetHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.getElementById("disable-theme-transitions");
      if (el) {
        el.remove();
      }
    });
  });
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const initial = getStoredTheme() || getPreferredTheme();
    applyThemeClass(initial);
    return initial;
  });

  useLayoutEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    applyThemeClass(newTheme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    }
    setThemeState(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      applyThemeClass(nextTheme);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      }
      return nextTheme;
    });
  }, []);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && (e.newValue === "dark" || e.newValue === "light")) {
        applyThemeClass(e.newValue);
        setThemeState(e.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    isDark: theme === "dark",
    setTheme,
    theme,
    toggleTheme,
  }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return context;
}
