import * as assert from 'assert';
import * as vscode from 'vscode';
import { expandSiunitx } from '../core/unitExpander';

suite('Unit Expander Test Suite', () => {
    test('Unit Expander: Basic expansion', () => {
        assert.strictEqual(expandSiunitx('10kg'), '\\SI{10}{\\kilo\\gram}');
        assert.strictEqual(expandSiunitx('10m/s^2'), '\\SI{10}{\\meter\\per\\second\\squared}');
        assert.strictEqual(expandSiunitx('kgm/s^2'), '\\si{\\kilo\\gram\\meter\\per\\second\\squared}');
    });

    test('Unit Expander: Complex expansion', () => {
        assert.strictEqual(expandSiunitx('10kgm/s^2'), '\\SI{10}{\\kilo\\gram\\meter\\per\\second\\squared}');
        assert.strictEqual(expandSiunitx('\\SI{10kgm/s^2}'), '\\SI{10}{\\kilo\\gram\\meter\\per\\second\\squared}');
        assert.strictEqual(expandSiunitx('100uF'), '\\SI{100}{\\micro\\farad}');
        assert.strictEqual(expandSiunitx('5cm^3'), '\\SI{5}{\\centi\\meter\\cubed}');
    });

    test('Unit Expander: Command execution', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content: '10kgm/s^2' });
        const editor = await vscode.window.showTextDocument(document);
        
        editor.selection = new vscode.Selection(0, 0, 0, 9);
        await vscode.commands.executeCommand('tex-machina.formatUnit');
        
        assert.strictEqual(document.lineAt(0).text, '\\SI{10}{\\kilo\\gram\\meter\\per\\second\\squared}');
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Unit Expander: Very complex units', () => {
        assert.strictEqual(expandSiunitx('10kgm^2s^-3A^-1'), '\\SI{10}{\\kilo\\gram\\meter\\squared\\second\\rpcubed\\ampere\\rpone}');
        const res = expandSiunitx('10m/s/s');
        assert.ok(res.includes('\\meter\\per\\second\\per\\second'));
    });
});
