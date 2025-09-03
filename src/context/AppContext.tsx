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
};

const AppContext = React.createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isVivliostyleActive, setIsVivliostyleActive] = React.useState(false);
  const { markdown } = useEditorMarkdown({ debounceMs: 250 });

  const toggle = React.useCallback(() => {
    setIsVivliostyleActive(prev => !prev);
  }, []);

  const value: AppContextType = {
    isVivliostyleActive,
    setIsVivliostyleActive,
    isOpen: isVivliostyleActive, // alias
    toggle,
    markdown,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = React.useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};
