import { ONE_DAY_MS, withCache } from "./cache";
import { runMise } from "./mise";

/** One backend a tool can be installed from, e.g. `aqua:BurntSushi/ripgrep`. */
export interface MiseBackend {
  name: string;
  /** The upstream page the registry links to. Absent for backends without a source link. */
  url?: string;
}

/** A row of https://mise.jdx.dev/registry.html, enriched with the local registry data. */
export interface MiseRegistryEntry {
  short: string;
  backends: MiseBackend[];
  /** Operating systems the tool is limited to. Empty means every OS. */
  os: string[];
  description?: string;
  aliases?: string[];
}

export const MISE_REGISTRY_URL = "https://mise.jdx.dev/registry.html";

/** Separates the link text from its href while the cell is still one string. */
const LINK_SEPARATOR = String.fromCharCode(1);

const decodeEntities = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

const stripMarkup = (value: string) => decodeEntities(value.replace(/<!--.*?-->/gs, "").replace(/<[^>]+>/g, "")).trim();

/** Alias lists, verification badges and "details" links, whose text would otherwise leak into the cells. */
const stripDecorations = (value: string) =>
  value
    .replace(/<span class="(?:aliases|verification)"[^>]*>.*?<\/span>/gs, "")
    .replace(/<a class="mise-versions"[^>]*>.*?<\/a>/gs, "");

/** The Full column: one backend per line, each optionally wrapped in a link. */
const parseBackends = (cell: string): MiseBackend[] =>
  cell
    .replace(/<!--.*?-->/gs, "")
    .replace(
      /<a\s[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs,
      (_match, url, text) => stripMarkup(text) + LINK_SEPARATOR + url,
    )
    .replace(/<br\b[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => decodeEntities(line).trim())
    .filter(Boolean)
    .map((line) => {
      const [name, url] = line.split(LINK_SEPARATOR);
      return url ? { name, url } : { name };
    });

export const parseRegistryHtml = (html: string): MiseRegistryEntry[] => {
  // The page also has a legend table of verification badges, so find the registry by its header.
  const header = html.search(/<th\b[^>]*>Backends/);
  const start = header === -1 ? -1 : html.indexOf("<tbody", header);
  const end = start === -1 ? -1 : html.indexOf("</tbody>", start);
  if (start === -1 || end === -1) {
    throw new Error("The mise registry page no longer contains a table.");
  }

  const rows = [...html.slice(start, end).matchAll(/<tr\b[^>]*>(.*?)<\/tr>/gs)].map((match) => match[1]);

  return rows
    .map((row) => {
      const cells = [...stripDecorations(row).matchAll(/<td\b[^>]*>(.*?)<\/td>/gs)].map((match) => match[1]);
      return {
        short: stripMarkup(cells[0] ?? ""),
        backends: parseBackends(cells[1] ?? ""),
        os: stripMarkup(cells[2] ?? "")
          .split(",")
          .map((value) => value.trim())
          // The page says "any" where it used to leave the cell empty.
          .filter((value) => value && value !== "any"),
      };
    })
    .filter((entry) => entry.short.length > 0);
};

const fetchRegistryTable = () =>
  withCache(
    // Versioned so a table parsed from an older page layout is not served from the cache.
    "mise_registry_table_v2",
    async () => {
      const response = await fetch(MISE_REGISTRY_URL);
      if (!response.ok) {
        throw new Error(`Error ${response.status}, please try again later.`);
      }
      return parseRegistryHtml(await response.text());
    },
    ONE_DAY_MS,
  );

interface RawLocalRegistryEntry {
  short: string;
  description?: string;
  aliases?: string[];
}

/**
 * Descriptions and aliases only exist in the local registry, not on the docs page.
 * A missing or broken mise is not fatal here — the table alone is still useful.
 */
const fetchLocalRegistryDetails = async (): Promise<Record<string, RawLocalRegistryEntry>> => {
  try {
    return await withCache(
      "mise_registry_details",
      async () => {
        const stdout = await runMise(["registry", "--json"]);
        const entries = JSON.parse(stdout) as RawLocalRegistryEntry[];
        return Object.fromEntries(entries.map((entry) => [entry.short, entry]));
      },
      ONE_DAY_MS,
    );
  } catch {
    return {};
  }
};

export const fetchMiseRegistry = async (): Promise<MiseRegistryEntry[]> => {
  const [table, details] = await Promise.all([fetchRegistryTable(), fetchLocalRegistryDetails()]);

  return table.map((entry) => {
    const detail = details[entry.short];
    return {
      ...entry,
      description: detail?.description,
      // A tool is always listed under its own short name, so that is not an alias.
      aliases: detail?.aliases?.filter((alias) => alias !== entry.short),
    };
  });
};

interface ScoredEntry {
  entry: MiseRegistryEntry;
  score: number;
}

/**
 * Ranks matches so that a name match always beats a description match. Raycast's own
 * filtering only looks at the title, which would hide tools found by what they do.
 */
export const filterRegistry = (entries: MiseRegistryEntry[], query: string): MiseRegistryEntry[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return entries;
  }

  const scored: ScoredEntry[] = [];

  for (const entry of entries) {
    const short = entry.short.toLowerCase();
    const aliases = entry.aliases?.map((alias) => alias.toLowerCase()) ?? [];

    let score = 0;
    if (short === needle || aliases.includes(needle)) {
      score = 5;
    } else if (short.startsWith(needle) || aliases.some((alias) => alias.startsWith(needle))) {
      score = 4;
    } else if (short.includes(needle) || aliases.some((alias) => alias.includes(needle))) {
      score = 3;
    } else if (entry.backends.some((backend) => backend.name.toLowerCase().includes(needle))) {
      score = 2;
    } else if (entry.description?.toLowerCase().includes(needle)) {
      score = 1;
    }

    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.entry.short.localeCompare(b.entry.short))
    .map((item) => item.entry);
};
