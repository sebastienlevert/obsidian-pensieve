import { execFile } from "child_process";
import * as path from "path";
import { Notice } from "obsidian";

const MARKMYWORD = "markmyword";

/**
 * Convert a markdown file to Word (.docx) using the markmyword CLI.
 * The output file is placed in the same directory with a .docx extension.
 * After conversion, the file is revealed in File Explorer.
 */
export async function convertToWord(absolutePath: string): Promise<void> {
  const basename = path.basename(absolutePath, path.extname(absolutePath));
  const dir = path.dirname(absolutePath);
  const outputPath = path.join(dir, `${basename}.docx`);

  new Notice(`Converting "${basename}" to Word…`);

  try {
    await runMarkMyWord(absolutePath);
    new Notice(`✅ Created "${basename}.docx"`);
    // Reveal the .docx in File Explorer since Obsidian hides non-supported files
    revealInExplorer(outputPath);
  } catch (err: any) {
    new Notice(`❌ Word conversion failed: ${err.message}`);
  }
}

function runMarkMyWord(inputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      MARKMYWORD,
      ["convert", "-i", inputPath, "--force"],
      { timeout: 30000 },
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

/** Open File Explorer with the given file selected */
function revealInExplorer(filePath: string): void {
  execFile("explorer.exe", ["/select,", filePath], (err) => {
    // Best-effort — ignore errors
  });
}
