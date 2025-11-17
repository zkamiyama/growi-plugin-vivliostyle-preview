import type { VivlioConfigInfo } from '../../src/vfm/vivlioConfigPreprocessor';
import { collectEntryTemplateInfos, stripTemplateFieldFromEntries } from '../../src/vfm/vivlioConfigPreprocessor';
import { processConfigWithGrowiLinks } from '../../src/vfm/configEntryProcessor';
import type { GrowiContext } from '../../src/utils/growi';

jest.mock('jszip', () => {
  class MockJSZip {
    files: Record<string, unknown> = {};
    file(name: string, data: unknown, options?: unknown) {
      this.files[name] = { data, options };
    }
    async generateAsync() {
      return { size: 0 };
    }
  }
  return { __esModule: true, default: MockJSZip };
});

jest.mock('../../src/vfm/buildVfmHtml', () => ({
  buildVfmPayloadAsync: jest.fn(async () => ({
    html: '<!DOCTYPE html><html><body>template</body></html>',
  })),
}));

jest.mock('../../src/utils/attachmentCollector', () => ({
  collectAttachmentsForHtml: jest.fn(async (html: string) => ({
    html,
    assets: [],
  })),
}));

jest.mock('../../src/vfmWorkerClient', () => ({
  getSharedVfmClient: jest.fn(async () => ({})),
}));

describe('Entry template helpers', () => {
  beforeAll(() => {
    // Provide fetch to satisfy code paths that might rely on it.
    if (!(global as any).fetch) {
      (global as any).fetch = jest.fn();
    }
  });

  it('collects template infos with sanitised targets', () => {
    const config = {
      entry: [
        {
          path: 'templates/cover-template.html',
          template: '[[/books/templates/cover]]',
          rel: 'cover',
          output: 'cover.html',
        },
      ],
    };

    const infos = collectEntryTemplateInfos(config);
    expect(infos).toHaveLength(1);
    expect(infos[0]).toMatchObject({
      entryIndex: 0,
      link: '/books/templates/cover',
      targetPath: 'templates/cover-template.html',
    });
  });

  it('strips template directive from processed config', () => {
    const parsedConfig: any = {
      entry: [
        {
          path: 'templates/cover-template.html',
          template: 'templates/cover-template.html',
          rel: 'cover',
          output: 'cover.html',
        },
      ],
    };
    const infos = [
      { entryIndex: 0, link: '/books/templates/cover', targetPath: 'templates/cover-template.html' },
    ];

    stripTemplateFieldFromEntries(parsedConfig, infos);
    expect(parsedConfig.entry[0].template).toBeUndefined();
  });
});

describe('processConfigWithGrowiLinks template integration', () => {
  const context: GrowiContext = {
    origin: 'https://growi.example.com',
    basePath: '',
    pagePath: '/books/index',
    pageId: 'page1',
    pageTitle: 'Test',
    apiToken: null,
  };

  const rawConfig = JSON.stringify({
    entry: [
      {
        path: 'templates/custom-cover.html',
        template: '[[/books/templates/cover]]',
        output: 'cover.html',
        rel: 'cover',
      },
    ],
  }, null, 2);

  const parsedConfig = JSON.parse(rawConfig);

  const configInfo: VivlioConfigInfo = {
    source: 'embedded',
    raw: rawConfig,
    parsed: parsedConfig,
    parseError: null,
    format: 'json',
  };

  it('uses template override for resolved entry paths and cleans template field', async () => {
    const fetchMarkdown = jest.fn(async () => '# Cover Page\n\n<img role="doc-cover" src="cover.png" />');

    const result = await processConfigWithGrowiLinks(configInfo, context, {
      fetchMarkdown,
    });

    expect(fetchMarkdown).toHaveBeenCalledWith('/books/templates/cover');
    expect(result.resolvedEntries).toHaveLength(1);
    expect(result.resolvedEntries[0].localPath).toBe('templates/custom-cover.html');
    expect(result.resolvedEntries[0].growiPath).toBe('/books/templates/cover');

    const processedEntry = Array.isArray(result.processedConfig.parsed?.entry)
      ? result.processedConfig.parsed.entry[0]
      : null;
    expect(processedEntry).toBeTruthy();
    if (processedEntry) {
      expect(processedEntry.path).toBe('templates/custom-cover.html');
      expect(processedEntry.template).toBeUndefined();
      expect(processedEntry.rel).toBe('cover');
      expect(processedEntry.output).toBe('cover.html');
    }
  });

  it('supports template override for TOC entries', async () => {
    const tocConfig: VivlioConfigInfo = {
      source: 'embedded',
      raw: JSON.stringify({
        entry: [
          {
            path: 'templates/toc-template.html',
            template: '[[/books/templates/toc]]',
            output: 'index.html',
            rel: 'contents',
          },
        ],
      }, null, 2),
      parsed: null,
      parseError: null,
      format: 'json',
    };

    tocConfig.parsed = JSON.parse(tocConfig.raw);

    const fetchMarkdown = jest.fn(async () => '# TOC\n\n- Entry');

    const result = await processConfigWithGrowiLinks(tocConfig, context, { fetchMarkdown });

    expect(fetchMarkdown).toHaveBeenCalledWith('/books/templates/toc');
    expect(result.resolvedEntries).toHaveLength(1);
    const entry = result.resolvedEntries[0];
    expect(entry.localPath).toBe('templates/toc-template.html');
    expect(entry.growiPath).toBe('/books/templates/toc');

    const processedEntry = Array.isArray(result.processedConfig.parsed?.entry)
      ? result.processedConfig.parsed.entry[0]
      : null;
    expect(processedEntry).toBeTruthy();
    if (processedEntry) {
      expect(processedEntry.path).toBe('templates/toc-template.html');
      expect(processedEntry.template).toBeUndefined();
      expect(processedEntry.rel).toBe('contents');
      expect(processedEntry.output).toBe('index.html');
    }
  });
});
