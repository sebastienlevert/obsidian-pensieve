import { Plugin } from "obsidian";
import { PensieveSettingTab } from "./PensieveSettingTab";
import { DEFAULT_SETTINGS } from "./constants";
import type { PensieveSettings } from "./constants";

export default class PensievePlugin extends Plugin {
  settings: PensieveSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    await this.loadSettings();

    // Settings tab
    this.addSettingTab(new PensieveSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  onunload(): void {
    // Cleanup handled by Obsidian
  }
}
