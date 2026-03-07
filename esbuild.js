const fs = require("fs");
const path = require("path");

const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const copyHtmlPlugin = {
	name: 'copy-html',
	setup(build) {
		build.onEnd(() => {
			try {
				const src = path.join(__dirname, 'src', 'webview', 'index.html');
				const dest = path.join(__dirname, 'dist', 'index.html');
				fs.copyFileSync(src, dest);
				console.log('[copy-html] index.html copied to dist');
			} catch (err) {
				console.error('[copy-html] error copying index.html:', err);
			}
		});
	},
};

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const extensionCtx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		define: {
			'PACKAGE_VERSION': '"3.2.1"'
		},
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});

	const webviewCtx = await esbuild.context({
		entryPoints: [
			'src/webview/main.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/webview.js',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
			copyHtmlPlugin,
		],
	});

	if (watch) {
		await Promise.all([
			extensionCtx.watch(),
			webviewCtx.watch()
		]);
	} else {
		await Promise.all([
			extensionCtx.rebuild(),
			webviewCtx.rebuild()
		]);
		await Promise.all([
			extensionCtx.dispose(),
			webviewCtx.dispose()
		]);
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
