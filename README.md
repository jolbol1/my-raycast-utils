# My Raycast Utils

A personal Raycast extension with a set of tools I use every day:

- **Search SVG Icons** — browse [svgl.app](https://svgl.app) and your own local icon folder.
- **Convert SVG to PNG** — rasterise an SVG from Finder or the clipboard.
- **Remove Image Background** — online through [fal.ai](https://fal.ai), or offline on-device.
- **Search Mise Registry** — search the [mise](https://mise.jdx.dev) registry and install tools globally.
- **Manage Mise Tools** — list, upgrade and remove your global mise tools.
- **Transcribe Video / Delay Audio** — thin wrappers around my own ffmpeg scripts.

It is published here for reference and for anyone who wants to copy parts of it. It is not on the Raycast
store, so install it as a local development extension.

## Credits

The SVG search command started as the [svgl Raycast extension](https://www.raycast.com/1weiho/svgl) by
[**1weiho**](https://github.com/1weiho), with contributions from
[**ridemountainpig**](https://github.com/ridemountainpig). Everything else was added on top. The project keeps
the original MIT licence.

## Requirements

`resvg` renders icons and powers the SVG→PNG conversion:

```sh
brew install resvg     # or: mise use -g resvg / cargo install resvg
```

The two mise commands need [mise](https://mise.jdx.dev) on disk. It is looked up in `~/.local/bin`,
`/opt/homebrew/bin`, `/usr/local/bin` and `~/.cargo/bin`, then through your login shell. Set **Mise Binary
Path** in the extension preferences when it lives somewhere else.

`Transcribe Video` and `Delay Audio` call scripts from my private dotfiles, so they will not work for you
without changes. See the section below.

## Install

```sh
git clone <this repo>
cd my-raycast-utils
pnpm install
pnpm dev
```

`pnpm dev` builds the extension and imports it into Raycast. Stop the process when you are done; the commands
stay available.

## Development

This repo uses **pnpm**.

```sh
pnpm install
pnpm dev          # ray develop
pnpm lint         # ray lint
pnpm fix-lint     # ray lint --fix
pnpm build        # ray build -e dist
```

## Commands

### Search SVG Icons

Browse, search, pin and copy logos from svgl.app — as SVG text, SVG file, or PNG at a chosen scale.

Icons are rendered by rasterising them with [resvg](https://github.com/linebender/resvg) rather than handing
the SVG to Raycast, whose image rendering does not resolve `clip-path`, ignores `mask-type: alpha`, and only
understands the legacy `xlink:href` on `<use>` — about one icon in six uses at least one of those and would
otherwise show as a blank tile. Renders are cached on disk and keyed by SVG content, so republished artwork
produces a fresh image; **⌘R** in the grid clears every cache and reloads. Without resvg the extension still
works, falling back to letting Raycast render the SVG directly.

#### Local (custom) icons

Set **Local Icons Path** in the command's preferences (⌘, on the command in Raycast) to a folder on disk.
Everything found there shows up under a **Custom** category. `~` is supported.

Two layouts are recognised, and they can be mixed in the same folder:

```
icons/
  acme/                     # a folder per icon
    light.svg               #   → light variant
    dark.svg                #   → dark variant
    wordmark-light.svg      #   → optional wordmark
    wordmark-dark.svg
  solo/
    anything.svg            # a folder with a single svg also works

  figma.svg                 # or flat files, named after the icon
  figma-dark.svg            #   → dark variant of figma
  figma-wordmark.svg        #   → wordmark of figma
```

Only the top level is scanned (one level of folders); non-`.svg` files and dotfiles are ignored. Local icons
load independently of the network, so they still appear when svgl.app is unreachable.

### Convert SVG to PNG

Converts the SVG selected in Finder (saved next to the original) or copied to the clipboard (copied back to
the clipboard).

### Remove Image Background

Runs on images selected in Finder or on the clipboard, either through [fal.ai](https://fal.ai) (needs an API
key in preferences) or on-device.

The offline path runs `assets/remove-background`, a small prebuilt macOS binary that calls Apple's Vision
framework to cut out the foreground. It is committed to this repo as a universal (arm64 + x86_64) binary
without its source. If you do not trust a prebuilt binary, delete it and use the fal.ai path instead.

### Search Mise Registry

Searches the [mise registry](https://mise.jdx.dev/registry.html) and shows each tool's **Short** name, its
**Full** backends, and the **OS** it is limited to, together with the description from your local mise. The
search matches the short name, aliases, backends and descriptions, in that order of priority.

**⏎** installs the selected tool globally (`mise use -g <tool>`). **⌘⇧I** opens the version list, so a specific
version can be pinned instead of `latest`. Tools already in the global config are marked and show their
installed version.

The registry table is read from the docs page and cached for a day; descriptions and aliases come from
`mise registry --json`, so they are missing when mise cannot be found.

### Manage Mise Tools

Lists the tools in your global mise config, split into **Updates Available** and **Up to Date**. Each tool
shows its installed version, the version pinned in `~/.config/mise/config.toml`, the latest available version,
and the backends it came from.

- **⌘U** upgrades the tool.
- **⌥⌘U** upgrades it and bumps the pinned version in the global config.
- **⌘⇧U** upgrades every global tool.
- **⌃X** removes the tool from the global config and deletes every installed version.

### Transcribe Video / Delay Audio

Thin wrappers around `~/.dotfiles/scripts/transcribe.sh` and `~/.dotfiles/scripts/delay-audio.sh`. Those
scripts are not in this repo. To use these two commands, write your own scripts at those paths, or change
`SCRIPTS_DIR` in `src/utils/script-runner.ts`.

## Licence

MIT. See `package.json`.
