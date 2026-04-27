# Skill: Deploy to Obsidian

## Description

Builds the plugin and deploys the output artifacts to the local Obsidian vault's plugin directory so you can immediately test changes by reloading the plugin.

## When to Use

Invoke this skill when the user says any of the following:

- "deploy", "deploy to obsidian", "deploy the plugin"
- "test in obsidian", "try it in obsidian"
- "install locally", "install the plugin"
- "push to vault", "update the plugin"
- "copy to my vault", "copy to vault"
- "reload", "refresh the plugin"

## Steps

### 1. Build the plugin

Run the production build from the repository root:

```shell
npm run build
```

This produces three artifacts:

| File            | Description                          |
| --------------- | ------------------------------------ |
| `main.js`       | Bundled plugin code (esbuild output) |
| `styles.css`    | Global styles (copied by esbuild)    |
| `manifest.json` | Obsidian plugin manifest (source)    |

The build **must** succeed (exit code 0) before continuing. If it fails, stop and report the errors to the user.

### 2. Locate the Obsidian vault plugin directory

The target directory is:

```
C:\Users\slevert\OneDrive - Microsoft\Pensieve\.obsidian\plugins\pensieve\
```

### 3. Copy artifacts to the plugin directory

Copy these three files from the repository root into the target plugin directory:

```powershell
$src = "D:\sebastienlevert\obsidian-pensieve"
$dest = "C:\Users\slevert\OneDrive - Microsoft\Pensieve\.obsidian\plugins\pensieve"

Copy-Item "$src\main.js" "$dest\main.js" -Force
Copy-Item "$src\styles.css" "$dest\styles.css" -Force
Copy-Item "$src\manifest.json" "$dest\manifest.json" -Force
```

### 4. Confirm deployment

After copying, print a summary:

```
✅ Deployed pensieve to C:\Users\slevert\OneDrive - Microsoft\Pensieve\.obsidian\plugins\pensieve\
   - main.js
   - styles.css
   - manifest.json

Reload Obsidian (Ctrl+R) or toggle the plugin off/on to pick up changes.
```

## Important Notes

- Always run `npm run build` first — never copy stale artifacts.
- Never modify files inside the vault's `.obsidian/` directory beyond the plugin folder.
- The `data.json` file in the plugin directory contains user settings — **never overwrite or delete it**.
- If the vault path doesn't exist or the `.obsidian` folder is missing, alert the user rather than creating it.
