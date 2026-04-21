import * as path from "path";
import { Notice } from "obsidian";
import { runPowerShell, psEscape } from "./powershell";

/**
 * Open the native Windows / OneDrive sharing dialog for a file.
 *
 * Uses the Shell.Application COM object to invoke the "Share" verb that the
 * OneDrive sync client adds to the explorer context menu. Falls back to
 * opening File Explorer with the file selected if the verb is not found.
 */
export async function shareFile(filePath: string): Promise<void> {
  const folderPath = psEscape(path.dirname(filePath));
  const fileName = psEscape(path.basename(filePath));

  const script = `
    $shell = New-Object -ComObject Shell.Application
    $folder = $shell.NameSpace('${folderPath}')
    if (-not $folder) { Write-Output 'FOLDER_NOT_FOUND'; exit 1 }
    $item = $folder.ParseName('${fileName}')
    if (-not $item) { Write-Output 'FILE_NOT_FOUND'; exit 1 }

    $shareVerb = $null
    foreach ($v in $item.Verbs()) {
      if ($v.Name -match '[Ss]hare|[Pp]artag') {
        $shareVerb = $v
        break
      }
    }

    if ($shareVerb) {
      $shareVerb.DoIt()
      Write-Output 'OK'
    } else {
      Write-Output 'NO_SHARE_VERB'
    }
  `;

  try {
    const result = (await runPowerShell(script)).trim();

    if (result === "NO_SHARE_VERB") {
      // Fallback: open File Explorer with the file selected
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
