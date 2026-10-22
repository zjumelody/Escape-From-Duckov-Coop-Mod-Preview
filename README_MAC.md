# macOS / Apple Silicon 构建与联机说明

# macOS / Apple Silicon build and co-op notes

本文件说明如何在 **独立 Mac 版《逃离鸭科夫》** 上编译、安装这一 fork 的联机模组，以及为什么所有联机端必须使用同一个版本字符串。

This file explains how to build and install this fork's co-op mod on **standalone Mac Duckov**, and why every peer must use the same version string.

上游仓库是 [Mr-sans-and-InitLoader-s-team/Escape-From-Duckov-Coop-Mod-Preview](https://github.com/Mr-sans-and-InitLoader-s-team/Escape-From-Duckov-Coop-Mod-Preview)。Mac 适配只维护在本 fork：[zjumelody/Escape-From-Duckov-Coop-Mod-Preview](https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview)。维护方式见 [CONTRIBUTING_FORK.md](CONTRIBUTING_FORK.md)。按时间排列的 Mac 修复见 [MAC_ARM64_CHANGELOG.md](MAC_ARM64_CHANGELOG.md)。

Upstream is [Mr-sans-and-InitLoader-s-team/Escape-From-Duckov-Coop-Mod-Preview](https://github.com/Mr-sans-and-InitLoader-s-team/Escape-From-Duckov-Coop-Mod-Preview). The Mac port lives only on this fork: [zjumelody/Escape-From-Duckov-Coop-Mod-Preview](https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview). Maintenance is described in [CONTRIBUTING_FORK.md](CONTRIBUTING_FORK.md). Chronological Mac fixes are in [MAC_ARM64_CHANGELOG.md](MAC_ARM64_CHANGELOG.md).

## 版本方案 / Version scheme

| 项 / Field | 值 / Value |
| --- | --- |
| `BuildInfo.ModVersion` | `1.4.2` |
| `BuildInfo.AssemblyNumericVersion` | `1.4.2.0` |
| 上游基线 / Upstream base | `1.4.1`（`fe4f9a3`，含 Release 1.4.1 及之后的蓝图 / 投掷物 / 搜索修复） |
| 旧的 Mac 测试标签 / Retired Mac test label | `1.4.5-mac-move5`（针对 1.4.0 / `668e798` 的内部标签，**不再**作为联机字符串） |

**选择 `1.4.2` 的原因 / Why `1.4.2`：** 相对上游 `1.4.1`，这次是兼容性补丁而不是新的联机玩法大版本：Apple Silicon 上跳过会崩溃的 FMOD `AudioManager` 补丁、进图后恢复移动、Harmony 单个失败不再中止加载、MSBuild 路径改为 Mac 能解析的正斜杠。代码量不小，但没有新增一套合作模式，因此按本仓库 `1.4.0 → 1.4.1` 的习惯做 **patch** 而不是 `1.5.0`。

The delta from upstream `1.4.1` is a compatibility patch, not a new co-op feature generation: skip the FMOD `AudioManager` hooks that crash on Apple Silicon, recover movement after a level load, keep Harmony from aborting the whole mod on one bad patch, and make MSBuild paths resolve on Mac. The diff is large, but it does not add a new co-op mode, so this follows the repo's `1.4.0 → 1.4.1` habit and stays a **patch** rather than `1.5.0`.

**托管 DLL 是跨平台的一份构建 / One shared managed DLL：** Windows 和 Mac 加载同一份程序集。版本字符串里 **不要** 写 `mac` 或其它平台词。旧标签 `1.4.5-mac-move5` 只出现在变更记录里，用来指认当时测过的移动修复栈（move5）；rebase 到上游 `1.4.1` 之后，线上字符串改为所有平台共用的 `1.4.2`。

Windows and Mac load the same assembly. The version string must **not** contain `mac` or any other platform word. The old label `1.4.5-mac-move5` remains only in the changelog, as the name of the movement stack that was tested then (move5). After the rebase onto upstream `1.4.1`, the wire string is the shared `1.4.2` for every platform.

**联机必须逐字相同 / Peers must match exactly：** 房间校验比较的是 `BuildInfo.ModVersion` 整串（见 `NetService` / Steam 房间数据），不是“semver 兼容”。主机、客户端、旁观者，**不论 Windows 还是 Mac**，都必须是 `1.4.2`。拿创意工坊原版 `1.4.1`，或旧的 `1.4.5-mac-move5` 构建，都会被拒绝。改任何 Mac 逻辑或再次合并更新的上游之后，如果行为或基线变了，就递增这个共用字符串，并在本文件写明。若上游将来发布它自己的 `1.4.2`，本 fork 必须再往上跳一档，避免和创意工坊构建撞车。

The room check compares the full `BuildInfo.ModVersion` string (`NetService` / Steam lobby data), not semver compatibility. Host, clients, and spectators, **on Windows or Mac**, must all be `1.4.2`. A stock workshop `1.4.1` build, or an old `1.4.5-mac-move5` build, is rejected. After any Mac-logic change or a newer upstream merge that changes behavior or the base, bump this shared string and document it here. If upstream later ships its own `1.4.2`, this fork must bump again so it does not collide with the workshop build.

## 编译 / Build

需要 / You need:

- macOS arm64（Apple Silicon）或能交叉编译的 `dotnet` SDK
- 独立 Mac 版游戏本体（不是只靠 Windows 的 `Duckov_Data` 路径硬猜）
- `Shared/0Harmony.dll` 与 `Shared/LiteNetLib.dll`（仓库已带）

`LangVersion` 在 `Directory.Build.props` 和两个 csproj 里设为 `preview`，与这套 Mac 工具链一致。游戏引用路径用正斜杠；空的 `DUCKOV_GAME_DIRECTORY` 不会再被 `Exists('')` 误当成当前目录。

`LangVersion` is `preview` in `Directory.Build.props` and both csproj files, matching this Mac toolchain. Game reference paths use forward slashes. An empty `DUCKOV_GAME_DIRECTORY` is no longer treated as the current directory by `Exists('')`.

### 1. 指向 Managed / Point at Managed

若独立版仍沿用 Windows 式目录（游戏根目录下有 `Duckov_Data/Managed`）：

If the standalone port still uses the Windows-style layout (`Duckov_Data/Managed` under the game root):

```bash
export DUCKOV_GAME_DIRECTORY="/path/to/game-root"
```

若是标准 Unity `.app`（`Contents/Resources/Data/Managed`，没有 `Duckov_Data`），不要依赖自动拼接，直接指定 Managed：

If it is a normal Unity `.app` (`Contents/Resources/Data/Managed`, no `Duckov_Data`), do not rely on the automatic join. Set Managed directly:

```bash
export DUCKOV_GAME_MANAGED="/path/to/Duckov.app/Contents/Resources/Data/Managed"
```

`Directory.Build.props` 只在 `DUCKOV_GAME_MANAGED` 为空时才用 `Duckov_Data/Managed` 填充它。

`Directory.Build.props` fills `DUCKOV_GAME_MANAGED` from `Duckov_Data/Managed` only when `DUCKOV_GAME_MANAGED` is empty.

### 2. 编译 / Compile

在仓库根目录：

From the repository root:

```bash
dotnet build EscapeFromDuckovCoopMod.sln -c Release
```

输出 / Output:

- `EscapeFromDuckovCoopMod/bin/Release/netstandard2.1/EscapeFromDuckovCoopMod.dll`
- `EscapeFromDuckovModApi/bin/Release/netstandard2.1/EscapeFromDuckovModApi.dll`
- 同目录下的 `Localization/*.json`

当 `DUCKOV_GAME_DIRECTORY` 指向含 `Duckov_Data` 的根目录时，工程还会把 DLL 复制到 `Duckov_Data/Mods/联机Mod1`。Mac `.app` 若没有这个目录，请按下一节手动复制。

When `DUCKOV_GAME_DIRECTORY` points at a root that contains `Duckov_Data`, the project also copies the DLLs to `Duckov_Data/Mods/联机Mod1`. If the Mac `.app` has no such folder, copy them by hand as below.

## 安装 / Install

把下面三个东西放进 **Mac 游戏模组加载器实际读取的 Mods 目录**（目录名保持加载器认的那个，Windows 布局下是 `联机Mod1`）：

Put these three items in the **Mods folder the Mac game's mod loader actually reads** (keep the folder name the loader expects; on the Windows layout that is `联机Mod1`):

1. `EscapeFromDuckovCoopMod.dll`
2. `EscapeFromDuckovModApi.dll`
3. `Localization/` 目录（全部 json）

然后启动游戏，在模组列表里启用它。确认界面上的版本号是 `1.4.2`。和你联机的每一个人，无论系统，都要装这一份构建。

Start the game and enable the mod. The on-screen version must read `1.4.2`. Everyone you play with, on any OS, must install this same build.

## 沙盒与 UDP / Sandbox and UDP

联机直连走 LiteNetLib 的 **UDP**（绑定端口、局域网广播、对连）。macOS **App Sandbox** 会直接拒绝这些套接字：症状通常是模组能开、房间界面在，但发现不了主机或 `Start` 失败。Steam P2P 同样需要出站/入站网络权限。

Direct co-op uses LiteNetLib **UDP** (bind, LAN broadcast, direct connect). The macOS **App Sandbox** denies those sockets. The usual symptom is that the mod UI loads and a room screen appears, but the host is undiscoverable or `Start` fails. Steam P2P needs inbound and outbound network permission as well.

模组 DLL 改不了宿主签名。独立 Mac 版的 **游戏 / 承载 COOP 的 .app** 需要在关闭沙盒的前提下带上网络 entitlement，再重新签名。示例 `entitlements.plist`：

The mod DLL cannot re-sign the host. The standalone Mac **game / the .app that hosts COOP** must be re-signed with the sandbox off and network entitlements. Example `entitlements.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <false/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.network.server</key>
  <true/>
</dict>
</plist>
```

对应口头约定就是 **nosandbox + network**。`com.apple.security.app-sandbox` 为 false，同时打开 `network.client` 与 `network.server`。只加 network 却把沙盒留着，UDP 广播仍然可能失败。签名会影响 Gatekeeper，请只对你自己有权修改的那一份游戏使用。

That is the **nosandbox + network** note: `com.apple.security.app-sandbox` false, with both `network.client` and `network.server`. Adding network keys while leaving the sandbox on can still break UDP broadcast. Re-signing affects Gatekeeper. Do this only on a game copy you are allowed to modify.

代码里的说明位于 `ModBehaviour.IsOsxRuntime` 和 `LiteNetTransport.Start`。

The in-code notes are on `ModBehaviour.IsOsxRuntime` and `LiteNetTransport.Start`.

## Mac 上故意不一样的运行时行为 / Runtime behavior that is intentionally different on Mac

这些分支只在 OSX 运行时生效，Windows 仍走原来的 Harmony 音效路径：

These branches run only on the OSX runtime. Windows still uses the original Harmony audio path:

- **不补丁 `AudioManager.MPost` / `OnBulletFlyby` / `SetRTPC`。** FMOD 的 MPost 在 Mac 上会崩溃或变成空操作；MonoMod 在 arm64 上修补它会抛 `Win32Exception`（`Invalid function` / 缺少 `libdl.so.2`），整个 `PatchAll` 会把模组加载一起带走。`Prepare()` 与 `Loader` 的按类型跳过是两道保险。脚步和枪声改由 `CoopOsxAudioEmitters` 发送。卡祖笛的 `ItemAgent_Kazoo` 补丁保留。
- **进图移动恢复（`MacLocalInputUnlock`）。** Base → MultiScene / GroundZero 之后，`WalkSpeed` 的 **Value 可以是 0**（Base 上曾是 4，`CanMove` 为真）。`CanMove` 要求 WalkSpeed &gt; 0，所以 `SetMoveInput` 有轴也会被丢掉。OSX 上修复 BaseValue，并用 postfix 把 Value 托到门槛以上。
- **绝不清除 `CA_Interact` 的 `CanMove`。** 交互、冲刺、钓鱼等动作故意禁移。每帧 `StopAction` 会让 F 只抖一下然后取消。
- **辅助标志卡住时不要每帧 `SetForceMoveVelocity`。** BaseValue 已经 &gt; 0 而 Value 仍为 0 时，若辅助不关，走路速度的 ForceMove 会和 Shift 冲刺打架，冲刺变顿、比走路还慢。move5 的结论是：BaseValue 健康就关掉连续注入，ForceMove 只做一次紧急注入，冲刺交还原版 Input System。

- **Do not patch `AudioManager.MPost` / `OnBulletFlyby` / `SetRTPC`.** FMOD MPost crashes or no-ops on Mac. MonoMod patching it on arm64 throws `Win32Exception` (`Invalid function` / missing `libdl.so.2`) and a single `PatchAll` failure takes down mod load. `Prepare()` plus `Loader`'s per-type skip are two layers. Footsteps and gunshots are sent by `CoopOsxAudioEmitters`. `ItemAgent_Kazoo` patches stay.
- **Movement recovery after load (`MacLocalInputUnlock`).** After Base → MultiScene / GroundZero, `WalkSpeed` **Value can be 0** (Base previously showed 4 with `CanMove` true). `CanMove` requires WalkSpeed &gt; 0, so `SetMoveInput` drops a non-zero axis. On OSX the code repairs BaseValue and a postfix floors Value so the gate can open.
- **Never clear `CA_Interact`'s `CanMove`.** Interact, dash, and fishing intentionally forbid movement. A per-frame `StopAction` makes F screen-shake and then cancel.
- **Do not call `SetForceMoveVelocity` every frame while the assist flag is stuck.** When BaseValue is already &gt; 0 and Value is still 0, leaving the assist on makes walk-speed ForceMove fight Shift sprint. Sprint stutters and can be slower than walking. The move5 conclusion: turn continuous inject off once BaseValue is healthy, allow one emergency ForceMove, and give sprint back to the vanilla Input System.

`Loader` 改为逐类型打补丁，这个韧性在所有平台都在：某一个补丁失败会记日志并继续，不再让整个 `OnEnable` 失败。聊天输入只有在聊天面板确实打开时才抢走游戏输入，避免 Mac 上残留的 TMP 焦点在切场景后禁用 `MainPlayerInput`。

`Loader` patches type by type on every platform: one failed patch is logged and skipped, and no longer fails all of `OnEnable`. Chat captures gameplay input only while the chat panel is actually open, so leftover TMP focus on Mac cannot disable `MainPlayerInput` across a scene load.
