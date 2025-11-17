import React from 'react';
import MenuInjector from './MenuInjector';
import { createMenuButton } from './createMenuButton';

const BuildPdfMenuInjector: React.FC = () => {
  return (
    <MenuInjector
      anchorSelector="#bulkExportDropdownItem"
      matchTexts={[ 'ページとその配下のページを全てエクスポート', '全てエクスポート', 'エクスポート' ]}
      createElement={createMenuButton}
      processedAttr="data-vivlio-build-added"
    />
  );
};

export default BuildPdfMenuInjector;
