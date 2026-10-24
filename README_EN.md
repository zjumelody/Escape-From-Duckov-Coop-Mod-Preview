Thanks to the original authors. The upstream project is https://github.com/Mr-sans-and-InitLoader-s-team/Escape-From-Duckov-Coop-Mod-Preview  
Please support their work and follow the applicable rules.

# Escape From Duckov Co-op Mod (Melody Fork · Mac compatible)

**[简体中文](README.md)** | English

This fork is updated so Mac players can co-op with each other and with Windows players.
Test builds are on the [Releases](https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases) page.
Downloading the mod is not enough on Mac: the game app needs the short local preparation below.

## Prepare the Mac game app (required)

The official / Steam `Duckov.app` uses App Sandbox and does not include the network entitlement co-op needs. Putting Mods inside that original app can also make the system report the app as damaged. **Copy the app**, adjust the copy, and install Mods only into the copy.

### Recommended: the graphical helper (no Terminal)

1. Open [Releases](https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases).
2. Download **`DuckovCoopPrepare-mac-1.5.1.zip`** from the asset list, unzip it, and double-click **`DuckovCoopPrepare.app`**. Use that asset. The Source code archive further down the page is the repository.
3. The first time you open it, macOS may say the developer cannot be verified. Control-click the app, choose Open, then choose Open again. If Open is not offered, use System Settings → Privacy & Security → Open Anyway. After that, a normal double-click is enough. An Apple Developer account is not required.

The window title is 《逃离鸭科夫》Mac 联机 Mod 支持工具 (Escape from Duckov — Mac co-op Mod support tool). **Open GitHub** at the top-right is not a step: it opens this fork's Releases in the browser. The button is light green, distinct from the gray secondary buttons and from the Prepare button. Below it is a bordered panel titled **当前状态： / Current status:** in blue. The text there says what to do next. The three steps follow, each inside its own bordered box. A finished step's title turns green and gains a ✅.

**Step 1: Prepare co-op copy**

1. Confirm the original app. The default is `/Applications/Duckov.app`. Pick the installed Duckov.app; Steam can show the install path. If the game is somewhere else, click Choose.
2. Confirm where the co-op copy is saved (launch this copy for co-op). The default is `Applications/Duckov-COOP.app` inside your home folder (`~/Applications/Duckov-COOP.app`).
3. Click **Prepare co-op copy** in this step. The button is blue when that copy is not on disk yet. If the copy is already there when the helper opens, the button is yellow and says you can continue, or click to regenerate; clicking still asks before replacing it. After a successful prepare in this session the button turns green and says you can play with the copy App. Mods already inside the copy are kept. A Mod path filled in at Step 3 is installed during prepare. Copying the whole game can take several minutes; leave the window open. Pointing the destination at a path that does not exist turns the button blue again.
4. After prepare succeeds, the dialog title asks whether to continue with Step 2: sync the original config (including saves) to the copy. Click **Sync now**, or **Don't sync**. Then **launch only** `Duckov-COOP.app` for co-op.

**Step 2: Sync config files**

Open the original config folder or the co-op config folder, or mirror them either way with the buttons prefixed **(sync files)**. Quit both games before syncing.

**Step 3: Configure (Mac-compatible) co-op Mod**

If you already downloaded the latest Mac-compatible co-op Mod, click Choose and pick that folder. It updates into the copy's `Contents/Mods/`. If you have not downloaded it, click **Auto-download and update the latest Mac-compatible co-op Mod into the copy's Mods folder**. That button is about 1.5× taller so the two-line title stays readable. If the copy or the chosen folder already has that same Release version, the download is skipped and the window says so. Otherwise, when the copy already exists, the Mod is installed and the copy is signed again. When the copy does not exist yet, the path is saved and Step 1 installs it. Each outermost folder that contains a `.dll` is copied whole. Clear only clears the path; Mods already in the copy stay there.

When this co-op Mod is installed or updated, older folders of the same mod in the copy are replaced so two copies are not left side by side. That includes workshop folder `3591341282`, folders named `EscapeFromDuckovCoopMod` or `Escape-From-Duckov-Coop`, and any folder identified by `info.ini` or the main DLL. Other mods, such as a backpack expansion, are not deleted. The original app is not modified.

What the buttons do:

- **Prepare co-op copy**: copies the original app, turns off App Sandbox, adds `network.client` and `network.server`, and re-signs the copy with the local `codesign` identity `-`. If Step 3 has a path, outermost folders that contain a `.dll` are installed into the copy's `Contents/Mods/` before signing. Three colors: blue when the copy is missing (**Prepare co-op copy**); yellow when a copy is already on disk at launch (**Co-op copy App already found — continue to next steps, or click to regenerate**); green after a successful prepare in this session (**Co-op copy is ready — you can play with the copy App now**). Green applies only to the path just prepared. A destination that does not exist returns the button to blue. The Step 1 heading stays green with ✅ while the copy exists.
- **Auto-download and update the latest Mac-compatible co-op Mod into the copy's Mods folder**: downloads the newest `EscapeFromDuckovCoopMod*.zip` from this fork's Releases (including pre-releases) and unzips it. The button is about 1.5× its previous height. If the copy or a chosen folder already has that same Release version, the download is skipped and the window explains why. When an install is needed, older folders of this same co-op Mod are removed from the copy first so only one remains, then the copy is signed again. If the copy does not exist yet, the path is saved and Step 1 installs it. Other mods are not deleted.
- **Open GitHub**: opens this fork's Releases page in the browser. The button is light green.
- **Choose**: pick the original app, the place to save the copy, or a Mac co-op Mod folder you already downloaded. Choosing a Mod folder updates the copy when the copy already exists.
- **Clear**: clears the Step 3 path. It does not remove Mods already in the copy.
- **Open**: shows that row's path in Finder. An empty Mod path shows an alert. A `.app` is revealed in Finder and is not launched.
- **Open original config folder**: opens the original config folder (the sandboxed original). If the folder is missing, the helper explains why and does not create it.
- **Open co-op config folder**: opens the co-op config folder. The helper creates that folder when it is missing.
- **(sync files) original → co-op**: mirrors the original config folder onto the co-op config folder.
- **(sync files) co-op → original**: mirrors the co-op config folder onto the original config folder.
- **Done dialog**: after a successful prepare, the title asks whether to continue with Step 2 and sync the original config (including saves) to the copy. The only buttons are **Sync now** and **Don't sync**. Sync now is the original → co-op sync above.

The original app keeps App Sandbox, so its config is `~/Library/Containers/com.bilibili.duckov/Data/Library/Application Support/com.bilibili.duckov` (original config folder). The co-op copy has App Sandbox off, so its config is `~/Library/Application Support/com.bilibili.duckov` (co-op config folder). The bundle id is the same. The split is sandbox on versus off, not where the `.app` file lives. Quit both games before syncing. Files that exist only in the destination are deleted. If reading the original config folder prints Operation not permitted, add `DuckovCoopPrepare.app` under System Settings → Privacy & Security → Full Disk Access, then try again.

Progress scrolls in a lightly tinted text area at the bottom of the window. The Prepare button spans Step 1 and draws its title in a centered image: blue when the copy is missing, yellow when a copy is already on disk, and green after a successful prepare in this session. Success and failure messages are in Chinese and English. Preparing a copy does not modify the original `Duckov.app`. Current status at the top updates as steps are finished.

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

When the copy already exists and you only want to update the Mac co-op Mod, skip copying the whole game:

```bash
./prepare-duckov-coop-app.sh --update-mods --dest "$HOME/Applications/Duckov-COOP.app" --mods-dir /path/to/Mods
```

If a Release zip (for example `EscapeFromDuckovCoopMod*.zip`) sits next to the script, the script installs it into the copy's `Contents/Mods/` before signing. Older folders of this same co-op Mod in the copy are replaced so only one remains; other mods stay.

### What the helper and the script do

1. Copy `/Applications/Duckov.app` to `~/Applications/Duckov-COOP.app` (the original is not modified).
2. Adjust entitlements on the copy: turn off App Sandbox; enable `com.apple.security.network.client` and `com.apple.security.network.server`.
3. Sign that copy with local `codesign` identity `-`. Each player signs their own copy on their own Mac.
4. Put this fork's co-op mod from Releases (and any dependency mods you need) in `Duckov-COOP.app/Contents/Mods/`.
5. **Launch only** `Duckov-COOP.app` for co-op. Every peer must use the exact same ModVersion string (one shared version for Windows and Mac, for example `1.4.2_melody` from Releases).

### Notes

- Do not install Mods into the original `/Applications/Duckov.app`.
- Steam "Verify integrity" can restore the original. If the copy misbehaves, run the helper or the script again.
- An Apple Developer account is not required. The helper and the game copy use the local `codesign` identity `-`.
- If the destination already exists, the helper asks before replacing it. A re-run keeps Mods already in the copy, then signs again after the refresh.
- If you add Mods by hand later, run the helper or the script again so the copy is signed with those files included.

License: [LICENSE.txt](LICENSE.txt)
