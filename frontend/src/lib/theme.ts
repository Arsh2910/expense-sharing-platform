export type Theme = "light" | "dark";

const preferenceKey = "splitcircle-theme";

export function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function savedTheme(): Theme | undefined {
  try {
    const value = window.localStorage.getItem(preferenceKey);
    return value === "dark" || value === "light" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function applyTheme(theme = savedTheme() ?? systemTheme()) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "dark" ? "#141816" : "#f5f5ef",
  );
}

export function saveTheme(theme: Theme) {
  try {
    window.localStorage.setItem(preferenceKey, theme);
  } catch {
    // The selected theme still applies for the current page.
  }
  applyTheme(theme);
}
