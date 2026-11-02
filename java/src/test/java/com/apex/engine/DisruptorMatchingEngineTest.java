package com.apex.engine;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class DisruptorMatchingEngineTest {

    @TempDir
    Path tempDir;

    private DisruptorMatchingEngine engine;

    @BeforeEach
    void setUp() {
        System.setProperty("apex.wal.dir", tempDir.resolve("wal").toString());
        engine = new DisruptorMatchingEngine(100.0, 0.01);
    }

    @AfterEach
    void tearDown() {
        if (engine != null) {
            engine.shutdown();
        }
        System.clearProperty("apex.wal.dir");
    }

    private void waitFor(String what, java.util.function.BooleanSupplier condition) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5000;
        while (!condition.getAsBoolean()) {
            if (System.currentTimeMillis() > deadline) {
                fail("timed out waiting for " + what);
            }
            Thread.sleep(5);
        }
    }

    @Test
    void crossingLimitOrdersProduceTrades() throws Exception {
        // Resting ask at 99.00 x5.
        engine.submitOrder(1, 10, OrderEvent.SIDE_SELL, OrderEvent.TYPE_LIMIT, 99.0, 5, (byte) 0);
        // Aggressive buy at 101.00 x3 crosses it.
        engine.submitOrder(2, 11, OrderEvent.SIDE_BUY, OrderEvent.TYPE_LIMIT, 101.0, 3, (byte) 0);

        waitFor("trade", () -> engine.getTradesCount() >= 1);
        assertEquals(1, engine.getTradesCount());
        // Maker price wins: trade printed at 99.00; 2 lots remain on the ask.
        assertEquals(99.0, engine.getBestAsk(), 1e-9);
        assertEquals(0.0, engine.getBestBid());
        waitFor("journal", () -> engine.getWalRecords() >= 2);
    }

    @Test
    void cancelTravelsThroughPipeline() throws Exception {
        engine.submitOrder(7, 12, OrderEvent.SIDE_BUY, OrderEvent.TYPE_LIMIT, 98.0, 10, (byte) 0);
        waitFor("rest", () -> engine.getBestBid() == 98.0);

        engine.cancelOrder(7);
        waitFor("cancel", () -> engine.getCancelsCount() >= 1);
        assertEquals(1, engine.getCancelsCount());
        assertEquals(0.0, engine.getBestBid());
    }

    @Test
    void journalRecordsEverySubmission() throws Exception {
        engine.submitOrder(21, 1, OrderEvent.SIDE_BUY, OrderEvent.TYPE_LIMIT, 97.0, 4, (byte) 1);
        engine.submitOrder(22, 2, OrderEvent.SIDE_SELL, OrderEvent.TYPE_LIMIT, 103.0, 4, (byte) 2);
        waitFor("journal", () -> engine.getWalRecords() >= 2);
        assertTrue(engine.getWalRecords() >= 2);
    }
}
