# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

iSparta is an Electron desktop app (macOS/Windows/Linux) for converting between animated image formats: PNG sequences → APNG, GIF/PNG → WebP, APNG ↔ Animated WebP, plus lossless PNG/GIF compression. UI is Vue 2 + Element UI + Vuex, built with Vue CLI 3 and `vue-cli-plugin-electron-builder` 2.x on Electron 31; the renderer keeps `nodeIntegration: true` (declared both in `background.js` webPreferences and `vue.config.js` pluginOptions — the latter controls webpack's target and must not be removed) and uses `@electron/remote` for dialog/Menu/shell access. UI text and code comments are largely in Simplified Chinese; the app itself supports zh-cn, zh-tw, and en-us via vue-i18n (`src/locales/`).

## Commands

```bash
npm install --legacy-peer-deps                       # legacy-peer-deps for the old dep tree
NODE_OPTIONS=--openssl-legacy-provider npm run dev   # legacy provider needed by webpack 4 on Node 17+
npm run lint         # eslint (plugin:vue/essential, babel-eslint parser)
NODE_OPTIONS=--openssl-legacy-provider CSC_IDENTITY_AUTO_DISCOVERY=false npx vue-cli-service electron:build --mac
                     # unsigned native arm64 build; output in dist_electron/mac-arm64/ and dist_electron/*.zip
```

On modern macOS the mac target must stay `zip` (see `electron-builder.yml`): electron-builder 22's dmg step spawns `/usr/bin/python` (Python 2), which no longer exists. The full `-mwl` build (`npm run build`) needs wine/mono for Windows targets.

There is no automated test suite. `test/` contains sample images (PNG sequence, APNG, GIF, WebP) for manually exercising conversions in the running app.

On Linux, the native tools require `libpng16-dev`.

## Architecture

**Conversion happens by shelling out to bundled CLI binaries**, not in JS. Per-platform executables (`apngasm`, `apngopt`, `apngquant`, `apngdis`, `apng2gif`, `gif2apng`, `cwebp`, `dwebp`, `webpmux`) live in `public/bin/<platform>/` (copied to `static/bin/` as well). `Action.bin(exec)` in `src/util/processor/action.js` resolves the binary path: `process.cwd()/public/bin/` in development, `<app-path>/bin/` in production (the app path is fetched from the main process over IPC via `get-app-path`). `asar` is disabled in `electron-builder.yml` so these binaries stay executable on disk.

**Conversion pipeline** (`src/util/processor/index.js`): every input type is first normalized to APNG, then fanned out to the requested output formats.
- Entry point takes the Vuex store, iterates selected items, and dispatches by `item.basic.type` (enum in `src/store/enum/type.js`): PNGs → `pngs2apng`, GIF → `gif2apng`, APNG → `apngCompress`, WebP → `webp2apng`.
- Each then runs `apng2other()`, which copies/converts the intermediate APNG into the chosen outputs (APNG, WebP via `apng2webp`, GIF via `apng2gif`).
- Work happens in per-item temp dirs under `os.tmpdir()/iSparta`, cleaned up after all items finish. Progress is reported by dispatching `editProcess` to the store; a global `setLock` flag prevents concurrent runs.

**Process split**: `src/background.js` is the Electron main process (window creation, IPC handlers like `get-app-path`, dialogs). The renderer (`src/main.js` → `App.vue` → `src/views/LandingPage.vue`) runs with `nodeIntegration: true`, so renderer code freely uses `fs-extra`, `child_process`, `os`, and `path`.

**State** (`src/store/index.js`): a single Vuex store holds the item list (files queued for conversion, each with `basic` file info and `options` conversion parameters) and global settings. Settings persist via `electron-localstorage` to a JSON file under `os.tmpdir()/iSparta/` (separate file in dev); the storage object is exposed as `window.storage` and read at startup in `main.js` to pick the i18n locale.

**UI components** (`src/components/`): `mainUpload` (drag-and-drop intake, with `drag/file.js` classifying dropped files), `projectList` (queue with per-item settings and right-click menu), `setting`/`globalSetting` (conversion options), `delayDialog` (per-frame delay editing for PNG sequences), `sortBar`.

## Gotchas

- Some modules (e.g. `src/util/processor/action.js`, `src/main.js`) use lodash's `_` without importing it, relying on it being available at runtime; lodash is also not a direct dependency in package.json. Import it explicitly in new code.
- The webpack side is still old (Vue CLI 3, webpack 4). node-sass was replaced with dart-sass (`sass` + `sass-loader@10`) so it installs on modern Node; the OpenSSL legacy flag above is still required.
- The bundled CLI binaries in `public/bin/mac` are x64-only and run under Rosetta; the packaging step drops their executable bit, so `Action.bin()` re-applies `chmod +x` synchronously before each use — keep that.
- Electron is pinned to ^31: Electron 32+ removes `File.path`, which the drag-and-drop intake (`drag/file.js`) depends on. Upgrading past 31 requires migrating to `webUtils.getPathForFile`.
- PNG-sequence input expects files named with a numeric sequence (1.png, 2.png, …) in the same directory.
