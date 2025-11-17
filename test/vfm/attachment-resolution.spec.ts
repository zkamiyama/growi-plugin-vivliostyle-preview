/**
 * Test for attachment ID resolution in vivliostyle config
 */

import {
  extractAttachmentIdsFromConfig,
  fetchAttachmentMetadata,
  replaceAttachmentLinksInConfig,
  extractGrowiLinksFromConfig,
} from '../../src/vfm/vivlioConfigPreprocessor';

describe('Attachment Resolution', () => {
  describe('extractAttachmentIdsFromConfig', () => {
    it('should extract attachment IDs from string values', () => {
      const config = {
        cover: '[[attachment/68ed00c86ff7c9b2833fd474]]',
      };

      const ids = extractAttachmentIdsFromConfig(config);
      expect(ids).toEqual(['68ed00c86ff7c9b2833fd474']);
    });

    it('should extract attachment IDs from array entries', () => {
      const config = {
        entry: [
          '[[詩集/詩A]]',
          '[[attachment/abc123def456]]',
          '[[attachment/789ghi012jkl]]',
        ],
      };

      const ids = extractAttachmentIdsFromConfig(config);
      expect(ids).toEqual(['abc123def456', '789ghi012jkl']);
    });

    it('should extract attachment IDs from nested objects', () => {
      const config = {
        cover: '[[attachment/cover123]]',
        theme: {
          background: '[[attachment/bg456]]',
        },
        pages: [
          {
            image: '[[attachment/img789]]',
          },
        ],
      };

      const ids = extractAttachmentIdsFromConfig(config);
      expect(ids).toEqual(['cover123', 'bg456', 'img789']);
    });

    it('should handle mixed GROWI links and attachment links', () => {
      const config = {
        entry: [
          '[[詩集/詩A]]',
          '[[attachment/abc123]]',
          '[[/技術/TypeScript]]',
        ],
        cover: '[[attachment/cover456]]',
      };

      const ids = extractAttachmentIdsFromConfig(config);
      expect(ids).toEqual(['abc123', 'cover456']);
    });

    it('should return empty array for config with no attachments', () => {
      const config = {
        entry: ['[[詩集/詩A]]', '[[詩集/詩B]]'],
        title: 'Test Book',
      };

      const ids = extractAttachmentIdsFromConfig(config);
      expect(ids).toEqual([]);
    });
  });

  describe('replaceAttachmentLinksInConfig', () => {
    it('should replace attachment links with filenames', () => {
      const config = {
        cover: '[[attachment/68ed00c86ff7c9b2833fd474]]',
        entry: ['doc.html'],
      };

      const map = new Map([
        ['68ed00c86ff7c9b2833fd474', 'Snipaste_2025-09-06_02-26-21.jpg'],
      ]);

      const result = replaceAttachmentLinksInConfig(config, map);

      expect(result).toEqual({
        cover: 'Snipaste_2025-09-06_02-26-21.jpg',
        entry: ['doc.html'],
      });
    });

    it('should replace multiple attachment links', () => {
      const config = {
        cover: '[[attachment/cover123]]',
        entry: [
          '[[attachment/page1]]',
          '[[attachment/page2]]',
        ],
      };

      const map = new Map([
        ['cover123', 'cover.jpg'],
        ['page1', 'page1.html'],
        ['page2', 'page2.html'],
      ]);

      const result = replaceAttachmentLinksInConfig(config, map);

      expect(result).toEqual({
        cover: 'cover.jpg',
        entry: ['page1.html', 'page2.html'],
      });
    });

    it('should handle nested objects', () => {
      const config = {
        theme: {
          background: '[[attachment/bg123]]',
          logo: '[[attachment/logo456]]',
        },
      };

      const map = new Map([
        ['bg123', 'background.png'],
        ['logo456', 'logo.svg'],
      ]);

      const result = replaceAttachmentLinksInConfig(config, map);

      expect(result).toEqual({
        theme: {
          background: 'background.png',
          logo: 'logo.svg',
        },
      });
    });
  });

  describe('fetchAttachmentMetadata', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('should fetch attachment metadata from GROWI API', async () => {
      const mockResponse = {
        attachment: {
          _id: '68ed00c86ff7c9b2833fd474',
          originalName: 'Snipaste_2025-09-06_02-26-21.jpg',
          fileName: '601b7c59d43a042c0117e08dd37aad0a_image.jpg',
          fileFormat: 'image/jpeg',
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchAttachmentMetadata(
        '68ed00c86ff7c9b2833fd474',
        'https://growi.example.com',
      );

      expect(result).toEqual({
        originalName: 'Snipaste_2025-09-06_02-26-21.jpg',
        fileName: '601b7c59d43a042c0117e08dd37aad0a_image.jpg',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://growi.example.com/_api/v3/attachment/68ed00c86ff7c9b2833fd474',
        expect.objectContaining({
          headers: {},
          credentials: 'same-origin',
        }),
      );
    });

    it('should include authorization header when API token is provided', async () => {
      const mockResponse = {
        attachment: {
          originalName: 'test.jpg',
          fileName: 'test_123.jpg',
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await fetchAttachmentMetadata(
        'abc123',
        'https://growi.example.com',
        'test-api-token',
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://growi.example.com/_api/v3/attachment/abc123',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-api-token',
          },
          credentials: 'same-origin',
        }),
      );
    });

    it('should return null when API returns error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await fetchAttachmentMetadata(
        'nonexistent',
        'https://growi.example.com',
      );

      expect(result).toBeNull();
    });

    it('should return null when attachment data is missing', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ attachment: null }),
      });

      const result = await fetchAttachmentMetadata(
        'invalid',
        'https://growi.example.com',
      );

      expect(result).toBeNull();
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchAttachmentMetadata(
        'test123',
        'https://growi.example.com',
      );

      expect(result).toBeNull();
    });
  });

  describe('extractGrowiLinksFromConfig - attachment exclusion', () => {
    it('should NOT extract [[attachment/...]] as page links', () => {
      const config = {
        entry: [
          '[[詩集/詩A]]',
          '[[詩集/詩B]]',
        ],
        cover: '[[attachment/68ed00c86ff7c9b2833fd474]]',
      };

      const links = extractGrowiLinksFromConfig(config);

      // Should only include page links, NOT attachment links
      expect(links).toEqual(['詩集/詩A', '詩集/詩B']);
      expect(links).not.toContain('attachment/68ed00c86ff7c9b2833fd474');
    });

    it('should handle mixed page links and attachment links correctly', () => {
      const config = {
        entry: [
          '[[Book01/Chapter1]]',
          '[[attachment/abc123]]',
          '[[Book01/Chapter2]]',
        ],
        cover: '[[attachment/cover456]]',
        images: [
          '[[attachment/img1]]',
          '[[attachment/img2]]',
        ],
      };

      const links = extractGrowiLinksFromConfig(config);

      expect(links).toEqual(['Book01/Chapter1', 'Book01/Chapter2']);
      expect(links.length).toBe(2);
    });

    it('should handle config with only attachments (no page links)', () => {
      const config = {
        cover: '[[attachment/cover123]]',
        background: '[[attachment/bg456]]',
      };

      const links = extractGrowiLinksFromConfig(config);

      expect(links).toEqual([]);
    });
  });
});
