// FloatingToggle.tsx
// GROWI DOM 構造に依存せず常時右下に表示される FAB 形式のトグルボタン
import * as React from 'react';
import { useAppContext } from '../context/AppContext';

const btnStyle: React.CSSProperties = {
  position: 'fixed',
  right: '20px',
  bottom: '20px',
  zIndex: 2147483647,
  padding: '10px 16px',
  fontSize: '14px',
  fontWeight: 600,
  borderRadius: '9999px',
  border: '1px solid #ccc',
  background: '#fff',
  boxShadow: '0 4px 12px rgba(0,0,0,.15)',
  cursor: 'pointer'
};

export const FloatingToggle: React.FC = () => {
  const { isOpen, toggle } = useAppContext();
  return (
    <button
      type="button"
      aria-pressed={isOpen}
      onClick={toggle}
      style={btnStyle}
      title="Vivliostyle Preview"
    >
      {isOpen ? 'Close Vivliostyle' : 'Vivliostyle'}
    </button>
  );
};

export default FloatingToggle;