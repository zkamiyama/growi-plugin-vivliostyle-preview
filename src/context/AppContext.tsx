// src/context/AppContext.tsx
import * as React from 'react';
import { useEditorMarkdown } from '../hooks/useEditorMarkdown';

// Backward compatible context type: keep old isOpen/toggle naming plus new explicit setter
export type AppContextType = {
  // New explicit naming
  isVivliostyleActive: boolean;
  setIsVivliostyleActive: React.Dispatch<React.SetStateAction<boolean>>;
  // Back-compat fields (existing tests/components may still read these)
  isOpen: boolean;
  toggle: () => void;
  markdown: string;
  forceUpdateMarkdown: (md: string) => void;
};

const AppContext = React.createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isVivliostyleActive, setIsVivliostyleActive] = React.useState(false);
  const { markdown } = useEditorMarkdown({ debounceMs: 250 });
  const [forced, setForced] = React.useState<string | null>(null);

  const toggle = React.useCallback(() => {
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG] toggle() called (before change)');
    setIsVivliostyleActive(prev => {
      const next = !prev;
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG] toggle() state transition', { from: prev, to: next, stack: new Error().stack?.split('\n').slice(0,4) });
      (window as any).__vivlio_debug = (window as any).__vivlio_debug || { toggles: [] };
      (window as any).__vivlio_debug.toggles.push({ at: Date.now(), from: prev, to: next });
      return next;
    });
  }, []);

  const value: AppContextType = {
    isVivliostyleActive,
    setIsVivliostyleActive,
    isOpen: isVivliostyleActive, // alias
    toggle,
    markdown: forced ?? markdown,
    forceUpdateMarkdown: (md: string) => {
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG] forceUpdateMarkdown', { length: md.length });
      setForced(md);
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = React.useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};
