import React from 'react';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExternalToggle from '../../src/ui/ExternalToggle';
import * as AppContextModule from '../../src/context/AppContext';

class MockMutationObserver {
  private readonly callback: MutationCallback;

  constructor(cb: MutationCallback) {
    this.callback = cb;
    mockObservers.add(this);
  }

  observe(target: Node, options?: MutationObserverInit) {
    this.target = target;
    this.options = options ?? null;
  }

  disconnect() {
    mockObservers.delete(this);
  }

  takeRecords(): MutationRecord[] {
    return [];
  }

  /** helpers for tests */
  trigger(records: MutationRecord[]) {
    this.callback(records, this as unknown as MutationObserver);
  }

  target: Node | null = null;

  options: MutationObserverInit | null = null;
}

const originalMutationObserver = globalThis.MutationObserver;
const mockObservers = new Set<MockMutationObserver>();

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).MutationObserver = MockMutationObserver as unknown as typeof MutationObserver;
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).MutationObserver = originalMutationObserver;
  mockObservers.clear();
});

const useAppContextSpy = jest.spyOn(AppContextModule, 'useAppContext');

const createContextValue = () => ({
  isVivliostyleActive: false,
  setIsVivliostyleActive: jest.fn(),
  isOpen: false,
  toggle: jest.fn(),
  markdown: '# heading',
  forceUpdateMarkdown: jest.fn(),
});

const triggerAllObservers = (records: MutationRecord[] = []) => {
  Array.from(mockObservers).forEach((observer) => {
    observer.trigger(records);
  });
};

describe('ExternalToggle anchoring', () => {
  beforeEach(() => {
    mockObservers.clear();
    document.body.innerHTML = '';
    useAppContextSpy.mockReturnValue(createContextValue());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('inserts the toggle into #grw-page-editor-mode-manager once the toolbar becomes available', async () => {
    render(<ExternalToggle />);

    expect(document.querySelector('[data-vivlio-toggle="true"]')).toBeNull();

    const container = document.createElement('div');
    container.id = 'grw-page-editor-mode-manager';
    container.className = 'btn-group flex-grow-1';
    const viewButton = document.createElement('button');
    viewButton.setAttribute('data-testid', 'view-button');
    viewButton.textContent = 'View';
    container.appendChild(viewButton);

    await act(async () => {
      document.body.appendChild(container);
      triggerAllObservers();
      // allow debounce timer from implementation to run
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    const wrapper = container.querySelector('.vivlio-inline-toggle');
    expect(wrapper).toBeTruthy();
    const toggleButton = wrapper?.querySelector('[data-vivlio-toggle="true"]');
    expect(toggleButton).toBeTruthy();
    expect(container.firstElementChild).toBe(wrapper);
    expect(container.children[1]).toBe(viewButton);
  });

  it('falls back to immediate heuristic when toolbar container is absent', () => {
    const fallbackAnchor = document.createElement('button');
    fallbackAnchor.textContent = 'View';
    fallbackAnchor.setAttribute('data-testid', 'view-button');
    document.body.appendChild(fallbackAnchor);

    render(<ExternalToggle />);

    const wrapper = document.querySelector('.vivlio-inline-toggle');
    expect(wrapper).toBeTruthy();
    const toggleButton = wrapper?.querySelector('[data-vivlio-toggle="true"]');
    expect(toggleButton).toBeTruthy();
    expect(fallbackAnchor.previousSibling).toBe(wrapper);
  });
});