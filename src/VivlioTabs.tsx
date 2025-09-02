import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import './VivlioTabs.css';

interface VivlioTabsProps {
  Original: React.FunctionComponent<any>;
  originalProps: any;
  extractHtml: () => string; // Markdown -> HTML (既存 preview の innerHTML を利用)
  extractCss: () => string;  // fenced code block などから抽出した CSS (暫定: 空)
}

export const withVivlioTabs = (Original: React.FunctionComponent<any>): React.FunctionComponent<any> => {
  const Wrapper: React.FC<any> = (props: any) => {
    const [tab, setTab] = useState<'markdown' | 'vivlio'>('markdown');
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    // TODO: 本実装では CSS/HTML 抽出ロジックを後で差し込む
    const extractHtml = () => {
      try {
        const el = document.querySelector('.page-content, .wiki') as HTMLElement | null;
        if (el) return el.innerHTML;
      } catch {}
      return '<p>(no html)</p>';
    };
    const extractCss = () => '';

    useEffect(() => {
      if (tab !== 'vivlio') return;
      const iframe = iframeRef.current;
      if (!iframe) return;
      const doc = iframe.contentDocument;
      if (!doc) return;
      const html = extractHtml();
      const css = extractCss();
      doc.open();
      doc.write(`<!DOCTYPE html><html><head><meta charset=\"utf-8\" /><style>${css}</style></head><body>${html}</body></html>`);
      doc.close();
    }, [tab]);

    return (
      <div className="vivlio-tabs-wrapper">
        <div className="vivlio-tabs-bar">
          <button className={tab==='markdown'? 'active':''} onClick={() => setTab('markdown')}>Markdown</button>
          <button className={tab==='vivlio'? 'active':''} onClick={() => setTab('vivlio')}>Vivliostyle</button>
        </div>
        <div className="vivlio-tabs-content">
          {tab === 'markdown' && <Original {...props} />}
          {tab === 'vivlio' && (
            <iframe ref={iframeRef} style={{width:'100%',height:'600px',border:'1px solid #ccc',background:'#fff'}} />
          )}
        </div>
      </div>
    );
  };
  return Wrapper;
};

export default withVivlioTabs;
