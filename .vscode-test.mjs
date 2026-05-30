import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
    headless: true,
	mocha: {
		reporter: 'spec',
		slow: 0
	}
});
