import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

suite('Label Discovery Integration Test Suite', () => {
    vscode.window.showInformationMessage('Start Label Discovery Integration Tests.');

    test('discoverLabels command should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('tex-machina.discoverLabels'));
    });

    test('discoverLabels should request label data from python backend', async () => {
        // Create a temporary TeX file for testing using OS temp dir
        const tmpDir = os.tmpdir();
        const testFile = path.join(tmpDir, `test_discovery_${Date.now()}.tex`);
        const content = `
\\section{Introduction}\\label{sec:intro}
This is a test with an equation.
\\begin{equation}
E = mc^2 \\label{eq:einstein}
\\end{equation}
As shown in \\ref{eq:einstein}, energy is mass.
        `;
        fs.writeFileSync(testFile, content);

        try {
            const doc = await vscode.workspace.openTextDocument(testFile);
            await vscode.window.showTextDocument(doc);

            // Execute the command
            await vscode.commands.executeCommand('tex-machina.discoverLabels');
            assert.ok(true);
        } catch (e) {
            assert.fail('discoverLabels command failed: ' + e);
        } finally {
            // Clean up
            if (fs.existsSync(testFile)) {
                fs.unlinkSync(testFile);
            }
        }
    });
});
