using System.Net;
using System.Net.Sockets;

namespace EscapeFromDuckovCoopMod;

internal sealed class LiteNetTransport : CoopNetworkManager, INetEventListener
{
    private readonly LiteNetLib.NetManager _manager;
    private readonly Dictionary<LiteNetLib.NetPeer, LiteNetPeer> _peers = new();
    private readonly List<CoopPeer> _connected = new();

    public LiteNetTransport(ICoopNetworkListener listener) : base(listener)
    {
        _manager = new LiteNetLib.NetManager(this)
        {
            BroadcastReceiveEnabled = true,
            UpdateTime = 1,
            EnableStatistics = true
        };
    }

    public override bool IsRunning => _manager.IsRunning;
    public override int LocalPort => _manager.LocalPort;
    public override IReadOnlyList<CoopPeer> ConnectedPeerList => _connected;
    public override NetStatistics Statistics => _manager.Statistics;
    // macOS App Sandbox 会拒绝这个 UDP 绑定以及后续广播/直连（LiteNetLib）。
    // 独立 Mac 版必须关闭沙盒（nosandbox）并具备 network.client + network.server entitlement。
    // 模组 DLL 自己改不了宿主签名，说明见 README_MAC.md。Windows 不走沙盒，行为不变。
    //
    // The macOS App Sandbox denies this UDP bind and later broadcast/direct connect (LiteNetLib).
    // A standalone Mac build needs the sandbox off (nosandbox) plus network.client and network.server
    // entitlements. The mod DLL cannot re-sign the host app; see README_MAC.md.
    // Windows is not sandboxed; behavior there is unchanged.
    public override bool Start(int port = 0) => _manager.Start(port);
    public override void Stop()
    {
        _manager.Stop();
        _peers.Clear();
        _connected.Clear();
    }
    public override void PollEvents() => _manager.PollEvents();
    public override int GetReliableQueueLength(CoopPeer peer) => peer is LiteNetPeer direct ? direct.ReliableQueueLength : -1;
    public override void TriggerUpdate() => _manager.TriggerUpdate();
    public override void Connect(string address, int port, NetDataWriter data) => _manager.Connect(address, port, data);
    public override void SendUnconnectedMessage(NetDataWriter data, IPEndPoint endpoint) => _manager.SendUnconnectedMessage(data, endpoint);
    public override void SendBroadcast(NetDataWriter data, int port) => _manager.SendBroadcast(data, port);

    public void OnPeerConnected(LiteNetLib.NetPeer peer)
    {
        var wrapper = new LiteNetPeer(peer);
        _peers.Add(peer, wrapper);
        _connected.Add(wrapper);
        Listener.OnPeerConnected(wrapper);
    }
    public void OnPeerDisconnected(LiteNetLib.NetPeer peer, DisconnectInfo info)
    {
        if (!_peers.TryGetValue(peer, out var wrapper))
            wrapper = new LiteNetPeer(peer); // Failed outgoing connection still clears the UI's connecting state.
        _peers.Remove(peer);
        _connected.Remove(wrapper);
        Listener.OnPeerDisconnected(wrapper, info);
    }
    public void OnNetworkReceive(LiteNetLib.NetPeer peer, LiteNetLib.NetPacketReader reader, byte channel, DeliveryMethod delivery)
    {
        try
        {
            if (_peers.TryGetValue(peer, out var wrapper))
                Listener.OnNetworkReceive(wrapper, new CoopPacketReader(reader.RawData, reader.Position, reader.AvailableBytes), channel, delivery);
        }
        catch (Exception ex) { Debug.LogError($"[Direct] Receive failed: {ex}"); }
        finally { reader.Recycle(); }
    }
    public void OnNetworkReceiveUnconnected(IPEndPoint endpoint, LiteNetLib.NetPacketReader reader, UnconnectedMessageType type)
    {
        try { Listener.OnNetworkReceiveUnconnected(endpoint, new CoopPacketReader(reader.RawData, reader.Position, reader.AvailableBytes), type); }
        finally { reader.Recycle(); }
    }
    public void OnNetworkLatencyUpdate(LiteNetLib.NetPeer peer, int latency)
    {
        if (_peers.TryGetValue(peer, out var wrapper)) Listener.OnNetworkLatencyUpdate(wrapper, latency);
    }
    public void OnNetworkError(IPEndPoint endpoint, SocketError error) => Listener.OnNetworkError(endpoint, error);
    public void OnConnectionRequest(ConnectionRequest request) => Listener.OnConnectionRequest(request);
}
