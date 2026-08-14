import { ActionPanel, getPreferenceValues } from "@raycast/api";
import { ReactElement } from "react";
import CopySvgActions from "./actions/copy-svg-actions";
import CopySvgFileActions from "./actions/copy-svg-file-actions";
import CopyWordmarkSvgActions from "./actions/copy-wordmark-svg-actions";
import { Svg, SvgActionKey } from "../type";
import PinSvgAction from "./actions/pin-svg-action";
import CopyPngActions from "./actions/copy-png-actions";

interface SvgActionProps {
  svg: Svg;
}

const SvgAction = ({ svg }: SvgActionProps) => {
  const preferences = getPreferenceValues<Preferences.Index>();
  const { svgDefaultAction } = preferences;

  const actionSections: Record<SvgActionKey, ReactElement> = {
    copySvg: (
      <ActionPanel.Section title="Copy SVG" key="copySvg">
        <CopySvgActions svg={svg} />
      </ActionPanel.Section>
    ),
    copySvgFile: (
      <ActionPanel.Section title="Copy SVG File" key="copySvgFile">
        <CopySvgFileActions svg={svg} />
      </ActionPanel.Section>
    ),
    copySvgWordmark: (
      <ActionPanel.Section title="Copy SVG Wordmark" key="copySvgWordmark">
        <CopyWordmarkSvgActions svg={svg} />
      </ActionPanel.Section>
    ),
    copyPng: (
      <ActionPanel.Section title="Copy PNG" key="copyPng">
        <CopyPngActions svg={svg} />
      </ActionPanel.Section>
    ),
    operation: (
      <ActionPanel.Section title="Operation" key="operation">
        <PinSvgAction svg={svg} />
      </ActionPanel.Section>
    ),
  };

  const orderedKeys = Object.keys(actionSections) as SvgActionKey[];
  const reorderedKeys: SvgActionKey[] = orderedKeys.includes(svgDefaultAction ?? "copySvg")
    ? [svgDefaultAction ?? "copySvg", ...orderedKeys.filter((key) => key !== svgDefaultAction)]
    : orderedKeys;

  return <>{reorderedKeys.map((key) => actionSections[key])}</>;
};

export default SvgAction;
