namespace EscapeFromDuckovCoopMod;

internal static class BuildInfo
{
    internal const string Name = "EscapeFromDuckovCoopMod";
    internal const string Copyright = "Copyright ©  2026";
    // Melody Mac fork: suffix _melody distinguishes from upstream bare versions (e.g. 1.4.2).
    // 用 _melody 后缀区分原版裸版本号（如 1.4.2）。联机各方必须逐字相同。
    internal const string ModVersion = "1.4.2_melody";
    internal const string AssemblyNumericVersion = "1.4.2.0";
    internal static readonly bool RuntimeVerboseLoggingEnabled = false;
    internal static readonly bool RuntimeCriticalLoggingEnabled = true;
    internal static readonly bool RuntimePerfLoggingEnabled = false;
}
