import React, { useEffect, useState } from 'react';
import { Renderer } from '@vivliostyle/react';
import { buildVfmHtml } from '../vfm/buildVfmHtml';

interface VivliostylePreviewProps {
  markdown: string;
}

export const VivliostylePreview: React.FC<VivliostylePreviewProps> = ({ markdown }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!markdown) {
      setBlobUrl(null);
      return;
    }

    try {
      const html = buildVfmHtml(markdown);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);

      return () => {
        URL.revokeObjectURL(url);
      };
    } catch (error) {
      console.error('[VivlioDBG] Error building HTML:', error);
      setBlobUrl(null);
    }
  }, [markdown]);

  if (!blobUrl) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Renderer source={blobUrl} />
    </div>
  );
};
