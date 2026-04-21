# Pensieve — Obsidian Plugin

## Project overview

An Obsidian plugin for AI-enhanced note management, optimized for better AI consumption of vault notes.

## Tech stack

- TypeScript, esbuild, Obsidian Plugin API
- Build: `npm run build` / `npm run dev` (watch mode)

## Development workflow

1. Make changes in `src/`
2. Run `npm run build`
3. Deploy to local Obsidian using the **deploy-to-obsidian** skill (`.agents/skills/deploy-to-obsidian.md`)
4. Reload Obsidian (`Ctrl+R`) or toggle the plugin off/on

## Key files

| File | Purpose |
|------|---------|
| `src/main.ts` | Plugin entry point (`PensievePlugin` class) |
| `src/constants.ts` | IDs, icons, settings interface |
| `src/TodayView.ts` | Sidebar view for the pinned "Today" note |
| `src/PensieveSettingTab.ts` | Settings UI |
| `manifest.json` | Obsidian plugin manifest |

## Build artifacts

The build produces `main.js` and `styles.css` at the repo root. These plus `manifest.json` are the only files needed in the Obsidian plugins directory.

## Rules

- Do NOT overwrite `data.json` in the Obsidian plugin directory — it contains user settings.
- Always build before deploying.
- The Obsidian vault is at: `C:\Users\slevert\OneDrive - Microsoft\Pensieve`
- The plugin directory is: `C:\Users\slevert\OneDrive - Microsoft\Pensieve\.obsidian\plugins\pensieve`
