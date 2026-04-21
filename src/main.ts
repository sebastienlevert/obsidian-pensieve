import { Plugin, addIcon, Notice, TFile, Menu, MenuItem } from "obsidian";
import { TodayView } from "./TodayView";
import { PensieveSettingTab } from "./PensieveSettingTab";
import { shareFile } from "./sharing";
import { VIEW_TYPE_TODAY, ICON_TODAY, TODAY_ICON_SVG, DEFAULT_SETTINGS } from "./constants";
import type { PensieveSettings } from "./constants";

export default class PensievePlugin extends Plugin {
  settings: PensieveSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    await this.loadSettings();

    addIcon(ICON_TODAY, TODAY_ICON_SVG);

    this.registerView(VIEW_TYPE_TODAY, (leaf) => new TodayView(leaf, this));

    this.addSettingTab(new PensieveSettingTab(this.app, this));

    // Ribbon icon to open the Today pane
    this.addRibbonIcon(ICON_TODAY, "Show Today pane", () => {
      this.activateTodayView();
    });

    // Command: Pin current note as Today
    this.addCommand({
      id: "pin-today-note",
      name: "Pin current note as Today",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("No active file to pin.");
          return;
        }
        this.settings.todayNotePath = file.path;
        await this.saveSettings();
        this.refreshTodayViews();
        await this.activateTodayView();
        new Notice(`Pinned "${file.basename}" as Today note.`);
      },
    });

    // Command: Show Today pane
    this.addCommand({
      id: "show-today-pane",
      name: "Show Today pane",
      callback: () => this.activateTodayView(),
    });

    // Command: Open pinned Today note in editor
    this.addCommand({
      id: "open-today-note",
      name: "Open pinned Today note in editor",
      callback: async () => {
        if (!this.settings.todayNotePath) {
          new Notice("No Today note pinned.");
          return;
        }
        const file = this.app.vault.getAbstractFileByPath(this.settings.todayNotePath);
        if (!file) {
          new Notice("Pinned Today note no longer exists.");
          return;
        }
        await this.app.workspace.openLinkText(this.settings.todayNotePath, "", false);
      },
    });

    // Command: Unpin Today note
    this.addCommand({
      id: "unpin-today-note",
      name: "Unpin Today note",
      callback: async () => {
        this.settings.todayNotePath = "";
        await this.saveSettings();
        this.refreshTodayViews();
        new Notice("Today note unpinned.");
      },
    });

    // Command: Share current file via OneDrive
    this.addCommand({
      id: "share-file",
      name: "Share current file via OneDrive",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("No active file to share.");
          return;
        }
        this.shareVaultFile(file);
      },
    });

    // Right-click context menu on files in the file explorer
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file) => {
        if (!(file instanceof TFile)) return;
        menu.addItem((item: MenuItem) => {
          item
            .setTitle("Share via OneDrive")
            .setIcon("share-2")
            .onClick(() => this.shareVaultFile(file));
        });
      })
    );

    // Right-click context menu on editor tabs
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return;
        menu.addItem((item: MenuItem) => {
          item
            .setTitle("Share via OneDrive")
            .setIcon("share-2")
            .onClick(() => this.shareVaultFile(file));
        });
      })
    );

    // Global rename handler — keep the pinned path in sync
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (oldPath === this.settings.todayNotePath) {
          this.settings.todayNotePath = file.path;
          this.saveSettings();
          this.refreshTodayViews();
        }
      })
    );

    // Global delete handler — clear the pin if the file is removed
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file.path === this.settings.todayNotePath) {
          this.settings.todayNotePath = "";
          this.saveSettings();
          this.refreshTodayViews();
        }
      })
    );
  }

  /** Open or reveal the Today sidebar view */
  async activateTodayView(): Promise<void> {
    const { workspace } = this.app;

    const existing = workspace.getLeavesOfType(VIEW_TYPE_TODAY);
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_TODAY, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  /** Notify all open Today views to re-render */
  refreshTodayViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TODAY)) {
      (leaf.view as TodayView).refresh();
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Resolve a vault file to its absolute path and invoke the OneDrive share dialog */
  private shareVaultFile(file: TFile): void {
    const adapter = this.app.vault.adapter as any;
    if (!adapter.basePath) {
      new Notice("Cannot determine vault path.");
      return;
    }
    const absolutePath = require("path").join(adapter.basePath, file.path);
    shareFile(absolutePath);
  }

  onunload(): void {
    // Views are automatically cleaned up by Obsidian
  }
}
