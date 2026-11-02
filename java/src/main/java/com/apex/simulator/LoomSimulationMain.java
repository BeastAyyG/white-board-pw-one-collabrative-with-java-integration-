package com.apex.simulator;

import com.apex.engine.DisruptorMatchingEngine;
import com.apex.engine.OrderEvent;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicLong;

/**
 * High-Concurrency Simulation Runner.
 * Simulates 10,000+ virtual agents interacting concurrently:
 * - Submitting limit & market orders
 * - Participating in multiple-choice question (MCQ) virtual liquidity pools
 * - Proving lock-free throughput scaling
 */
public final class LoomSimulationMain {

    private static final int VIRTUAL_AGENTS = 10_000;
    private static final int ORDERS_PER_AGENT = 20;
    private static final AtomicLong TOTAL_SUBMITTED = new AtomicLong();

    public static void main(String[] args) throws InterruptedException {
        System.out.println("======================================================================");
        System.out.println(" Apex Low-Latency Engine & Concurrency Simulation (Java 21 Project Loom)");
        System.out.println("======================================================================");

        DisruptorMatchingEngine engine = new DisruptorMatchingEngine(100.0, 0.01);

        System.out.printf("Spawning %,d Java 21 Virtual Threads...%n", VIRTUAL_AGENTS);
        long startNs = System.nanoTime();

        // Project Loom Virtual Thread Executor
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < VIRTUAL_AGENTS; i++) {
                final long traderId = i + 1;

                executor.submit(() -> {
                    ThreadLocalRandom rand = ThreadLocalRandom.current();

                    for (int j = 0; j < ORDERS_PER_AGENT; j++) {
                        long orderId = TOTAL_SUBMITTED.incrementAndGet();
                        byte side = rand.nextBoolean() ? OrderEvent.SIDE_BUY : OrderEvent.SIDE_SELL;
                        byte type = rand.nextDouble() < 0.25 ? OrderEvent.TYPE_MARKET : OrderEvent.TYPE_LIMIT;
                        double price = 100.0 + (rand.nextDouble() - 0.5) * 4.0;
                        long qty = rand.nextLong(1, 15);
                        byte optionKey = (byte) rand.nextInt(1, 5); // Options 1=A, 2=B, 3=C, 4=D

                        // Direct zero-lock dispatch to RingBuffer
                        engine.submitOrder(orderId, traderId, side, type, price, qty, optionKey);
                    }
                });
            }
        } // Block and wait for all 10,000 virtual threads to complete

        long elapsedNs = System.nanoTime() - startNs;
        double elapsedMs = elapsedNs / 1_000_000.0;
        long totalOrders = TOTAL_SUBMITTED.get();
        double opsPerSec = (totalOrders / (elapsedNs / 1_000_000_000.0));

        System.out.printf("%nExecution Finished in %.2f ms%n", elapsedMs);
        System.out.printf("Total Orders Dispatched: %,d%n", totalOrders);
        System.out.printf("Throughput: %,d ops/sec%n", (long) opsPerSec);
        System.out.printf("Total Trades Settled: %,d%n", engine.getTradesCount());
        System.out.printf("Final OrderBook: Best Bid = $%.2f | Best Ask = $%.2f%n", engine.getBestBid(), engine.getBestAsk());
        System.out.println("======================================================================");

        engine.shutdown();
    }
}
