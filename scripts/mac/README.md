# Mac：准备 Duckov-COOP.app / Prepare Duckov-COOP.app

推荐用图形工具 **`DuckovCoopPrepare.app`**。它会调用下面的脚本，复制官方 `Duckov.app` 到 `~/Applications/Duckov-COOP.app`，关闭 App Sandbox，加入 `com.apple.security.network.client` 与 `com.apple.security.network.server`，并用本机 `codesign` 身份 `-` 重新签名。不改动原版。Mods 只装进副本。

The graphical helper **`DuckovCoopPrepare.app`** is the path to use. It runs the script below: copy an official `Duckov.app` to `~/Applications/Duckov-COOP.app`, turn App Sandbox off, add `com.apple.security.network.client` and `com.apple.security.network.server`, and re-sign the copy with the local `codesign` identity `-`. The original app is not modified. Mods go only into the copy.

玩家步骤在仓库首页：[README.md](../../README.md) · [README_EN.md](../../README_EN.md)。

Player steps are on the repo homepage: [README.md](../../README.md) · [README_EN.md](../../README_EN.md).

## 给玩家 / For players

从 [Releases](https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases) 下载附件 **`DuckovCoopPrepare-mac-1.5.0.zip`**，解压后双击 `DuckovCoopPrepare.app`。

第一次若系统提示无法验证开发者：按住 Control 点按该 App，选择「打开」。不需要 Apple 开发者账号。

Download **`DuckovCoopPrepare-mac-1.5.0.zip`** from [Releases](https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases), unzip it, and double-click `DuckovCoopPrepare.app`.

If macOS says the developer cannot be verified, Control-click the app and choose Open. An Apple Developer account is not required.

窗口标题 / Window title: 《逃离鸭科夫》Mac 联机 Mod 支持工具（English: Escape from Duckov — Mac co-op Mod support tool）。

从上到下先是「当前状态」，然后三步各在一个带边框的方框里 / Current status comes first, then three steps, each inside its own bordered box:

**当前状态： / Current status:** — 窗口最上方、第一步之前，蓝色标题，自己的边框。正文会告诉你下一步该做什么，并在某一步成功后更新。打开时如果副本、配置或联机 Mod 已经就绪，会直接标出来。

1. **第一步：准备联机副本 / Step 1: Prepare co-op copy** — 原版路径、副本路径（默认 `~/Applications/Duckov-COOP.app`），以及这一步里的「准备联机副本」。按钮大约是这一步内容宽度的 70%，居中，不铺满整行。副本还不在时按钮是蓝色；打开时该位置已经有副本则是黄色，点它仍会重新生成；这一次准备成功后变成绿色。
2. **第二步：配置文件（包括存档）同步 / Step 2: Sync config files (including saves)** — 打开两边的配置文件夹，或用带「（同步文件）」的按钮互相镜像。打开文件夹的按钮大约是原来的 1.5 倍高。两个同步按钮更高，方便同时放下操作标题和最后更新时间。
3. **第三步：配置（支持Mac的）联机 Mod / Step 3: Configure (Mac-compatible) co-op Mod** — 选择已经下载的 Mac 联机 Mod，或点下载按钮。下载按钮的宽和高与第一步的准备按钮相同。副本已存在时会装进 `Contents/Mods/` 并重新签名；还不存在时记下路径，等第一步准备时装入。

**Current status:** is the blue title at the top. Its text says what to do next and updates after a step succeeds. If the copy, the config, or the co-op Mod is already in place when the window opens, that is shown immediately.

做完的步骤标题会变成绿色，并在后面加上 ✅。这一状态保留到关闭窗口；下次打开时会再看一遍磁盘上的结果。

A finished step's title turns green and gains a ✅. That stays until the window closes. The next launch checks the files on disk again.

| 按钮 / Button | 作用 / What it does |
| --- | --- |
| 准备联机副本 / Prepare co-op copy | 在第一步里：复制、改副本权限、本机签名。宽和高与第三步的下载按钮相同，大约是内容宽度的 70%，居中。蓝色是还没有副本；黄色标题是「检测到联机副本App已经存在，可以下一步或者点此按钮重新生成」；这一次准备成功后变绿，标题是「已经准备好联机副本，可以开始用副本App游戏了」。换一个还不存在的副本路径会回到蓝色 |
| 自动下载并更新最新支持 Mac 的联机 Mod 到副本 Mods 位置 / Auto-download and update the latest Mac-compatible co-op Mod into the copy's Mods folder | 与准备按钮同宽同高，两行标题画在按钮上。蓝色：副本里还没有这个联机 Mod。绿色：已安装的版本与最新 Release 相同，或比它更新；点击只说明已经是最新，不重复下载。黄色：副本里已有 Mod，但和最新 Release 不是同一个版本。打开窗口后会在后台向 GitHub Releases 查询，不卡住界面 |
| 打开 GitHub 页面 / Open GitHub | 右上角浅绿色按钮，在浏览器打开本 Fork 的 Releases。不是一个步骤。窗口打开时不会把它变成焦点，所以不会出现焦点环 |
| 打开 / Open | 在访达中显示原版 App、副本或 Mod 路径。`.app` 只显示，不启动 |
| 打开原版配置位置 / Open original config folder | 打开原版配置位置（原版沙盒配置）。不存在时提示，不创建。按钮高度是原来的 1.5 倍，灰色 |
| 打开联机副本配置位置 / Open co-op config folder | 打开联机副本配置位置。必要时创建该文件夹。高度同样是原来的 1.5 倍 |
| （同步文件）原版配置 → 联机副本 / (sync files) original → co-op | 把原版配置位置的内容镜像到联机副本配置位置（`rsync -a --delete`）。颜色见下面的比较规则，并显示原版一侧的最后更新时间 |
| （同步文件）联机副本 → 原版配置 / (sync files) co-op → original | 把联机副本配置位置的内容镜像到原版配置位置。颜色见下面的比较规则，并显示副本一侧的最后更新时间 |

准备成功后的对话框标题会问要不要做第二步：把原版配置（包括存档）同步到副本。按钮只有两个：「立即同步 / Sync now」（原版配置 → 联机副本，和窗口里的同步按钮是同一次操作）和「不同步 / Don't sync」。

After a successful prepare, the dialog title asks whether to continue with Step 2: sync the original config (including saves) to the copy. There are two buttons: **Sync now** (original config → co-op, the same action as the sync button in the window) and **Don't sync**.

原版开着 App Sandbox，配置在原版配置位置：`~/Library/Containers/com.bilibili.duckov/Data/Library/Application Support/com.bilibili.duckov`。联机副本关掉沙盒，配置在联机副本配置位置：`~/Library/Application Support/com.bilibili.duckov`。Bundle ID 相同，差别是沙盒开或关，不是 `.app` 放在哪。同步前请退出两边的游戏。若读取原版配置位置出现 Operation not permitted，请在「系统设置 → 隐私与安全性 → 完全磁盘访问权限」中加入 `DuckovCoopPrepare.app`。

The original app keeps App Sandbox, so config is the original config folder: `~/Library/Containers/com.bilibili.duckov/Data/Library/Application Support/com.bilibili.duckov`. The co-op copy has App Sandbox off, so config is the co-op config folder: `~/Library/Application Support/com.bilibili.duckov`. The bundle id is the same. The split is sandbox on versus off, not where the `.app` file lives. Quit both games before syncing. If reading the original config folder prints Operation not permitted, add `DuckovCoopPrepare.app` under System Settings → Privacy & Security → Full Disk Access.

窗口里：右上角是浅绿色的「打开 GitHub 页面」。打开时窗口自己是第一响应者，这个按钮没有焦点环。它下面是带边框的「当前状态」，然后第一步、第二步、第三步各在一个带边框的方框里。说明文字按内容换行。第一步的准备按钮大约是这一步内容宽度的 70%，居中，标题画在居中的图片上。「准备联机副本」在副本还不存在时是蓝色；打开时已经有副本则是黄色，点它会重新生成；这一次准备成功后变成绿色，并换成两行「可以开始用副本 App 游戏了」的标题。改成一个还不存在的路径会回到蓝色。第一步标题在副本已存在或准备成功时仍是绿色加 ✅。第三步的下载按钮与准备按钮同宽同高，两行标题按状态换色：没有联机 Mod 是蓝色，与最新 Release 相同是绿色，有差异是黄色。比较在窗口出现之后进行，不阻塞打开。第二步标题是「配置文件（包括存档）同步」。四个按钮都比原来高；两个同步按钮会比较两边文件夹。底部进度文字区域是浅色底。

In the window: Open GitHub is a light-green button at the top-right. On open the window itself is first responder, so that button has no focus ring. Below it is a bordered Current status panel, then Step 1, Step 2, and Step 3, each in its own bordered box. Help text is sized to its wrapped height. The Prepare button is about 70% of the step width, centered, and draws its title in a centered image. It is blue when the copy is not there yet, yellow when a copy is already on disk (clicking still regenerates it), and green after a successful prepare in this session, with a two-line "you can play with the copy App now" title. Pointing the destination at a path that does not exist returns it to blue. The Step 1 heading stays green with ✅ when the copy exists or prepare succeeded. The Step 3 download button matches that Prepare button in width and height. It is blue when the copy has no co-op Mod, green when the installed mod matches the latest Release, and yellow when it differs. The comparison runs after the window is shown and does not block launch. Step 2 is titled sync config files, including saves. Its four buttons are taller than before, and the two sync buttons compare the two folders. The progress text area at the bottom has a light background.

同步按钮的颜色 / Sync button colors: 打开窗口后在后台比较原版配置位置和联机副本配置位置。两边内容一致时，两个同步按钮都是绿色。不一致时，较新一侧向外同步的按钮是蓝色，较旧一侧向外同步的按钮是黄色；分不出先后则都是黄色。读不了某一侧，或两边都不存在时，保持灰色。每个同步按钮显示自己来源一侧的最后更新时间，例如 `最后更新于：2026年10月23日 13:18:52` / `Last updated: 2026-10-23 13:18:52`，用这台 Mac 的本地时区（读不到时用东八区）。同步成功后会再比较一次。

After the window is shown, the original config folder and the co-op config folder are compared in the background. When their contents match, both sync buttons are green. When they differ, the button that copies from the newer side is blue and the button that copies from the older side is yellow. If neither side is newer, both are yellow. If a side cannot be read, or neither folder exists, the buttons stay grey. Each sync button shows when its source side was last updated, for example `最后更新于：2026年10月23日 13:18:52` / `Last updated: 2026-10-23 13:18:52`, in the Mac's local time zone (UTC+8 if the zone cannot be read). A successful sync compares them again.

比较用的指纹 / Fingerprint: 相对路径加内容。普通文件记 sha256、权限和相对路径；目录记权限和相对路径（空目录也算）；符号链接记链接文字，不跟随。忽略 `.DS_Store`、`.localized` 和 `._*`。修改时间不参与「是否相同」，只用来判断哪一边更新：取被跟踪的普通文件和符号链接里最新的 mtime（整秒）。没有任何文件时才用目录自身的 mtime，避免访达写入 `.DS_Store` 把文件夹时间抬新。

The fingerprint is relative path plus content. A regular file records sha256, permission mode, and relative path. A directory records mode and relative path, so an empty directory counts. A symlink records the link text and is not followed. `.DS_Store`, `.localized`, and `._*` are ignored. mtime is not part of identity. "Newer" is the newest whole-second mtime among tracked regular files and symlinks. Directory mtime is used only when that side has no files, so Finder writing `.DS_Store` does not make a folder look newer.

## 文件 / Files

- [`gui/main.js`](gui/main.js) — 窗口界面 / the window
- [`gui/launcher.sh`](gui/launcher.sh) — `.app` 的启动程序 / the `.app` executable
- [`gui/fetch-mod-zip.sh`](gui/fetch-mod-zip.sh) — 下载并解压 Release zip / download and unzip a Release zip
- [`gui/release-match.js`](gui/release-match.js) — 挑选 `EscapeFromDuckovCoopMod*.zip`，并比较已安装版本 / pick that asset and compare installed versions
- [`gui/config-sync-state.js`](gui/config-sync-state.js) — 配置文件夹是否相同、哪一边更新、按钮上的时间 / whether the config folders match, which side is newer, and the button timestamp
- [`gui/config-fingerprint.sh`](gui/config-fingerprint.sh) — 读两边配置文件夹并打印指纹 / read both config folders and print the fingerprint
- [`prepare-duckov-coop-app.sh`](prepare-duckov-coop-app.sh) — 高级备用脚本 / advanced fallback script
- [`sync-duckov-config.sh`](sync-duckov-config.sh) — 在原版配置位置和联机副本配置位置之间镜像配置 / mirror config between the original config folder and the co-op config folder
- [`duckov-coop.entitlements`](duckov-coop.entitlements) — 签名用的 entitlements / entitlements passed to `codesign`
- [`build-gui-app.sh`](build-gui-app.sh) — 打包 `.app` 和 zip / pack the `.app` and zip
- [`dist/DuckovCoopPrepare.app`](dist/DuckovCoopPrepare.app) — 打包结果 / packed helper

## 高级：终端 / Advanced: Terminal

```bash
chmod +x prepare-duckov-coop-app.sh sync-duckov-config.sh
./prepare-duckov-coop-app.sh
./prepare-duckov-coop-app.sh --source "/path/to/Duckov.app" --mods-dir /path/to/Mods
./prepare-duckov-coop-app.sh --update-mods --dest "$HOME/Applications/Duckov-COOP.app" --mods-dir /path/to/Mods
./sync-duckov-config.sh --direction original-to-coop
./sync-duckov-config.sh --direction coop-to-original
```

参数 / Flags: `--source`, `--dest`, `--mods-dir`, `--force`, `--update-mods`, `--list-coop-mods`, `--dedupe-coop-mods`, `--keep-version`. `--update-mods` 不重拷整份游戏，只把 `--mods-dir` 里的 Mac 联机 Mod 装进已经存在的副本 `Contents/Mods/`，再用本机 `codesign` 身份 `-` 重新签名。安装前会先去掉副本里同属这一联机 Mod 的旧目录（创意工坊编号 `3591341282`、`EscapeFromDuckovCoopMod`、`Escape-From-Duckov-Coop`，以及 `info.ini` 或主 DLL 能认出的同一模组），只留一份即将安装的版本。背包扩展等其他 Mod 不删。原版 App 不改。若副本里已经是同一个版本，就跳过覆盖和重新签名。`--list-coop-mods` 只列出这些目录。`--dedupe-coop-mods` 在不下载新文件的情况下去掉重复项。同目录若有 `EscapeFromDuckovCoopMod*.zip`，完整准备时会在签名前装入副本的 `Contents/Mods/`，同样只留一份联机 Mod。`sync-duckov-config.sh` 只用 `--direction original-to-coop`（原版配置位置 → 联机副本配置位置）或 `coop-to-original`（联机副本配置位置 → 原版配置位置）。

`--update-mods` does not copy the whole game. It installs the Mac co-op Mod from `--mods-dir` into an existing copy's `Contents/Mods/`, then re-signs that copy with the local `codesign` identity `-`. Before installing, older folders of this same co-op Mod are removed from the copy (workshop id `3591341282`, `EscapeFromDuckovCoopMod`, `Escape-From-Duckov-Coop`, and any folder identified by `info.ini` or the main DLL) so only the version being installed remains. Other mods, such as a backpack expansion, stay. The original app is not modified. If the copy already has that same version, overwrite and re-sign are skipped. `--list-coop-mods` only lists those folders. `--dedupe-coop-mods` removes duplicates without downloading a new file. A sibling `EscapeFromDuckovCoopMod*.zip` is installed into the copy's `Contents/Mods/` before signing, and still only one co-op Mod package is kept.

`sync-duckov-config.sh` accepts `--direction original-to-coop` (original config folder → co-op config folder) or `coop-to-original` (co-op config folder → original config folder).

打开终端、`cd` 和 `chmod` 的逐步说明在首页 README 的「高级」一节。

Step-by-step Terminal help (opening Terminal, `cd`, and `chmod`) is in the Advanced section of the homepage README.

## 发布附件 / Publish the Release asset

在一台 Mac 上，于仓库里运行：

Run this on a Mac, from the repository:

```bash
scripts/mac/build-gui-app.sh
```

会生成 / It writes:

- `scripts/mac/dist/DuckovCoopPrepare.app`
- `scripts/mac/dist/DuckovCoopPrepare-mac-1.5.0.zip`

在 Mac 上，脚本会用本机 `codesign` 身份 `-` 给准备工具签名。Linux 上只能打包。把 **`DuckovCoopPrepare-mac-1.5.0.zip`** 上传到 GitHub Release。用户第一次打开下载的 App 时，仍可能需要 Control-点按 → 打开。

On a Mac the script signs the helper with the local `codesign` identity `-`. Linux can only pack the zip. Upload **`DuckovCoopPrepare-mac-1.5.0.zip`** to the GitHub Release. Players who download it may still need Control-click → Open the first time.

改过 `scripts/mac/gui/`、`prepare-duckov-coop-app.sh` 或 `sync-duckov-config.sh` 之后，重新运行打包脚本，并提交刷新后的 `dist/DuckovCoopPrepare.app`。

After editing `scripts/mac/gui/`, `prepare-duckov-coop-app.sh`, or `sync-duckov-config.sh`, run the pack script again and commit the refreshed `dist/DuckovCoopPrepare.app`.
