export const PLUGIN_ID = "pensieve";
export const PLUGIN_NAME = "Pensieve";

export const VIEW_TYPE_TODAY = "pensieve-today-view";
export const ICON_TODAY = "pensieve-today";

export const VIEW_TYPE_TASKS = "pensieve-tasks-view";
export const ICON_TASKS = "pensieve-tasks";

export const TASKS_DIR = ".pensieve/tasks";
export const LOGS_DIR = ".pensieve/logs";

// Calendar-sun icon for the Today pane
export const TODAY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="50" r="20"/><line x1="50" y1="5" x2="50" y2="18"/><line x1="50" y1="82" x2="50" y2="95"/><line x1="5" y1="50" x2="18" y2="50"/><line x1="82" y1="50" x2="95" y2="50"/><line x1="18.2" y1="18.2" x2="27.4" y2="27.4"/><line x1="72.6" y1="72.6" x2="81.8" y2="81.8"/><line x1="18.2" y1="81.8" x2="27.4" y2="72.6"/><line x1="72.6" y1="27.4" x2="81.8" y2="18.2"/></svg>`;

// Gear/cog icon for the Tasks pane
export const TASKS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="20" rx="4" width="76" height="12"/><rect x="12" y="44" rx="4" width="76" height="12"/><rect x="12" y="68" rx="4" width="76" height="12"/><circle cx="28" cy="26" r="5" fill="currentColor"/><circle cx="58" cy="50" r="5" fill="currentColor"/><circle cx="40" cy="74" r="5" fill="currentColor"/></svg>`;

export interface PensieveSettings {
  todayNotePath: string;
}

export const DEFAULT_SETTINGS: PensieveSettings = {
  todayNotePath: "",
};
