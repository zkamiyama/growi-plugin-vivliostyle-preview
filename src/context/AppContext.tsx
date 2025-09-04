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
  // New tab state
  activeTab: 'markdown' | 'vivliostyle';
  setActiveTab: React.Dispatch<React.SetStateAction<'markdown' | 'vivliostyle'>>;
  setActiveTabWithOpen: (tab: 'markdown' | 'vivliostyle') => void;
  // Debug field
  __contextId?: string;
};

const AppContext = React.createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isVivliostyleActive, setIsVivliostyleActive] = React.useState(true); // 初期値をtrueに設定して常にプレビューを表示
  const { markdown } = useEditorMarkdown({ debounceMs: 250 });
  const [forced, setForced] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'markdown' | 'vivliostyle'>('markdown');
  
  // 'vivlio:edit-mode-changed' イベントを購読
  React.useEffect(() => {
    const onEditModeChanged = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail || {};
        const isEditPreview = !!detail.isEditPreview;
        setIsVivliostyleActive(isEditPreview);
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][AppContext] edit-mode-changed event received', { isEditPreview, detail });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[VivlioDBG][AppContext] error handling edit-mode-changed event', error);
      }
    };
    
    window.addEventListener('vivlio:edit-mode-changed', onEditModeChanged);
    
    return () => {
      window.removeEventListener('vivlio:edit-mode-changed', onEditModeChanged);
    };
  }, []);
  
  // activeTabが変わったらisVivliostyleActiveを更新
  React.useEffect(() => {
    setIsVivliostyleActive(activeTab === 'vivliostyle');
  }, [activeTab]);
  
  // デバッグ: このContextインスタンスにIDを付与
  const contextIdRef = React.useRef(Math.random().toString(36).slice(2, 8));
  
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][AppProvider] created', { contextId: contextIdRef.current });

  const toggle = React.useCallback(() => {
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][AppContext] toggle() invoked', { time: Date.now(), contextId: contextIdRef.current });
    setIsVivliostyleActive(prev => {
      const next = !prev;
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][AppContext] state transition', { from: prev, to: next, contextId: contextIdRef.current, stack: new Error().stack?.split('\n').slice(0,4) });
      (window as any).__vivlio_debug = (window as any).__vivlio_debug || { toggles: [] };
      (window as any).__vivlio_debug.toggles.push({ at: Date.now(), from: prev, to: next, contextId: contextIdRef.current });
      return next;
    });
  }, []);

  const setActiveTabWithOpen = React.useCallback((tab: 'markdown' | 'vivliostyle') => {
    setActiveTab(tab);
    // タブが切り替わったらプレビューを開く
    setIsVivliostyleActive(tab === 'vivliostyle');
  }, []);

  const value: AppContextType = {
    isVivliostyleActive,
    setIsVivliostyleActive,
    isOpen: isVivliostyleActive, // alias
    toggle,
    markdown: forced ?? markdown,
    forceUpdateMarkdown: (md: string) => {
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG] forceUpdateMarkdown', { length: md.length, contextId: contextIdRef.current });
      setForced(md);
    },
    activeTab,
    setActiveTab,
    setActiveTabWithOpen,
    __contextId: contextIdRef.current, // デバッグ用
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = React.useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  
  // contextId をログ出力に含める
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][useAppContext] hook used', { 
      contextId: (context as any).__contextId,
      isOpen: context.isOpen 
    });
  }, [context]);
  
  return context;
};
