import { create } from 'zustand';

type ThemeState = {
  dark: boolean;
  hydrate: () => void;
  toggle: () => void;
};

export const useTheme = create<ThemeState>((set, get) => ({
  dark: false,
  hydrate: () => {
    const stored = localStorage.getItem('admin_theme');
    const dark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    set({ dark });
  },
  toggle: () => {
    const dark = !get().dark;
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('admin_theme', dark ? 'dark' : 'light');
    set({ dark });
  },
}));
