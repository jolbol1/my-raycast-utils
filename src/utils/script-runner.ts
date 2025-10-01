import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const SCRIPTS_DIR = "/Users/work/.dotfiles/scripts";

/**
 * Run a script from the .dotfiles/scripts directory
 * @param scriptName - Name of the script file (e.g., "transcribe.sh")
 * @param args - Arguments to pass to the script
 * @returns Promise with stdout
 */
export async function runDotfileScript(scriptName: string, args: string[] = []): Promise<string> {
  const scriptPath = `${SCRIPTS_DIR}/${scriptName}`;
  const quotedArgs = args.map((arg) => JSON.stringify(arg)).join(" ");

  // Source shell profile to get PATH for tools like ffmpeg
  const command = `source ~/.zprofile 2>/dev/null; source ~/.zshrc 2>/dev/null; ${scriptPath} ${quotedArgs}`;

  console.log("Running script:", command);

  try {
    const { stdout, stderr } = await execAsync(command, {
      shell: "/bin/zsh",
    });
    if (stderr) {
      console.error("Script stderr:", stderr);
    }
    return stdout.trim();
  } catch (error) {
    console.error("Script execution failed:", error);
    throw error;
  }
}
