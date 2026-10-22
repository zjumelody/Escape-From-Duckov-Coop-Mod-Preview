# 维护这个 fork

# Maintaining this fork

本文件只描述 **zjumelody/Escape-From-Duckov-Coop-Mod-Preview** 怎么跟上上游、怎么放 Mac 改动。它不修改许可证。

This file only describes how **zjumelody/Escape-From-Duckov-Coop-Mod-Preview** tracks upstream and where Mac changes go. It does not change the license.

## 仓库 / Repositories

| 角色 / Role | 地址 / URL |
| --- | --- |
| 本 fork / This fork | https://github.com/zjumelody/Escape-From-Duckov-Coop-Mod-Preview |
| 上游 / Upstream | https://github.com/Mr-sans-and-InitLoader-s-team/Escape-From-Duckov-Coop-Mod-Preview |

Mac / Apple Silicon 的适配（音频跳过、进图移动、构建路径、`README_MAC.md`）留在本 fork。不要为了这些改动去上游开 pull request。上游若愿意自行合并，那是上游的决定，不是这里的义务。

The Mac / Apple Silicon port (audio skip, movement after load, build paths, `README_MAC.md`) stays on this fork. Do not open an upstream pull request for it. If upstream later merges any of it, that is upstream's choice, not an obligation here.

功能分支合并进 **本 fork 的 `master`** 是可以的，例如 `mac-arm64-compat` → `zjumelody` 的 `master`。

A feature branch into **this fork's `master`** is fine, for example `mac-arm64-compat` → `zjumelody`'s `master`.

## 同步上游 / Syncing upstream

优先用 GitHub 仓库页的 **Sync fork**。它只更新本 fork 相对上游的 `master`，不会向上游推送。

Prefer **Sync fork** on the GitHub repository page. It updates this fork's `master` from upstream and does not push to upstream.

命令行等价做法 / The command-line equivalent:

```bash
git remote add upstream https://github.com/Mr-sans-and-InitLoader-s-team/Escape-From-Duckov-Coop-Mod-Preview.git
git fetch upstream
git checkout master
git merge upstream/master
git push origin master
```

`git push` 的目标是 `origin`（本 fork），不是 `upstream`。有 Mac 分支在飞时，先把上游合进 fork 的 `master`，再把 `master` 合进该功能分支并解决冲突。冲突往往出在 `BuildInfo.cs`：上游每发一个 release 都会改 `ModVersion`。

`git push` goes to `origin` (this fork), not `upstream`. If a Mac branch is open, merge upstream into the fork's `master` first, then merge `master` into that feature branch and resolve conflicts. Conflicts often land in `BuildInfo.cs`, because every upstream release changes `ModVersion`.

同步之后看 [MAC_ARM64_CHANGELOG.md](MAC_ARM64_CHANGELOG.md) 和 [README_MAC.md](README_MAC.md)。OSX 专用分支（`Prepare() => !IsOsxRuntime()`、`CoopOsxAudioEmitters`、`MacLocalInputUnlock`）应还在。若上游改了同一个函数，保留 Mac 的原因说明（中英注释），不要在解决冲突时把 `AudioManager.MPost` 补丁重新打开到 OSX 上。

After a sync, re-read [MAC_ARM64_CHANGELOG.md](MAC_ARM64_CHANGELOG.md) and [README_MAC.md](README_MAC.md). OSX-only branches (`Prepare() => !IsOsxRuntime()`, `CoopOsxAudioEmitters`, `MacLocalInputUnlock`) should still be there. If upstream edited the same function, keep the bilingual Mac rationale. Do not re-enable the `AudioManager.MPost` patch on OSX while resolving a conflict.

## 版本号 / Version string

`BuildInfo.ModVersion` 与 `AssemblyNumericVersion` 是 **所有平台共用的一个字符串**。托管 DLL 不分 Windows 构建和 Mac 构建，联机校验是整串相等（`NetService`、Steam 房间数据）。

`BuildInfo.ModVersion` and `AssemblyNumericVersion` are **one string shared by every platform**. The managed DLL is not split into a Windows build and a Mac build. The co-op check is exact string equality (`NetService`, Steam lobby data).

- 不要写 `mac`、`osx`、`arm64` 或类似平台词。
- 不要把字符串留成上游创意工坊正在使用的那个版本，否则不同的二进制会被当成同一间房。
- 相对当前上游 release 的改动有多大，就按普通 semver 递增。兼容性修复用 patch（这次相对 `1.4.1` 定为 `1.4.2`）。若出现新的联机玩法世代，再用 minor（例如 `1.5.0`）。
- 只改了 Mac 逻辑或文档、但联机双方必须重新一起换 DLL 时，同样要递增共用字符串，并在 `README_MAC.md` 写一句原因。
- 下次 rebase 若上游发布了与本 fork 当前字符串相同的版本，先把本 fork 再往上跳，避免和创意工坊撞车。

- Do not put `mac`, `osx`, `arm64`, or similar platform words in the string.
- Do not leave the string equal to the version the upstream workshop build is shipping, or different binaries will be treated as the same room.
- Bump ordinary semver by how large the change is relative to the current upstream release. Compatibility fixes take a patch (this port is `1.4.2` relative to `1.4.1`). A new co-op feature generation would take a minor (for example `1.5.0`).
- If only Mac logic or docs changed but peers must replace the DLL together, still bump the shared string and add a one-line reason to `README_MAC.md`.
- On the next rebase, if upstream publishes the same version string this fork is using, bump this fork again so it does not collide with the workshop build.

当前值与理由写在 [README_MAC.md](README_MAC.md)。历史内部标签 `1.4.5-mac-move5` 已经退役。

The current value and the reason are in [README_MAC.md](README_MAC.md). The historical internal label `1.4.5-mac-move5` is retired.

## 许可证 / License

本仓库以 **GNU Affero General Public License v3** 为基础，并带有第 7 节附加限制，见 [LICENSE.txt](LICENSE.txt) 与 [LICENSE_RESTRICTIONS.txt](LICENSE_RESTRICTIONS.txt)。

This repository is under the **GNU Affero General Public License v3**, plus Section 7 additional restrictions. See [LICENSE.txt](LICENSE.txt) and [LICENSE_RESTRICTIONS.txt](LICENSE_RESTRICTIONS.txt).

维护者需要继续遵守的限制 / Restrictions maintainers still have to follow:

- 不得把本程序用于商业目的。
- 不得用它运行无头游戏服务器，或做在服务器上中继、主持、管理对局的组件。
- 分发修改版时，必须在用户找得到的地方注明原作者仓库：`Mr-sans-and-InitLoader-s-team/Escape-From-Duckov-Coop-Mod-Preview`（例如 README 或关于界面）。

- Do not use the program for a commercial purpose.
- Do not use it to run a headless game server, or as a component that relays, hosts, or manages a session on a server.
- When distributing a modified version, keep a conspicuous attribution to the original repository: `Mr-sans-and-InitLoader-s-team/Escape-From-Duckov-Coop-Mod-Preview` (for example in the README or an about screen).

AGPLv3 允许在遵守上述条款的前提下公开修改和分发源码。本 fork 就是这样做的：源码公开、注明上游、不同步义务式地上游提 PR。这里不授予任何额外权利，也不取消任何限制。

AGPLv3 allows public modification and distribution when those terms are met. This fork does that: source stays public, upstream is attributed, and there is no duty to open an upstream PR. Nothing here grants extra rights or removes a restriction.

## 改 Mac 专用代码时 / When editing Mac-only code

OSX 门闩和只在 Mac 上运行的类型，注释用中文和英文写清 **为什么**，不要只写做了什么。需要保留的原因包括：

On OSX gates and types that run only on Mac, comments should say **why** in both Chinese and English, not only what the code does. Reasons that need to stay:

- App Sandbox 会拦截 UDP，需要 nosandbox 与 network entitlement。
- FMOD `MPost` 在 Mac 上崩溃或空操作，MonoMod 会中止加载。
- MultiScene 之后 `WalkSpeed` 的 Value 可以是 0。
- 绝不能清掉 `CA_Interact` 的 `CanMove`。
- 辅助标志卡住时，每帧 `SetForceMoveVelocity` 会让冲刺变顿。

- The App Sandbox blocks UDP; nosandbox and network entitlements are required.
- FMOD `MPost` crashes or no-ops on Mac, and MonoMod aborts mod load.
- After MultiScene, `WalkSpeed` Value can be 0.
- Never clear `CA_Interact`'s `CanMove`.
- Per-frame `SetForceMoveVelocity` while the assist flag is stuck makes sprint stutter.

用户能看的说明放在 `README_MAC.md`，按时间的修复放在 `MAC_ARM64_CHANGELOG.md`。两份都保持中英对照。

Player-facing notes go in `README_MAC.md`. Chronological fixes go in `MAC_ARM64_CHANGELOG.md`. Keep both bilingual.
