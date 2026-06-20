'use strict';

const vscode = require('vscode');
const { compressToEncodedURIComponent } = require('lz-string');

// The hosted playground reads a shared schema from the URL hash in the form
// `#s=<lz-string compressToEncodedURIComponent>`. This is the exact same share
// format the renderer and the HTTP render API emit, so the schema opens already
// loaded, with no copy and paste.
const PLAYGROUND_BASE = 'https://xdbml.org/playground/';

/** Build the playground deep link for a given xDBML source string. */
function buildPlaygroundUrl (source) {
  return PLAYGROUND_BASE + '#s=' + compressToEncodedURIComponent(source);
}

function activate (context) {
  const command = vscode.commands.registerCommand('xdbml.openInPlayground', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('Open an xDBML file to use "Open in Playground".');
      return;
    }

    // Send the current selection if there is one, otherwise the whole document.
    const selection = editor.selection;
    const source = selection && !selection.isEmpty
      ? editor.document.getText(selection)
      : editor.document.getText();

    if (!source.trim()) {
      vscode.window.showInformationMessage('Nothing to open: the xDBML document is empty.');
      return;
    }

    await vscode.env.openExternal(vscode.Uri.parse(buildPlaygroundUrl(source)));
  });

  context.subscriptions.push(command);
}

function deactivate () {}

module.exports = { activate, deactivate, buildPlaygroundUrl };
