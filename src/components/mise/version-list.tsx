import { Action, ActionPanel, Icon, Keyboard, List, useNavigation } from "@raycast/api";
import { useEffect, useState } from "react";
import { MiseToolVersion, installToolGlobally, listRemoteVersions, uninstallToolVersion } from "../../utils/mise";
import { runMiseTask } from "./run-mise-task";

interface VersionListProps {
  tool: string;
  /** Versions already on disk, so they can be marked in the list. */
  installedVersions: MiseToolVersion[];
  onChange?: () => void | Promise<void>;
}

/** Picks one of the versions mise can install and pins it in the global config. */
export default function VersionList({ tool, installedVersions, onChange }: VersionListProps) {
  const { pop } = useNavigation();
  const [versions, setVersions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    let cancelled = false;

    listRemoteVersions(tool)
      .then((remoteVersions) => {
        if (!cancelled) {
          setVersions(remoteVersions);
        }
      })
      .catch((listError) => {
        if (!cancelled) {
          setError(listError instanceof Error ? listError : new Error(String(listError)));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tool]);

  const installedByVersion = new Map(installedVersions.map((version) => [version.version, version]));

  const install = (version: string) =>
    runMiseTask({
      title: `Installing ${tool}@${version}`,
      successTitle: `Installed ${tool}@${version}`,
      failureTitle: `Failed to install ${tool}@${version}`,
      task: () => installToolGlobally(tool, version),
      onDone: async () => {
        await onChange?.();
        pop();
      },
    });

  const uninstall = (version: string) =>
    runMiseTask({
      title: `Removing ${tool}@${version}`,
      successTitle: `Removed ${tool}@${version}`,
      failureTitle: `Failed to remove ${tool}@${version}`,
      task: () => uninstallToolVersion(tool, version),
      onDone: onChange,
    });

  return (
    <List isLoading={isLoading} navigationTitle={`${tool} Versions`} searchBarPlaceholder={`Filter ${tool} versions`}>
      {error ? (
        <List.EmptyView icon={Icon.Warning} title="Could not list versions" description={error.message} />
      ) : (
        versions.map((version) => {
          const installed = installedByVersion.get(version);
          return (
            <List.Item
              key={version}
              title={version}
              icon={installed ? Icon.CheckCircle : Icon.Circle}
              accessories={installed?.active ? [{ tag: "Active" }] : installed ? [{ tag: "Installed" }] : undefined}
              actions={
                <ActionPanel>
                  <Action
                    title={`Use ${tool}@${version} Globally`}
                    icon={Icon.Download}
                    onAction={() => install(version)}
                  />
                  {installed ? (
                    <Action
                      title={`Remove ${tool}@${version}`}
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      shortcut={Keyboard.Shortcut.Common.Remove}
                      onAction={() => uninstall(version)}
                    />
                  ) : null}
                  <Action.CopyToClipboard
                    title="Copy Install Command"
                    content={`mise use -g ${tool}@${version}`}
                    shortcut={Keyboard.Shortcut.Common.Copy}
                  />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
