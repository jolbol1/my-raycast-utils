import { Action, ActionPanel, Color, Icon, Keyboard, List } from "@raycast/api";
import { useMemo, useState } from "react";
import ToolActions from "./components/mise/tool-actions";
import { useMiseRegistry } from "./hooks/use-mise-registry";
import { useMiseTools } from "./hooks/use-mise-tools";
import { MiseInstalledTool } from "./utils/mise";
import { MISE_REGISTRY_URL, MiseRegistryEntry, filterRegistry } from "./utils/mise-registry";

type RegistryFilter = "all" | "installed" | "available";

const OS_ICONS: Record<string, Icon> = {
  macos: Icon.Desktop,
  linux: Icon.Terminal,
  windows: Icon.Window,
};

/** An empty OS column on the registry page means the tool has no platform limit. */
const describeOs = (os: string[]) => (os.length > 0 ? os.join(", ") : "All platforms");

const buildDetailMarkdown = (entry: MiseRegistryEntry) =>
  [`# ${entry.short}`, entry.description ?? "_No description in the mise registry._"].join("\n\n");

export default function Command() {
  const { entries, isLoading: isLoadingRegistry, error, refresh: refreshRegistry } = useMiseRegistry();
  const { tools, isLoading: isLoadingTools, refresh: refreshTools } = useMiseTools();
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<RegistryFilter>("all");
  const [isShowingDetail, setIsShowingDetail] = useState(true);

  const installedByName = useMemo(
    () => new Map<string, MiseInstalledTool>(tools.map((tool) => [tool.name, tool])),
    [tools],
  );

  const results = useMemo(() => {
    const matches = filterRegistry(entries, searchText);
    if (filter === "installed") {
      return matches.filter((entry) => installedByName.has(entry.short));
    }
    if (filter === "available") {
      return matches.filter((entry) => !installedByName.has(entry.short));
    }
    return matches;
  }, [entries, searchText, filter, installedByName]);

  const refresh = async () => {
    await Promise.all([refreshRegistry(), refreshTools()]);
  };

  return (
    <List
      isLoading={isLoadingRegistry || isLoadingTools}
      isShowingDetail={isShowingDetail && results.length > 0}
      filtering={false}
      throttle
      onSearchTextChange={setSearchText}
      navigationTitle="Search Mise Registry"
      searchBarPlaceholder="Search the mise registry"
      searchBarAccessory={
        <List.Dropdown tooltip="Filter tools" storeValue onChange={(value) => setFilter(value as RegistryFilter)}>
          <List.Dropdown.Item title="All Tools" value="all" />
          <List.Dropdown.Item title="Installed Globally" value="installed" />
          <List.Dropdown.Item title="Not Installed" value="available" />
        </List.Dropdown>
      }
    >
      {error ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Could not load the mise registry"
          description={error.message}
          actions={
            <ActionPanel>
              <Action
                title="Try Again"
                icon={Icon.RotateClockwise}
                shortcut={Keyboard.Shortcut.Common.Refresh}
                onAction={refresh}
              />
              <Action.OpenInBrowser title="Open Mise Registry" url={MISE_REGISTRY_URL} />
            </ActionPanel>
          }
        />
      ) : (
        results.map((entry) => {
          const installed = installedByName.get(entry.short);
          const current = installed?.current;

          return (
            <List.Item
              key={entry.short}
              title={entry.short}
              subtitle={isShowingDetail ? undefined : entry.description}
              icon={installed ? { source: Icon.CheckCircle, tintColor: Color.Green } : Icon.Box}
              accessories={
                isShowingDetail
                  ? current
                    ? [{ tag: { value: current.version, color: Color.Green } }]
                    : undefined
                  : [
                      ...(current ? [{ tag: { value: current.version, color: Color.Green } }] : []),
                      ...entry.os.map((os) => ({ tag: os, icon: OS_ICONS[os] })),
                    ]
              }
              detail={
                <List.Item.Detail
                  markdown={buildDetailMarkdown(entry)}
                  metadata={
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label title="Short" text={entry.short} />
                      <List.Item.Detail.Metadata.TagList title="Full">
                        {entry.backends.map((backend) => (
                          <List.Item.Detail.Metadata.TagList.Item key={backend.name} text={backend.name} />
                        ))}
                      </List.Item.Detail.Metadata.TagList>
                      <List.Item.Detail.Metadata.Label title="OS" text={describeOs(entry.os)} />
                      {entry.aliases && entry.aliases.length > 0 ? (
                        <List.Item.Detail.Metadata.Label title="Aliases" text={entry.aliases.join(", ")} />
                      ) : null}
                      <List.Item.Detail.Metadata.Separator />
                      <List.Item.Detail.Metadata.Label
                        title="Installed"
                        text={current ? current.version : "Not installed globally"}
                        icon={current ? { source: Icon.CheckCircle, tintColor: Color.Green } : Icon.Circle}
                      />
                      {current?.requestedVersion ? (
                        <List.Item.Detail.Metadata.Label title="Pinned As" text={current.requestedVersion} />
                      ) : null}
                      {current?.source ? (
                        <List.Item.Detail.Metadata.Label title="Config" text={current.source} />
                      ) : null}
                    </List.Item.Detail.Metadata>
                  }
                />
              }
              actions={
                <ActionPanel>
                  <ToolActions tool={entry.short} installed={installed} backends={entry.backends} onChange={refresh} />
                  <ActionPanel.Section title="View">
                    <Action
                      title={isShowingDetail ? "Hide Details" : "Show Details"}
                      icon={Icon.Sidebar}
                      shortcut={{ modifiers: ["cmd"], key: "d" }}
                      onAction={() => setIsShowingDetail((shown) => !shown)}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
