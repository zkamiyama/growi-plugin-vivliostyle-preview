jest.mock('@vivliostyle/vfm', () => ({
	__esModule: true,
	stringify: jest.fn((md: string, _opts?: unknown, metadata?: any) => {
		const lang = metadata?.lang ?? 'ja';
		const title = metadata?.title ?? 'Preview';
		const metaTags = Array.isArray(metadata?.meta)
			? metadata.meta
					.map((entry: any) => `<meta name="${entry.name}" content="${entry.content}" />`)
					.join('')
			: '';
		return `<!doctype html><html lang="${lang}"><head><title>${title}</title>${metaTags}</head><body>${md}</body></html>`;
	}),
	readMetadata: jest.fn(() => ({
		title: 'Frontmatter Title',
		lang: 'en',
		meta: [
			{ name: 'description', content: 'Sample description' },
		],
	})),
}), { virtual: true });

const { buildVfmHtml, buildVfmPayload } = jest.requireActual('../../src/vfm/buildVfmHtml');

describe('buildVfmHtml frontmatter handling', () => {
	const markdownWithFrontmatter = [
		'---',
		'title: Frontmatter Title',
		'lang: en',
		'meta:',
		'  - name: description',
		'    content: Sample description',
		'---',
		'',
		'# Heading',
		'',
		'本文',
	].join('\n');

	it('applies frontmatter metadata to generated HTML', () => {
		const html = buildVfmHtml(markdownWithFrontmatter, { language: 'ja' });

		expect(html).toContain('<title>Frontmatter Title</title>');
		expect(html).toContain('<html lang="en"');
		expect(html).toContain('<meta name="description" content="Sample description"');
		expect(html).not.toMatch(/title:\s*Frontmatter Title/);
		expect(html).not.toMatch(/---/);
	});

	it('removes frontmatter from payload markdown and html body', () => {
		const payload = buildVfmPayload(markdownWithFrontmatter, { language: 'ja' });

		expect(payload.rawMarkdown).not.toMatch(/^---/);
		expect(payload.rawMarkdown).not.toContain('title: Frontmatter Title');
		expect(payload.html).not.toMatch(/title:\s*Frontmatter Title/);
		expect(payload.html).toContain('<title>Frontmatter Title</title>');
	});
});

describe('title-block header extraction', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('derives document title from header title and author', () => {
		const markdown = [
			'<header class="title-block">',
			'  <h1 class="title">作品タイトルA</h1>',
			'  <p class="subtitle">副題</p>',
			'  <p class="author">著者名</p>',
			'</header>',
			'',
			'本文',
		].join('\n');

		const html = buildVfmHtml(markdown, { language: 'ja' });

		expect(html).toContain('<title>作品タイトルA　著者名</title>');
	});

	it('falls back to title alone when author is missing', () => {
		const markdown = [
			'<header class="title-block">',
			'  <h1 class="title">作品タイトルB</h1>',
			'</header>',
			'',
			'本文',
		].join('\n');

		const html = buildVfmHtml(markdown, { language: 'ja' });

		expect(html).toContain('<title>作品タイトルB</title>');
	});

	it('propagates derived title to buildVfmPayload output', () => {
		const markdown = [
			'<header class="title-block">',
			'  <h1 class="title">作品タイトルC</h1>',
			'  <p class="author">著者名C</p>',
			'</header>',
			'',
			'本文',
		].join('\n');

		const payload = buildVfmPayload(markdown, { language: 'ja' });

		expect(payload.html).toContain('<title>作品タイトルC　著者名C</title>');
		const { stringify } = jest.requireMock('@vivliostyle/vfm') as { stringify: jest.Mock };
		const lastCall = stringify.mock.calls[stringify.mock.calls.length - 1];
		expect(lastCall?.[1]).toEqual(expect.objectContaining({ title: '作品タイトルC　著者名C' }));
	});
});
