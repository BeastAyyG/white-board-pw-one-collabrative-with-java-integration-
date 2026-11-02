package com.apex.engine;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;

/**
 * Best-effort UDP replication of order events to a standby / analytics node.
 *
 * <p>Enabled with {@code -Dapex.replicate=host:port}. When the property is absent
 * the replicator is never constructed and the replication stage costs nothing.
 * Datagrams reuse a single pre-allocated 64-byte buffer and packet, so the hot
 * path allocates nothing.
 */
public final class UdpReplicator implements AutoCloseable {

    private final DatagramSocket socket;
    private final DatagramPacket packet;
    private final byte[] buf = new byte[WriteAheadLog.RECORD_SIZE];
    private final ByteBuffer view = ByteBuffer.wrap(buf);
    private long datagramsSent;

    private UdpReplicator(InetSocketAddress destination) throws IOException {
        this.socket = new DatagramSocket();
        this.socket.setSendBufferSize(1 << 20);
        this.packet = new DatagramPacket(buf, buf.length, destination);
    }

    /**
     * Creates a replicator from the {@code apex.replicate} system property,
     * or returns {@code null} when replication is not configured.
     */
    public static UdpReplicator create() {
        String target = System.getProperty("apex.replicate", "").trim();
        if (target.isEmpty()) {
            return null;
        }
        String[] parts = target.split(":");
        if (parts.length != 2) {
            System.err.println("[replicator] ignoring malformed apex.replicate=" + target + " (expected host:port)");
            return null;
        }
        try {
            return new UdpReplicator(new InetSocketAddress(parts[0], Integer.parseInt(parts[1])));
        } catch (Exception e) {
            System.err.println("[replicator] cannot reach " + target + ": " + e.getMessage() + "; replication disabled");
            return null;
        }
    }

    /**
     * Sends one 64-byte order record. Best effort: send failures are counted
     * and swallowed so replication can never stall the matching pipeline.
     */
    public void replicate(long sequence, long orderId, long traderId,
                          byte side, byte type, byte optionKey,
                          double price, long quantity, long timestampNs) {
        view.clear();
        view.putLong(sequence);
        view.putLong(orderId);
        view.putLong(traderId);
        view.put(side);
        view.put(type);
        view.put(optionKey);
        view.putDouble(price);
        view.putLong(quantity);
        view.putLong(timestampNs);
        try {
            socket.send(packet);
            datagramsSent++;
        } catch (IOException ignored) {
            // best effort only
        }
    }

    public long getDatagramsSent() {
        return datagramsSent;
    }

    @Override
    public void close() {
        socket.close();
    }
}
