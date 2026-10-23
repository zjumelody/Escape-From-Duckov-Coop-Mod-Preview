# Mac：准备 Duckov-COOP.app / Prepare Duckov-COOP.app

推荐用图形工具 **`DuckovCoopPrepare.app`**。它会调用下面的脚本，复制官方 `Duckov.app` 到 `~/Applications/Duckov-COOP.app`，关闭 App Sandbox，加入 `com.apple.security.network.client` 与 `com.apple.security.network.server`，并用本机 `codesign` 身份 `-` 重新签名。不改动原版。Mods 只装进副本。

The graphical helper **`DuckovCoopPrepare.app`** is the path to use. It runs the script below: copy an official `Duckov.app` to `~/Applications/Duckov-COOP.app`, turn App Sandbox off, add `com.apple.security.network.client` and `com.apple.security.network.server`, and re-sign the copy with the local `codesign` identity `-`. The original app is not modified. Mods go only into the copy.

玩家步骤在仓库首页：[README.md](../../README.md) · [README_EN.md](../../README_EN.md)。

Player steps are on the repo homepage: [README.md](../../README.md) · [README_EN.md](../../README_EN.md).

## 给玩家 / For players

从 [Releases](https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases) 下载附件 **`DuckovCoopPrepare-mac.zip`**，解压后双击 `DuckovCoopPrepare.app`。

第一次若系统提示无法验证开发者：按住 Control 点按该 App，选择「打开」。不需要 Apple 开发者账号。

Download **`DuckovCoopPrepare-mac.zip`** from [Releases](https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases), unzip it, and double-click `DuckovCoopPrepare.app`.

If macOS says the developer cannot be verified, Control-click the app and choose Open. An Apple Developer account is not required.

| 按钮 / Button | 作用 / What it does |
| --- | --- |
| 准备联机副本 / Prepare co-op copy | 复制、改副本权限、本机签名，并在有 Mods 路径时装入副本 |
| 下载最新测试 Mod / Download latest test mod | 下载最新的 `EscapeFromDuckovCoopMod*.zip`（含预发布），解压后填入 Mods 路径 |
| 打开 Releases 页面 / Open Releases | 在浏览器打开 Releases |
| 打开 / Open | 在访达中显示原版 App、副本或 Mods 路径。`.app` 只显示，不启动 |
| 打开原版配置位置 / Open original config folder | 打开位置1（原版沙盒配置）。不存在时提示，不创建 |
| 打开联机副本配置位置 / Open co-op config folder | 打开位置2（联机副本配置）。必要时创建该文件夹 |
| 原版配置 → 联机副本 / Sync original → co-op | 把位置1的内容镜像到位置2（`rsync -a --delete`） |
| 联机副本 → 原版配置 / Sync co-op → original | 把位置2的内容镜像到位置1 |

原版开着 App Sandbox，配置在位置1：`~/Library/Containers/com.bilibili.duckov/Data/Library/Application Support/com.bilibili.duckov`（原版沙盒配置）。联机副本关掉沙盒，配置在位置2：`~/Library/Application Support/com.bilibili.duckov`（联机副本配置）。Bundle ID 相同，差别是沙盒开或关，不是 `.app` 放在哪。同步前请退出两边的游戏。若读取位置1出现 Operation not permitted，请在「系统设置 → 隐私与安全性 → 完全磁盘访问权限」中加入 `DuckovCoopPrepare.app`。

The original app keeps App Sandbox, so config is Location 1: `~/Library/Containers/com.bilibili.duckov/Data/Library/Application Support/com.bilibili.duckov`. The co-op copy has App Sandbox off, so config is Location 2: `~/Library/Application Support/com.bilibili.duckov`. The bundle id is the same. The split is sandbox on versus off, not where the `.app` file lives. Quit both games before syncing. If reading Location 1 prints Operation not permitted, add `DuckovCoopPrepare.app` under System Settings → Privacy & Security → Full Disk Access.

窗口里：原版和副本路径在上方；Mods 与配置/存档是两个可选方框，中间留白较紧；「打开 Releases 页面」在右上角，是一颗灰色按钮；「准备联机副本」是最下方居中的蓝色按钮。

In the window: the original app and the copy path are at the top; Mods and config/saves are two optional boxes with a tight gap; Open Releases is a gray button at the top-right; Prepare co-op copy is a centered blue button at the bottom.

## 文件 / Files

- [`gui/main.js`](gui/main.js) — 窗口界面 / the window
- [`gui/launcher.sh`](gui/launcher.sh) — `.app` 的启动程序 / the `.app` executable
- [`gui/fetch-mod-zip.sh`](gui/fetch-mod-zip.sh) — 下载并解压 Release zip / download and unzip a Release zip
- [`gui/release-match.js`](gui/release-match.js) — 挑选 `EscapeFromDuckovCoopMod*.zip` / pick that asset
- [`prepare-duckov-coop-app.sh`](prepare-duckov-coop-app.sh) — 高级备用脚本 / advanced fallback script
- [`sync-duckov-config.sh`](sync-duckov-config.sh) — 在位置1和位置2之间镜像配置 / mirror config between Location 1 and Location 2
- [`duckov-coop.entitlements`](duckov-coop.entitlements) — 签名用的 entitlements / entitlements passed to `codesign`
- [`build-gui-app.sh`](build-gui-app.sh) — 打包 `.app` 和 zip / pack the `.app` and zip
- [`dist/DuckovCoopPrepare.app`](dist/DuckovCoopPrepare.app) — 打包结果 / packed helper

## 高级：终端 / Advanced: Terminal

```bash
chmod +x prepare-duckov-coop-app.sh sync-duckov-config.sh
./prepare-duckov-coop-app.sh
./prepare-duckov-coop-app.sh --source "/path/to/Duckov.app" --mods-dir /path/to/Mods
./sync-duckov-config.sh --direction original-to-coop
./sync-duckov-config.sh --direction coop-to-original
```

参数 / Flags: `--source`, `--dest`, `--mods-dir`, `--force`. 同目录若有 `EscapeFromDuckovCoopMod*.zip`，会在签名前装入副本的 `Contents/Mods/`。`sync-duckov-config.sh` 只用 `--direction original-to-coop`（位置1→位置2）或 `coop-to-original`（位置2→位置1）。

`sync-duckov-config.sh` accepts `--direction original-to-coop` (Location 1 → 2) or `coop-to-original` (Location 2 → 1).

A sibling `EscapeFromDuckovCoopMod*.zip` is installed into the copy's `Contents/Mods/` before signing.

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
- `scripts/mac/dist/DuckovCoopPrepare-mac.zip`

在 Mac 上，脚本会用本机 `codesign` 身份 `-` 给准备工具签名。Linux 上只能打包。把 **`DuckovCoopPrepare-mac.zip`** 上传到 GitHub Release。用户第一次打开下载的 App 时，仍可能需要 Control-点按 → 打开。

On a Mac the script signs the helper with the local `codesign` identity `-`. Linux can only pack the zip. Upload **`DuckovCoopPrepare-mac.zip`** to the GitHub Release. Players who download it may still need Control-click → Open the first time.

改过 `scripts/mac/gui/`、`prepare-duckov-coop-app.sh` 或 `sync-duckov-config.sh` 之后，重新运行打包脚本，并提交刷新后的 `dist/DuckovCoopPrepare.app`。

After editing `scripts/mac/gui/`, `prepare-duckov-coop-app.sh`, or `sync-duckov-config.sh`, run the pack script again and commit the refreshed `dist/DuckovCoopPrepare.app`.
