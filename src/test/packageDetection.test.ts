import * as assert from 'assert';
import * as vscode from 'vscode';
import { checkPackageUsage } from '../core/packageDetection';

suite('Package Detection Test Suite', () => {
    test('Should comment out unused package', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nHello\n\\end{document}',
            language: 'latex'
        });
        await vscode.window.showTextDocument(doc);
        
        const config = vscode.workspace.getConfiguration('tex-machina');
        await config.update('packageAutoCleanup.enabled', true, vscode.ConfigurationTarget.Global);

        await checkPackageUsage(doc);

        const text = doc.getText();
        assert.ok(text.includes('% [unused] \\usepackage{amsmath}'), 'amsmath should be commented out');
    });

    test('Should uncomment used package', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: '\\documentclass{article}\n% [unused] \\usepackage{graphicx}\n\\begin{document}\n\\includegraphics{test.png}\n\\end{document}',
            language: 'latex'
        });
        await vscode.window.showTextDocument(doc);
        
        await checkPackageUsage(doc);

        const text = doc.getText();
        assert.ok(text.includes('\\usepackage{graphicx}'), 'graphicx should be uncommented');
        assert.ok(!text.includes('% [unused]'), 'unused marker should be removed');
    });

    test('Should handle optional arguments', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: '\\documentclass{article}\n\\usepackage[utf8]{amsmath}\n\\begin{document}\nHello\n\\end{document}',
            language: 'latex'
        });
        await vscode.window.showTextDocument(doc);
        
        await checkPackageUsage(doc);

        const text = doc.getText();
        assert.ok(text.includes('% [unused] \\usepackage[utf8]{amsmath}'), 'amsmath with options should be commented out');
    });
});
