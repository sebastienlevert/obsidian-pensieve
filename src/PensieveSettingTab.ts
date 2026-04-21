import { App, PluginSettingTab, Setting } from "obsidian";
import type PensievePlugin from "./main";

export class PensieveSettingTab extends PluginSettingTab {
  plugin: PensievePlugin;

  constructor(app: App, plugin: PensievePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Pensieve Settings" });
    containerEl.createEl("p", {
      text: "Configure AI-enhanced note management for your vault.",
    });
  }
}
