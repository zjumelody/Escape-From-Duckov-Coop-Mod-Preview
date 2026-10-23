# Escape From Duckov Co-op Mod (Melody Fork · Mac compatible)

**[简体中文](README.md)** | English

This fork is updated so Mac players can co-op with each other and with Windows players.
Test builds are on the [Releases](https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases) page.
Downloading the mod is not enough on Mac: the game app needs the short local preparation below.

## Prepare the Mac game app (required)

The official / Steam `Duckov.app` uses App Sandbox and does not include the network entitlement co-op needs. Putting Mods inside that original app can also make the system report the app as damaged. **Copy the app**, adjust the copy, and install Mods only into the copy.

### Recommended: the graphical helper (no Terminal)

1. Open [Releases](https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases).
2. Download **`DuckovCoopPrepare-mac.zip`** from the asset list, unzip it, and double-click **`DuckovCoopPrepare.app`**. Use that asset. The Source code archive further down the page is the repository.
3. The first time you open it, macOS may say the developer cannot be verified. Control-click the app, choose Open, then choose Open again. If Open is not offered, use System Settings → Privacy & Security → Open Anyway. After that, a normal double-click is enough. An Apple Developer account is not required.

In the window:

1. Confirm the original app. The default is `/Applications/Duckov.app`. If the game is somewhere else, click Choose.
2. Confirm the copy. The default is `Applications/Duckov-COOP.app` inside your home folder (`~/Applications/Duckov-COOP.app`).
3. To include the co-op mod, do one of these:
   - Click **Download latest test mod** and wait until the Mods path fills in; or
   - Click Choose next to Mods and select an unzipped Mods folder.
   - Leave Mods empty if you only want the copy prepared and will add Mods later.
4. Click **Prepare co-op copy**. If the copy already exists, the helper asks before replacing it. Mods already inside the copy are kept. Copying the whole game can take several minutes; leave the window open.
5. When you see **Done**, **launch only** `Duckov-COOP.app` for co-op.

What the buttons do:

- **Prepare co-op copy**: copies the original app, turns off App Sandbox, adds `network.client` and `network.server`, and re-signs the copy with the local `codesign` identity `-`. If the Mods field has a path, those files are installed into the copy's `Contents/Mods/` before signing.
- **Download latest test mod**: downloads the newest `EscapeFromDuckovCoopMod*.zip` from this fork's Releases (including pre-releases), unzips it next to the helper (or into Downloads if that folder is not writable), and fills in the Mods path. The download does not change the game. Click Prepare co-op copy after it finishes.
- **Open Releases**: opens this fork's Releases page in the browser.
- **Choose**: pick the original app, the place to save the copy, or an unzipped Mods folder.
- **Clear**: clears the Mods path so this run does not install new mods.

Progress scrolls in the text area. Success and failure messages are in Chinese and English. The original `Duckov.app` is not modified.

### Advanced: Terminal script

If you are comfortable in Terminal, use [`scripts/mac/prepare-duckov-coop-app.sh`](scripts/mac/prepare-duckov-coop-app.sh). Its entitlements file is [`scripts/mac/duckov-coop.entitlements`](scripts/mac/duckov-coop.entitlements). Notes: [`scripts/mac/README.md`](scripts/mac/README.md).

1. Install the official game. The usual location is `/Applications/Duckov.app`. If it is somewhere else, note that `Duckov.app`.
2. Download `prepare-duckov-coop-app.sh`. If you also download `duckov-coop.entitlements`, keep it in the same folder as the script.
3. Open Terminal: press `Command` + `Space`, type `Terminal`, and press Return.
4. Type `cd` and a space. Do not press Return yet. In Finder, open the folder that contains the script, drag that folder into the Terminal window, then press Return.
5. Type these two lines. Press Return after each one:

```bash
chmod +x prepare-duckov-coop-app.sh
./prepare-duckov-coop-app.sh
```

6. If the game is not in the default location, replace the path below (you can also drag `Duckov.app` into Terminal):

```bash
./prepare-duckov-coop-app.sh --source "/path/to/Duckov.app"
```

7. If the copy already exists, the script asks before replacing it. Type `y` or `是` and press Return to continue. Add `--force` to replace without that question.

The default result is `~/Applications/Duckov-COOP.app` (App Sandbox removed, `network.client` / `network.server` added, re-signed with the local `codesign` identity `-`. No Apple Developer account).

Optional: install an unzipped Mods folder into the copy:

```bash
./prepare-duckov-coop-app.sh --mods-dir /path/to/Mods
```

If a Release zip (for example `EscapeFromDuckovCoopMod*.zip`) sits next to the script, the script installs it into the copy's `Contents/Mods/` before signing.

### What the helper and the script do

1. Copy `/Applications/Duckov.app` to `~/Applications/Duckov-COOP.app` (the original is not modified).
2. Adjust entitlements on the copy: turn off App Sandbox; enable `com.apple.security.network.client` and `com.apple.security.network.server`.
3. Sign that copy with local `codesign` identity `-`. Each player signs their own copy on their own Mac.
4. Put this fork's co-op mod from Releases (and any dependency mods you need) in `Duckov-COOP.app/Contents/Mods/`.
5. **Launch only** `Duckov-COOP.app` for co-op. Every peer must use the exact same ModVersion string (one shared version for Windows and Mac, for example `1.4.2` from Releases).

### Notes

- Do not install Mods into the original `/Applications/Duckov.app`.
- Steam "Verify integrity" can restore the original. If the copy misbehaves, run the helper or the script again.
- An Apple Developer account is not required. The helper and the game copy use the local `codesign` identity `-`.
- If the destination already exists, the helper asks before replacing it. A re-run keeps Mods already in the copy, then signs again after the refresh.
- If you add Mods by hand later, run the helper or the script again so the copy is signed with those files included.

License: [LICENSE.txt](LICENSE.txt)

Thanks to the original authors. The upstream project is https://github.com/Mr-sans-and-InitLoader-s-team/Escape-From-Duckov-Coop-Mod-Preview  
Please support their work and follow the applicable rules.
