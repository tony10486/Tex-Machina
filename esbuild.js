const esbuild = require("esbuild");
const packageJson = require("./package.json");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

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
	const ctx = await esbuild.context({
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
			'PACKAGE_VERSION': JSON.stringify(packageJson.version)
		},
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

/**
 * 웹뷰용 Three.js 3D 플롯 렌더러 번들 (Phase 0.2)
 *
 * - 엔트리: src/ui/plot3d/index.ts (웹뷰 inline 스크립트가 아니라 별도 IIFE 번들로 로드)
 * - `three` 는 번들에 포함 (외부 아님) — CDN 없이 완전 오프라인, CSP 원격 origin 불필요.
 * - importmap 대신 단일 파일 + `webview.asWebviewUri()` 로 로드 (경로 단순화).
 * - 산출물: dist/webview/plot3d.js (esbuild 트리셰이킹, three r170 ≈ 128-166KB gz)
 */
async function buildWebview() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/ui/plot3d/index.ts'
		],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/webview/plot3d.js',
		define: {
			'process.env.NODE_ENV': production ? '"production"' : '"development"'
		},
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

async function run() {
	await Promise.all([main(), buildWebview()]);
}

run().catch(e => {
	console.error(e);
	process.exit(1);
});
