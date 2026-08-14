import { execa } from "execa";
import { existsSync } from "fs";
import os from "os";
import path from "path";

const SCRIPTS_DIR = path.join(os.homedir(), ".dotfiles", "scripts");

/**
 * Run a script from the .dotfiles/scripts directory
 * @param scriptName - Name of the script file (e.g., "transcribe.sh")
 * @param args - Arguments to pass to the script
 * @returns Promise with stdout
 */
export async function runDotfileScript(scriptName: string, args: string[] = []): Promise<string> {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);

  if (!existsSync(scriptPath)) {
    throw new Error(`Script not found: ${scriptPath}`);
  }

  // Source the shell profile so tools like ffmpeg are on PATH, then exec the
  // script with its arguments passed positionally (never interpolated).
  const { stdout, stderr } = await execa(
    "/bin/zsh",
    ["-c", 'source ~/.zprofile 2>/dev/null; source ~/.zshrc 2>/dev/null; "$0" "$@"', scriptPath, ...args],
    { reject: true },
  );

  if (stderr) {
    console.error("Script stderr:", stderr);
  }

  return stdout.trim();
}
