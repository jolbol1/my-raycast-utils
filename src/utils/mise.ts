import { getPreferenceValues } from "@raycast/api";
import { execa, ExecaError } from "execa";
import { existsSync } from "fs";
import os from "os";
import path from "path";

/** A single installed version of a tool, as reported by `mise ls --json`. */
export interface MiseToolVersion {
  version: string;
  requestedVersion?: string;
  installPath?: string;
  source?: string;
  installed: boolean;
  active: boolean;
}

/** A tool that has at least one version in the global config. */
export interface MiseInstalledTool {
  name: string;
  versions: MiseToolVersion[];
  /** The active version, or the first one when mise reports none as active. */
  current?: MiseToolVersion;
}

/** An entry of `mise outdated --json`. */
export interface MiseOutdatedTool {
  name: string;
  requested: string;
  current?: string;
  latest?: string;
  bump?: string;
}

/** Raised when no mise binary can be found, so the UI can explain how to fix it. */
export class MiseNotFoundError extends Error {
  constructor() {
    super("mise was not found. Install it from https://mise.jdx.dev or set the mise path in the extension settings.");
    this.name = "MiseNotFoundError";
  }
}

// Raycast starts commands with a bare PATH, so the binary has to be located by hand.
const CANDIDATE_PATHS = [
  path.join(os.homedir(), ".local", "bin", "mise"),
  "/opt/homebrew/bin/mise",
  "/usr/local/bin/mise",
  path.join(os.homedir(), ".cargo", "bin", "mise"),
];

// Sourcing the profile is what puts the backend toolchains (node, go, cargo, …) on
// PATH. Its own output is thrown away so it can never pollute the JSON we parse.
const SHELL = "/bin/zsh";
const SHELL_PRELUDE = '{ source ~/.zprofile; source ~/.zshrc; } >/dev/null 2>&1; "$0" "$@"';

const DEFAULT_TIMEOUT_MS = 1000 * 60;
const INSTALL_TIMEOUT_MS = 1000 * 60 * 15;

let cachedBin: string | undefined;

/** Asks the login shell where mise lives, ignoring shell functions and aliases. */
const lookupMiseInShell = async () => {
  try {
    const { stdout } = await execa(
      SHELL,
      ["-c", "{ source ~/.zprofile; source ~/.zshrc; } >/dev/null 2>&1; which -p mise"],
      {
        timeout: 15000,
      },
    );
    const candidate = stdout.trim().split("\n").pop()?.trim();
    return candidate && candidate.startsWith("/") && existsSync(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
};

const findMiseBin = async (): Promise<string> => {
  const { misePath } = getPreferenceValues<ExtensionPreferences>();
  const configured = misePath?.trim();
  if (configured) {
    if (!existsSync(configured)) {
      throw new Error(`No mise binary at ${configured}. Update the mise path in the extension settings.`);
    }
    return configured;
  }

  const candidate = CANDIDATE_PATHS.find((binPath) => existsSync(binPath)) ?? (await lookupMiseInShell());
  if (!candidate) {
    throw new MiseNotFoundError();
  }

  return candidate;
};

export const resolveMiseBin = async (): Promise<string> => {
  cachedBin = cachedBin ?? (await findMiseBin());
  return cachedBin;
};

/** The most useful line of a failed mise run, because mise reports errors on stderr. */
const describeFailure = (error: unknown) => {
  const execaError = error as ExecaError;
  const stderr = typeof execaError?.stderr === "string" ? execaError.stderr.trim() : "";
  if (stderr) {
    return stderr.split("\n").slice(-4).join("\n");
  }
  return error instanceof Error ? error.message : String(error);
};

export const runMise = async (args: string[], timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<string> => {
  const bin = await resolveMiseBin();

  try {
    // Running from the home directory means mise resolves the global config and no
    // stray mise.toml from another project can change the answer.
    const { stdout } = await execa(SHELL, ["-c", SHELL_PRELUDE, bin, ...args], {
      cwd: os.homedir(),
      env: { MISE_YES: "1" },
      timeout: timeoutMs,
    });
    return stdout;
  } catch (error) {
    if (error instanceof MiseNotFoundError) {
      throw error;
    }
    throw new Error(describeFailure(error));
  }
};

const runMiseJson = async <T>(args: string[], timeoutMs?: number): Promise<T> => {
  const stdout = await runMise(args, timeoutMs);
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new Error(`mise ${args.join(" ")} did not return JSON.`);
  }
};

interface RawToolVersion {
  version: string;
  requested_version?: string;
  install_path?: string;
  source?: { type?: string; path?: string };
  installed?: boolean;
  active?: boolean;
}

/** Every tool in the global config, newest-first within each tool. */
export const listGlobalTools = async (): Promise<MiseInstalledTool[]> => {
  const raw = await runMiseJson<Record<string, RawToolVersion[]>>(["ls", "--global", "--json"]);

  return Object.entries(raw)
    .map(([name, rawVersions]) => {
      const versions: MiseToolVersion[] = rawVersions.map((rawVersion) => ({
        version: rawVersion.version,
        requestedVersion: rawVersion.requested_version,
        installPath: rawVersion.install_path,
        source: rawVersion.source?.path,
        installed: rawVersion.installed ?? false,
        active: rawVersion.active ?? false,
      }));

      return { name, versions, current: versions.find((version) => version.active) ?? versions[0] };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

interface RawOutdatedTool {
  name: string;
  requested: string;
  current?: string | null;
  latest?: string | null;
  bump?: string | null;
}

/** Outdated tools keyed by tool name. This one hits the network, so call it separately. */
export const listOutdatedTools = async (): Promise<Record<string, MiseOutdatedTool>> => {
  const raw = await runMiseJson<Record<string, RawOutdatedTool>>(["outdated", "--json"], 1000 * 60 * 3);

  return Object.fromEntries(
    Object.entries(raw).map(([name, tool]) => [
      name,
      {
        name: tool.name ?? name,
        requested: tool.requested,
        current: tool.current ?? undefined,
        latest: tool.latest ?? undefined,
        bump: tool.bump ?? undefined,
      },
    ]),
  );
};

/** Installable versions, newest first. */
export const listRemoteVersions = async (tool: string): Promise<string[]> => {
  const stdout = await runMise(["ls-remote", tool], 1000 * 60 * 2);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();
};

/** `mise use -g <tool>[@version]` — installs and pins the tool in the global config. */
export const installToolGlobally = (tool: string, version?: string) =>
  runMise(["use", "--global", "--yes", version ? `${tool}@${version}` : tool], INSTALL_TIMEOUT_MS);

/** Upgrades one tool. `bump` also rewrites the pinned version in the global config. */
export const upgradeTool = (tool: string, bump: boolean) =>
  runMise(["upgrade", "--yes", ...(bump ? ["--bump"] : []), tool], INSTALL_TIMEOUT_MS);

export const upgradeAllTools = (bump: boolean) =>
  runMise(["upgrade", "--yes", ...(bump ? ["--bump"] : [])], INSTALL_TIMEOUT_MS);

/** Drops the tool from the global config and deletes every version it has on disk. */
export const removeToolGlobally = async (tool: string) => {
  await runMise(["use", "--global", "--yes", "--remove", tool]);
  await runMise(["uninstall", "--yes", "--all", tool], INSTALL_TIMEOUT_MS);
};

/** Deletes one installed version but leaves the global config alone. */
export const uninstallToolVersion = (tool: string, version: string) =>
  runMise(["uninstall", "--yes", `${tool}@${version}`], INSTALL_TIMEOUT_MS);
