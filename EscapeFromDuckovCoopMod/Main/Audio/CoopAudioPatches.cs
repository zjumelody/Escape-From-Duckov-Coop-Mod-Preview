using Duckov;
using FMOD.Studio;

namespace EscapeFromDuckovCoopMod;

[HarmonyPatch(typeof(AudioManager))]
internal static class CoopAudioPatches
{
    // macOS 不补丁 AudioManager.MPost。FMOD 的 MPost 在 Mac 上会崩溃或变成空操作；
    // MonoMod 在 Apple Silicon 上修补该方法会抛 Win32Exception
    // （Invalid function / 缺少 libdl.so.2），Harmony 一旦中止，模组就加载不起来。
    // Windows 仍走这里。OSX 的脚步和枪声由 CoopOsxAudioEmitters 发送，不碰 MPost。
    //
    // Do not patch AudioManager.MPost on macOS. FMOD MPost crashes or no-ops on Mac.
    // MonoMod patching that method on Apple Silicon throws Win32Exception
    // (Invalid function / missing libdl.so.2) and aborts Harmony, so the mod never loads.
    // Windows still uses this hook. On OSX, CoopOsxAudioEmitters sends footsteps and
    // gunshots without touching MPost.
    static bool Prepare() => !ModBehaviour.IsOsxRuntime();

    [HarmonyPatch("MPost", typeof(string), typeof(GameObject))]
    [HarmonyPostfix]
    private static void PostEventInstance(EventInstance? __result, string eventName, GameObject gameObject)
    {
        if (__result == null)
            return;

        CoopAudioSync.NotifyLocalPost(eventName, gameObject, string.Empty, string.Empty);
    }

    [HarmonyPatch("MPost", typeof(string), typeof(Vector3))]
    [HarmonyPostfix]
    private static void PostAtPosition(EventInstance? __result, string eventName, Vector3 position)
    {
        if (__result == null)
            return;

        CoopAudioSync.NotifyLocalPost(eventName, position);
    }

    [HarmonyPatch("MPostCustomSFX", typeof(string), typeof(GameObject), typeof(bool))]
    [HarmonyPostfix]
    private static void PostCustomSfx(EventInstance? __result, string filePath, GameObject gameObject, bool loop)
    {
        if (__result == null)
            return;

        CoopAudioSync.NotifyLocalPost(filePath, gameObject, string.Empty, string.Empty);
    }
}
