# My Raycast Utils

A personal Raycast extension with a set of tools I use every day:

- **Search SVG Icons** — browse [svgl.app](https://svgl.app) and your own local icon folder.
- **Convert SVG to PNG** — rasterise an SVG from Finder or the clipboard.
- **Remove Image Background** — online through [fal.ai](https://fal.ai), or offline on-device.
- **Search Mise Registry** — search the [mise](https://mise.jdx.dev) registry and install tools globally.
- **Manage Mise Tools** — list, upgrade and remove your global mise tools.
- **Download Video** — download a video, a section of it, or only its audio, with [yt-dlp](https://github.com/yt-dlp/yt-dlp).
- **Download Video Thumbnail** — see every thumbnail a video publishes and save the one you want.
- **Get Video Transcript** — read, copy and save the subtitles of a video.
- **Show Video Info** — channel, duration, views, chapters, formats and subtitles of a video.
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

The four video commands need [yt-dlp](https://github.com/yt-dlp/yt-dlp), and [ffmpeg](https://ffmpeg.org) to
merge streams, cut sections and make MP3s:

```sh
mise use -g yt-dlp ffmpeg     # or: brew install yt-dlp ffmpeg
```

Both are looked up in `~/.local/bin`, the mise shims folder, `/opt/homebrew/bin`, `/usr/local/bin` and
`/usr/bin`, then through your login shell. Set **yt-dlp Path** or **ffmpeg Path** in the extension
preferences when they live somewhere else. YouTube also asks for a JavaScript runtime now: without one
(`mise use -g deno`) yt-dlp still works, but it reports fewer formats.

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

### Download Video

A form that reads the video as you paste its URL, then downloads it into the folder set by **Video Download
Path**. The format list holds every stream yt-dlp reports, best first, plus an **MP3** entry that extracts
the audio at the highest quality. A video-only stream gets the best audio track merged into it.

- **Start Time** and **End Time** (`MM:SS` or `HH:MM:SS`) download only that section, cut on keyframes.
- Audio downloads can embed the title, the artist and the cover art.
- A URL inside a playlist offers to pull the whole list instead of the single video.
- **⌘⇧C** copies the yt-dlp command, so a download can be repeated or changed in a terminal.
- A failed download offers **Copy Logs**; a finished one offers **Show in Finder** and **Copy File**.

### Download Video Thumbnail

Paste a URL in the search bar to see every thumbnail of that video: the ones yt-dlp reports, plus the fixed
set YouTube serves for every video (cover, the three frame grabs, and their WebP twins). Each one is checked
against the server, so only the sizes that really exist are shown, together with their resolution and weight.
For a YouTube URL the grid works even when yt-dlp cannot read the video.

When YouTube is running a **Thumbnail Test** on the video, the covers being tested come up in their own
section above the published one. yt-dlp does not report them, and they cannot be guessed: they sit at
`.../<id>/hq720_custom_<n>.jpg`, but answer only to a signed URL, and the signature covers the path — so
editing the index gives back a placeholder.

The signed URLs come from YouTube's own search feed, which puts every request in one test bucket. The feed is
asked again, 0.8 s apart, until a round brings nothing new: two quiet rounds for a video with no test, up to
twelve for a video that is being tested. Asked too quickly, YouTube answers with a bot check instead of
results; that is recognised, ends the sweep at once, and is reported in the section header, because a sweep
it cut short proves nothing. What each sweep finds is merged into what is already known, so a cover missed
the first time is picked up when the command is opened again.

Sweeps are cached per video: a day for a video with no test, two hours for a full set of three, fifteen
minutes for a partial one, and five for one that was cut short. Signed URLs carry the quarter-hour they were
issued in and do not live forever, so cached ones are asked whether they still resolve before being reused.

Those covers are only published at feed size, so the largest one to be had is 720 × 404. The cover that is
winning the test is also the full-size `maxresdefault` in the section below.

**⏎** saves the thumbnail, **⌘C** copies the image itself, **⌘⇧C** copies its URL, and **⌘⇧D** saves every
size at once.

### Get Video Transcript

Picks the subtitle track and shows it as text. Uploaded subtitles come before the automatic ones, and the
language the video was spoken in comes before the machine translations. Automatic captions repeat themselves
as they roll, so the repetition is removed to make the text readable again.

**⌘T** puts a timestamp in front of each line, **⌘S** saves a `.txt`, and **⌘⇧S** saves a `.srt`.

### Show Video Info

Title, channel, duration, views, likes, upload date, availability, tags, chapters and the best format of a
video, with its description. From there, **⌘D** downloads the video, **⌘T** opens its thumbnails and **⌘⇧T**
opens its transcript.

### Transcribe Video / Delay Audio

Thin wrappers around `~/.dotfiles/scripts/transcribe.sh` and `~/.dotfiles/scripts/delay-audio.sh`. Those
scripts are not in this repo. To use these two commands, write your own scripts at those paths, or change
`SCRIPTS_DIR` in `src/utils/script-runner.ts`.

## Licence

MIT. See `package.json`.
