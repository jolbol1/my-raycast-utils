import { Toast, showToast, getPreferenceValues } from "@raycast/api";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePinSvg } from "../hooks/use-pin-svg";
import { useRecentSvg } from "../hooks/use-recent-svg";
import { Category, Svg } from "../type";
import { fetchCategories, fetchSvgs } from "../utils/fetch";
import { LOCAL_CATEGORY, loadLocalSvgs } from "../utils/local-icons";
import { clearRenderCache } from "../utils/render-source";

interface AppContextProps {
  svgs: Svg[];
  categories: Category[];
  pinnedSvgIds: number[];
  pinSvg: (id: number, name: string) => Promise<void>;
  unPinSvg: (id: number, name: string) => Promise<void>;
  moveUpInPinned: (id: number, name: string) => Promise<void>;
  moveDownInPinned: (id: number, name: string) => Promise<void>;
  selectedItemKey?: string;
  focusGridItem: (svgId: number, key: string) => void;
  recentSvgIds: number[];
  addRecentSvgId: (id: number) => void;
  refresh: () => Promise<void>;
  isLoading: boolean;
}

const defaultAppContext: AppContextProps = {
  svgs: [],
  categories: [],
  pinnedSvgIds: [],
  pinSvg: async () => {},
  unPinSvg: async () => {},
  moveUpInPinned: async () => {},
  moveDownInPinned: async () => {},
  selectedItemKey: undefined,
  focusGridItem: () => {},
  recentSvgIds: [],
  addRecentSvgId: () => {},
  refresh: async () => {},
  isLoading: true,
};

export const AppContext = createContext<AppContextProps>(defaultAppContext);

export const useSvglExtension = () => {
  return useContext(AppContext);
};

export const SvglExtensionProvider = ({ children }: { children: React.ReactNode }) => {
  const {
    isLoading: isLoadingPinnedSvg,
    pinnedSvgIds,
    loadPinnedSvg,
    pinSvg,
    unPinSvg,
    moveUpInPinned,
    moveDownInPinned,
  } = usePinSvg();
  const { isLoading: isLoadingRecentSvg, recentSvgIds, loadRecentSvg, addRecentSvgId } = useRecentSvg();
  const [isAPILoading, setIsAPILoading] = useState(true);
  const [svgs, setSvgs] = useState<Svg[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedItemKey, setSelectedItemKey] = useState<string | undefined>();

  // Because in All view, SVG's ID would be used in the Pinned Section and the All Section, so we need to add a prefix to make it unique.
  // The key is bound in the Pinned Section with the prefix `pinned`, for example: `pinned_1`
  const focusGridItem = useCallback((svgId: number, key: string) => {
    setSelectedItemKey(`${key}_${svgId}`);
  }, []);

  const fetchData = useCallback(async () => {
    setIsAPILoading(true);

    // Local icons are loaded first and independently of the network, so a
    // failing/slow svgl.app request never hides them.
    const preferences = getPreferenceValues<Preferences.Index>();
    const { svgs: localSvgs, error: localError } = loadLocalSvgs(preferences.localIconsPath);
    const localCategories: Category[] =
      localSvgs.length > 0 ? [{ category: LOCAL_CATEGORY, total: localSvgs.length }] : [];

    setSvgs(localSvgs);
    setCategories(localCategories);

    if (localError && preferences.localIconsPath) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Local icons not loaded",
        message: localError,
      });
    }

    try {
      const [apiSvgs, apiCategories] = await Promise.all([fetchSvgs(), fetchCategories()]);

      // Local icons come first, so the Custom category is at the top of the
      // dropdown and its section is the first one in the All grid.
      setSvgs([...localSvgs, ...apiSvgs]);
      setCategories([...localCategories, ...apiCategories]);
    } catch (error) {
      if (error instanceof Error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Loading Failed",
          message: error.message,
        });
      }
    }
    setIsAPILoading(false);
  }, []);

  useEffect(() => {
    loadPinnedSvg();
    loadRecentSvg();
    fetchData();
  }, []);

  /** Drops every cached list and render, then reloads from svgl.app. */
  const refresh = useCallback(async () => {
    clearRenderCache();
    await showToast({ style: Toast.Style.Animated, title: "Refreshing icons" });
    await fetchData();
    await showToast({ style: Toast.Style.Success, title: "Icons refreshed" });
  }, [fetchData]);

  return (
    <AppContext.Provider
      value={{
        svgs,
        categories,
        pinnedSvgIds,
        pinSvg,
        unPinSvg,
        moveUpInPinned,
        moveDownInPinned,
        selectedItemKey,
        focusGridItem,
        recentSvgIds,
        addRecentSvgId,
        refresh,
        isLoading: isLoadingPinnedSvg || isLoadingRecentSvg || isAPILoading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
