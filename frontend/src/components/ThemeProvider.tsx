import { useTheme } from '../hooks/useTheme';

/** Applies theme (light/dark/system) on app mount — use once inside BrowserRouter. */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useTheme();
  return <>{children}</>;
}
