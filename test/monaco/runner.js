/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const http = require('http');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 8563;
const ROOT_DIR = __dirname;
const MIME_TYPES = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
};

const server = http.createServer((request, response) => {
	const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
	const relativePath = requestUrl.pathname === '/' ? '/dist/core.html' : requestUrl.pathname;
	const resolvedPath = path.resolve(ROOT_DIR, `.${relativePath}`);

	if (!resolvedPath.startsWith(ROOT_DIR)) {
		response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
		response.end('Forbidden');
		return;
	}

	fs.readFile(resolvedPath, (error, data) => {
		if (error) {
			const statusCode = error.code === 'ENOENT' ? 404 : 500;
			response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
			response.end(statusCode === 404 ? 'Not found' : 'Internal server error');
			return;
		}

		const extension = path.extname(resolvedPath);
		const contentType = MIME_TYPES[extension] || 'application/octet-stream';
		response.writeHead(200, { 'Content-Type': contentType });
		response.end(data);
	});
});

server.listen(PORT, '127.0.0.1', () => {
	runTests().then(() => {
		console.log(`All good`);
		process.exit(0);
	}, (err) => {
		console.error(err);
		process.exit(1);
	});
});

function runTests() {
	return (
		runTest('chromium')
			.then(() => runTest('firefox'))
			// .then(() => runTest('webkit'))
	);
}

function runTest(browser) {
	return new Promise((resolve, reject) => {
		const proc = cp.spawn('node', ['../../node_modules/mocha/bin/mocha', 'out/*.test.js', '--headless'], {
			env: { BROWSER: browser, ...process.env },
			stdio: 'inherit'
		});
		proc.on('error', reject);
		proc.on('exit', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(code);
			}
		});
	});
}
