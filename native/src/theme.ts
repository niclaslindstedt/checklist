// Minimal design tokens for the native UI. The web app has a full theme
// engine (presets, custom overrides, fonts) under ../../src/theme; that is
// DOM/CSS-variable based and not portable, so the native app starts with a
// small light/dark token set keyed off the OS colour scheme. Richer theming
// can grow here later without touching the shared core.

import { useColorScheme } from "react-native";

export interface Tokens {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  danger: string;
  archive: string;
}

const dark: Tokens = {
  bg: "#0f1115",
  surface: "#171a21",
  surfaceAlt: "#1f242e",
  border: "#2a313d",
  text: "#e7ebf0",
  textMuted: "#8b95a5",
  accent: "#4f8cff",
  accentText: "#ffffff",
  danger: "#e5484d",
  archive: "#3fae6b",
};

const light: Tokens = {
  bg: "#f6f7f9",
  surface: "#ffffff",
  surfaceAlt: "#eef0f3",
  border: "#dfe3e8",
  text: "#1a1d23",
  textMuted: "#6b7280",
  accent: "#2f6bff",
  accentText: "#ffffff",
  danger: "#d92d20",
  archive: "#2f9e5e",
};

export function useTokens(): Tokens {
  return useColorScheme() === "light" ? light : dark;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;
