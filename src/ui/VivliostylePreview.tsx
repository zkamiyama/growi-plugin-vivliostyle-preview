import React, { useEffect, useState } from 'react';
import { Renderer } from '@vivliostyle/react';
import { buildVfmHtml } from '../vfm/buildVfmHtml';

interface VivliostylePreviewProps {
  markdown: string;
}

export const VivliostylePreview: React.FC<VivliostylePreviewProps> = ({ markdown }) => {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!markdown) {
      setSourceUrl(null);
      return;
    }

    try {
      const html = buildVfmHtml(markdown);
      // Blob URLの代わりにdata URLを使用
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      setSourceUrl(dataUrl);

      // Blob URLの場合はrevokeが必要だが、data URLは不要
      return () => {
        // data URLの場合は何もしない
      };
    } catch (error) {
      console.error('[VivlioDBG] Error building HTML:', error);
      setSourceUrl(null);
    }
  }, [markdown]);

  if (!sourceUrl) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Renderer source={sourceUrl} />
    </div>
  );
};
