// ExternalToggle.tsx
// シンプルなトグルボタン。常に表示。
import * as React from 'react';
import { useAppContext } from '../context/AppContext';
import '../VivlioToggle.css';

export const ExternalToggle: React.FC = () => {
  const { isOpen, toggle } = useAppContext();

  return (
    <button
      type="button"
      className="vivlio-toggle-btn"
      onClick={(e) => {
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][ExternalToggle] click', { isOpenBefore: isOpen, time: Date.now() });
        toggle();
      }}
      aria-pressed={isOpen}
      title="Toggle Vivliostyle Preview"
      data-vivlio-toggle="true"
    >
      Vivliostyle
    </button>
  );
};

export default ExternalToggle;