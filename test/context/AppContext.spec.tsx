import React, { useEffect, useRef } from 'react';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AppProvider, useAppContext } from '../../src/context/AppContext';

jest.mock('../../src/vfm/vivlioCssPreprocessor', () => ({
  clearVivlioCssCache: jest.fn(),
}));

const PreviewStateProbe: React.FC = () => {
  const ctx = useAppContext();
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    ctx.setIsVivliostyleActive(true);
  }, [ctx]);
  return <div data-testid="preview-state">{ctx.isVivliostyleActive ? 'open' : 'closed'}</div>;
};

describe('AppProvider navigation auto-reset', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('turns preview off when location changes', () => {
    const { getByTestId } = render(
      <AppProvider>
        <PreviewStateProbe />
      </AppProvider>,
    );

    expect(getByTestId('preview-state')).toHaveTextContent('open');

    act(() => {
      window.history.pushState({}, '', '/vivlio/new-page');
      jest.advanceTimersByTime(600);
    });

    expect(getByTestId('preview-state')).toHaveTextContent('closed');

    const { clearVivlioCssCache } = require('../../src/vfm/vivlioCssPreprocessor') as { clearVivlioCssCache: jest.Mock };
    expect(clearVivlioCssCache).toHaveBeenCalled();
  });
});
