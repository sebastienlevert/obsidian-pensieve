import { ItemView, MarkdownRenderer, Menu, TFile, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_TODAY, ICON_TODAY } from "./constants";
import type PensievePlugin from "./main";

const DEBOUNCE_MS = 300;

export class TodayView extends ItemView {
  private plugin: PensievePlugin;
  private contentEl_: HTMLElement;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private renderGeneration = 0;

  constructor(leaf: WorkspaceLeaf, plugin: PensievePlugin) {
    super(leaf);
    this.plugin = plugin;
    this.contentEl_ = this.contentEl;
  }

  getViewType(): string {
    return VIEW_TYPE_TODAY;
  }

  getDisplayText(): string {
    if (this.plugin.settings.todayNotePath) {
      const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.todayNotePath);
      if (file instanceof TFile) {
        return `Today — ${file.basename}`;
      }
    }
    return "Today";
  }

  getIcon(): string {
    return ICON_TODAY;
  }

  /** Prevent pin, link, and move actions on this tab */
  onPaneMenu(menu: Menu, source: string): void {
    // Obsidian adds Pin/Link/Move at the leaf level after this method.
    // Intercept showAtPosition to strip them before the menu renders.
    const originalShow = menu.showAtPosition.bind(menu);
    menu.showAtPosition = (position: any, doc?: Document) => {
      const blocked = new Set(["Pin", "Link with tab...", "Move to new window"]);
      (menu as any).items = (menu as any).items.filter((item: any) => {
        const title = item.titleEl?.textContent?.trim() ?? item.dom?.textContent?.trim() ?? "";
        return !blocked.has(title);
      });
      // Also remove orphaned separators
      (menu as any).items = (menu as any).items.filter(
        (item: any) => !item.dom?.classList?.contains("menu-separator")
      );
      originalShow(position, doc);
    };
  }

  async onOpen(): Promise<void> {
    this.contentEl_.addClass("pensieve-today-container");

    // Watch for file modifications — view-level listener, auto-cleaned on close
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file.path === this.plugin.settings.todayNotePath) {
          this.debouncedRefresh();
        }
      })
    );

    await this.renderContent();
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /** Public entry point — called by the plugin on setting changes */
  refresh(): void {
    this.renderContent();
    // Update the tab title
    (this.leaf as any).updateHeader?.();
  }

  private debouncedRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.renderContent();
    }, DEBOUNCE_MS);
  }

  private async renderContent(): Promise<void> {
    const generation = ++this.renderGeneration;
    const scrollTop = this.contentEl_.scrollTop;

    const { todayNotePath } = this.plugin.settings;

    if (!todayNotePath) {
      this.contentEl_.empty();
      this.contentEl_.createEl("div", {
        cls: "pensieve-today-placeholder",
        text: 'No note pinned as Today. Use the "Pin current note as Today" command.',
      });
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(todayNotePath);
    if (!(file instanceof TFile)) {
      this.contentEl_.empty();
      this.contentEl_.createEl("div", {
        cls: "pensieve-today-placeholder",
        text: `Pinned file "${todayNotePath}" not found.`,
      });
      return;
    }

    const content = await this.app.vault.cachedRead(file);

    // Guard against stale async reads
    if (generation !== this.renderGeneration) return;

    this.contentEl_.empty();

    const wrapper = this.contentEl_.createDiv({ cls: "pensieve-today-content markdown-rendered" });
    await MarkdownRenderer.render(this.app, content, wrapper, file.path, this);

    // Restore scroll position after re-render
    this.contentEl_.scrollTop = scrollTop;
  }
}
