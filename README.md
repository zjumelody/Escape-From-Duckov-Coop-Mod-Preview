# 逃离鸭科夫联机模组（Melody Fork · Mac 兼容）

[English](README_EN.md) | **简体中文**

本人 Fork 过来修改更新了写代码以便支持 Mac 和 Mac 之间联机，也支持 Mac 和 Windows 联机。
想要测试的朋友们也可以自行下载 [Release](https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview/releases) 里的测试版进行测试。
不过除了下载此 Mod 文件外，也要对游戏 App 进行一些处理，方法如下：

## Mac 游戏 App 处理（必须）

官方/Steam 安装的原版 `Duckov.app` 带有 App Sandbox，且缺少联机所需的网络权限；把 Mods 装进原版还可能导致系统提示 App 已损坏。请**复制一份**再改权限并签名，Mods 只装进副本。

### 推荐：一键脚本

脚本放在 [`scripts/mac/prepare-duckov-coop-app.sh`](scripts/mac/prepare-duckov-coop-app.sh)，配套 entitlements 为 [`scripts/mac/duckov-coop.entitlements`](scripts/mac/duckov-coop.entitlements)。简短说明见 [`scripts/mac/README.md`](scripts/mac/README.md)。Release 里也可能附上同一份脚本，方便直接下载。

1. 安装正版游戏，确认 `/Applications/Duckov.app` 存在（或记下你的安装路径）。
2. 下载本仓库 [`scripts/mac/prepare-duckov-coop-app.sh`](scripts/mac/prepare-duckov-coop-app.sh)（也可从 Release 附件下载；建议把同目录的 `duckov-coop.entitlements` 一起放在脚本旁边）。
3. 在「终端」执行：

```bash
chmod +x prepare-duckov-coop-app.sh
./prepare-duckov-coop-app.sh
```

游戏若不在默认位置，加上你的安装路径：

```bash
./prepare-duckov-coop-app.sh --source "/path/to/Duckov.app"
```

默认会生成 `~/Applications/Duckov-COOP.app`（去掉 App Sandbox、加入 network.client / network.server，并用本机 `codesign` 身份 `-` 重新签名；无需 Apple 开发者账号）。

可选：把解压后的 Mods 目录一并装入副本：

```bash
./prepare-duckov-coop-app.sh --mods-dir /path/to/Mods
```

若把 Release 压缩包（例如 `EscapeFromDuckovCoopMod*.zip`）和脚本放在同一目录，脚本会在签名前把它装进副本的 `Contents/Mods/`。

### 脚本在做什么（等价手动步骤）

1. 复制 `/Applications/Duckov.app` → `~/Applications/Duckov-COOP.app`（不改动原版）。
2. 调整副本的 entitlements：关闭 App Sandbox；启用 `com.apple.security.network.client` 与 `com.apple.security.network.server`。
3. 对本机副本执行 `codesign` 本地签名（身份 `-`）。每人在自己电脑上对自己的副本签一次即可。
4. 将本 Fork Release 中的联机 Mod（及所需依赖 Mod）放入 `Duckov-COOP.app/Contents/Mods/`。
5. **只启动** `Duckov-COOP.app` 进行联机；联机各方 ModVersion 字符串必须完全一致（Windows / Mac 共用同一版本号，例如 Release 中的 `1.4.2`）。

### 注意

- 不要把 Mods 安装进原版 `/Applications/Duckov.app`。
- Steam「验证游戏完整性」可能影响原版；副本若异常请重新运行脚本。
- 不需要 Apple 开发者账号。
- 目标副本已存在时，脚本会询问是否替换；直接替换可加 `--force`。重新运行会保留副本里已经装好的 Mods，并在复制之后重新签名。

许可证：[LICENSE.txt](LICENSE.txt)

感谢原作者的奉献，世界有他们更精彩，原地址：https://github.com/Mr-sans-and-InitLoader-s-team/Escape-From-Duckov-Coop-Mod-Preview  
请支持他们的劳动成果并遵守相关法规法则！
