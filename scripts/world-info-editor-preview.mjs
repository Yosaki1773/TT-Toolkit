import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const previewRoot = fileURLToPath(new URL('./world-info-editor-preview/', import.meta.url));
const prefix = '/scripts/extensions/third-party/TT-Toolkit/';
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

export function createWorldInfoEditorPreviewServer() {
    return http.createServer(async (request, response) => {
        if (!['GET', 'HEAD'].includes(request.method)) {
            response.writeHead(405, { Allow: 'GET, HEAD' }).end();
            return;
        }
        let pathname;
        try {
            pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        } catch {
            response.writeHead(400).end('Invalid URL');
            return;
        }
        let file;
        if (pathname === '/' || pathname === '/index.html') {
            file = path.join(previewRoot, 'index.html');
        } else if (pathname === '/app.js') {
            file = path.join(previewRoot, 'app.js');
        } else if (pathname.startsWith(prefix)) {
            const relative = pathname.slice(prefix.length);
            // 只提供运行时源码和样式，不暴露仓库配置、个人文件或开发资产。
            if (['style.css', 'manifest.json'].includes(relative)
                || /^src\/(?:[\w-]+\/)*[\w-]+\.(?:js|css)$/.test(relative)) {
                file = path.join(projectRoot, relative);
            }
        }
        if (!file) {
            response.writeHead(404).end('Not found');
            return;
        }
        try {
            const data = await readFile(file);
            response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)], 'Cache-Control': 'no-store' });
            response.end(request.method === 'HEAD' ? undefined : data);
        } catch (error) {
            response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Unable to read preview asset');
        }
    });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
    const port = Number(process.argv[2] ?? 4173);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        console.error('端口必须是 0 到 65535 之间的整数。');
        process.exitCode = 1;
    } else {
        const server = createWorldInfoEditorPreviewServer();
        server.on('error', error => {
            console.error(error.code === 'EADDRINUSE'
                ? `端口 ${port} 已被占用，可运行 npm run preview:world-info-editor -- 4174。`
                : error.message);
            process.exitCode = 1;
        });
        server.listen(port, '127.0.0.1', () => {
            console.log(`世界书隔离验证：http://127.0.0.1:${server.address().port}/`);
            console.log('80 条示例只驻内存；刷新页面重置；不连接 TauriTavern。按 Ctrl+C 停止。');
        });
    }
}
