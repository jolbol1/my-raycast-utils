import { useCallback, useEffect, useState } from "react";
import { MiseRegistryEntry, fetchMiseRegistry } from "../utils/mise-registry";

export interface MiseRegistryState {
  entries: MiseRegistryEntry[];
  byShort: Map<string, MiseRegistryEntry>;
  isLoading: boolean;
  error?: Error;
  refresh: () => Promise<void>;
}

export const useMiseRegistry = (): MiseRegistryState => {
  const [entries, setEntries] = useState<MiseRegistryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setEntries(await fetchMiseRegistry());
      setError(undefined);
    } catch (loadError) {
      setEntries([]);
      setError(loadError instanceof Error ? loadError : new Error(String(loadError)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    entries,
    byShort: new Map(entries.map((entry) => [entry.short, entry])),
    isLoading,
    error,
    refresh: load,
  };
};
