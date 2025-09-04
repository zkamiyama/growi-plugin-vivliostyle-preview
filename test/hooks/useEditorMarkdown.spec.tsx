import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useEditorMarkdown } from '../../src/hooks/useEditorMarkdown';

describe('useEditorMarkdown', () => {
  beforeEach(() => {
    // ensure clean DOM
    document.body.innerHTML = '';
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('reads from textarea and attaches input listener and cleans up', () => {
    const ta = document.createElement('textarea');
    ta.className = 'editor';
    ta.value = '# hello';
    document.body.appendChild(ta);

    const { result, unmount } = renderHook(() => useEditorMarkdown({ debounceMs: 10 }));
    // initial tick: handler should read and set markdown after debounce
    act(() => {
      jest.advanceTimersByTime(20);
    });
    expect(result.current.markdown).toBe('# hello');

    // simulate input
    act(() => {
      ta.value = '# hello world';
      ta.dispatchEvent(new Event('input'));
      jest.advanceTimersByTime(20);
    });
    expect(result.current.markdown).toBe('# hello world');

    // unmount and ensure handlers removed (no errors when dispatching)
    unmount();
    expect(() => { ta.dispatchEvent(new Event('input')); }).not.toThrow();
  });
});
