# My Utils

A personal Raycast extension: SVG search (via [svgl](https://svgl.app/) plus your own local icons), SVG→PNG
conversion, background removal, and a couple of ffmpeg helpers.

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
the clipboard). Requires `librsvg`:

```sh
brew install librsvg
```

### Remove Image Background

Runs on images selected in Finder or on the clipboard, either through [fal.ai](https://fal.ai) (needs an API
key in preferences) or through the bundled offline binary.

### Transcribe Video / Delay Audio

Thin wrappers around `~/.dotfiles/scripts/transcribe.sh` and `~/.dotfiles/scripts/delay-audio.sh`; those
scripts need to exist locally.
