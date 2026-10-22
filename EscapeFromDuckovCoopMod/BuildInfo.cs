namespace EscapeFromDuckovCoopMod;

internal static class BuildInfo
{
    internal const string Name = "EscapeFromDuckovCoopMod";
    internal const string Copyright = "Copyright ©  2026";
    // 托管 DLL 是 Windows / Mac 共用的同一份构建。ModVersion 不带平台后缀。
    // 联机双方（任意系统）必须逐字相同，否则房间版本校验会拒绝。见 README_MAC.md。
    //
    // The managed DLL is one shared Windows/Mac build. ModVersion has no platform suffix.
    // Peers on any OS must match this string exactly or the room version check rejects them.
    // See README_MAC.md.
    internal const string ModVersion = "1.4.2";
    internal const string AssemblyNumericVersion = "1.4.2.0";
    internal static readonly bool RuntimeVerboseLoggingEnabled = false;
    internal static readonly bool RuntimeCriticalLoggingEnabled = true;
    internal static readonly bool RuntimePerfLoggingEnabled = false;
}
