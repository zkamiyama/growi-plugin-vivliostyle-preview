// src/ui/ExternalToggle.tsx
import * as React from 'react';
import { useAppContext } from '../context/AppContext';

// Simplified toggle: container is created by client-entry and we just render the button.
const ExternalToggle: React.FC = () => {
  const { isOpen, toggle } = useAppContext();
  return (
    <button
      type="button"
      className={`btn btn-outline-secondary ${isOpen ? 'active' : ''}`}
      aria-pressed={isOpen}
      onClick={toggle}
      data-vivlio-toggle
    >
      Vivliostyle
    </button>
  );
};

export default ExternalToggle;