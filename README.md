# dep-deps
Dependable Dependencies Principle as VSCode Extension

From [Dependable Dependencies (Gorman, 2011)](https://codemanship.co.uk/Dependable%20Dependencies.pdf)

## how to test

To play around with this:
- open the project in vscode
- find the `src/extension.ts` file and open it
- hit F5 or go "Run -> Start Debugging"
- this will open a new VSCode window with the extension loaded
- Add a folder containing the code/prject you want to analyse
- Shift+Ctrl+P and run `DDP: Analyse Folder..`
- Select your `/src` or whatever directory you wish to analyse
- find the DDP Risks section in the lefthand sidebar at the bottom for results