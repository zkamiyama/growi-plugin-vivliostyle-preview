// src/context/AppContext.tsx
import * as React from 'react';
import { useEditorMarkdown } from '../hooks/useEditorMarkdown';
import { dbg } from '../utils/debug';

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
  // Debug field
  __contextId?: string;
};

const AppContext = React.createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isVivliostyleActive, setIsVivliostyleActive] = React.useState(false);
  const { markdown } = useEditorMarkdown({ debounceMs: 250 });
  const [forced, setForced] = React.useState<string | null>(null);

  // デバッグ: このContextインスタンスにIDを付与
  const contextIdRef = React.useRef(Math.random().toString(36).slice(2, 8));

  // Markdown 更新イベントをlisten
  React.useEffect(() => {
    const handleMarkdownUpdate = (event: CustomEvent) => {
      const newMarkdown = event.detail.markdown;
      setForced(newMarkdown);
    };
    window.addEventListener('vivlio:markdown-updated', handleMarkdownUpdate as EventListener);
    return () => {
      window.removeEventListener('vivlio:markdown-updated', handleMarkdownUpdate as EventListener);
    };
  }, []);

  const toggle = React.useCallback(() => {
    dbg('[VivlioDBG][AppContext] toggle() invoked', { time: Date.now(), contextId: contextIdRef.current });
    setIsVivliostyleActive(prev => {
      const next = !prev;
      dbg('[VivlioDBG][AppContext] state transition', { from: prev, to: next, contextId: contextIdRef.current, stack: new Error().stack?.split('\n').slice(0,4) });
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
  dbg('[VivlioDBG] forceUpdateMarkdown', { length: md.length, contextId: contextIdRef.current });
      setForced(md);
    },
    __contextId: contextIdRef.current, // デバッグ用
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = React.useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');

  // contextId をログ出力に含める
  React.useEffect(() => {
    dbg('[VivlioDBG][useAppContext] hook used', {
      contextId: (context as any).__contextId,
      isOpen: context.isOpen
    });
  }, [context]);

  return context;
};