
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const baseTheme = {
  primary: '#28b900',
  colors: {
    primary: '#28b900', // match your accent or main button color
    number: '#4f6893',   // match your number color (or pick a suitable one)
  },
  // Backgrounds
  //bg: "#4f6893",
  bg: "#f0f0f0",
  //bg: "#ff945b",
  //bg: "#96bdca",
  //bg: "#F7E9C4",
  //bg: "#758cb4",
  //bg: "#5a5994",
  bgGradientTop: "#EAF4FF",
  bgGradientBottom: "#4f6893",
  //bgGradient: ["#3b5176", "#7b8dad"],
  //bgGradient: ["#242347", "#3f3e6e"],
  bgGradient: ["#f0f0f0", "#f0f0f0"],
  surface: "#FFFFFF",
  surface2: "#EBF9EE",
  card: "#F6FBF7",
  cardSoftBlue: "#E8F1FF",
  gray: "#E5E7EB",
  line: "#D1D5DB",

  // Text (accessible contrast)
  title: "#000000",
  title2: "#000000",
  text: "#000000",
  text2: "#000000",
  muted: "#000000",
  muted2: "#000000",

  // Accent
  accent: '#28b900',
  outline: "#A9C8AA",

  // Feedback
  dangerBg: "#FEE2E2",
  dangerText: "#B91C1C",

  // Layout
  pad: 16,
  radius: 12,
  radiusSm: 10,
  topGap: 10,
};

function createTheme(accent) {
  return {
    ...baseTheme,
    accent,
    primary: accent,
    colors: {
      ...baseTheme.colors,
      primary: accent,
    },
  };
}

export const theme = createTheme(baseTheme.accent);

const ThemeContext = createContext(null);

export function ThemeProvider({ children, accentColor = theme.accent }) {
  const [accent, setAccent] = useState(accentColor);

  useEffect(() => {
    setAccent(accentColor);
  }, [accentColor]);

  useEffect(() => {
    Object.assign(theme, createTheme(accent));
  }, [accent]);

  const value = useMemo(
    () => ({
      theme,
      setAccent,
    }),
    [accent]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

export default theme;
