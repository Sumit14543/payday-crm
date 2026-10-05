import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/theme";
import { AppTooltip } from "./ui/app-tooltip";

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <AppTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={isDark}
        onClick={toggleTheme}
        className="theme-toggle inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-sm transition duration-200 hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 cursor-pointer"
      >
        <span className="relative h-5 w-5 overflow-hidden">
          <Sun
            aria-hidden="true"
            className={`absolute inset-0 h-5 w-5 text-amber-500 transition duration-300 ${
              isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
            }`}
          />
          <Moon
            aria-hidden="true"
            className={`absolute inset-0 h-5 w-5 text-blue-300 transition duration-300 ${
              isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
            }`}
          />
        </span>
      </button>
    </AppTooltip>
  );
}
