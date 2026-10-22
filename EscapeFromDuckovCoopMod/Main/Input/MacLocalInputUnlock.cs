using System;
using System.Collections.Generic;
using System.Reflection;
using Duckov;
using Duckov.Scenes;
using HarmonyLib;
using ItemStatsSystem;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;

namespace EscapeFromDuckovCoopMod;

/// <summary>
/// Mac 进图后的移动恢复（Base → 突袭 / MultiScene）。
/// 测试日志：SetMoveInput 兜底时 MoveAxis 不是 (0,0)，但 GroundZero 上
/// CanMove=False、WalkSpeed=0.00（Base 上曾是 WalkSpeed=4、CanMove=True）。
/// CharacterMainControl.CanMove 要求 WalkSpeed&gt;0；Movement.SetMoveInput 在 !CanMove 时丢掉输入。
/// MultiScene 之后常见故障是 WalkSpeed 的 Value==0（BaseValue 仍可能大于 0）。
/// 因此进图后若仍卡住，就在 OSX 上修 WalkSpeed/Moveability，并绕过 CanMove 门闩。
///
/// Mac movement recovery after Base → raid/MultiScene loads.
/// Test log: SetMoveInput fallback fired with MoveAxis!=(0,0) but CanMove=False and
/// WalkSpeed=0.00 on GroundZero (Base had WalkSpeed=4 and CanMove=True).
/// CharacterMainControl.CanMove requires WalkSpeed&gt;0; Movement.SetMoveInput ignores
/// input when !CanMove. After MultiScene the usual failure is WalkSpeed Value==0
/// (BaseValue may still be above 0). Repair WalkSpeed/Moveability and bypass the
/// CanMove gate on OSX after level init when still stuck.
/// </summary>
internal static class MacLocalInputUnlock
{
    private static int _lastUnlockFrame = -1;
    private static bool _sceneHooked;
    private static float _watchUntil;
    private static float _nextWatchLog;
    private static bool _loggedKeyboardFallback;
    private static bool _loggedWalkRepair;
    private static bool _loggedForceMove;
    private static bool _loggedCanMoveBypass;
    private static MethodInfo _registerEvents;

    /// <summary>When true, OSX CanMove/WalkSpeed postfixes keep Main character mobile.</summary>
    internal static bool OsxForceMobileAfterRaid;
    /// <summary>True after we observed WalkSpeed==0 post level-init this session (raid gate).</summary>
    internal static bool NeedsWalkSpeedAssist;
    private static float _lastFullUnlockRealtime;

    internal static float ReadRawWalkSpeed(CharacterMainControl main)
    {
        if (main == null) return -1f;
        try
        {
            var item = main.CharacterItem;
            if (item == null) return 0f;
            var w = item.GetStat("WalkSpeed".GetHashCode());
            var m = item.GetStat("Moveability".GetHashCode());
            var wv = w != null ? w.Value : 0f;
            var mv = m != null ? m.Value : 1f;
            if (mv <= 0.05f) mv = 0f; // match game multiply
            return wv * mv;
        }
        catch { return -1f; }
    }

    internal static void EnsureSceneHooks()
    {
        if (_sceneHooked)
            return;
        _sceneHooked = true;
        try
        {
            SceneManager.sceneLoaded += OnSceneLoaded;
            Debug.Log("[COOP][InputUnlock] SceneManager.sceneLoaded hooked");
        }
        catch (Exception ex)
        {
            Debug.LogWarning($"[COOP][InputUnlock] scene hook failed: {ex.Message}");
        }
    }

    private static void OnSceneLoaded(Scene scene, LoadSceneMode mode)
    {
        ScheduleAfterLevelReady($"sceneLoaded:{scene.name}:{mode}");
    }

    internal static void ScheduleAfterLevelReady(string reason)
    {
        EnsureSceneHooks();
        RunWhenLevelReady(reason).Forget();
    }

    private static async UniTaskVoid RunWhenLevelReady(string reason)
    {
        try
        {
            var deadline = Time.realtimeSinceStartup + 20f;
            while (Time.realtimeSinceStartup < deadline)
            {
                if (LevelManager.LevelInited && CharacterMainControl.Main != null)
                {
                    await UniTask.Yield();
                    await UniTask.Delay(100, ignoreTimeScale: true);
                    UnlockAndDiagnose(reason);
                    await UniTask.Delay(500, ignoreTimeScale: true);
                    UnlockAndDiagnose(reason + "-recheck");
                    StartWatchdog();
                    return;
                }

                await UniTask.Delay(100, ignoreTimeScale: true);
            }

            UnlockAndDiagnose(reason + "-timeout");
            StartWatchdog();
        }
        catch (Exception ex)
        {
            Debug.LogWarning($"[COOP][InputUnlock] schedule failed: {ex.Message}");
        }
    }

    private static void StartWatchdog()
    {
        _watchUntil = Time.realtimeSinceStartup + 15f;
        _nextWatchLog = 0f;
        _loggedKeyboardFallback = false;
        _loggedWalkRepair = false;
        _loggedForceMove = false;
        _loggedCanMoveBypass = false;
        // Do NOT clear NeedsWalkSpeedAssist here — set when we see WalkSpeed==0.
        if (ModBehaviour.IsOsxRuntime())
            OsxForceMobileAfterRaid = true;
    }

    /// <summary>Called each frame from MacMoveWatchdog MonoBehaviour.</summary>
    internal static void TickWatchdog()
    {
        if (!LevelManager.LevelInited)
            return;

        var main = CharacterMainControl.Main;
        var watch = Time.realtimeSinceStartup <= _watchUntil;

        if (main != null)
        {
            TryRepairWalkStats(main, log: false);
            UpdateAssistFlag(main);
        }

        if (watch && Time.realtimeSinceStartup >= _nextWatchLog)
        {
            _nextWatchLog = Time.realtimeSinceStartup + 0.5f;
            LogExtended("watchdog");
        }

        if (!ModBehaviour.IsOsxRuntime())
            return;

        // 一次修复：WalkSpeed 恢复后，走路和冲刺都交还原版 Input System。
        // 辅助标志若一直为真，每帧用走路速度 SetForceMoveVelocity 会和 Shift 冲刺打架，冲刺变顿、甚至比走路还慢。
        // Once WalkSpeed is healthy, vanilla Input System owns walk and sprint.
        // If the assist flag stays stuck, per-frame walk-speed SetForceMoveVelocity fights Shift
        // sprint and makes sprint stutter, sometimes slower than walking.
        if (!NeedsWalkSpeedAssist)
            return;

        TryKeyboardMoveFallback();
        // No per-frame SetForceMoveVelocity — only brief emergency in UnlockAndDiagnose.
    }

    /// <summary>
    /// 连续注入只在 WalkSpeed 的 BaseValue 真的坏掉时进行。
    /// 测试日志：GroundZero / MultiScene 之后 walkBase=4、walkVal=0。
    /// 若按 Value 把辅助标志卡住不放，SetForceMoveVelocity 会一直用走路速度和 Shift 冲刺打架。
    /// BaseValue&gt;0 就关掉辅助；CanMove/WalkSpeed 的 postfix 仍会把 Value 托到门槛以上，不再每帧 ForceMove。
    ///
    /// Continuous inject only while WalkSpeed BaseValue is actually broken.
    /// Test log: walkBase=4 walkVal=0 after GroundZero / MultiScene. A Value-gated assist
    /// never cleared, so SetForceMoveVelocity at walk speed fought Shift sprint.
    /// BaseValue&gt;0 turns the assist OFF. CanMove/WalkSpeed postfixes still floor Value
    /// for the gate, without a per-frame force.
    /// </summary>
    private static void UpdateAssistFlag(CharacterMainControl main)
    {
        if (main == null)
            return;

        float walkBase = -1f;
        float raw = ReadRawWalkSpeed(main);
        try
        {
            var item = main.CharacterItem;
            if (item != null)
            {
                var w = item.GetStat("WalkSpeed".GetHashCode());
                if (w != null)
                    walkBase = w.BaseValue;
            }
        }
        catch { }

        // Structurally healthy base stat → no continuous inject (vanilla sprint).
        if (walkBase > 0.05f || raw > 0.05f)
        {
            if (NeedsWalkSpeedAssist)
            {
                NeedsWalkSpeedAssist = false;
                CoopLogSystem.WriteNetworkDiagnostic(
                    $"[COOP][InputUnlock] WalkSpeed assist OFF (walkBase={walkBase:F2} raw={raw:F2}) — vanilla walk+sprint");
            }
            return;
        }

        // Missing/zero BaseValue — keep brief assist until repair sets BaseValue.
        if (raw >= 0f && raw <= 0.05f && walkBase <= 0.05f)
            NeedsWalkSpeedAssist = true;
    }

    internal static void UnlockAndDiagnose(string reason)
    {
        if (_lastUnlockFrame == Time.frameCount)
            return;
        _lastUnlockFrame = Time.frameCount;

        var heavy = !reason.StartsWith("watchdog", StringComparison.Ordinal);
        // Throttle heavy rebinds (chat close / RefreshCharacter) — they cancel interact prompts.
        if (heavy || Time.realtimeSinceStartup - _lastFullUnlockRealtime > 2f)
        {
            if (heavy)
            {
                ForceCloseChatAndClearUiFocus();
                Patch_CharacterInputControl_Update_ChatBlock.ResetForceDisable();
                EnablePlayerInputAndMaps();
                ClearLingeringInputBlocks();
                RebindCharacterControl();
                ForceMovementEnabled();
                // Only clear stuck non-interact actions once on level-ready, not continuously.
                ClearStuckCharacterAction(allowStopInteract: false);
                _lastFullUnlockRealtime = Time.realtimeSinceStartup;
            }
            else
            {
                EnablePlayerInputAndMaps();
                ForceMovementEnabled();
            }
        }

        var main = CharacterMainControl.Main;
        TryRepairWalkStats(main, log: true);
        UpdateAssistFlag(main);
        if (ModBehaviour.IsOsxRuntime())
            OsxForceMobileAfterRaid = true;

        // Brief inject only if still gated after repair (rare). Prefer vanilla thereafter.
        if (NeedsWalkSpeedAssist)
        {
            TryKeyboardMoveFallback();
            TryEmergencyForceMoveOnce();
        }
        LogExtended(reason);
    }

    private static void ForceCloseChatAndClearUiFocus()
    {
        try { MModUI.Instance?.ForceCloseChatForMovement(); } catch { }
        try
        {
            if (EventSystem.current != null)
                EventSystem.current.SetSelectedGameObject(null);
        }
        catch { }
    }

    private static void EnablePlayerInputAndMaps()
    {
        try
        {
            var playerInput = GameManager.MainPlayerInput;
            if (playerInput == null)
                return;

            playerInput.enabled = true;
            try { playerInput.ActivateInput(); } catch { }

            try
            {
                if (playerInput.actions != null)
                {
                    playerInput.actions.Enable();
                    foreach (var map in playerInput.actions.actionMaps)
                    {
                        try { map.Enable(); } catch { }
                    }
                }
            }
            catch { }
        }
        catch { }
    }

    private static void RebindCharacterControl()
    {
        try
        {
            var main = CharacterMainControl.Main;
            var level = LevelManager.Instance;
            if (level != null && main != null)
            {
                if (level.ControllingCharacter != main)
                    level.SetControllingCharacter(main);

                var im = TryGetInputManager();
                if (im != null)
                    im.RefreshCharacter(main);
            }

            var cic = CharacterInputControl.Instance;
            if (cic != null)
            {
                _registerEvents ??= AccessTools.Method(typeof(CharacterInputControl), "RegisterEvents");
                _registerEvents?.Invoke(cic, null);
            }
        }
        catch (Exception ex)
        {
            Debug.LogWarning($"[COOP][InputUnlock] rebind failed: {ex.Message}");
        }
    }

    private static void ForceMovementEnabled()
    {
        try
        {
            var main = CharacterMainControl.Main;
            var mv = main != null ? main.movementControl : null;
            if (mv != null && !mv.MovementEnabled)
                mv.MovementEnabled = true;

            if (main != null)
            {
                var cc = main.GetComponentInChildren<CharacterController>(true);
                if (cc != null && !cc.enabled)
                    cc.enabled = true;

                // ECM2 CharacterMovement under Movement
                try
                {
                    var ecm = Traverse.Create(mv).Field("characterMovement").GetValue() as Behaviour;
                    if (ecm != null && !ecm.enabled)
                        ecm.enabled = true;
                }
                catch { }
            }
        }
        catch { }
    }

    /// <summary>
    /// CA_Interact / CA_Dash 等动作故意让 CanMove 返回 false。
    /// 早期每帧清掉这些动作后，按 F 只剩屏幕一抖，交互立刻被取消。
    /// 绝不能清掉 CA_Interact 的 CanMove，交互过程中也不要调用 StopAction。
    ///
    /// CA_Interact / CA_Dash and similar actions intentionally return CanMove=false.
    /// Clearing them every frame made F only screen-shake and then cancel the interact.
    /// Never clear CA_Interact's CanMove, and do not call StopAction while interacting.
    /// </summary>
    internal static bool IsIntentionalNoMoveAction(CharacterActionBase action)
    {
        if (action == null)
            return false;
        var n = action.GetType().Name;
        return n == "CA_Interact"
               || n == "CA_Dash"
               || n == "CA_ControlOtherCharacter"
               || n == "Action_Fishing"
               || n == "Action_FishingV2"
               || n.IndexOf("Interact", StringComparison.OrdinalIgnoreCase) >= 0;
    }

    internal static bool IsInteractOrUsePressed()
    {
        try
        {
            var kb = Keyboard.current;
            if (kb == null)
                return false;
            // F is interact in Duckov; also treat E / mouse as interact-ish.
            if (kb.fKey.isPressed || kb.eKey.isPressed)
                return true;
        }
        catch { }
        return false;
    }

    internal static bool IsCurrentlyInteracting(CharacterMainControl main = null)
    {
        try
        {
            main ??= CharacterMainControl.Main;
            if (main == null)
                return false;
            return IsIntentionalNoMoveAction(main.CurrentAction);
        }
        catch { return false; }
    }

    private static void ClearStuckCharacterAction(bool allowStopInteract = false)
    {
        try
        {
            var main = CharacterMainControl.Main;
            if (main == null)
                return;
            var action = main.CurrentAction;
            if (action != null && IsIntentionalNoMoveAction(action) && !allowStopInteract)
                return; // never cancel F-interact / dash / etc.
        }
        catch { }

        var im = TryGetInputManager();
        if (im != null)
        {
            try { im.CancleSkill(); } catch { }
            // Avoid InputManager.StopAction while interacting — it stops CA_Interact.
            if (!IsCurrentlyInteracting())
            {
                try { im.StopAction(); } catch { }
            }
        }
    }

    /// <summary>
    /// 证据：进入 GroundZero / MultiScene 后 WalkSpeed 的 Value 变成 0。
    /// 修复 WalkSpeed 与 Moveability 的 BaseValue（原版把两者相乘得到可移动速度）。
    ///
    /// Evidence: WalkSpeed Value becomes 0 after a GroundZero / MultiScene load.
    /// Repair WalkSpeed and Moveability BaseValues (the game multiplies them into move speed).
    /// </summary>
    internal static bool TryRepairWalkStats(CharacterMainControl main, bool log)
    {
        if (main == null)
            return false;

        float before = ReadRawWalkSpeed(main);
        if (before < 0f)
        {
            try { before = main.CharacterWalkSpeed; } catch { return false; }
        }
        if (before > 0.05f)
            return false;

        var item = main.CharacterItem;
        var repaired = false;
        float walkBase = -1f, walkVal = -1f, moveBase = -1f, moveVal = -1f;
        var hasItem = item != null;
        string actionName = "null";
        try
        {
            if (main.CurrentAction != null)
                actionName = main.CurrentAction.GetType().Name;
        }
        catch { }

        if (item != null)
        {
            try
            {
                var walk = item.GetStat("WalkSpeed".GetHashCode());
                if (walk != null)
                {
                    walkBase = walk.BaseValue;
                    walkVal = walk.Value;
                    if (walk.BaseValue <= 0.05f)
                    {
                        walk.BaseValue = 4f;
                        repaired = true;
                    }
                }

                var move = item.GetStat("Moveability".GetHashCode());
                if (move != null)
                {
                    moveBase = move.BaseValue;
                    moveVal = move.Value;
                    if (move.BaseValue <= 0.05f)
                    {
                        move.BaseValue = 1f;
                        repaired = true;
                    }
                }

                // Value can be 0 from modifiers even if BaseValue>0 — push BaseValue up.
                try
                {
                    var raw = ReadRawWalkSpeed(main);
                    if (raw <= 0.05f && walk != null && walk.BaseValue < 4f)
                    {
                        walk.BaseValue = 4f;
                        repaired = true;
                    }
                    if (raw <= 0.05f && move != null && move.BaseValue < 1f)
                    {
                        move.BaseValue = 1f;
                        repaired = true;
                    }
                }
                catch { }
            }
            catch (Exception ex)
            {
                if (log)
                    Debug.LogWarning($"[COOP][InputUnlock] WalkSpeed repair exception: {ex.Message}");
            }
        }

        float after = ReadRawWalkSpeed(main);
        if (after < 0f)
        {
            after = before;
            try { after = main.CharacterWalkSpeed; } catch { }
        }

        if (log || repaired)
        {
            if (!_loggedWalkRepair || repaired)
            {
                _loggedWalkRepair = true;
                CoopLogSystem.WriteNetworkDiagnostic(
                    $"[COOP][InputUnlock] WalkSpeedRepair before={before:F2} after={after:F2} repaired={repaired} " +
                    $"hasItem={hasItem} walkBase={walkBase:F2} walkVal={walkVal:F2} moveBase={moveBase:F2} " +
                    $"moveVal={moveVal:F2} action={actionName}");
            }
        }

        return repaired || after > 0.05f;
    }

    private static Vector2 ReadKeyboardAxis()
    {
        Keyboard kb = null;
        try { kb = Keyboard.current; } catch { }
        if (kb == null)
            return Vector2.zero;

        var axis = Vector2.zero;
        if (kb.wKey.isPressed || kb.upArrowKey.isPressed) axis.y += 1f;
        if (kb.sKey.isPressed || kb.downArrowKey.isPressed) axis.y -= 1f;
        if (kb.aKey.isPressed || kb.leftArrowKey.isPressed) axis.x -= 1f;
        if (kb.dKey.isPressed || kb.rightArrowKey.isPressed) axis.x += 1f;
        return axis;
    }

    private static bool IsSprintHeld()
    {
        try
        {
            var kb = Keyboard.current;
            if (kb != null && (kb.leftShiftKey.isPressed || kb.rightShiftKey.isPressed))
                return true;
        }
        catch { }
        try
        {
            var im = TryGetInputManager();
            if (im != null && Traverse.Create(im).Field<bool>("runInput").Value)
                return true;
        }
        catch { }
        return false;
    }

    private static void TryKeyboardMoveFallback()
    {
        if (!LevelManager.LevelInited || !ModBehaviour.IsOsxRuntime())
            return;
        if (!NeedsWalkSpeedAssist)
            return;
        if (IsInteractOrUsePressed() || IsCurrentlyInteracting())
            return;

        var axis = ReadKeyboardAxis();
        if (axis.sqrMagnitude < 0.01f)
            return;

        var main = CharacterMainControl.Main;
        TryRepairWalkStats(main, log: false);
        UpdateAssistFlag(main);
        if (!NeedsWalkSpeedAssist)
            return; // repair stuck — vanilla owns input (incl. Shift sprint)

        // If PlayerInput already delivers move, do not stomp.
        try
        {
            var im = TryGetInputManager();
            if (im != null && im.MoveAxisInput.sqrMagnitude > 0.01f)
            {
                // Still forward sprint flag if Shift held and Input System move works.
                if (IsSprintHeld())
                {
                    try { im.SetRunInput(true); } catch { }
                }
                return;
            }
        }
        catch { }

        try
        {
            var im = TryGetInputManager();
            if (im != null)
            {
                im.SetMoveInput(axis.normalized);
                if (IsSprintHeld())
                    im.SetRunInput(true);
                if (!_loggedKeyboardFallback)
                {
                    _loggedKeyboardFallback = true;
                    CoopLogSystem.WriteNetworkDiagnostic(
                        "[COOP][InputUnlock] OSX brief SetMoveInput while WalkSpeed gated (clears when healthy)");
                }
            }
        }
        catch { }
    }

    /// <summary>
    /// 只在 UnlockAndDiagnose 里做一次紧急注入，绝不每帧调用。
    /// 辅助标志卡住时，连续的走路速度 SetForceMoveVelocity 会让 Shift 冲刺变顿，甚至比走路还慢。
    ///
    /// One-shot emergency only (called from UnlockAndDiagnose). Never per-frame.
    /// Continuous walk-speed SetForceMoveVelocity while the assist flag was stuck
    /// made Shift sprint stutter and run slower than walking.
    /// </summary>
    private static void TryEmergencyForceMoveOnce()
    {
        if (!ModBehaviour.IsOsxRuntime() || !NeedsWalkSpeedAssist)
            return;
        if (_loggedForceMove)
            return; // at most once per watch window
        if (IsInteractOrUsePressed() || IsCurrentlyInteracting())
            return;

        var axis = ReadKeyboardAxis();
        if (axis.sqrMagnitude < 0.01f)
            return;

        var main = CharacterMainControl.Main;
        if (main == null)
            return;

        try
        {
            TryRepairWalkStats(main, log: false);
            UpdateAssistFlag(main);
            if (!NeedsWalkSpeedAssist)
                return;

            var mv = main.movementControl;
            if (mv == null)
                return;

            var sprint = IsSprintHeld();
            float speed;
            if (sprint)
            {
                try { speed = main.CharacterRunSpeed; }
                catch { speed = ReadRawWalkSpeed(main); }
                try
                {
                    var im = TryGetInputManager();
                    im?.SetRunInput(true);
                }
                catch { }
            }
            else
            {
                speed = ReadRawWalkSpeed(main);
            }
            if (speed < 0.05f)
                speed = sprint ? 6.5f : 4f;

            mv.SetForceMoveVelocity(AxisToWorld(axis.normalized) * speed);
            _loggedForceMove = true;
            CoopLogSystem.WriteNetworkDiagnostic(
                $"[COOP][InputUnlock] OSX one-shot SetForceMoveVelocity sprint={sprint} speed={speed:F2} (not per-frame)");
        }
        catch (Exception ex)
        {
            Debug.LogWarning($"[COOP][InputUnlock] ForceMove failed: {ex.Message}");
        }
    }

    private static Vector3 AxisToWorld(Vector2 axis)
    {
        var cam = Camera.main;
        if (cam == null)
            return new Vector3(axis.x, 0f, axis.y);
        var f = cam.transform.forward; f.y = 0f; f.Normalize();
        var r = cam.transform.right; r.y = 0f; r.Normalize();
        return (f * axis.y + r * axis.x).normalized;
    }

    private static InputManager TryGetInputManager()
    {
        try
        {
            var prop = AccessTools.PropertyGetter(typeof(InputManager), "instance");
            if (prop != null)
            {
                var v = prop.Invoke(null, null) as InputManager;
                if (v != null) return v;
            }
        }
        catch { }

        try { return UnityEngine.Object.FindObjectOfType<InputManager>(); }
        catch { return null; }
    }

    private static void ClearLingeringInputBlocks()
    {
        var im = TryGetInputManager();
        if (im == null)
            return;

        var sources = Traverse.Create(im).Field<HashSet<GameObject>>("blockInputSources").Value;
        if (sources != null && sources.Count > 0)
        {
            var snapshot = new List<GameObject>(sources);
            foreach (var go in snapshot)
            {
                try
                {
                    if (go == null || !go)
                    {
                        sources.Remove(go);
                        continue;
                    }

                    InputManager.ActiveInput(go);
                }
                catch
                {
                    try { sources.Remove(go); } catch { }
                }
            }

            sources.RemoveWhere(go => go == null || !go || !go.activeInHierarchy);
            try { sources.Clear(); } catch { }
        }

        Traverse.Create(im).Field<int>("inputActiveCoolCounter").Value = 0;
    }

    private static void LogExtended(string reason)
    {
        var inputActived = false;
        var blockCount = -1;
        var playerEnabled = false;
        var paused = false;
        var cameraMode = false;
        var levelInited = false;
        var chatTyping = false;
        var moveEnabled = false;
        var canMove = false;
        var walkSpeed = -1f;
        var moveAxis = Vector2.zero;
        var controlling = "null";
        var mainName = "null";
        var actionMap = "null";
        var hasItem = false;
        var walkBase = -1f;
        var moveability = -1f;
        var actionName = "null";
        var timeScale = Time.timeScale;
        var vel = Vector3.zero;

        try { levelInited = LevelManager.LevelInited; } catch { }
        try { paused = GameManager.Paused; } catch { }
        try { cameraMode = CameraMode.Active; } catch { }
        try { chatTyping = MModUI.Instance != null && MModUI.Instance.IsChatTyping(); } catch { }

        try
        {
            var pi = GameManager.MainPlayerInput;
            playerEnabled = pi != null && pi.enabled;
            if (pi != null && pi.currentActionMap != null)
                actionMap = pi.currentActionMap.name;
        }
        catch { }

        try
        {
            var im = TryGetInputManager();
            if (im != null)
            {
                inputActived = InputManager.InputActived;
                moveAxis = im.MoveAxisInput;
                var sources = Traverse.Create(im).Field<HashSet<GameObject>>("blockInputSources").Value;
                blockCount = sources?.Count ?? 0;
                var ctrl = im.ControllingCharacter;
                controlling = ctrl ? ctrl.name : "null";
            }
        }
        catch { }

        try
        {
            var main = CharacterMainControl.Main;
            if (main != null)
            {
                mainName = main.name;
                canMove = main.CanMove();
                walkSpeed = main.CharacterWalkSpeed;
                if (main.movementControl != null)
                {
                    moveEnabled = main.movementControl.MovementEnabled;
                    try { vel = main.movementControl.Velocity; } catch { }
                }
                var item = main.CharacterItem;
                hasItem = item != null;
                if (item != null)
                {
                    try
                    {
                        var w = item.GetStat("WalkSpeed".GetHashCode());
                        if (w != null) walkBase = w.BaseValue;
                        var m = item.GetStat("Moveability".GetHashCode());
                        if (m != null) moveability = m.Value;
                    }
                    catch { }
                }
                try
                {
                    if (main.CurrentAction != null)
                        actionName = main.CurrentAction.GetType().Name;
                }
                catch { }
            }
        }
        catch { }

        CoopLogSystem.WriteNetworkDiagnostic(
            $"[COOP][InputUnlock] reason={reason} InputActived={inputActived} LevelInited={levelInited} " +
            $"block={blockCount} PlayerInput.enabled={playerEnabled} map={actionMap} Paused={paused} " +
            $"CameraMode={cameraMode} chatTyping={chatTyping} MovementEnabled={moveEnabled} CanMove={canMove} " +
            $"WalkSpeed={walkSpeed:F2} walkBase={walkBase:F2} Moveability={moveability:F2} hasItem={hasItem} " +
            $"action={actionName} timeScale={timeScale:F2} vel={vel} MoveAxis={moveAxis} " +
            $"Controlling={controlling} Main={mainName}");
    }

    internal static void NoteCanMoveBypass()
    {
        if (_loggedCanMoveBypass)
            return;
        _loggedCanMoveBypass = true;
        CoopLogSystem.WriteNetworkDiagnostic(
            "[COOP][InputUnlock] OSX CanMove postfix bypass active (WalkSpeed was gating movement)");
    }
}

/// <summary>
/// 进图后的逐帧看门狗：OSX 键盘兜底，以及限时诊断。
/// 非 OSX 也会修一次 WalkSpeed 统计，但不会做 ForceMove。
///
/// Per-frame watchdog after a map load: OSX keyboard fallback plus timed diagnostics.
/// Non-OSX still repairs WalkSpeed stats once, but never ForceMove.
/// </summary>
internal sealed class MacMoveWatchdog : MonoBehaviour
{
    private void Update() => MacLocalInputUnlock.TickWatchdog();
}

[HarmonyPatch(typeof(LevelManager), "StartInit")]
internal static class Patch_Level_StartInit_UnlockInput
{
    private static void Postfix(LevelManager __instance)
    {
        if (__instance == null)
            return;
        MacLocalInputUnlock.ScheduleAfterLevelReady("StartInit");
    }
}

/// <summary>
/// 进突袭后 CanMove 为 false，常常只是因为 CharacterWalkSpeed==0。
/// 修好属性后，关卡已就绪且未暂停时，强制本地 Main 在 OSX 上可以移动。
/// 若当前是 CA_Interact 等故意禁移的动作，必须保持原来的 false，不能绕过。
///
/// After a raid load, CanMove is often false only because CharacterWalkSpeed==0.
/// After repairing stats, force true for the local Main on OSX when the level is ready
/// and the game is not paused.
/// If the current action is an intentional no-move such as CA_Interact, keep the original
/// false result. Never bypass that.
/// </summary>
[HarmonyPatch(typeof(CharacterMainControl), nameof(CharacterMainControl.CanMove))]
internal static class Patch_CharacterMainControl_CanMove_Osx
{
    private static void Postfix(CharacterMainControl __instance, ref bool __result)
    {
        if (__result)
            return;
        if (_inCanMovePatch)
            return;
        if (!ModBehaviour.IsOsxRuntime() || !MacLocalInputUnlock.OsxForceMobileAfterRaid)
            return;
        if (__instance == null || __instance != CharacterMainControl.Main)
            return;
        if (!LevelManager.LevelInited)
            return;
        try { if (GameManager.Paused) return; } catch { }

        // Preserve intentional no-move (F interact, dash, fishing, …).
        try
        {
            if (MacLocalInputUnlock.IsIntentionalNoMoveAction(__instance.CurrentAction))
                return;
        }
        catch { }

        _inCanMovePatch = true;
        try
        {
            MacLocalInputUnlock.TryRepairWalkStats(__instance, log: false);
            var speed = MacLocalInputUnlock.ReadRawWalkSpeed(__instance);
            float walkBase = -1f;
            try
            {
                var item = __instance.CharacterItem;
                var w = item != null ? item.GetStat("WalkSpeed".GetHashCode()) : null;
                if (w != null) walkBase = w.BaseValue;
            }
            catch { }

            if (speed > 0.05f || walkBase > 0.05f)
            {
                MacLocalInputUnlock.NeedsWalkSpeedAssist = false;
                // Value 可能是 0 而 BaseValue 正常：门槛交给 WalkSpeed postfix，这里只放行移动。
                // Value may be 0 while BaseValue is OK. The WalkSpeed postfix floors the gate; only allow the move here.
                if (speed <= 0.05f && walkBase > 0.05f)
                {
                    var actionOk = __instance.CurrentAction;
                    if (actionOk != null)
                    {
                        try { if (!actionOk.CanMove()) return; } catch { return; }
                    }
                    __result = true;
                    MacLocalInputUnlock.NoteCanMoveBypass();
                }
                return;
            }

            MacLocalInputUnlock.NeedsWalkSpeedAssist = true;

            var action = __instance.CurrentAction;
            if (action != null)
            {
                try
                {
                    if (!action.CanMove())
                        return;
                }
                catch { return; }
            }

            __result = true;
            MacLocalInputUnlock.NoteCanMoveBypass();
        }
        finally
        {
            _inCanMovePatch = false;
        }
    }

    [ThreadStatic] private static bool _inCanMovePatch;
}

/// <summary>
/// MultiScene 之后 WalkSpeed 的 Value 可能是 0，而 BaseValue 仍大于 0。
/// CanMove 读的是 Value，所以这里在 OSX 上把读数托到 BaseValue，仅用于通过门闩。
/// 不要因此把 NeedsWalkSpeedAssist 设为 true，否则 ForceMove 会把冲刺打成顿挫。
///
/// After MultiScene, WalkSpeed Value can be 0 while BaseValue is still above 0.
/// CanMove reads Value, so on OSX this floors the read to BaseValue just to pass the gate.
/// Do not set NeedsWalkSpeedAssist for that case, or ForceMove will stutter sprint.
/// </summary>
[HarmonyPatch(typeof(CharacterMainControl), "get_CharacterWalkSpeed")]
internal static class Patch_CharacterMainControl_WalkSpeed_Osx
{
    private static void Postfix(CharacterMainControl __instance, ref float __result)
    {
        if (__result > 0.05f)
            return;
        if (_inWalkSpeedPatch)
            return;
        if (!ModBehaviour.IsOsxRuntime() || !MacLocalInputUnlock.OsxForceMobileAfterRaid)
            return;
        if (__instance == null || __instance != CharacterMainControl.Main)
            return;
        if (!LevelManager.LevelInited)
            return;

        _inWalkSpeedPatch = true;
        try
        {
            MacLocalInputUnlock.TryRepairWalkStats(__instance, log: false);
            var raw = MacLocalInputUnlock.ReadRawWalkSpeed(__instance);
            float walkBase = -1f;
            try
            {
                var item = __instance.CharacterItem;
                var w = item != null ? item.GetStat("WalkSpeed".GetHashCode()) : null;
                if (w != null) walkBase = w.BaseValue;
            }
            catch { }

            if (raw > 0.05f)
            {
                MacLocalInputUnlock.NeedsWalkSpeedAssist = false;
                __result = raw;
            }
            else if (walkBase > 0.05f)
            {
                // BaseValue 正常但 Value==0（GroundZero / MultiScene）。
                // 只为 CanMove 门槛把读数托起来，不要打开连续注入。
                // 连续注入会把 Shift 冲刺卡在走路速度并造成顿挫。
                // BaseValue is OK but Value==0 (GroundZero / MultiScene).
                // Floor the read for the CanMove gate only. Do not enable continuous inject —
                // that capped Shift sprint at walk speed and made it stutter.
                MacLocalInputUnlock.NeedsWalkSpeedAssist = false;
                __result = walkBase;
            }
            else
            {
                MacLocalInputUnlock.NeedsWalkSpeedAssist = true;
                __result = 4f;
            }
        }
        catch
        {
            if (__result <= 0.05f)
                __result = 4f;
        }
        finally
        {
            _inWalkSpeedPatch = false;
        }
    }

    [ThreadStatic] private static bool _inWalkSpeedPatch;
}

[HarmonyPatch(typeof(CharacterMainControl), "get_CharacterRunSpeed")]
internal static class Patch_CharacterMainControl_RunSpeed_Osx
{
    [ThreadStatic] private static bool _inRunSpeedPatch;

    private static void Postfix(CharacterMainControl __instance, ref float __result)
    {
        if (__result > 0.05f)
            return;
        if (_inRunSpeedPatch)
            return;
        if (!ModBehaviour.IsOsxRuntime() || !MacLocalInputUnlock.OsxForceMobileAfterRaid)
            return;
        if (__instance == null || __instance != CharacterMainControl.Main)
            return;
        if (!LevelManager.LevelInited)
            return;

        _inRunSpeedPatch = true;
        try
        {
            float runBase = -1f;
            try
            {
                var item = __instance.CharacterItem;
                var r = item != null ? item.GetStat("RunSpeed".GetHashCode()) : null;
                if (r != null) runBase = r.BaseValue;
            }
            catch { }
            if (runBase > 0.05f)
                __result = runBase;
        }
        finally
        {
            _inRunSpeedPatch = false;
        }
    }
}
