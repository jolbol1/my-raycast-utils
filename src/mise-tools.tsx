import { Action, ActionPanel, Color, Icon, Keyboard, List } from "@raycast/api";
import { useMemo, useState } from "react";
import ToolActions from "./components/mise/tool-actions";
import { useMiseRegistry } from "./hooks/use-mise-registry";
import { useMiseTools } from "./hooks/use-mise-tools";
import { MiseInstalledTool, MiseOutdatedTool } from "./utils/mise";
import { MiseRegistryEntry } from "./utils/mise-registry";

const MISE_INSTALL_URL = "https://mise.jdx.dev/getting-started.html";

const buildDetailMarkdown = (tool: MiseInstalledTool, entry?: MiseRegistryEntry) =>
  [`# ${tool.name}`, entry?.description ?? "_No description in the mise registry._"].join("\n\n");

export default function Command() {
  const {
    tools,
    outdated,
    isLoading,
    isCheckingOutdated,
    error,
    refresh: refreshTools,
  } = useMiseTools({
    checkOutdated: true,
  });
  const { byShort, refresh: refreshRegistry } = useMiseRegistry();
  const [isShowingDetail, setIsShowingDetail] = useState(true);

  const { outdatedTools, currentTools } = useMemo(() => {
    const isOutdated = (tool: MiseInstalledTool) => {
      const entry = outdated[tool.name];
      return Boolean(entry?.latest && entry.latest !== entry.current);
    };

    return {
      outdatedTools: tools.filter(isOutdated),
      currentTools: tools.filter((tool) => !isOutdated(tool)),
    };
  }, [tools, outdated]);

  const refresh = async () => {
    await Promise.all([refreshTools(), refreshRegistry()]);
  };

  const renderTool = (tool: MiseInstalledTool) => {
    const entry = byShort.get(tool.name);
    const update: MiseOutdatedTool | undefined = outdated[tool.name];
    const current = tool.current;
    const hasUpdate = Boolean(update?.latest && update.latest !== update.current);

    return (
      <List.Item
        key={tool.name}
        title={tool.name}
        subtitle={isShowingDetail ? undefined : entry?.description}
        icon={hasUpdate ? { source: Icon.ArrowUpCircle, tintColor: Color.Orange } : Icon.Box}
        accessories={[
          ...(current ? [{ tag: { value: current.version, color: hasUpdate ? Color.Orange : Color.Green } }] : []),
          ...(hasUpdate ? [{ tag: { value: `→ ${update?.latest}`, color: Color.Orange } }] : []),
        ]}
        detail={
          <List.Item.Detail
            markdown={buildDetailMarkdown(tool, entry)}
            metadata={
              <List.Item.Detail.Metadata>
                <List.Item.Detail.Metadata.Label title="Installed" text={current?.version ?? "Unknown"} />
                <List.Item.Detail.Metadata.Label title="Pinned As" text={current?.requestedVersion ?? "—"} />
                <List.Item.Detail.Metadata.Label
                  title="Latest"
                  text={update?.latest ?? (isCheckingOutdated ? "Checking…" : "Up to date")}
                  icon={hasUpdate ? { source: Icon.ArrowUpCircle, tintColor: Color.Orange } : undefined}
                />
                {tool.versions.length > 1 ? (
                  <List.Item.Detail.Metadata.Label
                    title="Other Versions"
                    text={tool.versions
                      .filter((version) => version.version !== current?.version)
                      .map((version) => version.version)
                      .join(", ")}
                  />
                ) : null}
                <List.Item.Detail.Metadata.Separator />
                {entry ? (
                  <List.Item.Detail.Metadata.TagList title="Full">
                    {entry.backends.map((backend) => (
                      <List.Item.Detail.Metadata.TagList.Item key={backend.name} text={backend.name} />
                    ))}
                  </List.Item.Detail.Metadata.TagList>
                ) : null}
                {entry ? (
                  <List.Item.Detail.Metadata.Label
                    title="OS"
                    text={entry.os.length > 0 ? entry.os.join(", ") : "All platforms"}
                  />
                ) : null}
                <List.Item.Detail.Metadata.Separator />
                {current?.source ? <List.Item.Detail.Metadata.Label title="Config" text={current.source} /> : null}
                {current?.installPath ? (
                  <List.Item.Detail.Metadata.Label title="Install Path" text={current.installPath} />
                ) : null}
              </List.Item.Detail.Metadata>
            }
          />
        }
        actions={
          <ActionPanel>
            <ToolActions
              tool={tool.name}
              installed={tool}
              outdated={update}
              backends={entry?.backends}
              onChange={refresh}
            />
            <ActionPanel.Section title="View">
              <Action
                title={isShowingDetail ? "Hide Details" : "Show Details"}
                icon={Icon.Sidebar}
                shortcut={{ modifiers: ["cmd"], key: "d" }}
                onAction={() => setIsShowingDetail((shown) => !shown)}
              />
              {current?.installPath ? (
                <Action.ShowInFinder
                  title="Reveal Install Folder"
                  path={current.installPath}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
                />
              ) : null}
            </ActionPanel.Section>
          </ActionPanel>
        }
      />
    );
  };

  if (error) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title="Could not read your mise tools"
          description={error.message}
          actions={
            <ActionPanel>
              <Action
                title="Try Again"
                icon={Icon.RotateClockwise}
                shortcut={Keyboard.Shortcut.Common.Refresh}
                onAction={refresh}
              />
              <Action.OpenInBrowser title="Open Mise Install Guide" url={MISE_INSTALL_URL} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading || isCheckingOutdated}
      isShowingDetail={isShowingDetail && tools.length > 0}
      navigationTitle="Manage Mise Tools"
      searchBarPlaceholder="Search your global mise tools"
    >
      <List.EmptyView
        icon={Icon.Box}
        title="No global mise tools"
        description="Install one with the Search Mise Registry command."
      />
      {outdatedTools.length > 0 ? (
        <List.Section title="Updates Available" subtitle={`${outdatedTools.length}`}>
          {outdatedTools.map(renderTool)}
        </List.Section>
      ) : null}
      {currentTools.length > 0 ? (
        <List.Section title="Up to Date" subtitle={`${currentTools.length}`}>
          {currentTools.map(renderTool)}
        </List.Section>
      ) : null}
    </List>
  );
}
