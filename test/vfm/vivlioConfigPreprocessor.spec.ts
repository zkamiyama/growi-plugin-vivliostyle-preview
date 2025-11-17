/**
 * Tests for vivlioConfigPreprocessor - GROWI link detection and resolution
 */

import {
  extractVivlioConfig,
  resolveVivlioConfig,
  containsGrowiLink,
  resolveGrowiLinkPath,
  extractGrowiLinksFromConfig,
  generateLocalPathFromGrowiPath,
  replaceGrowiLinksInConfig,
} from '../../src/vfm/vivlioConfigPreprocessor';

describe('extractVivlioConfig', () => {
  it('supports code fences tagged as ```vivliostyleconfig.javascript```', () => {
    const markdown = [
      '# Title',
      '```vivliostyleconfig.javascript',
      'module.exports = {',
      "  title: 'JS config',",
      "  entry: ['index.md'],",
      '};',
      '```',
      '',
      'Body content',
    ].join('\n');

    const extraction = extractVivlioConfig(markdown);
    expect(extraction.rawConfig).toContain('module.exports');
    expect(extraction.markdown).not.toContain('vivliostyleconfig.javascript');

    const resolved = resolveVivlioConfig(extraction.rawConfig);
    expect(resolved.source).toBe('embedded');
    expect(resolved.parseError).toBeNull();
    expect(resolved.parsed).toEqual({
      title: 'JS config',
      entry: ['index.md'],
    });
  });

  it('supports code fences tagged as ```vivliostyleconfig.json```', () => {
    const markdown = [
      'Intro text',
      '```vivliostyleconfig.json',
      '{',
      '  "title": "JSON config",',
      '  "toc": false',
      '}',
      '```',
      'Outro',
    ].join('\n');

    const extraction = extractVivlioConfig(markdown);
    expect(extraction.rawConfig).toContain('"title": "JSON config"');
    expect(extraction.markdown).not.toContain('vivliostyleconfig.json');

    const resolved = resolveVivlioConfig(extraction.rawConfig);
    expect(resolved.source).toBe('embedded');
    expect(resolved.parseError).toBeNull();
    expect(resolved.parsed).toEqual({
      title: 'JSON config',
      toc: false,
    });
  });

  it('removes indented vivliostyleconfig fences from the rendered markdown', () => {
    const markdown = [
      'Intro text',
      '    ```vivliostyleconfig',
      '{ "title": "Indented" }',
      '    ```',
      '',
      'Body content',
    ].join('\n');

    const extraction = extractVivlioConfig(markdown);
    expect(extraction.rawConfig).toContain('"title": "Indented"');
    expect(extraction.markdown).toContain('Intro text');
    expect(extraction.markdown).toContain('Body content');
    expect(extraction.markdown).not.toContain('vivliostyleconfig');
  });
});

describe('vivlioConfigPreprocessor - GROWI Links', () => {
  describe('containsGrowiLink', () => {
    it('should detect [[...]] notation', () => {
      expect(containsGrowiLink('[[詩集/詩A]]')).toBe(true);
      expect(containsGrowiLink('text [[link]] more')).toBe(true);
      expect(containsGrowiLink('[[/absolute/path]]')).toBe(true);
    });

    it('should return false for non-link strings', () => {
      expect(containsGrowiLink('normal text')).toBe(false);
      expect(containsGrowiLink('[single bracket]')).toBe(false);
      expect(containsGrowiLink('[ [ space ] ]')).toBe(false);
      expect(containsGrowiLink('')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(containsGrowiLink('[[]]')).toBe(true); // empty link
      expect(containsGrowiLink('[[]')).toBe(false); // unmatched
      expect(containsGrowiLink(null as any)).toBe(false);
      expect(containsGrowiLink(123 as any)).toBe(false);
    });
  });

  describe('resolveGrowiLinkPath', () => {
    it('should resolve relative paths from current page (not parent)', () => {
      // [[詩集/詩A]] from /技術/日記 -> /技術/日記/詩集/詩A
      expect(resolveGrowiLinkPath('詩集/詩A', '/技術/日記'))
        .toBe('/技術/日記/詩集/詩A');
      
      // [[subfolder/page]] from /parent/current -> /parent/current/subfolder/page
      expect(resolveGrowiLinkPath('subfolder/page', '/parent/current'))
        .toBe('/parent/current/subfolder/page');
    });

    it('should handle absolute paths', () => {
      expect(resolveGrowiLinkPath('/詩集/詩A', '/技術/日記'))
        .toBe('/詩集/詩A');
      
      expect(resolveGrowiLinkPath('/absolute', '/any/path'))
        .toBe('/absolute');
    });

    it('should handle root page context', () => {
      expect(resolveGrowiLinkPath('詩集/詩A', '/'))
        .toBe('/詩集/詩A');
      
      expect(resolveGrowiLinkPath('page', '/'))
        .toBe('/page');
    });

    it('should handle null/empty current path', () => {
      expect(resolveGrowiLinkPath('詩集/詩A', null))
        .toBe('/詩集/詩A');
      
      expect(resolveGrowiLinkPath('page', ''))
        .toBe('/page');
    });

    it('should trim whitespace', () => {
      expect(resolveGrowiLinkPath('  詩集/詩A  ', '/技術'))
        .toBe('/技術/詩集/詩A');
    });

    it('should handle single segment paths', () => {
      // [[詩A]] from /技術 -> /技術/詩A
      expect(resolveGrowiLinkPath('詩A', '/技術'))
        .toBe('/技術/詩A');
    });
  });

  describe('extractGrowiLinksFromConfig', () => {
    it('should extract from string', () => {
      const result = extractGrowiLinksFromConfig('[[詩集/詩A]]');
      expect(result).toEqual(['詩集/詩A']);
    });

    it('should extract multiple links', () => {
      const result = extractGrowiLinksFromConfig('[[詩A]] and [[詩B]]');
      expect(result).toEqual(['詩A', '詩B']);
    });

    it('should extract from array', () => {
      const result = extractGrowiLinksFromConfig([
        '[[詩集/詩A]]',
        '[[詩集/詩B]]',
      ]);
      expect(result).toEqual(['詩集/詩A', '詩集/詩B']);
    });

    it('should extract from nested object', () => {
      const config = {
        entry: ['[[詩集/詩A]]', '[[詩集/詩B]]'],
        toc: {
          title: 'Contents',
          theme: '[[テーマ/詩]]',
        },
      };
      const result = extractGrowiLinksFromConfig(config);
      expect(result).toEqual(['詩集/詩A', '詩集/詩B', 'テーマ/詩']);
    });

    it('should handle deep nesting', () => {
      const config = {
        level1: {
          level2: {
            level3: ['[[deep/link]]'],
          },
        },
      };
      const result = extractGrowiLinksFromConfig(config);
      expect(result).toEqual(['deep/link']);
    });

    it('should handle empty inputs', () => {
      expect(extractGrowiLinksFromConfig('')).toEqual([]);
      expect(extractGrowiLinksFromConfig([])).toEqual([]);
      expect(extractGrowiLinksFromConfig({})).toEqual([]);
      expect(extractGrowiLinksFromConfig(null)).toEqual([]);
    });

    it('should handle mixed content', () => {
      const config = {
        entry: ['normal.html', '[[wiki/page]]', 'other.html'],
        title: 'My Book [[with/link]]',
      };
      const result = extractGrowiLinksFromConfig(config);
      expect(result).toEqual(['wiki/page', 'with/link']);
    });
  });

  describe('generateLocalPathFromGrowiPath', () => {
    it('should convert GROWI path to safe filename (flat hierarchy)', () => {
      expect(generateLocalPathFromGrowiPath('/詩集/詩A'))
        .toBe('詩集_詩A.html');
      
      expect(generateLocalPathFromGrowiPath('/技術/TypeScript'))
        .toBe('技術_TypeScript.html');
    });

    it('should handle paths without leading slash', () => {
      expect(generateLocalPathFromGrowiPath('詩集/詩A'))
        .toBe('詩集_詩A.html');
    });

    it('should sanitize unsafe characters', () => {
      expect(generateLocalPathFromGrowiPath('/path/with:special|chars'))
        .toBe('path_with-special-chars.html');
      
      expect(generateLocalPathFromGrowiPath('/file<>name'))
        .toBe('file--name.html');
    });

    it('should handle root path', () => {
      expect(generateLocalPathFromGrowiPath('/'))
        .toBe('page.html');
    });

    it('should handle empty path', () => {
      expect(generateLocalPathFromGrowiPath(''))
        .toBe('page.html');
    });

    it('should handle deep nesting', () => {
      expect(generateLocalPathFromGrowiPath('/a/b/c/d/e'))
        .toBe('a_b_c_d_e.html');
    });
  });

  describe('replaceGrowiLinksInConfig', () => {
    const linkMap = new Map([
      ['詩集/詩A', '詩集_詩A.html'],
      ['詩集/詩B', '詩集_詩B.html'],
      ['テーマ/詩', 'テーマ_詩.html'],
    ]);

    it('should replace in string', () => {
      const result = replaceGrowiLinksInConfig(
        '[[詩集/詩A]]',
        linkMap
      );
      expect(result).toBe('詩集_詩A.html');
    });

    it('should replace multiple occurrences', () => {
      const result = replaceGrowiLinksInConfig(
        '[[詩集/詩A]] and [[詩集/詩B]]',
        linkMap
      );
      expect(result).toBe('詩集_詩A.html and 詩集_詩B.html');
    });

    it('should replace in array', () => {
      const result = replaceGrowiLinksInConfig(
        ['[[詩集/詩A]]', '[[詩集/詩B]]'],
        linkMap
      );
      expect(result).toEqual([
        '詩集_詩A.html',
        '詩集_詩B.html',
      ]);
    });

    it('should replace in object', () => {
      const config = {
        entry: ['[[詩集/詩A]]', '[[詩集/詩B]]'],
        theme: '[[テーマ/詩]]',
      };
      const result = replaceGrowiLinksInConfig(config, linkMap) as any;
      
      expect(result.entry).toEqual([
        '詩集_詩A.html',
        '詩集_詩B.html',
      ]);
      expect(result.theme).toBe('テーマ_詩.html');
    });

    it('should handle nested structures', () => {
      const config = {
        publications: [
          {
            title: '第一巻',
            entry: ['[[詩集/詩A]]'],
          },
          {
            title: '第二巻',
            entry: ['[[詩集/詩B]]'],
          },
        ],
      };
      const result = replaceGrowiLinksInConfig(config, linkMap) as any;
      
      expect(result.publications[0].entry[0]).toBe('詩集_詩A.html');
      expect(result.publications[1].entry[0]).toBe('詩集_詩B.html');
    });

    it('should preserve non-link content', () => {
      const config = {
        entry: ['normal.html', '[[詩集/詩A]]', 'other.html'],
        title: 'My Book',
      };
      const result = replaceGrowiLinksInConfig(config, linkMap) as any;
      
      expect(result.entry).toEqual([
        'normal.html',
        '詩集_詩A.html',
        'other.html',
      ]);
      expect(result.title).toBe('My Book');
    });

    it('should handle empty map', () => {
      const result = replaceGrowiLinksInConfig(
        '[[詩集/詩A]]',
        new Map()
      );
      expect(result).toBe('[[詩集/詩A]]'); // unchanged
    });

    it('should handle non-matching links', () => {
      const result = replaceGrowiLinksInConfig(
        '[[unknown/link]]',
        linkMap
      );
      expect(result).toBe('[[unknown/link]]'); // unchanged
    });

    it('should handle special regex characters in links', () => {
      const specialMap = new Map([
        ['path.with.dots', 'path_with_dots.html'],
        ['path[with]brackets', 'path_with_brackets.html'],
      ]);
      
      const result = replaceGrowiLinksInConfig(
        '[[path.with.dots]] [[path[with]brackets]]',
        specialMap
      );
      expect(result).toBe('path_with_dots.html path_with_brackets.html');
    });
  });

  describe('Integration: Full workflow', () => {
    it('should process complete config', () => {
      const currentPath = '/技術/日記';
      const configInput = {
        title: '詩集',
        entry: ['[[詩集/詩A]]', '[[詩集/詩B]]', '[[/絶対/パス]]'],
        toc: true,
      };

      // 1. Extract links
      const links = extractGrowiLinksFromConfig(configInput);
      expect(links).toEqual(['詩集/詩A', '詩集/詩B', '/絶対/パス']);

      // 2. Resolve paths
      const resolved = links.map((link: string) => ({
        original: link,
        growiPath: resolveGrowiLinkPath(link, currentPath),
        localPath: generateLocalPathFromGrowiPath(
          resolveGrowiLinkPath(link, currentPath)
        ),
      }));

      expect(resolved).toEqual([
        {
          original: '詩集/詩A',
          growiPath: '/技術/日記/詩集/詩A',
          localPath: '技術_日記_詩集_詩A.html',
        },
        {
          original: '詩集/詩B',
          growiPath: '/技術/日記/詩集/詩B',
          localPath: '技術_日記_詩集_詩B.html',
        },
        {
          original: '/絶対/パス',
          growiPath: '/絶対/パス',
          localPath: '絶対_パス.html',
        },
      ]);

      // 3. Build map
      const linkMap = new Map(
        resolved.map((r: any) => [r.original, r.localPath])
      );

      // 4. Replace in config
      const result = replaceGrowiLinksInConfig(configInput, linkMap) as any;

      expect(result).toEqual({
        title: '詩集',
        entry: [
          '技術_日記_詩集_詩A.html',
          '技術_日記_詩集_詩B.html',
          '絶対_パス.html',
        ],
        toc: true,
      });
    });
  });
});
