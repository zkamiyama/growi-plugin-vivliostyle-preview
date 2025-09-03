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

  it('closed state: iframe exists but shell hidden', () => {
    renderWithContext({
      isOpen: false,
      toggle: mockToggle,
      markdown: '# Hello',
    });
    // コンテナは data-vivlio-shell 属性で判別
    const shell = document.querySelector('[data-vivlio-shell]') as HTMLElement | null;
    expect(shell).toBeTruthy();
    const iframe = screen.getByTitle(/Vivliostyle Viewer/i);
    // 非表示: 親シェルの display が none
    expect(shell!.style.display).toBe('none');
    expect(iframe).toBeInTheDocument();
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
