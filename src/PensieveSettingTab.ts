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

    new Setting(containerEl)
      .setName("Today note")
      .setDesc(
        this.plugin.settings.todayNotePath
          ? `Currently pinned: ${this.plugin.settings.todayNotePath}`
          : 'No note pinned. Use the "Pin current note as Today" command.'
      )
      .addButton((btn) =>
        btn
          .setButtonText("Clear")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.todayNotePath = "";
            await this.plugin.saveSettings();
            this.plugin.refreshTodayViews();
            this.display();
          })
      );
  }
}
