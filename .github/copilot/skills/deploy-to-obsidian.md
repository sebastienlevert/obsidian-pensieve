# Deploy to Obsidian

Builds the plugin and deploys it to the local Obsidian vault.

## Steps

1. Run `npm run build` in the repository root (`D:\sebastienlevert\obsidian-pensieve`)
2. Copy the following build artifacts to the Obsidian plugin directory:
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. The Obsidian vault plugin directory is:
   ```
   C:\Users\slevert\OneDrive - Microsoft\Pensieve\.obsidian\plugins\pensieve
   ```
4. Create the plugin directory if it does not exist.
5. After copying, remind the user to reload Obsidian (Ctrl+R) or toggle the plugin off/on to pick up the changes.

## Notes

- Do NOT copy `data.json` — that contains user settings and should not be overwritten.
- Always build before deploying to ensure artifacts are up to date.
