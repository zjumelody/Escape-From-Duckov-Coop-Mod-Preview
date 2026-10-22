// Escape-From-Duckov-Coop-Mod-Preview
// Copyright (C) 2025  Mr.sans and InitLoader's team
//
// This program is not a free software.
// It's distributed under a license based on AGPL-3.0,
// with strict additional restrictions:
//  YOU MUST NOT use this software for commercial purposes.
//  YOU MUST NOT use this software to run a headless game server.
//  YOU MUST include a conspicuous notice of attribution to
//  Mr-sans-and-InitLoader-s-team/Escape-From-Duckov-Coop-Mod-Preview as the original author.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

using System.Reflection;
using System.Runtime.InteropServices;

namespace EscapeFromDuckovCoopMod;

public class ModBehaviour : Duckov.Modding.ModBehaviour
{
    public Harmony Harmony;

    public void OnEnable()
    {
        // Mac / Apple Silicon：单个 Harmony/MonoMod 失败不能中止模组加载，
        // 否则没有联机面板，网络也不会起来。
        // A single Harmony/MonoMod failure must not abort mod load on Apple Silicon,
        // or there is no COOP panel and networking never starts.
        try
        {
            Harmony = new Harmony("DETF_COOP");
            ApplyPatchesResilient(Harmony);
        }
        catch (Exception ex)
        {
            Debug.LogError($"[COOP][Mac] Harmony init failed; continuing without patches. {ex}");
        }

        try
        {
            var go = new GameObject("COOP_MOD_1");
            DontDestroyOnLoad(go);

            go.AddComponent<NetService>();
            COOPManager.InitManager();
            go.AddComponent<ModBehaviourF>();
            Loader();
            CoopLogSystem.WriteNetworkDiagnostic(
                $"[COOP] Loaded from {typeof(ModBehaviour).Assembly.Location} | UI build: single-overlay-white-theme | platform={Application.platform} arch={RuntimeInformation.ProcessArchitecture}");
        }
        catch (Exception ex)
        {
            Debug.LogError($"[COOP][Mac] COOP GameObject / UI bootstrap failed: {ex}");
        }
    }

    /// <summary>
    /// 逐个类型打补丁。Apple Silicon 上已知会抛 Win32Exception
    /// "Invalid function" / 缺少 libdl.so.2，若用 PatchAll 会整段 OnEnable 失败。
    ///
    /// Patch types one-by-one so a single Harmony/MonoMod failure (for example
    /// Win32Exception "Invalid function" / missing libdl.so.2 on arm64 OSX)
    /// does not abort OnEnable.
    /// </summary>
    private static void ApplyPatchesResilient(Harmony harmony)
    {
        var asm = Assembly.GetExecutingAssembly();
        var types = AccessTools.GetTypesFromAssembly(asm);
        var ok = 0;
        var skipped = 0;
        var failed = 0;
        var nonPatch = 0;

        foreach (var type in types)
        {
            if (type == null)
                continue;

            // 普通辅助类型（例如带 Cleanup 方法的类）不能被当成 HarmonyCleanup。
            // Ordinary helpers (for example ConnectionRecovery.Cleanup) must not be treated as HarmonyCleanup.
            if (!IsHarmonyPatchClass(type))
            {
                nonPatch++;
                continue;
            }

            if (ShouldSkipPatchTypeOnOsx(type))
            {
                skipped++;
                Debug.LogWarning($"[COOP][Mac] Skipping known-bad OSX patch type: {type.FullName}");
                continue;
            }

            try
            {
                var processor = harmony.CreateClassProcessor(type);
                if (processor == null)
                    continue;
                processor.Patch();
                ok++;
            }
            catch (Exception ex)
            {
                failed++;
                Debug.LogError($"[COOP][Mac] Harmony patch failed for {type.FullName}: {ex}");
            }
        }

        Debug.Log($"[COOP][Mac] Harmony patch summary: ok={ok} skipped={skipped} failed={failed} nonPatch={nonPatch} platform={Application.platform}");
    }

    private static bool IsHarmonyPatchClass(Type type)
    {
        if (type.GetCustomAttributes(typeof(HarmonyAttribute), true).Length > 0)
            return true;

        const BindingFlags flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static |
                                   BindingFlags.Instance | BindingFlags.DeclaredOnly;
        foreach (var member in type.GetMembers(flags))
        {
            try
            {
                if (member.GetCustomAttributes(typeof(HarmonyAttribute), true).Length > 0)
                    return true;
            }
            catch
            {
            }
        }

        return false;
    }

    private static bool ShouldSkipPatchTypeOnOsx(Type type)
    {
        if (!IsOsxRuntime())
            return false;

        // 即使 Prepare() 会返回 false，创建 processor 时 MonoMod 仍可能先去解析
        // AudioManager.MPost。FMOD 的 MPost 在 Mac 上会崩溃或变成空操作，
        // 而且是 Apple Silicon 上第一处已知的 Win32Exception 崩溃点。
        // 因此 OSX 上直接跳过这些类型；脚步/枪声改走 CoopOsxAudioEmitters。
        //
        // Prepare() returning false is not enough: creating the processor can still
        // resolve AudioManager.MPost. FMOD MPost crashes or no-ops on Mac, and it is
        // the first known Win32Exception site on Apple Silicon. Skip these types on
        // OSX; footsteps and gunshots go through CoopOsxAudioEmitters instead.
        var name = type.Name;
        return name == nameof(CoopAudioPatches)
               || name == nameof(CoopBulletFlybyAudioPatch)
               || name == "KazooAudioManagerRtpcPatch";
    }

    /// <summary>
    /// 识别 OSX 播放器/编辑器。macOS App Sandbox 会拦截 LiteNetLib 的 UDP
    /// （绑定、广播、直连）。独立 Mac 版需要以关闭沙盒（nosandbox）并带上
    /// network client/server entitlement 的方式启动，否则房间能开但发现和对连失败。
    /// 授权说明见 README_MAC.md。本方法不改变 Windows 行为。
    ///
    /// Detects the OSX player/editor. The macOS App Sandbox blocks LiteNetLib UDP
    /// (bind, broadcast, and direct connect). A standalone Mac build must be launched
    /// with the sandbox off (nosandbox) and network client/server entitlements, or a
    /// room can open while discovery and direct connect fail. See README_MAC.md.
    /// This check does not change Windows behavior.
    /// </summary>
    internal static bool IsOsxRuntime()
    {
        return Application.platform == RuntimePlatform.OSXPlayer
               || Application.platform == RuntimePlatform.OSXEditor
               || RuntimeInformation.IsOSPlatform(OSPlatform.OSX);
    }

    public void Loader()
    {
        CoopLocalization.Initialize();

        var go = new GameObject("COOP_MOD_");
        DontDestroyOnLoad(go);

        go.AddComponent<SteamP2PLoader>();
        go.AddComponent<Send_ClientStatus>();
        go.AddComponent<HealthM>();
        go.AddComponent<LocalPlayerManager>();
        go.AddComponent<SendLocalPlayerStatus>();
        go.AddComponent<SendLocalVehicleStatus>();
        go.AddComponent<Spectator>();
        go.AddComponent<DeadLootBox>();
        go.AddComponent<LootManager>();
        go.AddComponent<SceneNet>();
        go.AddComponent<MModUI>();
        go.AddComponent<VehicleControlHud>();
        go.AddComponent<CoopAISettings>();
        go.AddComponent<AISyncSettingsUI>();
        go.AddComponent<CoopLootSettings>();
        go.AddComponent<WaitingSynchronizationUI>();
        go.AddComponent<VersionOverlayTMP>();
        CoopTool.Init();
        CoopOsxAudioEmitters.EnsureHooks();
        MacLocalInputUnlock.EnsureSceneHooks();
        if (go.GetComponent<MacMoveWatchdog>() == null)
            go.AddComponent<MacMoveWatchdog>();

        DeferredInit();
    }

    private void DeferredInit()
    {
        SafeInit<SteamP2PLoader>(s => s.Init());
        SafeInit<SceneNet>(sn => sn.Init());
        SafeInit<LootManager>(lm => lm.Init());
        SafeInit<LocalPlayerManager>(lpm => lpm.Init());
        SafeInit<HealthM>(hm => hm.Init());
        SafeInit<SendLocalPlayerStatus>(s => s.Init());
        SafeInit<SendLocalVehicleStatus>(s => s.Init());
        SafeInit<Spectator>(s => s.Init());
        SafeInit<MModUI>(ui => ui.Init());
        SafeInit<CoopLootSettings>(s => s.Init());
        SafeInit<CoopAISettings>(s => s.Init());
        SafeInit<AISyncSettingsUI>(ui => ui.Init());
        SafeInit<Send_ClientStatus>(s => s.Init());
        SafeInit<DeadLootBox>(s => s.Init());
    }

    private void SafeInit<T>(Action<T> init) where T : Component
    {
        var c = FindObjectOfType<T>();
        if (c == null) return;
        try
        {
            init(c);
        }
        catch (Exception ex)
        {
            Debug.LogError($"[COOP] SafeInit<{typeof(T).Name}> failed: {ex}");
        }
    }
}
