import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Formula History Test Suite', function() {
    this.timeout(15000);

    test('Formula History: Auto-inject ID into $$ block', async () => {
        const content = '$$x^2 + y^2 = z^2$$';
        // Use a real file path with .tex extension to ensure language detection
        const uri = vscode.Uri.parse('untitled:' + path.join(process.cwd(), 'test.tex'));
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: content });
        await vscode.window.showTextDocument(document);
        
        console.log(`Document LanguageId: ${document.languageId}`);

        const editor = vscode.window.activeTextEditor!;
        // Significant change to trigger the listener
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(document.lineCount, 0), '\n% trigger change\n');
        });

        console.log("Waiting for debounce (2s) + processing...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        let foundId = false;
        let id = '';
        const text = document.getText();
        const match = text.match(/% @hist:([a-z0-9-]+)/);
        if (match) {
            foundId = true;
            id = match[1];
        }

        if (!foundId) {
            console.log("Auto-injection failed, checking if extension is active...");
            const ext = vscode.extensions.getExtension('tony29028.tex-machina');
            console.log(`Extension Active: ${ext?.isActive}`);
        }

        assert.ok(foundId, 'Should auto-inject history ID comment');
        
        // Verify history file creation
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (workspaceFolder) {
            const historyPath = path.join(workspaceFolder.uri.fsPath, '.tex-machina/history', `${id}.json`);
            
            // Wait for file to be written
            for (let i = 0; i < 20; i++) {
                if (fs.existsSync(historyPath)) break;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            assert.ok(fs.existsSync(historyPath), 'History JSON file should be created');
            const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
            assert.ok(history.length > 0, 'History should have at least one entry');
        }

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Formula History: Capture multiple versions', async () => {
        const content = '$$v_1$$';
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: content });
        const editor = await vscode.window.showTextDocument(document);

        // 1. Trigger initial ID injection
        await editor.edit(editBuilder => { editBuilder.insert(new vscode.Position(1, 0), '\n% init'); });
        
        console.log("Waiting for ID injection...");
        let id = '';
        for (let i = 0; i < 50; i++) {
            const match = document.getText().match(/% @hist:([a-z0-9-]+)/);
            if (match) { id = match[1]; break; }
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        assert.ok(id, 'ID should be injected');

        // 2. Modify formula
        const mathRegex = /\$\$v_1\$\$/;
        const currentText = document.getText();
        const v1Pos = currentText.indexOf('v_1');
        
        await editor.edit(editBuilder => {
            editBuilder.replace(new vscode.Range(document.positionAt(v1Pos), document.positionAt(v1Pos + 3)), 'v_2');
        });

        // 3. Wait for history capture (debounce is 2s)
        console.log("Waiting for history capture (2nd version)...");
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (workspaceFolder) {
            const historyPath = path.join(workspaceFolder.uri.fsPath, '.tex-machina/history', `${id}.json`);
            
            for (let i = 0; i < 50; i++) {
                if (fs.existsSync(historyPath)) {
                    const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
                    if (history.length >= 2) break;
                }
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
            assert.ok(history.length >= 2, 'Should capture at least two versions');
            assert.ok(history.some((e: any) => e.latex.includes('v_1')), 'One version should have v_1');
            assert.ok(history.some((e: any) => e.latex.includes('v_2')), 'One version should have v_2');
        }

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
