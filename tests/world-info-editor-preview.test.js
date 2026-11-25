// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createWorldInfoEditorPreviewServer } from '../scripts/world-info-editor-preview.mjs';

const prefix = '/scripts/extensions/third-party/TT-Toolkit/';
const server = createWorldInfoEditorPreviewServer();
let baseUrl;
beforeAll(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
});

describe('isolated world info editor preview', () => {
    it('serves the preview entry and the production stylesheet at the iframe URL', async () => {
        const page = await fetch(baseUrl);
        expect(page.status).toBe(200);
        expect(page.headers.get('content-type')).toContain('text/html');
        expect(await page.text()).toContain('只驻内存');

        const css = await fetch(`${baseUrl}${prefix}style.css`);
        expect(css.status).toBe(200);
        expect(css.headers.get('content-type')).toContain('text/css');
        expect(await css.text()).toContain('./src/features/world-info-editor/style.css');
    });

    it('serves current source files directly without cached or copied builds', async () => {
        const response = await fetch(`${baseUrl}${prefix}src/features/world-info-editor/detail-form.js`);
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('content-type')).toContain('text/javascript');
        expect(await response.text()).toBe(await readFile(new URL('../src/features/world-info-editor/detail-form.js', import.meta.url), 'utf8'));
    });

    it.each(['/package.json', `${prefix}package.json`, `${prefix}src/%2e%2e/index.js`, '/missing.js'])('does not expose unrelated files at %s', async pathname => {
        expect((await fetch(baseUrl + pathname)).status).toBe(404);
    });

    it('rejects malformed URL encoding without taking down the server', async () => {
        expect((await fetch(`${baseUrl}/%ZZ`)).status).toBe(400);
        expect((await fetch(baseUrl)).status).toBe(200);
    });

    it('does not accept writes through HTTP', async () => {
        const response = await fetch(baseUrl, { method: 'POST', body: 'sample' });
        expect(response.status).toBe(405);
        expect(response.headers.get('allow')).toBe('GET, HEAD');
    });
});
