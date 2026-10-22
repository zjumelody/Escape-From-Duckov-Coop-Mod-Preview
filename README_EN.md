# Escape From Duckov Co-op Mod (Melody Fork · Mac compatible)

**[简体中文](README.md)** | English

This fork is updated so Mac players can co-op with each other and with Windows players.
Test builds are on the [Releases](https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases) page.
Downloading the mod is not enough on Mac: the game app needs the short local preparation below.

## Prepare the Mac game app (required)

The official / Steam `Duckov.app` uses App Sandbox and does not include the network entitlement co-op needs. Putting Mods inside that original app can also make the system report the app as damaged. **Copy the app**, adjust the copy, and install Mods only into the copy.

### Recommended: one script

The script is [`scripts/mac/prepare-duckov-coop-app.sh`](scripts/mac/prepare-duckov-coop-app.sh). Its entitlements file is [`scripts/mac/duckov-coop.entitlements`](scripts/mac/duckov-coop.entitlements). Short notes: [`scripts/mac/README.md`](scripts/mac/README.md). A Release may also attach the same script for a one-click download.

1. Install the official game and confirm `/Applications/Duckov.app` exists (or note your install path).
2. Download [`scripts/mac/prepare-duckov-coop-app.sh`](scripts/mac/prepare-duckov-coop-app.sh) (or the Release attachment). Keep `duckov-coop.entitlements` beside the script when you download both.
3. In Terminal:

```bash
chmod +x prepare-duckov-coop-app.sh
./prepare-duckov-coop-app.sh
```

If the game is not in the default location:

```bash
./prepare-duckov-coop-app.sh --source "/path/to/Duckov.app"
```

The default result is `~/Applications/Duckov-COOP.app` (App Sandbox removed, `network.client` / `network.server` added, re-signed with the local `codesign` identity `-`. No Apple Developer account).

Optional: install an unzipped Mods folder into the copy:

```bash
./prepare-duckov-coop-app.sh --mods-dir /path/to/Mods
```

If a Release zip (for example `EscapeFromDuckovCoopMod*.zip`) sits next to the script, the script installs it into the copy's `Contents/Mods/` before signing.

### What the script does (same steps by hand)

1. Copy `/Applications/Duckov.app` to `~/Applications/Duckov-COOP.app` (the original is not modified).
2. Adjust entitlements on the copy: turn off App Sandbox; enable `com.apple.security.network.client` and `com.apple.security.network.server`.
3. Sign that copy with local `codesign` identity `-`. Each player signs their own copy on their own Mac.
4. Put this fork's co-op mod from Releases (and any dependency mods you need) in `Duckov-COOP.app/Contents/Mods/`.
5. **Launch only** `Duckov-COOP.app` for co-op. Every peer must use the exact same ModVersion string (one shared version for Windows and Mac, for example `1.4.2` from Releases).

### Notes

- Do not install Mods into the original `/Applications/Duckov.app`.
- Steam "Verify integrity" can restore the original. If the copy misbehaves, run the script again.
- An Apple Developer account is not required.
- If the destination already exists, the script asks before replacing it. Pass `--force` to replace without asking. A re-run keeps Mods already in the copy, then signs again after the refresh.

License: [LICENSE.txt](LICENSE.txt)

Thanks to the original authors. The upstream project is https://github.com/Mr-sans-and-InitLoader-s-team/Escape-From-Duckov-Coop-Mod-Preview  
Please support their work and follow the applicable rules.
