// test/ui/PreviewShell.spec.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PreviewShell from '../../src/ui/PreviewShell';
// VivliostylePreview は内部で vfm -> rehype-format -> ESM 依存を辿り Jest が生で解釈できないためモック
jest.mock('../../src/ui/VivliostylePreview', () => ({
  VivliostylePreview: (props: any) => <div data-testid="vivlio-preview-mock">Vivliostyle Preview (mock)</div>,
  __esModule: true,
}));
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

describe('PreviewShell (inline replace mode)', () => {
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

  it('closed state: no Vivliostyle wrapper rendered', () => {
    renderWithContext({
      isOpen: false,
      toggle: mockToggle,
      markdown: '# Hello',
    });
    // 閉じているときは VivliostylePreview 自体描画されない
    expect(screen.queryByText(/Vivliostyle Preview/i)).toBeNull();
  });

  it('open state: Vivliostyle header bar rendered', () => {
    renderWithContext({
      isOpen: true,
      toggle: mockToggle,
      markdown: '# Hello',
    });
    // ヘッダーバーのタイトル確認
    expect(screen.getByText(/Vivliostyle Preview/i)).toBeInTheDocument();
  });
});
