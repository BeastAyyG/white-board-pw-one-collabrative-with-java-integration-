package com.apex.demo;

import com.apex.engine.DisruptorMatchingEngine;
import com.apex.engine.OrderEvent;
import com.apex.engine.WriteAheadLog;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.atomic.AtomicLong;

/**
 * One-shot runnable demo of the Apex matching engine pipeline:
 * seed book, crossing orders, a cancel, then a WAL replay proof.
 *
 * <p>Run: {@code java -jar apex-engine.jar}
 * (or {@code java -cp apex-engine.jar com.apex.demo.EngineDemoMain}).
 */
public final class EngineDemoMain {

    public static void main(String[] args) throws Exception {
        System.out.println("======================================================================");
        System.out.println(" Apex Matching Engine Demo (LMAX Disruptor + Zero-GC Order Book + WAL)");
        System.out.println("======================================================================");

        Path walDir = Paths.get(System.getProperty("apex.wal.dir", "./wal-demo"));
        System.setProperty("apex.wal.dir", walDir.toString()); // engine + replay share one journal
        DisruptorMatchingEngine engine = new DisruptorMatchingEngine(100.0, 0.01);
        AtomicLong id = new AtomicLong(1);

        // 1. Seed a resting book: 5 bids, 5 asks.
        for (int i = 1; i <= 5; i++) {
            engine.submitOrder(id.getAndIncrement(), 100 + i, OrderEvent.SIDE_BUY,
                    OrderEvent.TYPE_LIMIT, 100.0 - i * 0.25, 10 + i * 5, (byte) 0);
            engine.submitOrder(id.getAndIncrement(), 200 + i, OrderEvent.SIDE_SELL,
                    OrderEvent.TYPE_LIMIT, 100.0 + i * 0.25, 10 + i * 5, (byte) 0);
        }
        waitFor(() -> engine.getWalRecords() >= 10, "seeding");

        // 2. Aggressive market buy sweeps the ask side.
        engine.submitOrder(id.getAndIncrement(), 999, OrderEvent.SIDE_BUY,
                OrderEvent.TYPE_MARKET, 0.0, 40, (byte) 0);
        waitFor(() -> engine.getTradesCount() >= 2, "market sweep");

        // 3. Cancel one resting bid.
        long restingBidId = 1; // first seeded buy order
        engine.cancelOrder(restingBidId);
        waitFor(() -> engine.getCancelsCount() >= 1, "cancel");

        System.out.println();
        System.out.println("Order book after demo flow:");
        System.out.printf("  Best Bid : $%.2f%n", engine.getBestBid());
        System.out.printf("  Best Ask : $%.2f%n", engine.getBestAsk());
        System.out.printf("  Trades settled : %,d%n", engine.getTradesCount());
        System.out.printf("  Cancels applied : %,d%n", engine.getCancelsCount());
        System.out.printf("  WAL records     : %,d%n", engine.getWalRecords());
        System.out.printf("  Replicated      : %,d datagrams%n", engine.getReplicatedDatagrams());
        engine.shutdown();

        // 4. Prove the journal: replay the WAL written above.
        System.out.println();
        System.out.println("Replaying write-ahead log from " + walDir.toAbsolutePath() + ":");
        AtomicLong replayed = new AtomicLong();
        AtomicLong replayedTrades = new AtomicLong();
        try (WriteAheadLog wal = new WriteAheadLog(walDir)) {
            wal.readAll((seq, orderId, traderId, side, type, optKey, price, qty, ts) -> {
                replayed.incrementAndGet();
                if (type != OrderEvent.TYPE_CANCEL) {
                    replayedTrades.addAndGet(0);
                }
            });
        } catch (Exception e) {
            System.out.println("  (WAL replay skipped: " + e.getMessage() + ")");
        }
        System.out.printf("  Replayed %,d journal records%n", replayed.get());
        System.out.println("======================================================================");
        System.out.println("Demo complete. Next:");
        System.out.println("  Whiteboard server : java -cp apex-engine.jar com.apex.whiteboard.WhiteboardServer 8090");
        System.out.println("  10k-agent sim     : java -cp apex-engine.jar com.apex.simulator.LoomSimulationMain");
        System.out.println("======================================================================");
    }

    @FunctionalInterface
    private interface Condition {
        boolean met();
    }

    private static void waitFor(Condition c, String what) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5000;
        while (!c.met()) {
            if (System.currentTimeMillis() > deadline) {
                throw new IllegalStateException("timed out waiting for " + what);
            }
            Thread.sleep(5);
        }
    }
}
