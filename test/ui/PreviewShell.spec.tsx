// test/ui/PreviewShell.spec.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PreviewShell from '../../src/ui/PreviewShell';
import { useEditorMarkdown } from '../../src/hooks/useEditorMarkdown';
import { useVivliostyleBridge } from '../../src/hooks/useVivliostyleBridge';
import { usePreviewToggle } from '../../src/hooks/usePreviewToggle';

// Hooksをモック
jest.mock('../../src/hooks/useEditorMarkdown');
jest.mock('../../src/hooks/useVivliostyleBridge');
jest.mock('../../src/hooks/usePreviewToggle');

const mockedUseEditorMarkdown = useEditorMarkdown as jest.Mock;
const mockedUseVivliostyleBridge = useVivliostyleBridge as jest.Mock;
const mockedUsePreviewToggle = usePreviewToggle as jest.Mock;

describe('PreviewShell', () => {
  let mockToggle: jest.Mock;
  let mockUpdateViewer: jest.Mock;

  beforeEach(() => {
    mockToggle = jest.fn();
    mockUpdateViewer = jest.fn();

    mockedUseEditorMarkdown.mockReturnValue({ markdown: '# Hello' });
    mockedUseVivliostyleBridge.mockReturnValue({ html: '', updateViewer: mockUpdateViewer });
  });

  it('should be closed by default and render a button', () => {
    mockedUsePreviewToggle.mockReturnValue({ isOpen: false, toggle: mockToggle });
    render(<PreviewShell />);

    const button = screen.getByRole('button', { name: /Open Vivliostyle/i });
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Vivliostyle preview/i })).toBeInTheDocument();
    expect(screen.queryByTitle(/Vivliostyle Viewer/i)).not.toBeInTheDocument(); // iframeはまだない
  });

  it('should open when toggle button is clicked', () => {
    mockedUsePreviewToggle.mockReturnValue({ isOpen: false, toggle: mockToggle });
    render(<PreviewShell />);

    const button = screen.getByRole('button', { name: /Open Vivliostyle/i });
    fireEvent.click(button);
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it('should render iframe and update viewer when open', () => {
    mockedUsePreviewToggle.mockReturnValue({ isOpen: true, toggle: mockToggle });
    render(<PreviewShell />);

    const button = screen.getByRole('button', { name: /Close Vivliostyle/i });
    expect(button).toBeInTheDocument();

    const iframe = screen.getByTitle(/Vivliostyle Viewer/i);
    expect(iframe).toBeInTheDocument();

    // useEffectが呼ばれ、updateViewerが呼ばれることを確認
    expect(mockUpdateViewer).toHaveBeenCalledWith('<h1>Hello</h1>\n');
  });
});
