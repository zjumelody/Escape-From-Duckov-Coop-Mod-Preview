using Duckov;
using FMOD.Studio;

namespace EscapeFromDuckovCoopMod;

/// <summary>
/// 与 ItemAgent_Kazoo 的补丁拆开，这样 Apple Silicon 可以跳过 AudioManager.SetRTPC，
/// 而不丢掉卡祖笛本身的 Update/OnDisable 同步。
/// SetRTPC 和 MPost 一样：在 Mac 上补丁 FMOD AudioManager 会崩溃或变成空操作，
/// MonoMod 还可能抛 Win32Exception。Prepare() 在 OSX 上返回 false；
/// Loader 也会按类型名再跳过一次。
///
/// Split from the ItemAgent_Kazoo patches so Apple Silicon can skip AudioManager.SetRTPC
/// without dropping kazoo Update/OnDisable sync.
/// SetRTPC matches MPost: patching FMOD AudioManager on Mac crashes or no-ops, and MonoMod
/// can throw Win32Exception. Prepare() returns false on OSX, and Loader skips the type by name.
/// </summary>
[HarmonyPatch(typeof(AudioManager), "SetRTPC", typeof(string), typeof(float), typeof(GameObject))]
internal static class KazooAudioManagerRtpcPatch
{
    static bool Prepare() => !ModBehaviour.IsOsxRuntime();

    [HarmonyPostfix]
    private static void CaptureParameter(string key, float value, GameObject gameObject)
    {
        if (gameObject == null || (key != "Kazoo/Pitch" && key != "Kazoo/Intensity")) return;
        var agent = gameObject.GetComponent<ItemAgent_Kazoo>();
        if (agent != null) KazooSync.CaptureParameter(agent, key, value);
    }
}

[HarmonyPatch]
internal static class KazooPatches
{
    [HarmonyPatch(typeof(ItemAgent_Kazoo), "Update")]
    [HarmonyPostfix]
    private static void AfterUpdate(ItemAgent_Kazoo __instance, bool ___currentMakingSound, EventInstance? ___currentEvent)
    {
        KazooSync.Observe(__instance, ___currentMakingSound && ___currentEvent.HasValue);
    }

    [HarmonyPatch(typeof(ItemAgent_Kazoo), "OnDisable")]
    [HarmonyPrefix]
    private static void OnDisable(ItemAgent_Kazoo __instance) => KazooSync.StopLocal(__instance);

    [HarmonyPatch(typeof(ItemAgent_Kazoo), "OnDestroy")]
    [HarmonyPrefix]
    private static void OnDestroy(ItemAgent_Kazoo __instance) => KazooSync.StopLocal(__instance);
}
