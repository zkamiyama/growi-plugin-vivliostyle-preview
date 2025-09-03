// test/hooks/usePreviewToggle.spec.ts
import { renderHook, act } from '@testing-library/react';
import { usePreviewToggle } from '../../src/hooks/usePreviewToggle';

describe('usePreviewToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should be closed by default', () => {
    const { result } = renderHook(() => usePreviewToggle());
    expect(result.current.isOpen).toBe(false);
  });

  it('should read initial state from localStorage', () => {
    localStorage.setItem('vivlio:isOpen', '1');
    const { result } = renderHook(() => usePreviewToggle());
    expect(result.current.isOpen).toBe(true);
  });

  it('should toggle state', () => {
    const { result } = renderHook(() => usePreviewToggle());
    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('should open and close state', () => {
    const { result } = renderHook(() => usePreviewToggle());
    act(() => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);
    act(() => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('should write state to localStorage', () => {
    const { result } = renderHook(() => usePreviewToggle());
    act(() => {
      result.current.open();
    });
    expect(localStorage.getItem('vivlio:isOpen')).toBe('1');
    act(() => {
      result.current.close();
    });
    expect(localStorage.getItem('vivlio:isOpen')).toBe('0');
  });
});
