// test/ui/PreviewShell.spec.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PreviewShell from '../../src/ui/PreviewShell';
import { AppProvider } from '../../src/context/AppContext';
import * as AppContextModule from '../../src/context/AppContext';

// AppContext をテスト用にカスタム値で包むヘルパ
const TestProvider: React.FC<{ value: any; children: React.ReactNode }> = ({ value, children }) => {
  const Ctx = (AppContextModule as any).default || (AppContextModule as any).AppContext || (AppContextModule as any).AppProvider?._context;
  // 上記は失敗する可能性があるので正式APIで: create wrapper
  const OriginalProvider = (AppContextModule as any).AppProvider as React.ComponentType<any>;
  // 直接 context を export していないため、モック用に spy する代わりに jest.spyOn で useAppContext を差し替える
  return <>{children}</>;
};

// useAppContext をスパイして任意値を返す
const useAppContextSpy = jest.spyOn(AppContextModule, 'useAppContext');

describe('PreviewShell (with AppContext)', () => {
  let mockToggle: jest.Mock;
  let mockUpdateViewer: jest.Mock;

  beforeEach(() => {
    mockToggle = jest.fn();
    mockUpdateViewer = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderWithContext = (ctx: any) => {
    useAppContextSpy.mockReturnValue(ctx);
    return render(<PreviewShell />);
  };

  it('closed state: shell exists but iframe not rendered', () => {
    renderWithContext({
      isOpen: false,
      toggle: mockToggle,
      markdown: '# Hello',
    });
    // コンテナは data-vivlio-shell 属性で判別
    expect(document.querySelector('[data-vivlio-shell]')).toBeTruthy();
    expect(screen.queryByTitle(/Vivliostyle Viewer/i)).not.toBeInTheDocument();
  });

  it('open state: iframe present', () => {
    renderWithContext({
      isOpen: true,
      toggle: mockToggle,
      markdown: '# Hello',
    });
    expect(screen.getByTitle(/Vivliostyle Viewer/i)).toBeInTheDocument();
  });
});
