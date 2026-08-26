import { useCallback, useEffect, useState } from "react";
import { MiseInstalledTool, MiseOutdatedTool, listGlobalTools, listOutdatedTools } from "../utils/mise";

interface UseMiseToolsOptions {
  /** Checking for updates hits the network for every tool, so it is opt-in. */
  checkOutdated?: boolean;
}

export interface MiseToolsState {
  tools: MiseInstalledTool[];
  outdated: Record<string, MiseOutdatedTool>;
  isLoading: boolean;
  isCheckingOutdated: boolean;
  error?: Error;
  refresh: () => Promise<void>;
}

export const useMiseTools = ({ checkOutdated = false }: UseMiseToolsOptions = {}): MiseToolsState => {
  const [tools, setTools] = useState<MiseInstalledTool[]>([]);
  const [outdated, setOutdated] = useState<Record<string, MiseOutdatedTool>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingOutdated, setIsCheckingOutdated] = useState(checkOutdated);
  const [error, setError] = useState<Error | undefined>();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setTools(await listGlobalTools());
      setError(undefined);
    } catch (loadError) {
      setTools([]);
      setError(loadError instanceof Error ? loadError : new Error(String(loadError)));
    } finally {
      setIsLoading(false);
    }

    if (!checkOutdated) {
      return;
    }

    setIsCheckingOutdated(true);
    try {
      setOutdated(await listOutdatedTools());
    } catch {
      // The installed list is still worth showing when the update check fails.
      setOutdated({});
    } finally {
      setIsCheckingOutdated(false);
    }
  }, [checkOutdated]);

  useEffect(() => {
    load();
  }, [load]);

  return { tools, outdated, isLoading, isCheckingOutdated, error, refresh: load };
};
