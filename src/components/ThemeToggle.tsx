"use client";
import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

const KEY = "3dblend.theme";
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const read = () => (typeof document === "undefined" ? "dark" : document.documentElement.dataset.theme || "dark");

export function applyTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  listeners.forEach((cb) => cb());
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "dark");
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button onClick={() => applyTheme(next)} className="btn-ghost !px-2" title={`Switch to ${next} mode`} aria-label={`Switch to ${next} mode`}>
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/** Inline, runs before paint: applies the saved theme (or the OS preference) to <html>. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(KEY)});if(!t){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){}})();`;
