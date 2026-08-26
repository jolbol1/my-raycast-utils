import { Action, ActionPanel, Alert, Icon, Keyboard, confirmAlert } from "@raycast/api";
import {
  MiseInstalledTool,
  MiseOutdatedTool,
  installToolGlobally,
  removeToolGlobally,
  upgradeAllTools,
  upgradeTool,
} from "../../utils/mise";
import { MISE_REGISTRY_URL, MiseBackend } from "../../utils/mise-registry";
import { runMiseTask } from "./run-mise-task";
import VersionList from "./version-list";

interface ToolActionsProps {
  /** The registry short name, which is what every mise command expects. */
  tool: string;
  installed?: MiseInstalledTool;
  outdated?: MiseOutdatedTool;
  backends?: MiseBackend[];
  onChange: () => void | Promise<void>;
}

/** The full set of install and management actions for one tool, shared by both commands. */
export default function ToolActions({ tool, installed, outdated, backends, onChange }: ToolActionsProps) {
  const install = () =>
    runMiseTask({
      title: `Installing ${tool} globally`,
      successTitle: `Installed ${tool}`,
      failureTitle: `Failed to install ${tool}`,
      task: () => installToolGlobally(tool),
      onDone: onChange,
    });

  const upgrade = (bump: boolean) =>
    runMiseTask({
      title: `Upgrading ${tool}`,
      successTitle: `Upgraded ${tool}`,
      failureTitle: `Failed to upgrade ${tool}`,
      task: () => upgradeTool(tool, bump),
      onDone: onChange,
    });

  const upgradeAll = (bump: boolean) =>
    runMiseTask({
      title: "Upgrading all global tools",
      successTitle: "Upgraded all global tools",
      failureTitle: "Failed to upgrade tools",
      task: () => upgradeAllTools(bump),
      onDone: onChange,
    });

  const remove = async () => {
    const confirmed = await confirmAlert({
      title: `Remove ${tool}?`,
      message: `This removes ${tool} from the global config and deletes every installed version.`,
      icon: Icon.Trash,
      primaryAction: { title: "Remove", style: Alert.ActionStyle.Destructive },
    });

    if (!confirmed) {
      return;
    }

    await runMiseTask({
      title: `Removing ${tool}`,
      successTitle: `Removed ${tool}`,
      failureTitle: `Failed to remove ${tool}`,
      task: () => removeToolGlobally(tool),
      onDone: onChange,
    });
  };

  const linkedBackends = backends?.filter((backend) => backend.url) ?? [];

  return (
    <>
      <ActionPanel.Section>
        {installed ? (
          <Action
            title={`Upgrade ${tool}`}
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["cmd"], key: "u" }}
            onAction={() => upgrade(false)}
          />
        ) : (
          <Action title={`Install ${tool} Globally`} icon={Icon.Download} onAction={install} />
        )}
        <Action.Push
          title="Choose Version…"
          icon={Icon.List}
          shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
          target={<VersionList tool={tool} installedVersions={installed?.versions ?? []} onChange={onChange} />}
        />
        {installed ? <Action title={`Reinstall ${tool} Globally`} icon={Icon.Download} onAction={install} /> : null}
      </ActionPanel.Section>

      <ActionPanel.Section title="Manage">
        {installed ? (
          <Action
            title="Upgrade and Bump Pinned Version"
            icon={Icon.ArrowUpCircle}
            shortcut={{ modifiers: ["cmd", "opt"], key: "u" }}
            onAction={() => upgrade(true)}
          />
        ) : null}
        <Action
          title="Upgrade All Global Tools"
          icon={Icon.ArrowClockwise}
          shortcut={{ modifiers: ["cmd", "shift"], key: "u" }}
          onAction={() => upgradeAll(false)}
        />
        {installed ? (
          <Action
            title={`Remove ${tool}`}
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={Keyboard.Shortcut.Common.Remove}
            onAction={remove}
          />
        ) : null}
        <Action
          title="Refresh"
          icon={Icon.RotateClockwise}
          shortcut={Keyboard.Shortcut.Common.Refresh}
          onAction={() => onChange()}
        />
      </ActionPanel.Section>

      <ActionPanel.Section title="Copy and Open">
        <Action.CopyToClipboard
          title="Copy Install Command"
          content={`mise use -g ${tool}`}
          shortcut={Keyboard.Shortcut.Common.Copy}
        />
        <Action.CopyToClipboard title="Copy Tool Name" content={tool} shortcut={Keyboard.Shortcut.Common.CopyName} />
        {outdated?.latest ? <Action.CopyToClipboard title="Copy Latest Version" content={outdated.latest} /> : null}
        {linkedBackends.map((backend) => (
          <Action.OpenInBrowser key={backend.name} title={`Open ${backend.name}`} url={backend.url as string} />
        ))}
        <Action.OpenInBrowser
          title="Open Mise Registry"
          url={MISE_REGISTRY_URL}
          shortcut={Keyboard.Shortcut.Common.Open}
        />
      </ActionPanel.Section>
    </>
  );
}
