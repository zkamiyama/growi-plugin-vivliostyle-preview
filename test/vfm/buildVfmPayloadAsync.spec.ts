import { clearVivlioCssCache } from '../../src/vfm/vivlioCssPreprocessor';
import type { VivlioCssPreprocessOptions } from '../../src/vfm/vivlioCssPreprocessor';

jest.mock('@vivliostyle/vfm', () => ({
  __esModule: true,
  stringify: jest.fn((md: string) => `<html><head></head><body>${md}</body></html>`),
  readMetadata: jest.fn(() => ({})),
}), { virtual: true });

jest.mock('../../src/vfmWorkerClient', () => ({
  createVfmClient: () => ({
    stringify: async (md: string, _opts?: any, _metadata?: unknown) => `<html><head></head><body>${md}</body></html>`,
    terminate: () => {},
    cancelPending: () => {},
  }),
}));

const parentCss = `
:root {
  --theme-color: red;
}

body {
  color: black;
}
`.trim();

const parentMarkdown = `# Parent
\`\`\`vivliostylecss
${parentCss}
\`\`\`
`;

type FetchMarkdown = NonNullable<VivlioCssPreprocessOptions['fetchMarkdown']>;

const createFetchMarkdown = () =>
  jest.fn(async (path: string) => (path === '/docs' ? parentMarkdown : null)) as jest.MockedFunction<FetchMarkdown>;

describe('buildVfmPayloadAsync CSS aggregation', () => {
  let buildVfmPayloadAsync: typeof import('../../src/vfm/buildVfmHtml').buildVfmPayloadAsync;

  beforeAll(async () => {
    const mod = await import('../../src/vfm/buildVfmHtml');
    buildVfmPayloadAsync = mod.buildVfmPayloadAsync;
  });

  beforeEach(() => {
    clearVivlioCssCache();
  });

  it('injects inherited CSS when directive is placed with local overrides', async () => {
    const fetchMarkdown = createFetchMarkdown();
    const markdown = [
      '# Child',
      '```vivliostylecss',
      '/* #GROWI_INHERIT_FULL */',
      'html { writing-mode: vertical-rl; }',
      '```',
      '',
      '```vivliostylecss',
      'body { font-size: 14px; }',
      '```',
    ].join('\n');

    const payload = await buildVfmPayloadAsync(
      markdown,
      {
        vivlioCssOptions: {
          currentPath: '/docs/child',
          fetchMarkdown,
        },
      },
      {
        stringifyLatest: async (md: string, _opts?: any, _metadata?: unknown) => `<html><head></head><body>${md}</body></html>`,
      },
    );

    expect(fetchMarkdown).toHaveBeenCalledWith('/docs', expect.anything());
    expect(payload.userCss).toMatch(/#GROWI_INHERIT_FULL/);
    expect(payload.finalCss).toContain('--theme-color: red;');
    expect(payload.finalCss).toContain('body { font-size: 14px; }');
    expect(payload.html).toContain('--theme-color: red;');
  });
});
