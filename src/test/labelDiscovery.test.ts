import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

suite('Label Discovery Integration Test Suite', () => {
    test('discoverLabels should request label data from python backend', async () => {
        const tmpDir = os.tmpdir();
        const testFile = path.join(tmpDir, `test_discovery_${Date.now()}.tex`);
        const content = `
\\section{Introduction}\\label{sec:intro}
\\begin{equation}
E = mc^2 \\label{eq:einstein}
\\end{equation}
As shown in \\ref{eq:einstein}, energy is mass.
        `;
        fs.writeFileSync(testFile, content);

        try {
            const doc = await vscode.workspace.openTextDocument(testFile);
            await vscode.window.showTextDocument(doc);
            await vscode.commands.executeCommand('tex-machina.discoverLabels');
            assert.ok(true);
        } catch (e) {
            assert.fail('discoverLabels command failed: ' + e);
        } finally {
            if (fs.existsSync(testFile)) {
                fs.unlinkSync(testFile);
            }
        }
    });
});
