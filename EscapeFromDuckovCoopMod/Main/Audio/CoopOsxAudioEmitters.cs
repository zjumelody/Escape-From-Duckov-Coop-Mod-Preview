using System;
using Duckov;
using HarmonyLib;
using UnityEngine;

namespace EscapeFromDuckovCoopMod;

/// <summary>
/// OSX 不能 Harmony 补丁 AudioManager.MPost。FMOD 的 MPost 在 Mac 上会崩溃或变成空操作，
/// MonoMod 在 Apple Silicon 上还会因 libdl / Win32Exception 直接崩掉模组加载。
/// 这里改用 CharacterSoundMaker + ItemAgent_Gun 采集同样的联机音效，完全不碰 MPost。
/// Windows 继续用 CoopAudioPatches；Prepare() 把这些挂钩限制在 OSX。
///
/// OSX cannot Harmony-patch AudioManager.MPost: FMOD MPost crashes or no-ops on Mac,
/// and MonoMod on Apple Silicon aborts mod load (libdl / Win32Exception).
/// Capture the same network audio events via CharacterSoundMaker + ItemAgent_Gun
/// without touching MPost. Windows keeps CoopAudioPatches; Prepare() gates these hooks to OSX only.
/// </summary>
internal static class CoopOsxAudioEmitters
{
    private static bool _footstepsHooked;

    internal static void EnsureHooks()
    {
        if (!ModBehaviour.IsOsxRuntime())
            return;

        if (_footstepsHooked)
            return;

        _footstepsHooked = true;
        try
        {
            CharacterSoundMaker.OnFootStepSound += OnLocalFootStep;
            Debug.Log("[COOP][Mac] OSX audio emitters hooked (footsteps via CharacterSoundMaker.OnFootStepSound)");
        }
        catch (Exception ex)
        {
            Debug.LogWarning($"[COOP][Mac] Failed to hook footstep audio emitter: {ex.Message}");
            _footstepsHooked = false;
        }
    }

    private static void OnLocalFootStep(Vector3 position, CharacterSoundMaker.FootStepTypes type, CharacterMainControl character)
    {
        try
        {
            if (character == null || character != CharacterMainControl.Main)
                return;

            var eventName = BuildFootstepEventName(character, type);
            if (string.IsNullOrEmpty(eventName))
                return;

            CoopAudioSync.NotifyLocalPost(eventName, character.gameObject, string.Empty, string.Empty);
        }
        catch
        {
        }
    }

    /// <summary>
    /// Mirrors Duckov.AudioManager.OnFootStepSound event-name construction.
    /// </summary>
    private static string BuildFootstepEventName(CharacterMainControl character, CharacterSoundMaker.FootStepTypes type)
    {
        if (character == null)
            return null;

        var material = character.FootStepMaterialType;
        if (material == AudioManager.FootStepMaterialType.noSound)
            return null;

        if (type == CharacterSoundMaker.FootStepTypes.swim)
            return "Char/Footstep/footstep_swim";

        var strength = type is CharacterSoundMaker.FootStepTypes.walkHeavy or CharacterSoundMaker.FootStepTypes.runHeavy
            ? "heavy"
            : "light";
        var charaType = material.ToString();
        return $"Char/Footstep/footstep_{charaType}_{strength}";
    }

    internal static void NotifyLocalGunshot(ItemAgent_Gun gun)
    {
        if (!ModBehaviour.IsOsxRuntime() || gun == null)
            return;

        try
        {
            if (gun.Holder != CharacterMainControl.Main)
                return;

            var eventName = BuildShootEventName(gun);
            if (string.IsNullOrEmpty(eventName))
                return;

            CoopAudioSync.NotifyLocalPost(eventName, gun.gameObject, string.Empty, string.Empty);
        }
        catch
        {
        }
    }

    /// <summary>
    /// Mirrors ItemAgent_Gun.PostShootSound event-name construction.
    /// </summary>
    private static string BuildShootEventName(ItemAgent_Gun gun)
    {
        var setting = gun.GunItemSetting;
        if (setting == null || string.IsNullOrEmpty(setting.shootKey))
            return null;

        var soundKey = setting.shootKey.ToLowerInvariant();
        if (gun.Silenced)
            soundKey += "_mute";
        return "SFX/Combat/Gun/Shoot/" + soundKey;
    }
}

/// <summary>
/// 仅 OSX：本地 PostShootSound 经 AudioManager.Post 播放之后，补发 Windows 上
/// CoopAudioPatches 本来会从 MPost 发出的联机音效 RPC。这样跳过 MPost 补丁时枪声仍会同步。
///
/// OSX only: after local PostShootSound plays via AudioManager.Post, emit the network
/// audio RPC that CoopAudioPatches would have sent from MPost on Windows, so gunshots
/// still sync while the MPost patch stays disabled.
/// </summary>
[HarmonyPatch(typeof(ItemAgent_Gun), "PostShootSound")]
internal static class CoopOsxGunShootAudioPatch
{
    static bool Prepare() => ModBehaviour.IsOsxRuntime();

    private static void Postfix(ItemAgent_Gun __instance)
    {
        CoopOsxAudioEmitters.NotifyLocalGunshot(__instance);
    }
}
