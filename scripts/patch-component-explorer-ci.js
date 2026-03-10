/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('node:fs');
const path = require('node:path');

function replaceOrThrow(source, search, replacement, description) {
	if (source.includes(replacement)) {
		return { source, changed: false, alreadyPatched: true };
	}

	if (!source.includes(search)) {
		throw new Error(`Expected to find ${description} while patching component explorer CI support.`);
	}

	return { source: source.replace(search, replacement), changed: true, alreadyPatched: false };
}

function countRegexMatches(source, regex) {
	return [...source.matchAll(new RegExp(regex.source, regex.flags))].length;
}

function patchFile(filePath, patches) {
	let source = fs.readFileSync(filePath, 'utf8');
	let changed = false;
	let alreadyPatched = true;

	for (const patch of patches) {
		const result = replaceOrThrow(source, patch.search, patch.replacement, patch.description);
		source = result.source;
		changed = changed || result.changed;
		alreadyPatched = alreadyPatched && result.alreadyPatched;
	}

	if (changed) {
		fs.writeFileSync(filePath, source);
		console.log(`Patched ${path.relative(process.cwd(), filePath)}`);
	} else if (alreadyPatched) {
		console.log(`Already patched ${path.relative(process.cwd(), filePath)}`);
	}
}

const browserPagePath = path.join(process.cwd(), 'node_modules', '@vscode', 'component-explorer-cli', 'dist', 'browserPage.js');
patchFile(browserPagePath, [{
	description: 'browser page creation and navigation strategy',
	search: `        const page = await this._browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        return new PlaywrightBrowserPage(page);`,
	replacement: `        const page = await this._browser.newPage();
        page.on('console', msg => {
            console.log(\`[component-explorer:console:\${msg.type()}] \${msg.text()}\`);
        });
        page.on('pageerror', err => {
            console.log(\`[component-explorer:pageerror] \${err?.stack ?? err}\`);
        });
        page.on('requestfailed', request => {
            const errorText = request.failure()?.errorText ?? 'unknown';
            console.log(\`[component-explorer:requestfailed] \${request.url()} (\${errorText})\`);
        });
        page.on('response', response => {
            if (response.status() >= 400) {
                console.log(\`[component-explorer:response:\${response.status()}] \${response.url()}\`);
            }
        });
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        return new PlaywrightBrowserPage(page);`
}]);

const componentExplorerPath = path.join(process.cwd(), 'node_modules', '@vscode', 'component-explorer-cli', 'dist', 'componentExplorer.js');
patchFile(componentExplorerPath, [{
	description: 'CLI API initialization wait loop',
	search: `        await page.evaluateJs(\`
\t\t\tnew Promise(resolve => {
\t\t\t\tfunction check() {
\t\t\t\t\tif (window.__componentExplorerCli__) resolve();
\t\t\t\t\telse setTimeout(check, 50);
\t\t\t\t}
\t\t\t\tcheck();
\t\t\t})
\t\t\`);`,
	replacement: `        await page.evaluateJs(\`
\t\t\tnew Promise((resolve, reject) => {
\t\t\t\tconst startedAt = Date.now();
\t\t\t\tfunction check() {
\t\t\t\t\tif (window.__componentExplorerCli__) {
\t\t\t\t\t\tresolve();
\t\t\t\t\t\treturn;
\t\t\t\t\t}
\t\t\t\t\tif (Date.now() - startedAt > 30000) {
\t\t\t\t\t\tconst root = document.getElementById('root');
\t\t\t\t\t\treject(new Error(
\t\t\t\t\t\t\t'Timeout waiting for __componentExplorerCli__ to initialize ' +
\t\t\t\t\t\t\tJSON.stringify({
\t\t\t\t\t\t\t\turl: location.href,
\t\t\t\t\t\t\t\treadyState: document.readyState,
\t\t\t\t\t\t\t\ttitle: document.title,
\t\t\t\t\t\t\t\trootChildCount: root?.childElementCount ?? -1,
\t\t\t\t\t\t\t\tbodyText: document.body?.innerText?.slice(0, 500) ?? ''
\t\t\t\t\t\t\t})
\t\t\t\t\t\t));
\t\t\t\t\t\treturn;
\t\t\t\t\t}
\t\t\t\t\tsetTimeout(check, 50);
\t\t\t\t}
\t\t\t\tcheck();
\t\t\t})
\t\t\`);`
}]);

const viewerCandidates = [
	path.join(process.cwd(), 'build', 'vite', 'node_modules', '@vscode', 'component-explorer', 'dist', 'viewer.js'),
	path.join(process.cwd(), 'node_modules', '@vscode', 'component-explorer', 'dist', 'viewer.js'),
];

const unpatchedFixtureRegistryLoopRegex = /(^[ \t]*)for \(const \[(\w+), (\w+)\] of Object\.entries\(([^)\r\n]+)\)\) \{\r?\n([ \t]*)const (\w+) = \3\.default;\r?\n([ \t]*)\6 && typeof \6 == "object" && ([^;\r\n]+(?:\.register|\.set)\(\2, \6\));\r?\n\1\}/gm;
const patchedFixtureRegistryLoopRegex = /(^[ \t]*)for \(const \[(\w+), (\w+)\] of Object\.entries\(([^)\r\n]+)\)\) \{\r?\n([ \t]*)if \(!\3\) \{\r?\n[ \t]*console\.error\("\[component-explorer\] Fixture module was undefined:", \2\);\r?\n[ \t]*continue;\r?\n\5\}\r?\n\5const (\w+) = \3\.default;\r?\n[ \t]*\6 && typeof \6 == "object" && ([^;\r\n]+(?:\.register|\.set)\(\2, \6\));\r?\n\1\}/gm;

function patchViewerRegistryGuards(viewerPath) {
	const source = fs.readFileSync(viewerPath, 'utf8');
	const newline = source.includes('\r\n') ? '\r\n' : '\n';
	const totalLoopCount = countRegexMatches(source, unpatchedFixtureRegistryLoopRegex) + countRegexMatches(source, patchedFixtureRegistryLoopRegex);

	if (totalLoopCount === 0) {
		throw new Error(`Expected to find fixture registry population guard while patching ${path.relative(process.cwd(), viewerPath)}.`);
	}

	const patchedSource = source.replace(unpatchedFixtureRegistryLoopRegex, (_, indent, keyName, moduleName, entriesExpr, bodyIndent, valueName, valueCheckIndent, registryTarget) => [
		`${indent}for (const [${keyName}, ${moduleName}] of Object.entries(${entriesExpr})) {`,
		`${bodyIndent}if (!${moduleName}) {`,
		`${bodyIndent}  console.error("[component-explorer] Fixture module was undefined:", ${keyName});`,
		`${bodyIndent}  continue;`,
		`${bodyIndent}}`,
		`${bodyIndent}const ${valueName} = ${moduleName}.default;`,
		`${valueCheckIndent}${valueName} && typeof ${valueName} == "object" && ${registryTarget};`,
		`${indent}}`
	].join(newline));

	const remainingUnpatchedLoopCount = countRegexMatches(patchedSource, unpatchedFixtureRegistryLoopRegex);
	const patchedLoopCount = countRegexMatches(patchedSource, patchedFixtureRegistryLoopRegex);

	if (remainingUnpatchedLoopCount > 0 || patchedLoopCount !== totalLoopCount) {
		throw new Error(`Expected to patch every fixture registry population guard in ${path.relative(process.cwd(), viewerPath)}.`);
	}

	if (patchedSource === source) {
		console.log(`Already patched ${path.relative(process.cwd(), viewerPath)}`);
		return;
	}

	fs.writeFileSync(viewerPath, patchedSource);
	console.log(`Patched ${path.relative(process.cwd(), viewerPath)}`);
}

for (const viewerPath of viewerCandidates) {
	if (!fs.existsSync(viewerPath)) {
		continue;
	}

	patchViewerRegistryGuards(viewerPath);
}
