import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import { ItemView, Menu, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_TASKS, ICON_TASKS, TASKS_DIR } from "./constants";
import type PensievePlugin from "./main";

/** Parsed frontmatter from a cron-agents task .md file */
interface TaskFrontmatter {
  id: string;
  schedule: string;
  invocation: "cli" | "api";
  agent: string;
  enabled: boolean;
  notifications: { toast: boolean };
  dependsOn?: string[];
  variables?: Record<string, string>;
}

interface ParsedTask {
  /** Filename (e.g. "daily-recap.md") */
  filename: string;
  /** Absolute path on disk */
  absPath: string;
  /** Parsed frontmatter fields */
  meta: TaskFrontmatter;
  /** Markdown body (instructions/prompt) */
  instructions: string;
  /** Raw file content */
  raw: string;
}

const DEBOUNCE_MS = 400;

export class TasksView extends ItemView {
  private plugin: PensievePlugin;
  private listEl: HTMLElement | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private fsWatcher: fs.FSWatcher | null = null;

  /** Absolute path to .pensieve/tasks inside the vault */
  private get tasksAbsDir(): string {
    const vaultBase = (this.app.vault.adapter as any).basePath as string;
    return path.join(vaultBase, TASKS_DIR);
  }

  constructor(leaf: WorkspaceLeaf, plugin: PensievePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_TASKS;
  }

  getDisplayText(): string {
    return "Pensieve Tasks";
  }

  getIcon(): string {
    return ICON_TASKS;
  }

  /** Remove pin/link/move from the tab menu */
  onPaneMenu(menu: Menu, source: string): void {
    const originalShow = menu.showAtPosition.bind(menu);
    menu.showAtPosition = (position: any, doc?: Document) => {
      const blocked = new Set(["Pin", "Link with tab...", "Move to new window"]);
      (menu as any).items = (menu as any).items.filter((item: any) => {
        const title = item.titleEl?.textContent?.trim() ?? item.dom?.textContent?.trim() ?? "";
        return !blocked.has(title);
      });
      (menu as any).items = (menu as any).items.filter(
        (item: any) => !item.dom?.classList?.contains("menu-separator")
      );
      originalShow(position, doc);
    };
  }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("pensieve-tasks-container");

    const header = container.createDiv({ cls: "pensieve-tasks-header" });
    header.createEl("h4", { text: "Tasks" });
    const refreshBtn = header.createEl("button", {
      cls: "pensieve-tasks-refresh clickable-icon",
      attr: { "aria-label": "Refresh task list" },
    });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => this.renderTasks());

    this.listEl = container.createDiv({ cls: "pensieve-tasks-list" });

    // Watch for changes using native fs.watch (Obsidian vault API ignores dotfolders)
    this.startFsWatcher();

    this.renderTasks();
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    // Clean up all poll timers
    for (const timer of this.pollTimers.values()) {
      clearInterval(timer);
    }
    this.pollTimers.clear();
    this.stopFsWatcher();
  }

  private startFsWatcher(): void {
    const dir = this.tasksAbsDir;
    if (!fs.existsSync(dir)) return;
    try {
      this.fsWatcher = fs.watch(dir, { persistent: false }, () => {
        this.debouncedRefresh();
      });
    } catch {
      // Fail silently — manual refresh still works
    }
  }

  private stopFsWatcher(): void {
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
  }

  private debouncedRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.renderTasks();
    }, DEBOUNCE_MS);
  }

  // ── Task parsing (direct filesystem) ──────────────────

  private discoverTasks(): ParsedTask[] {
    const tasks: ParsedTask[] = [];
    const dir = this.tasksAbsDir;
    if (!fs.existsSync(dir)) return tasks;

    let entries: string[];
    try {
      entries = fs.readdirSync(dir).filter((n) => n.endsWith(".md"));
    } catch {
      return tasks;
    }

    for (const filename of entries) {
      try {
        const absPath = path.join(dir, filename);
        const raw = fs.readFileSync(absPath, "utf-8");
        const parsed = this.parseFrontmatter(raw);
        if (parsed) {
          const basename = filename.replace(/\.md$/, "");
          tasks.push({
            filename,
            absPath,
            meta: { ...parsed.meta, id: parsed.meta.id || basename },
            instructions: parsed.instructions,
            raw,
          });
        }
      } catch {
        // Skip unparseable files
      }
    }

    tasks.sort((a, b) => a.meta.id.localeCompare(b.meta.id));
    return tasks;
  }

  private parseFrontmatter(raw: string): { meta: TaskFrontmatter; instructions: string } | null {
    // Normalize line endings to \n (files may have \r\n on Windows/OneDrive)
    const normalized = raw.replace(/\r\n/g, "\n");
    const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return null;

    const yamlBlock = match[1];
    const instructions = match[2].trim();

    // Simple YAML parsing for the fields we care about
    const get = (key: string): string | undefined => {
      const m = yamlBlock.match(new RegExp(`^${key}:\\s*"?([^"\\n]*)"?`, "m"));
      return m ? m[1].trim() : undefined;
    };
    const getBool = (key: string, def: boolean): boolean => {
      const v = get(key);
      if (v === "true") return true;
      if (v === "false") return false;
      return def;
    };

    // Handle nested notifications.toast
    const toastMatch = yamlBlock.match(/^\s+toast:\s*(true|false)/m);
    const toast = toastMatch ? toastMatch[1] === "true" : false;

    const meta: TaskFrontmatter = {
      id: get("id") || "",
      schedule: get("schedule") || "0 0 * * *",
      invocation: (get("invocation") as "cli" | "api") || "cli",
      agent: get("agent") || "copilot",
      enabled: getBool("enabled", true),
      notifications: { toast },
    };

    return { meta, instructions };
  }

  // ── Log discovery ─────────────────────────────────────

  private getRecentLogs(taskId: string, max = 3): { filename: string; absPath: string; timestamp: string; success: boolean }[] {
    const fs = require("fs") as typeof import("fs");
    const logsDir = this.getLogsDir();
    if (!logsDir || !fs.existsSync(logsDir)) return [];

    try {
      const entries = fs.readdirSync(logsDir)
        .filter((name: string) => name.startsWith(taskId + "_") && name.endsWith(".md"))
        .sort()
        .reverse()
        .slice(0, max);

      return entries.map((name: string) => {
        const absPath = path.join(logsDir, name);
        let success = true;
        try {
          const content = fs.readFileSync(absPath, "utf-8");
          if (content.includes("status: failure")) success = false;
        } catch { /* ignore */ }

        // Extract timestamp from filename: taskId_2024-02-17T09-00-00_exec-123.md
        const tsMatch = name.match(/_(\d{4}-\d{2}-\d{2}T[\d-]+)_/);
        const timestamp = tsMatch ? tsMatch[1].replace(/-/g, (m: string, i: number) => i > 9 ? ":" : "-") : name;

        return { filename: name, absPath, timestamp, success };
      });
    } catch {
      return [];
    }
  }

  private getLogsDir(): string | null {
    const fs = require("fs") as typeof import("fs");
    const configPath = path.join(require("os").homedir(), ".cron-agents", "config.json");
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return config.logsDir || null;
    } catch {
      return null;
    }
  }

  // ── Rendering ─────────────────────────────────────────

  private renderTasks(): void {
    if (!this.listEl) return;
    this.listEl.empty();

    const tasks = this.discoverTasks();

    if (tasks.length === 0) {
      this.listEl.createDiv({
        cls: "pensieve-tasks-empty",
        text: `No tasks found in ${TASKS_DIR}/`,
      });
      return;
    }

    for (const task of tasks) {
      this.renderTaskRow(task);
    }
  }

  private renderTaskRow(task: ParsedTask): void {
    if (!this.listEl) return;

    const row = this.listEl.createDiv({ cls: "pensieve-task-item" });

    // ── Summary row ──
    const headerRow = row.createDiv({ cls: "pensieve-task-header" });

    const info = headerRow.createDiv({ cls: "pensieve-task-info" });

    const statusDot = info.createSpan({
      cls: `pensieve-task-status ${task.meta.enabled ? "pensieve-task-enabled" : "pensieve-task-disabled"}`,
      attr: { "aria-label": task.meta.enabled ? "Enabled" : "Disabled" },
    });

    info.createEl("span", { cls: "pensieve-task-name", text: task.meta.id });
    info.createEl("span", { cls: "pensieve-task-schedule", text: task.meta.schedule });

    const controls = headerRow.createDiv({ cls: "pensieve-task-controls" });

    // Run button
    const runBtn = controls.createEl("button", {
      cls: "pensieve-task-btn clickable-icon",
      attr: { "aria-label": "Run task now" },
    });
    setIcon(runBtn, "play");
    runBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.runTask(task, runBtn);
    });

    // Edit button — opens inline source editor
    const editBtn = controls.createEl("button", {
      cls: "pensieve-task-btn clickable-icon",
      attr: { "aria-label": "Edit task source" },
    });
    setIcon(editBtn, "pencil");
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openSourceEditor(task);
    });

    // ── Expandable detail panel ──
    const detail = row.createDiv({ cls: "pensieve-task-detail hidden" });

    headerRow.addEventListener("click", () => {
      const isHidden = detail.hasClass("hidden");
      if (isHidden) {
        this.renderDetail(task, detail);
        detail.removeClass("hidden");
        row.addClass("pensieve-task-expanded");
      } else {
        detail.addClass("hidden");
        row.removeClass("pensieve-task-expanded");
      }
    });
  }

  /** Open a full-source editor in the main content area */
  private openSourceEditor(task: ParsedTask): void {
    // Read current content from disk
    let content: string;
    try {
      content = fs.readFileSync(task.absPath, "utf-8");
    } catch {
      new Notice(`Unable to read ${task.filename}`);
      return;
    }

    // Create a new leaf in the main editor area
    const leaf = this.app.workspace.getLeaf("tab");
    leaf.setViewState({ type: "empty" }).then(() => {
      // Build the editor UI inside the leaf's view container
      const container = leaf.view.contentEl;
      container.empty();
      container.addClass("pensieve-source-editor");

      // Header bar
      const header = container.createDiv({ cls: "pensieve-source-header" });
      header.createEl("span", { cls: "pensieve-source-title", text: task.filename });

      const headerControls = header.createDiv({ cls: "pensieve-source-controls" });

      const saveBtn = headerControls.createEl("button", {
        cls: "mod-cta",
        text: "Save",
      });

      // Textarea
      const editorWrapper = container.createDiv({ cls: "pensieve-source-wrapper" });
      const textarea = editorWrapper.createEl("textarea", {
        cls: "pensieve-source-textarea",
      });
      textarea.value = content;
      textarea.spellcheck = false;

      // Save handler
      const save = () => {
        try {
          fs.writeFileSync(task.absPath, textarea.value, "utf-8");
          new Notice(`Saved ${task.filename}`);
        } catch (err: any) {
          new Notice(`Failed to save: ${err.message}`);
        }
      };

      saveBtn.addEventListener("click", save);

      // Ctrl+S shortcut within the textarea
      textarea.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
          e.preventDefault();
          save();
        }
      });

      // Update the leaf title
      (leaf as any).tabHeaderInnerTitleEl?.setText?.(task.filename);
    });
  }

  private renderDetail(task: ParsedTask, container: HTMLElement): void {
    container.empty();

    // ── Metadata ──
    const meta = container.createDiv({ cls: "pensieve-task-meta" });

    const metaGrid = meta.createDiv({ cls: "pensieve-task-meta-grid" });
    this.addMetaRow(metaGrid, "Agent", task.meta.agent);
    this.addMetaRow(metaGrid, "Invocation", task.meta.invocation);
    this.addMetaRow(metaGrid, "Schedule", task.meta.schedule);
    this.addMetaRow(metaGrid, "Enabled", task.meta.enabled ? "Yes" : "No");
    this.addMetaRow(metaGrid, "Notifications", task.meta.notifications.toast ? "Toast" : "None");

    // ── Prompt / Instructions ──
    const promptSection = container.createDiv({ cls: "pensieve-task-prompt-section" });
    promptSection.createEl("h6", { text: "Prompt" });

    const promptContent = promptSection.createDiv({ cls: "pensieve-task-prompt" });
    promptContent.createEl("pre", { text: task.instructions || "(empty)" });

    // ── Recent Logs ──
    const logsSection = container.createDiv({ cls: "pensieve-task-logs-section" });
    logsSection.createEl("h6", { text: "Recent Logs" });

    const logs = this.getRecentLogs(task.meta.id);
    if (logs.length === 0) {
      logsSection.createDiv({ cls: "pensieve-task-logs-empty", text: "No logs yet." });
    } else {
      for (const log of logs) {
        const entry = logsSection.createDiv({ cls: "pensieve-log-entry" });
        const entryHeader = entry.createDiv({
          cls: `pensieve-log-header ${log.success ? "pensieve-log-success" : "pensieve-log-failure"}`,
        });

        const chevron = entryHeader.createSpan({ cls: "pensieve-log-chevron" });
        setIcon(chevron, "chevron-right");

        const iconEl = entryHeader.createSpan({ cls: "pensieve-log-icon" });
        setIcon(iconEl, log.success ? "check-circle" : "x-circle");

        entryHeader.createSpan({ cls: "pensieve-log-time", text: log.timestamp });

        // Inline log content — lazy-loaded on click
        const logBody = entry.createDiv({ cls: "pensieve-log-body hidden" });

        entryHeader.addEventListener("click", () => {
          const isHidden = logBody.hasClass("hidden");
          if (isHidden) {
            if (!logBody.hasAttribute("data-loaded")) {
              try {
                const content = fs.readFileSync(log.absPath, "utf-8");
                logBody.createEl("pre", { text: content });
              } catch {
                logBody.createEl("pre", { text: "(Unable to read log file)" });
              }
              logBody.setAttribute("data-loaded", "true");
            }
            logBody.removeClass("hidden");
            entry.addClass("pensieve-log-expanded");
            setIcon(chevron, "chevron-down");
          } else {
            logBody.addClass("hidden");
            entry.removeClass("pensieve-log-expanded");
            setIcon(chevron, "chevron-right");
          }
        });
      }
    }
  }

  private addMetaRow(grid: HTMLElement, label: string, value: string): void {
    const row = grid.createDiv({ cls: "pensieve-meta-row" });
    row.createSpan({ cls: "pensieve-meta-label", text: label });
    row.createSpan({ cls: "pensieve-meta-value", text: value });
  }

  // ── Task execution via cron-agents CLI ────────────────

  /** Track which tasks are currently running */
  private runningTasks = new Set<string>();
  private pollTimers = new Map<string, ReturnType<typeof setInterval>>();

  private runTask(task: ParsedTask, runBtn: HTMLElement): void {
    if (this.runningTasks.has(task.meta.id)) return; // Already running

    this.runningTasks.add(task.meta.id);
    runBtn.empty();
    setIcon(runBtn, "loader");
    runBtn.addClass("pensieve-task-running");

    new Notice(`Running ${task.meta.id}...`);

    // Launch in background mode
    const proc = spawn("cron-agents", ["run", "--background", task.meta.id], {
      shell: true,
      stdio: "pipe",
      cwd: require("os").homedir(),
    });

    let output = "";
    proc.stdout?.on("data", (data: Buffer) => { output += data.toString(); });
    proc.stderr?.on("data", (data: Buffer) => { output += data.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        this.stopRunning(task.meta.id, runBtn);
        new Notice(`✗ Failed to start ${task.meta.id} (exit ${code})`);
        return;
      }

      // Poll run-status until complete
      this.pollRunStatus(task.meta.id, runBtn);
    });

    proc.on("error", (err) => {
      this.stopRunning(task.meta.id, runBtn);
      new Notice(`✗ Failed to run ${task.meta.id}: ${err.message}`);
    });
  }

  private pollRunStatus(taskId: string, runBtn: HTMLElement): void {
    const POLL_INTERVAL = 5000;

    const poll = () => {
      const proc = spawn("cron-agents", ["run-status", "--task-id", taskId], {
        shell: true,
        stdio: "pipe",
        cwd: require("os").homedir(),
      });

      let output = "";
      proc.stdout?.on("data", (data: Buffer) => { output += data.toString(); });
      proc.stderr?.on("data", (data: Buffer) => { output += data.toString(); });

      proc.on("close", () => {
        const lower = output.toLowerCase();
        if (lower.includes("completed") || lower.includes("success")) {
          this.stopRunning(taskId, runBtn);
          new Notice(`✓ ${taskId} completed`);
          this.debouncedRefresh();
        } else if (lower.includes("failed") || lower.includes("error")) {
          this.stopRunning(taskId, runBtn);
          new Notice(`✗ ${taskId} failed`);
          this.debouncedRefresh();
        }
        // Otherwise still running — keep polling
      });
    };

    // First check after a short delay, then regular interval
    const timer = setInterval(poll, POLL_INTERVAL);
    this.pollTimers.set(taskId, timer);
    setTimeout(poll, 2000);
  }

  private stopRunning(taskId: string, runBtn: HTMLElement): void {
    this.runningTasks.delete(taskId);
    const timer = this.pollTimers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(taskId);
    }
    runBtn.empty();
    setIcon(runBtn, "play");
    runBtn.removeClass("pensieve-task-running");
  }
}

