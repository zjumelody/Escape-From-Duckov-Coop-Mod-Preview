感谢原作者的奉献，世界有他们更精彩，原地址：https://github.com/Mr-sans-and-InitLoader-s-team/Escape-From-Duckov-Coop-Mod-Preview  
请支持他们的劳动成果并遵守相关法规法则！

# 逃离鸭科夫联机模组（Melody Fork · Mac 兼容）

[English](README_EN.md) | **简体中文**

本人 Fork 过来修改更新了写代码以便支持 Mac 和 Mac 之间联机，也支持 Mac 和 Windows 联机。
想要测试的朋友们也可以自行下载 [Release](https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases) 里的测试版进行测试。
不过除了下载此 Mod 文件外，也要对游戏 App 进行一些处理，方法如下：

## Mac 游戏 App 处理（必须）

官方/Steam 安装的原版 `Duckov.app` 带有 App Sandbox，且缺少联机所需的网络权限；把 Mods 装进原版还可能导致系统提示 App 已损坏。请**复制一份**再改权限并签名，Mods 只装进副本。

### 推荐：图形工具（不用终端）

1. 打开 [Releases](https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases)。
2. 在附件里下载 **`DuckovCoopPrepare-mac.zip`**，解压后双击里面的 **`DuckovCoopPrepare.app`**。请用这个附件；页面下方名为 Source code 的压缩包是仓库源码。
3. 第一次打开时，macOS 可能会说无法验证开发者。按住 **Control** 点按这个 App，选择「打开」，再点「打开」。若菜单里没有「打开」，到「系统设置 → 隐私与安全性」里点「仍要打开」。这一次之后就可以直接双击。不需要 Apple 开发者账号。

然后在窗口里：

1. 确认「指定原版游戏 App 的位置（现有已经安装的游戏位置可在 steam 里查看）」。默认是 `/Applications/Duckov.app`。已安装的位置可以在 Steam 里查看。若不在默认位置，点「选择… / Choose…」。
2. 确认「指定要保存游戏副本的位置（今后要联机则打开这个副本游戏）」。默认是你的用户文件夹里的 `Applications/Duckov-COOP.app`（也就是 `~/Applications/Duckov-COOP.app`）。今后要联机，打开的是这个副本。
3. 需要联机 Mod 时，任选一种：
   - 点「下载最新测试 Mod / Download latest test mod」，等 Mods 路径自动填上；或
   - 点 Mods 旁边的「选择… / Choose…」，选已经解压好的 Mods 文件夹。
   - 只想先做出副本、以后再装 Mod：Mods 留空。
4. 点窗口最下方的 **「准备联机副本 / Prepare co-op copy」**。副本已经存在时，会先问你要不要替换；已经装在副本里的 Mods 会保留。复制整份游戏可能要几分钟，这段时间不要关窗口。
5. 看到「完成 / Done」之后，**只启动** `Duckov-COOP.app` 进行联机。

按钮含义：

- **准备联机副本 / Prepare co-op copy**：把原版复制成副本，关闭 App Sandbox，加入 `network.client` 和 `network.server`，再用本机 `codesign` 身份 `-` 重新签名。Mods 栏有路径时，会在签名前装进副本的 `Contents/Mods/`。
- **下载最新测试 Mod / Download latest test mod**：从本 Fork 的 Releases（包含预发布）下载最新的 `EscapeFromDuckovCoopMod*.zip`，解压到这个准备工具旁边（那个文件夹不能写时，改放到「下载」），并把 Mods 路径填好。下载这一步不改游戏，还要再点「准备联机副本」。
- **打开 Releases 页面 / Open Releases**：用浏览器打开本 Fork 的 Releases，方便自己下载。
- **选择… / Choose…**：挑选原版 App、副本保存位置，或已经解压的 Mods 文件夹。
- **清除 / Clear**：清空 Mods 路径。这一次准备就不装入新的 Mod。
- **打开 / Open**：在访达中显示这一行的路径。Mods 为空时会提示。`.app` 会在访达里显示，不会因此启动游戏。
- **打开原版配置位置 / Open original config folder**：打开位置1（原版沙盒配置）。文件夹不存在时会说明原因，不会自动创建。
- **打开联机副本配置位置 / Open co-op config folder**：打开位置2（联机副本配置）。必要时会先创建这个文件夹。
- **原版配置 → 联机副本 / Sync original → co-op**：把位置1里的内容镜像到位置2。
- **联机副本 → 原版配置 / Sync co-op → original**：把位置2里的内容镜像到位置1。

原版开着 App Sandbox，配置在 `~/Library/Containers/com.bilibili.duckov/Data/Library/Application Support/com.bilibili.duckov`（位置1 / 原版沙盒配置）。联机副本关掉沙盒，配置在 `~/Library/Application Support/com.bilibili.duckov`（位置2 / 联机副本配置）。Bundle ID 相同，差别来自沙盒开关，不是 `.app` 放在哪。同步前请退出两边的游戏；目标里多出来的文件会被删掉。若读取位置1时出现 Operation not permitted，请在「系统设置 → 隐私与安全性 → 完全磁盘访问权限」里加入 `DuckovCoopPrepare.app` 后再试。

进度在窗口中下部滚动显示。Mods、配置与存档各在一个标为可选的区域里。「准备联机副本」是窗口最下方居中的蓝色按钮。「打开 Releases 页面」在窗口内容区右上角，是一颗灰色按钮。成功和失败都有中文和英文说明。准备副本不会修改原版 `Duckov.app`。

### 高级：终端脚本

熟悉终端时，可以用 [`scripts/mac/prepare-duckov-coop-app.sh`](scripts/mac/prepare-duckov-coop-app.sh)。配套 entitlements 是 [`scripts/mac/duckov-coop.entitlements`](scripts/mac/duckov-coop.entitlements)。说明见 [`scripts/mac/README.md`](scripts/mac/README.md)。

1. 安装官方游戏。默认位置是 `/Applications/Duckov.app`；若装在别处，记下那个 `Duckov.app`。
2. 下载 `prepare-duckov-coop-app.sh`。若同时下载了 `duckov-coop.entitlements`，放在脚本同一个文件夹里。
3. 打开「终端」：按 `Command` + `空格`，输入 `终端` 或 `Terminal`，回车。
4. 输入 `cd` 和一个空格，先不要回车。在访达里打开脚本所在的文件夹，把这个文件夹拖进终端窗口，再回车。
5. 依次输入下面两行，每行结束按回车：

```bash
chmod +x prepare-duckov-coop-app.sh
./prepare-duckov-coop-app.sh
```

6. 游戏不在默认位置时，把 `/path/to/Duckov.app` 换成你的路径（也可以把 `Duckov.app` 拖进终端）：

```bash
./prepare-duckov-coop-app.sh --source "/path/to/Duckov.app"
```

7. 副本已经存在时，脚本会问是否替换。输入 `y` 或 `是`，再回车，才会继续。不想每次确认时，加上 `--force`。

默认会生成 `~/Applications/Duckov-COOP.app`（去掉 App Sandbox、加入 network.client / network.server，并用本机 `codesign` 身份 `-` 重新签名；无需 Apple 开发者账号）。

可选：把解压后的 Mods 目录一并装入副本：

```bash
./prepare-duckov-coop-app.sh --mods-dir /path/to/Mods
```

若把 Release 压缩包（例如 `EscapeFromDuckovCoopMod*.zip`）和脚本放在同一目录，脚本会在签名前把它装进副本的 `Contents/Mods/`。

### 图形工具和脚本在做什么

1. 复制 `/Applications/Duckov.app` → `~/Applications/Duckov-COOP.app`（不改动原版）。
2. 调整副本的 entitlements：关闭 App Sandbox；启用 `com.apple.security.network.client` 与 `com.apple.security.network.server`。
3. 对本机副本执行 `codesign` 本地签名（身份 `-`）。每人在自己电脑上对自己的副本签一次即可。
4. 将本 Fork Release 中的联机 Mod（及所需依赖 Mod）放入 `Duckov-COOP.app/Contents/Mods/`。
5. **只启动** `Duckov-COOP.app` 进行联机；联机各方 ModVersion 字符串必须完全一致（Windows / Mac 共用同一版本号，例如 Release 中的 `1.4.2`）。

### 注意

- 不要把 Mods 安装进原版 `/Applications/Duckov.app`。
- Steam「验证游戏完整性」可能影响原版；副本若异常，请再运行一次准备工具或脚本。
- 不需要 Apple 开发者账号。准备工具和副本都只用本机 `codesign` 身份 `-`。
- 目标副本已存在时，会先确认再替换。重新运行会保留副本里已经装好的 Mods，并在复制之后重新签名。
- 若之后又手动放入 Mods，请再运行一次准备工具或脚本，以便重新签名。

许可证：[LICENSE.txt](LICENSE.txt)
