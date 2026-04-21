import { execFile } from "child_process";

/**
 * Escape a string for embedding inside a PowerShell single-quoted string.
 * Single quotes are doubled: ' → ''
 */
export function psEscape(s: string): string {
  return s.replace(/'/g, "''");
}

/** Run a PowerShell snippet and return stdout. */
export function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      { timeout: 15000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout);
        }
      }
    );
  });
}
