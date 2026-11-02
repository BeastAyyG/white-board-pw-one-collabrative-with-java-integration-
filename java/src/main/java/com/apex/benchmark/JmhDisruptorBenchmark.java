package com.apex.benchmark;

import com.apex.engine.DisruptorMatchingEngine;
import com.apex.engine.OrderEvent;
import org.openjdk.jmh.annotations.*;

import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

/**
 * JMH throughput benchmark for the Disruptor matching pipeline.
 * Run: {@code java -cp apex-engine.jar org.openjdk.jmh.Main JmhDisruptorBenchmark}
 * (or {@code mvn -Dtest=none package} then the jmh Main class from the shaded jar).
 */
@BenchmarkMode(Mode.Throughput)
@OutputTimeUnit(TimeUnit.SECONDS)
@Warmup(iterations = 3, time = 1)
@Measurement(iterations = 5, time = 2)
@Fork(value = 1)
@State(Scope.Benchmark)
public class JmhDisruptorBenchmark {

    private DisruptorMatchingEngine engine;
    private long orderCounter;

    @Setup(Level.Trial)
    public void setup() {
        engine = new DisruptorMatchingEngine(100.0, 0.01);
        orderCounter = 0;
    }

    @TearDown(Level.Trial)
    public void tearDown() {
        engine.shutdown();
    }

    @Benchmark
    @Threads(4)
    public void benchmarkOrderSubmission() {
        long id = ++orderCounter;
        ThreadLocalRandom rand = ThreadLocalRandom.current();
        byte side = rand.nextBoolean() ? OrderEvent.SIDE_BUY : OrderEvent.SIDE_SELL;
        byte type = rand.nextDouble() < 0.25 ? OrderEvent.TYPE_MARKET : OrderEvent.TYPE_LIMIT;
        double price = 100.0 + (rand.nextDouble() - 0.5) * 4.0;
        engine.submitOrder(id, id % 1000, side, type, price, rand.nextLong(1, 15), (byte) 0);
    }
}
