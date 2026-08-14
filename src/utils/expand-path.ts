import os from "os";
import path from "path";

/**
 * Expands a user-supplied path into an absolute one.
 * Handles `~`, `~/…` and relative paths, and trims stray whitespace/quotes
 * that sneak in when a path is pasted from Finder or a terminal.
 */
export const expandPath = (input: string): string => {
  let value = input.trim().replace(/^["']|["']$/g, "");

  if (value === "~") {
    return os.homedir();
  }

  if (value.startsWith("~/")) {
    value = path.join(os.homedir(), value.slice(2));
  }

  return path.resolve(value);
};
