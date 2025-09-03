// src/context/AppContext.tsx
import * as React from 'react';
import { usePreviewToggle } from '../hooks/usePreviewToggle';
import { useEditorMarkdown } from '../hooks/useEditorMarkdown';

type AppContextType = {
  isOpen: boolean;
  toggle: () => void;
  markdown: string;
};

const AppContext = React.createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isOpen, toggle } = usePreviewToggle();
  const { markdown } = useEditorMarkdown({ debounceMs: 250 });

  const value = {
    isOpen,
    toggle,
    markdown,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = React.useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
