# Mac arm64 变更记录

# Mac arm64 changelog

记录 Apple Silicon 联机适配，从能加载模组一直到测过的移动栈 **`1.4.5-mac-move5`**，以及把这套改动 rebase 到上游 **1.4.1** 之后的版本字符串。

This is the Apple Silicon co-op port, from "the mod can load" through the tested movement stack **`1.4.5-mac-move5`**, and the version string chosen after rebasing that work onto upstream **1.4.1**.

这些步骤来自针对上游 `668e798`（1.4.0 清理提交）的 Mac diff、两份新文件，以及当时注释里的 Player.log 结论。它们当时不是本 fork master 上的独立 git 提交。下面按修复顺序排列。原 Mac 包用 "1.4.2 / 1.4.3 / 1.4.4" 称呼自己的测试构建；那不是上游 Release 1.4.1，也不是现在的共用 `BuildInfo.ModVersion`（`1.4.2`）。源码注释已改成直接描述故障，避免和这个版本号搅在一起。

The steps come from the Mac diff against upstream `668e798` (the 1.4.0 cleanup commit), the two new files, and the Player.log conclusions that were in those comments. They were not separate git commits on this fork's master. The order below is the order of the fixes. The original Mac pack called its own test builds "1.4.2 / 1.4.3 / 1.4.4". Those names are not upstream Release 1.4.1, and they are not the shared `BuildInfo.ModVersion` (`1.4.2`) used now. In-tree comments describe the failure directly so they are not confused with that version string.

## 1. 工具链能在 Mac 上解析游戏 DLL

## 1. The toolchain can resolve game DLLs on Mac

- `Directory.Build.props` 改为正斜杠。
- 只有 `DUCKOV_GAME_DIRECTORY` 非空且目录存在时才设 `GameDirectory`。空字符串上的 `Exists('')` 在部分 MSBuild 里会当成当前目录。
- `DUCKOV_GAME_MANAGED` 可以单独覆盖，用于没有 `Duckov_Data` 的 Unity `.app`（`Contents/Resources/Data/Managed`）。
- `LangVersion` 设为 `preview`。
- 两个 csproj 的 `HintPath`、复制目标、嵌入资源路径一并改为正斜杠。针对 `668e798` 的原始 diff 只改了 `LangVersion` 和 props 里的三条路径；csproj 里成百个 `\` 是 rebase 时补上的，否则 Mac 上的 item 路径不可靠。

- `Directory.Build.props` uses forward slashes.
- `GameDirectory` is set only when `DUCKOV_GAME_DIRECTORY` is non-empty and exists. `Exists('')` is the current directory on some MSBuild versions.
- `DUCKOV_GAME_MANAGED` can be overridden on its own for a Unity `.app` that has no `Duckov_Data` (`Contents/Resources/Data/Managed`).
- `LangVersion` is `preview`.
- HintPaths, copy destinations, and embedded resource paths in both csproj files are forward slashes too. The original diff against `668e798` only changed `LangVersion` and the three props paths. The hundreds of `\` in the csproj files were converted during this rebase, because those item paths are not reliable separators on Mac.

## 2. 一个坏补丁不再让整个模组加载失败

## 2. One bad patch no longer fails the whole mod load

arm64 OSX 上 Harmony/MonoMod 会抛 `Win32Exception`（`Invalid function` / 缺少 `libdl.so.2`）。原来的 `Harmony.PatchAll()` 一失败，`OnEnable` 就停，联机面板和网络都没有。

On arm64 OSX, Harmony/MonoMod throws `Win32Exception` (`Invalid function` / missing `libdl.so.2`). The old `Harmony.PatchAll()` aborted `OnEnable`, so there was no co-op panel and no networking.

`Loader` 改为逐类型打补丁：跳过非补丁类型（避免把普通 `Cleanup` 方法当成 `HarmonyCleanup`），OSX 上跳过已知会炸的 AudioManager 类型，其它失败只记日志。`SafeInit` 也会把异常打出来。

`Loader` now patches one type at a time. It skips non-patch types (so an ordinary `Cleanup` method is not treated as `HarmonyCleanup`), skips the known-bad AudioManager types on OSX, and logs any other failure. `SafeInit` logs its exceptions too.

## 3. 跳过 Mac 上的 FMOD `AudioManager` 补丁

## 3. Skip FMOD `AudioManager` patches on Mac

`AudioManager.MPost` 在 Mac 上会崩溃或变成空操作。`OnBulletFlyby` 和卡祖笛的 `SetRTPC` 走同一条路。

`AudioManager.MPost` crashes or no-ops on Mac. `OnBulletFlyby` and the kazoo `SetRTPC` hook take the same path.

- `CoopAudioPatches`、`CoopBulletFlybyAudioPatch`、`KazooAudioManagerRtpcPatch` 的 `Prepare()` 在 OSX 上返回 false。
- `Loader` 仍按类型名再跳过一次，避免 `Prepare()` 之前 MonoMod 已经去解析 `MPost`。
- `ItemAgent_Kazoo` 的 Update / OnDisable / OnDestroy 补丁留在 `KazooPatches`，不跟 AudioManager 一起被跳过。
- 新增 `CoopOsxAudioEmitters`：用 `CharacterSoundMaker.OnFootStepSound` 和 `ItemAgent_Gun.PostShootSound` 发送原来从 `MPost` 出去的联机音效。`Prepare()` 只在 OSX 上启用枪声补丁。

- `Prepare()` on `CoopAudioPatches`, `CoopBulletFlybyAudioPatch`, and `KazooAudioManagerRtpcPatch` returns false on OSX.
- `Loader` still skips those types by name, in case MonoMod resolves `MPost` before `Prepare()` runs.
- `ItemAgent_Kazoo` Update / OnDisable / OnDestroy stay in `KazooPatches` and are not skipped with AudioManager.
- New `CoopOsxAudioEmitters`: `CharacterSoundMaker.OnFootStepSound` and `ItemAgent_Gun.PostShootSound` emit the network audio events that used to leave via `MPost`. The gunshot patch's `Prepare()` enables it only on OSX.

## 4. 沙盒与 UDP

## 4. Sandbox and UDP

独立 Mac 版若带 App Sandbox，LiteNetLib 的 UDP 绑定、广播和直连会被拒绝。需要 **nosandbox + network client/server** entitlement。这不是协议改动；说明写在 `README_MAC.md`，代码注释在 `IsOsxRuntime` 与 `LiteNetTransport.Start`。

If the standalone Mac build is sandboxed, LiteNetLib UDP bind, broadcast, and direct connect are denied. It needs the **nosandbox + network client/server** entitlements. This is not a protocol change. `README_MAC.md` documents it. Code comments are on `IsOsxRuntime` and `LiteNetTransport.Start`.

## 5. 进图不能移动，一直修到 `1.4.5-mac-move5`

## 5. Cannot move after a level load, through `1.4.5-mac-move5`

新增 `MacLocalInputUnlock`（含 `MacMoveWatchdog`）。`SceneNet` 的主客机场景门、`LevelManager` 的客户端 `InitLevel`、`SceneManager.sceneLoaded` 都会在关卡就绪后调用它。

New `MacLocalInputUnlock` (and `MacMoveWatchdog`). The host and client scene gates in `SceneNet`, the client `InitLevel` path in `LevelManager`, and `SceneManager.sceneLoaded` all call it once the level is ready.

内部测试构建上的顺序 / Order on the internal Mac test builds:

1. **早期移动日志（注释里称 1.4.2 那份 Player.log）。** Base 上 `WalkSpeed=4`、`CanMove=True`。进入 GroundZero / MultiScene 之后 `MoveAxis` 不是 `(0,0)`，但 `CanMove=False`、`WalkSpeed=0.00`。`CanMove` 要求 WalkSpeed &gt; 0，`SetMoveInput` 因此丢掉输入。修复 WalkSpeed / Moveability 的 BaseValue，并在 OSX 上为本地角色绕过这个门闩。
2. **聊天焦点。** 切场景后 TMP 仍可能保持焦点，`IsChatTyping` 把 `MainPlayerInput` 留在禁用状态。现在只有聊天面板确实打开才算正在输入；进图时 `ForceCloseChatForMovement` 加上 `ResetForceDisable`。
3. **不要清掉 `CA_Interact`（注释里称 1.4.3）。** 每帧取消交互 / 冲刺 / 钓鱼后，F 只让屏幕抖一下然后交互被取消。故意禁移的动作必须保留，交互过程中不调用 `StopAction`。
4. **Value==0 但 BaseValue 仍健康（注释里称 1.4.4）。** GroundZero 上 `walkBase=4`、`walkVal=0`。若辅助标志按 Value 卡住不放，每帧 `SetForceMoveVelocity` 用走路速度去推角色，Shift 冲刺就会变顿，甚至比走路还慢。
5. **测过的标签 `1.4.5-mac-move5`。** 辅助只跟 BaseValue：BaseValue 健康就关掉连续注入。WalkSpeed postfix 仅把 Value 托到 CanMove 门槛以上。`SetForceMoveVelocity` 每个观察窗口最多一次。冲刺交还原版 Input System。这个标签当时打在 **1.4.0 / `668e798`** 上，不是上游的 1.4.5，上游没有 1.4.5。

1. **Early movement log (the comments call that Player.log "1.4.2").** On Base, `WalkSpeed=4` and `CanMove=True`. After GroundZero / MultiScene, `MoveAxis` was not `(0,0)` but `CanMove=False` and `WalkSpeed=0.00`. `CanMove` requires WalkSpeed &gt; 0, so `SetMoveInput` dropped the axis. Repair WalkSpeed / Moveability BaseValue, and on OSX bypass that gate for the local character.
2. **Chat focus.** TMP can stay focused across a scene load, and `IsChatTyping` left `MainPlayerInput` disabled. Typing now counts only while the chat panel is actually open. Level ready calls `ForceCloseChatForMovement` and `ResetForceDisable`.
3. **Do not clear `CA_Interact` (the comments call this "1.4.3").** Cancelling interact / dash / fishing every frame made F screen-shake and then cancel. Intentional no-move actions stay. `StopAction` is not called during an interact.
4. **Value==0 while BaseValue is healthy (the comments call this "1.4.4").** On GroundZero, `walkBase=4` and `walkVal=0`. A Value-gated assist that never cleared pushed the character with per-frame `SetForceMoveVelocity` at walk speed, so Shift sprint stuttered and could be slower than walking.
5. **Tested label `1.4.5-mac-move5`.** The assist follows BaseValue and turns continuous inject off once BaseValue is healthy. The WalkSpeed postfix only floors Value so `CanMove` can pass. `SetForceMoveVelocity` runs at most once per watch window. Sprint belongs to the vanilla Input System. That label was built on **1.4.0 / `668e798`**. It was not an upstream 1.4.5. Upstream has no 1.4.5.

## 6. Rebase 到上游 1.4.1，共用版本改为 `1.4.2`

## 6. Rebase onto upstream 1.4.1; shared version is `1.4.2`

本 fork 的 `master` 在接入时已经包含上游 Release **1.4.1** 以及其后的提交，顶端是 `fe4f9a3`（蓝图掉落、可回收投掷物、搜索连续性）。Mac diff 的基线是 `668e798`。

When this port landed, this fork's `master` already contained upstream Release **1.4.1** and the commits after it. The tip was `fe4f9a3` (blueprint loot, reusable throwables, search continuity). The Mac diff was based on `668e798`.

**冲突 / Conflict：** 在 diff 碰到的文件里，只有 `EscapeFromDuckovCoopMod/BuildInfo.cs` 在 `668e798` 和 `HEAD` 之间改过。上游把 `ModVersion` 从 `1.4.0` 改成了 `1.4.1`（程序集 `1.4.1.0`）。Mac 包想写成 `1.4.5-mac-move5` / `1.4.5.0`。其余被改文件与 `668e798` 一致，补丁干净套上。

Among the files the diff touches, only `EscapeFromDuckovCoopMod/BuildInfo.cs` changed between `668e798` and `HEAD`. Upstream moved `ModVersion` from `1.4.0` to `1.4.1` (assembly `1.4.1.0`). The Mac pack wanted `1.4.5-mac-move5` / `1.4.5.0`. Every other touched file matched `668e798`, so those hunks applied cleanly.

**决议 / Resolution：** 托管 DLL 是 Windows 和 Mac 共用的一份构建，版本字符串不能带平台后缀，也不能留在创意工坊的 `1.4.1` 上（会和原版对上号，但二进制并不是原版）。按改动相对 `1.4.1` 的大小，做成 patch：`ModVersion = 1.4.2`，`AssemblyNumericVersion = 1.4.2.0`。move5 的移动逻辑保留；那个旧标签不再参与联机比较。任意系统的两端都必须逐字等于 `1.4.2`。方案说明在 [README_MAC.md](README_MAC.md)。

The managed DLL is one Windows and Mac build. The version string cannot carry a platform suffix, and it cannot stay on the workshop's `1.4.1` (that string would match stock clients whose binary is not this one). Judged against `1.4.1`, the change is a patch: `ModVersion = 1.4.2`, `AssemblyNumericVersion = 1.4.2.0`. The move5 movement logic stays. The old label is no longer what peers compare. Both sides, on any OS, must equal `1.4.2` exactly. The scheme is documented in [README_MAC.md](README_MAC.md).

诊断日志仍使用上游的 UI 标签 `single-overlay-white-theme`，并附上 `platform` 与 `arch`。Mac 包里曾写过已经过时的 `mac-move2`，rebase 时没有沿用。

The diagnostic line keeps upstream's UI label `single-overlay-white-theme` and adds `platform` and `arch`. The Mac pack's stale `mac-move2` label was not kept.
