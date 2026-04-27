import * as path from "path";
import { Notice } from "obsidian";
import { runPowerShell, psEscape } from "./powershell";

/**
 * Open the native Windows / OneDrive sharing dialog for a file.
 *
 * Uses Shell.Application COM's InvokeVerb to trigger the OneDrive "Share"
 * context-menu action. Falls back to opening File Explorer with the file
 * selected if the share verb is not available.
 */
export async function shareFile(filePath: string): Promise<void> {
  const folderPath = psEscape(path.dirname(filePath));
  const fileName = psEscape(path.basename(filePath));

  // First, check if the Share verb exists and invoke it via InvokeVerb
  // which avoids the "Invalid window handle" error that DoIt() throws
  // when called from a headless process.
  const script = `
    $shell = New-Object -ComObject Shell.Application
    $folder = $shell.NameSpace('${folderPath}')
    if (-not $folder) { Write-Output 'FOLDER_NOT_FOUND'; exit 1 }
    $item = $folder.ParseName('${fileName}')
    if (-not $item) { Write-Output 'FILE_NOT_FOUND'; exit 1 }

    $hasShare = $false
    foreach ($v in $item.Verbs()) {
      if ($v.Name -match '&?[Ss]hare|&?[Pp]artag') {
        $hasShare = $true
        break
      }
    }

    if ($hasShare) {
      $item.InvokeVerb('share')
      Write-Output 'OK'
    } else {
      Write-Output 'NO_SHARE_VERB'
    }
  `;

  try {
    const result = (await runPowerShell(script)).trim();

    if (result === "NO_SHARE_VERB") {
      await runPowerShell(
        `Start-Process explorer.exe -ArgumentList '/select,"${psEscape(filePath)}"'`
      );
      new Notice(
        "OneDrive share dialog not available. File Explorer opened — right-click the file to share."
      );
    } else if (result !== "OK") {
      throw new Error(result);
    }
  } catch (err: any) {
    new Notice(`Failed to open share dialog: ${err.message}`);
  }
}
