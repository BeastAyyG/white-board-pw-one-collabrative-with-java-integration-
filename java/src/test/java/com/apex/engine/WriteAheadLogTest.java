package com.apex.engine;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class WriteAheadLogTest {

    @TempDir
    Path tempDir;

    @Test
    void appendAndReplayRoundTrip() throws Exception {
        Path walDir = tempDir.resolve("wal");
        try (WriteAheadLog wal = new WriteAheadLog(walDir)) {
            wal.append(0, 11, 21, (byte) 1, (byte) 1, (byte) 3, 99.5, 10, 123456789L);
            wal.append(1, 12, 22, (byte) 2, (byte) 2, (byte) 0, 0.0, 7, 123456790L);
            wal.append(2, 13, 23, (byte) 0, (byte) 3, (byte) 0, 0.0, 0, 123456791L);
            assertEquals(3, wal.getTotalRecords());
            wal.flush();
        }

        List<String> seen = new ArrayList<>();
        try (WriteAheadLog wal = new WriteAheadLog(walDir)) {
            wal.readAll((seq, orderId, traderId, side, type, optKey, price, qty, ts) ->
                    seen.add(seq + ":" + orderId + ":" + traderId + ":" + side + ":" + type
                            + ":" + optKey + ":" + price + ":" + qty + ":" + ts));
        }

        assertEquals(3, seen.size());
        assertEquals("0:11:21:1:1:3:99.5:10:123456789", seen.get(0));
        assertEquals("1:12:22:2:2:0:0.0:7:123456790", seen.get(1));
        assertEquals("2:13:23:0:3:0:0.0:0:123456791", seen.get(2));
    }

    @Test
    void emptyLogReplaysNothing() throws Exception {
        Path walDir = tempDir.resolve("empty");
        List<String> seen = new ArrayList<>();
        try (WriteAheadLog wal = new WriteAheadLog(walDir)) {
            wal.readAll((seq, orderId, traderId, side, type, optKey, price, qty, ts) ->
                    seen.add("x"));
        }
        assertTrue(seen.isEmpty());
    }
}
