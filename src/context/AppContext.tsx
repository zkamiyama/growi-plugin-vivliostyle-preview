// src/context/AppContext.tsx
import * as React from 'react';
import { usePreviewToggle } from '../hooks/usePreviewToggle';
import { useEditorMarkdown } from '../hooks/useEditorMarkdown';
import { useVivliostyleBridge } from '../hooks/useVivliostyleBridge';

type AppContextType = {
  isOpen: boolean;
  toggle: () => void;
  markdown: string;
  html: string;
  updateViewer: (html: string) => void;
};

const AppContext = React.createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isOpen, toggle } = usePreviewToggle();
  const { markdown } = useEditorMarkdown({ debounceMs: 250 });
  const { html, updateViewer } = useVivliostyleBridge();

  const value = {
    isOpen,
    toggle,
    markdown,
    html,
    updateViewer,
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
