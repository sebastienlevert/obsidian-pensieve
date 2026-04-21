import * as path from "path";
import { spawn, ChildProcess } from "child_process";
import { ItemView, Menu, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_TASKS, ICON_TASKS, TASKS_DIR, LOGS_DIR } from "./constants";
import type PensievePlugin from "./main";

const SUPPORTED_EXTENSIONS = new Set([".ps1", ".js", ".sh", ".bat", ".cmd"]);
const MAX_INLINE_LOGS = 3;

interface TaskInfo {
  /** Full filename, e.g. "sync-notes.ps1" — used as unique ID */
  filename: string;
  /** Display name without extension */
  displayName: string;
  /** Absolute path to the script */
  absolutePath: string;
  /** Extension including dot */
  ext: string;
}

interface LogEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Vault-relative path to the log file */
  vaultPath: string;
  /** First line preview */
  preview: string;
  /** Whether the run succeeded */
  success: boolean;
}

export class TasksView extends ItemView {
  private plugin: PensievePlugin;
  private listEl: HTMLElement | null = null;
  private runningTasks = new Map<string, ChildProcess>();

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

    // Watch for file changes in .pensieve/tasks/
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file.path.startsWith(TASKS_DIR)) this.renderTasks();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file.path.startsWith(TASKS_DIR)) this.renderTasks();
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file.path.startsWith(TASKS_DIR) || oldPath.startsWith(TASKS_DIR)) {
          this.renderTasks();
        }
      })
    );

    await this.renderTasks();
  }

  async onClose(): Promise<void> {
    // Kill any still-running tasks spawned from this view
    for (const [, proc] of this.runningTasks) {
      proc.kill();
    }
    this.runningTasks.clear();
  }

  // ── Task discovery ──────────────────────────────────────

  private getVaultBasePath(): string {
    return (this.app.vault.adapter as any).basePath as string;
  }

  private async discoverTasks(): Promise<TaskInfo[]> {
    const fs = require("fs") as typeof import("fs");
    const tasksAbsDir = path.join(this.getVaultBasePath(), TASKS_DIR);

    if (!fs.existsSync(tasksAbsDir)) {
      return [];
    }

    const entries = fs.readdirSync(tasksAbsDir, { withFileTypes: true });
    const tasks: TaskInfo[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      tasks.push({
        filename: entry.name,
        displayName: path.basename(entry.name, ext),
        absolutePath: path.join(tasksAbsDir, entry.name),
        ext,
      });
    }

    tasks.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return tasks;
  }

  // ── Log discovery ───────────────────────────────────────

  private async getRecentLogs(task: TaskInfo): Promise<LogEntry[]> {
    const fs = require("fs") as typeof import("fs");
    const logDir = path.join(this.getVaultBasePath(), LOGS_DIR, task.filename);

    if (!fs.existsSync(logDir)) return [];

    const entries = fs.readdirSync(logDir, { withFileTypes: true })
      .filter((e: any) => e.isFile() && e.name.endsWith(".log"))
      .map((e: any) => e.name)
      .sort()
      .reverse()
      .slice(0, MAX_INLINE_LOGS);

    const logs: LogEntry[] = [];
    for (const name of entries) {
      const absPath = path.join(logDir, name);
      const content = fs.readFileSync(absPath, "utf-8");
      const firstLine = content.split("\n").find((l: string) => l.trim()) || "(empty)";
      const success = !content.includes("[EXIT CODE: ") || content.includes("[EXIT CODE: 0]");

      logs.push({
        timestamp: name.replace(".log", "").replace(/T/g, " ").replace(/-/g, (m: string, i: number) => i > 9 ? ":" : "-"),
        vaultPath: `${LOGS_DIR}/${task.filename}/${name}`,
        preview: firstLine.substring(0, 120),
        success,
      });
    }

    return logs;
  }

  // ── Rendering ───────────────────────────────────────────

  private async renderTasks(): Promise<void> {
    if (!this.listEl) return;
    this.listEl.empty();

    const tasks = await this.discoverTasks();

    if (tasks.length === 0) {
      this.listEl.createDiv({
        cls: "pensieve-tasks-empty",
        text: `No tasks found. Add script files to ${TASKS_DIR}/ to get started.`,
      });
      return;
    }

    for (const task of tasks) {
      await this.renderTaskItem(task);
    }
  }

  private async renderTaskItem(task: TaskInfo): Promise<void> {
    if (!this.listEl) return;

    const row = this.listEl.createDiv({ cls: "pensieve-task-item" });

    // ── Header row ──
    const headerRow = row.createDiv({ cls: "pensieve-task-header" });

    const info = headerRow.createDiv({ cls: "pensieve-task-info" });
    info.createEl("span", { cls: "pensieve-task-name", text: task.displayName });
    info.createEl("span", { cls: "pensieve-task-ext", text: task.ext });

    const controls = headerRow.createDiv({ cls: "pensieve-task-controls" });

    // Run button
    const runBtn = controls.createEl("button", {
      cls: "pensieve-task-btn clickable-icon",
      attr: { "aria-label": "Run task" },
    });
    setIcon(runBtn, "play");
    runBtn.addEventListener("click", () => this.runTask(task, runBtn, logsContainer));

    // Toggle logs button
    const logsBtn = controls.createEl("button", {
      cls: "pensieve-task-btn clickable-icon",
      attr: { "aria-label": "Toggle logs" },
    });
    setIcon(logsBtn, "file-text");

    // ── Logs section (collapsed by default) ──
    const logsContainer = row.createDiv({ cls: "pensieve-task-logs hidden" });

    logsBtn.addEventListener("click", async () => {
      const isHidden = logsContainer.hasClass("hidden");
      if (isHidden) {
        await this.renderLogs(task, logsContainer);
        logsContainer.removeClass("hidden");
      } else {
        logsContainer.addClass("hidden");
      }
    });
  }

  private async renderLogs(task: TaskInfo, container: HTMLElement): Promise<void> {
    container.empty();
    const logs = await this.getRecentLogs(task);

    if (logs.length === 0) {
      container.createDiv({
        cls: "pensieve-task-logs-empty",
        text: "No logs yet.",
      });
      return;
    }

    for (const log of logs) {
      const entry = container.createDiv({ cls: "pensieve-log-entry" });
      const statusIcon = log.success ? "check-circle" : "x-circle";
      const statusCls = log.success ? "pensieve-log-success" : "pensieve-log-failure";

      const entryHeader = entry.createDiv({ cls: `pensieve-log-header ${statusCls}` });

      const iconEl = entryHeader.createSpan({ cls: "pensieve-log-icon" });
      setIcon(iconEl, statusIcon);

      entryHeader.createSpan({ cls: "pensieve-log-time", text: log.timestamp });

      const openBtn = entryHeader.createEl("button", {
        cls: "pensieve-task-btn clickable-icon",
        attr: { "aria-label": "Open log" },
      });
      setIcon(openBtn, "external-link");
      openBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        // Open the log file in a new leaf
        const file = this.app.vault.getAbstractFileByPath(log.vaultPath);
        if (file) {
          await this.app.workspace.getLeaf("tab").openFile(file as any);
        } else {
          new Notice("Log file not found in vault. It may need to be indexed.");
        }
      });

      entry.createDiv({ cls: "pensieve-log-preview", text: log.preview });
    }
  }

  // ── Task execution ──────────────────────────────────────

  private async runTask(task: TaskInfo, runBtn: HTMLElement, logsContainer: HTMLElement): Promise<void> {
    if (this.runningTasks.has(task.filename)) {
      new Notice(`${task.displayName} is already running.`);
      return;
    }

    const fs = require("fs") as typeof import("fs");
    const vaultBase = this.getVaultBasePath();

    // Ensure log directory exists
    const logDir = path.join(vaultBase, LOGS_DIR, task.filename);
    fs.mkdirSync(logDir, { recursive: true });

    // Create log file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logFilename = `${timestamp}.log`;
    const logAbsPath = path.join(logDir, logFilename);
    const logStream = fs.createWriteStream(logAbsPath, { flags: "a" });

    // Determine interpreter
    const { cmd, args } = this.getInterpreter(task);

    // UI: show running state
    runBtn.empty();
    setIcon(runBtn, "loader");
    runBtn.addClass("pensieve-task-running");
    runBtn.setAttribute("disabled", "true");

    const startTime = Date.now();
    logStream.write(`[TASK: ${task.filename}]\n[STARTED: ${new Date().toISOString()}]\n\n`);

    try {
      const proc = spawn(cmd, args, {
        cwd: vaultBase,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      });

      this.runningTasks.set(task.filename, proc);

      proc.stdout?.on("data", (data: Buffer) => logStream.write(data));
      proc.stderr?.on("data", (data: Buffer) => logStream.write(data));

      const exitCode = await new Promise<number | null>((resolve) => {
        proc.on("close", (code) => resolve(code));
        proc.on("error", (err) => {
          logStream.write(`\n[ERROR: ${err.message}]\n`);
          resolve(null);
        });
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logStream.write(`\n[EXIT CODE: ${exitCode ?? "unknown"}]\n[DURATION: ${elapsed}s]\n`);

      if (exitCode === 0) {
        new Notice(`✓ ${task.displayName} completed (${elapsed}s)`);
      } else {
        new Notice(`✗ ${task.displayName} failed (exit ${exitCode})`);
      }
    } catch (err: any) {
      logStream.write(`\n[SPAWN ERROR: ${err.message}]\n`);
      new Notice(`✗ ${task.displayName} failed: ${err.message}`);
    } finally {
      logStream.end();
      this.runningTasks.delete(task.filename);

      // UI: restore run button
      runBtn.empty();
      setIcon(runBtn, "play");
      runBtn.removeClass("pensieve-task-running");
      runBtn.removeAttribute("disabled");

      // Refresh logs if visible
      if (!logsContainer.hasClass("hidden")) {
        await this.renderLogs(task, logsContainer);
      }
    }
  }

  private getInterpreter(task: TaskInfo): { cmd: string; args: string[] } {
    switch (task.ext) {
      case ".ps1":
        return {
          cmd: "powershell.exe",
          args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", task.absolutePath],
        };
      case ".js":
        return { cmd: "node", args: [task.absolutePath] };
      case ".sh":
        return { cmd: "bash", args: [task.absolutePath] };
      case ".bat":
      case ".cmd":
        return { cmd: "cmd.exe", args: ["/c", task.absolutePath] };
      default:
        return { cmd: task.absolutePath, args: [] };
    }
  }
}
