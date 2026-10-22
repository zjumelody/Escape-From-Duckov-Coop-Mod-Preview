# Mac：准备 Duckov-COOP.app / Prepare Duckov-COOP.app

把正版 `Duckov.app` **复制**到 `~/Applications/Duckov-COOP.app`，关闭 App Sandbox，加入 `com.apple.security.network.client` 与 `com.apple.security.network.server`，并用本机 `codesign` 身份 `-` 重新签名。不改动原版。Mods 只装进副本。

Copies an official `Duckov.app` to `~/Applications/Duckov-COOP.app`, turns App Sandbox off, adds `com.apple.security.network.client` and `com.apple.security.network.server`, and re-signs the copy with the local `codesign` identity `-`. The original app is not modified. Mods go only into the copy.

## 文件 / Files

- [`prepare-duckov-coop-app.sh`](prepare-duckov-coop-app.sh) — 一键脚本 / the script
- [`duckov-coop.entitlements`](duckov-coop.entitlements) — 签名用的 entitlements / entitlements passed to `codesign`

## 运行 / Run

```bash
chmod +x prepare-duckov-coop-app.sh
./prepare-duckov-coop-app.sh
./prepare-duckov-coop-app.sh --source "/path/to/Duckov.app" --mods-dir /path/to/Mods
```

参数 / Flags: `--source`, `--dest`, `--mods-dir`, `--force`. 同目录若有 `EscapeFromDuckovCoopMod*.zip`，会在签名前装入副本的 `Contents/Mods/`。

A sibling `EscapeFromDuckovCoopMod*.zip` is installed into the copy's `Contents/Mods/` before signing.

完整说明见仓库首页 [README.md](../../README.md) · [README_EN.md](../../README_EN.md)。Release 也可能附上同一份脚本。

Full steps are on the repo homepage: [README.md](../../README.md) · [README_EN.md](../../README_EN.md). A Release may attach this same script.
