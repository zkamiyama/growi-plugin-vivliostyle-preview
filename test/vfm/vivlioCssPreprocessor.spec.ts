import { clearVivlioCssCache, preprocessVivlioCss, type VivlioCssPreprocessOptions } from '../../src/vfm/vivlioCssPreprocessor';

const parentCss = `
:root {
  --theme-color: red;
  color: red;
}

body {
  color: black;
}

@media print {
  :root {
    --theme-color: blue;
  }
  body {
    color: gray;
  }
}

@page {
  size: A4;
  margin: 10mm;
}

@font-face {
  font-family: 'Example';
  src: url(example.woff2) format('woff2');
}
`.trim();

const parentMarkdown = `# Parent
\`\`\`vivliostylecss
${parentCss}
\`\`\`
`;

type FetchMarkdown = NonNullable<VivlioCssPreprocessOptions['fetchMarkdown']>;

const createFetchMarkdown = () =>
  jest.fn(async (path: string, _ctx?: { basePath?: string }) => (path === '/docs' ? parentMarkdown : null)) as jest.MockedFunction<FetchMarkdown>;

describe('preprocessVivlioCss inheritance directives', () => {
  beforeEach(() => {
    clearVivlioCssCache();
    jest.clearAllMocks();
  });

  const commonOptions = (): VivlioCssPreprocessOptions & { fetchMarkdown: jest.MockedFunction<FetchMarkdown> } => ({
    currentPath: '/docs/child',
    fetchMarkdown: createFetchMarkdown(),
  });

  it('inherits only :root rules including nested contexts', async () => {
    const options = commonOptions();
    const markdown = [
      '# Child',
      '```vivliostylecss',
      '/* #GROWI_INHERIT_:root */',
      '```',
    ].join('\n');

    const result = await preprocessVivlioCss(markdown, options);

    expect(options.fetchMarkdown).toHaveBeenCalledWith('/docs', expect.anything());
    expect(result.userCss).toContain(':root {');
    expect(result.userCss).toContain('--theme-color: red;');
    expect(result.userCss).toContain('@media print');
    expect(result.userCss).toContain('--theme-color: blue;');
    expect(result.userCss).not.toContain('@page');
    expect(result.userCss).not.toContain('font-family:');
    expect(result.userCss).not.toContain('body {');
  });

  it('inherits only @page declarations', async () => {
    const options = commonOptions();
    const markdown = [
      '# Child',
      '```vivliostylecss',
      '/* #GROWI_INHERIT_@page */',
      '```',
    ].join('\n');

    const result = await preprocessVivlioCss(markdown, options);

    expect(result.userCss).toContain('@page {');
    expect(result.userCss).toContain('size: A4;');
    expect(result.userCss).not.toContain(':root');
    expect(result.userCss).not.toContain('font-family:');
  });

  it('inherits only @font-face definitions', async () => {
    const options = commonOptions();
    const markdown = [
      '# Child',
      '```vivliostylecss',
      '/* #GROWI_INHERIT_@font-face */',
      '```',
    ].join('\n');

    const result = await preprocessVivlioCss(markdown, options);

    expect(result.userCss).toContain('@font-face');
    expect(result.userCss).toContain("font-family: 'Example';");
    expect(result.userCss).toContain('src: url(example.woff2)');
    expect(result.userCss).not.toContain(':root {');
    expect(result.userCss).not.toContain('@page');
  });

  it('supports multiple inheritance directives in order', async () => {
    const options = commonOptions();
    const markdown = [
      '# Child',
      '```vivliostylecss',
      '/* #GROWI_INHERIT_:root */',
      '/* #GROWI_INHERIT_@font-face */',
      '```',
    ].join('\n');

    const result = await preprocessVivlioCss(markdown, options);

    const rootIndex = result.userCss.indexOf(':root {');
    const fontFaceIndex = result.userCss.indexOf('@font-face');

    expect(rootIndex).toBeGreaterThanOrEqual(0);
    expect(fontFaceIndex).toBeGreaterThan(rootIndex);
    expect(result.userCss).not.toContain('@page');
    expect(result.userCss).toContain('--theme-color: red;');
    expect(result.userCss).toContain("font-family: 'Example';");
  });

  it('still inherits full CSS when #GROWI_INHERIT_FULL is used', async () => {
    const options = commonOptions();
    const markdown = [
      '# Child',
      '```vivliostylecss',
      '/* #GROWI_INHERIT_FULL */',
      '```',
    ].join('\n');

    const result = await preprocessVivlioCss(markdown, options);

    expect(result.userCss.trim()).toBe(parentCss);
  });

  it('inherits parent CSS when directive is placed in a separate block', async () => {
    const options = commonOptions();
    const markdown = [
      '# Child',
      '```vivliostylecss',
      'body { color: green; }',
      '```',
      '',
      '```vivliostylecss',
      '/* #GROWI_INHERIT_FULL */',
      '```',
    ].join('\n');

    const result = await preprocessVivlioCss(markdown, options);

    expect(result.userCss).toContain('body {');
    expect(result.userCss).toContain('--theme-color: red;');
  });

  it('keeps inherited CSS when directive block also contains local overrides', async () => {
    const options = commonOptions();
    const markdown = [
      '# Child',
      '```vivliostylecss',
      '/* #GROWI_INHERIT_FULL */',
      '/* ======================================================================',
      '   Vivliostyle：A5・縦書き【タイトルブロック最適化版】（レイアウト・要素）',
      '   - :root / @page / @font-face を除いた本体スタイル',
      '   ====================================================================== */',
      '',
      'html { writing-mode: vertical-rl; text-orientation: mixed; }',
      'body { color: green; }',
      '```',
      '',
      '```vivliostylecss',
      'body { font-size: 14px; }',
      '```',
    ].join('\n');

    const result = await preprocessVivlioCss(markdown, options);

    expect(result.rawUserCss).toMatch(/#GROWI_INHERIT_FULL/);
    expect(result.userCss).toContain('--theme-color: red;');
    expect(result.userCss).toContain('writing-mode: vertical-rl;');
    expect(result.userCss).toContain('body { font-size: 14px; }');
  });

  it('merges multiple blocks including inherited CSS seamlessly', async () => {
    const options = commonOptions();
    const markdown = [
      '# Child',
      '```vivliostylecss',
      'body { margin: 0; }',
      '```',
      '',
      '```vivliostylecss',
      '/* #GROWI_INHERIT_FULL */',
      '```',
      '',
      '```vivliostylecss',
      ':root { --child-color: green; }',
      '```',
    ].join('\n');

    const result = await preprocessVivlioCss(markdown, options);

    const pieces = result.userCss.split('\n');
    expect(result.userCss).toContain('body { margin: 0; }');
    expect(result.userCss).toContain('--theme-color: red;');
    expect(result.userCss).toContain(':root { --child-color: green; }');
    // ensure inherited CSS is not lost between blocks
    expect(pieces.length).toBeGreaterThan(0);
  });

  it('does not wrap extracted fragments with @layer', async () => {
    const options = commonOptions();
    const layerFetcher = jest.fn(async (path: string, _ctx?: { basePath?: string }) => {
      if (path === '/docs') {
        return [
          '# Parent',
          '```vivliostylecss',
          '@layer theme {',
          '  :root {',
          '    --theme-color: green;',
          '  }',
          '}',
          '```',
        ].join('\n');
      }
      return null;
    }) as jest.MockedFunction<FetchMarkdown>;
    options.fetchMarkdown = layerFetcher;

    const markdown = [
      '# Child',
      '```vivliostylecss',
      '/* #GROWI_INHERIT_:root */',
      '```',
    ].join('\n');

    const result = await preprocessVivlioCss(markdown, options);

    expect(layerFetcher).toHaveBeenCalled();
    expect(result.userCss).toContain(':root {');
    expect(result.userCss).toContain('--theme-color: green;');
    expect(result.userCss).not.toContain('@layer');
  });
});
