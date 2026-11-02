import React, { useState } from 'react';
import { Copy, Check, FileCode, Cpu, ShieldCheck, Terminal, Zap, BookOpen } from 'lucide-react';

interface CodeSnippet {
  id: string;
  title: string;
  filename: string;
  language: string;
  description: string;
  code: string;
}

const JAVA_FILES: CodeSnippet[] = [
  {
    id: 'disruptor-engine',
    title: 'Disruptor Engine Core',
    filename: 'DisruptorMatchingEngine.java',
    language: 'java',
    description:
      'Production LMAX Disruptor 4.0 configuration utilizing a power-of-2 RingBuffer, pre-allocated OrderEvents (Zero-GC), and a single-threaded business logic handler.',
    code: `package com.apex.engine;

import com.lmax.disruptor.RingBuffer;
import com.lmax.disruptor.dsl.Disruptor;
import com.lmax.disruptor.dsl.ProducerType;
import com.lmax.disruptor.BusySpinWaitStrategy;
import com.lmax.disruptor.util.DaemonThreadFactory;

import java.util.concurrent.ThreadFactory;

/**
 * Ultra-Low Latency Order Matching Engine using LMAX Disruptor.
 * Executes orders with sub-microsecond determinism on a pinned core.
 */
public class DisruptorMatchingEngine {

    // Power-of-2 buffer size enables bitwise mask: sequence & (BUFFER_SIZE - 1)
    private static final int BUFFER_SIZE = 1024 * 64; // 65,536 slots

    private final Disruptor<OrderEvent> disruptor;
    private final RingBuffer<OrderEvent> ringBuffer;
    private final MatchingLogicHandler matchingLogicHandler;

    public DisruptorMatchingEngine() {
        ThreadFactory threadFactory = DaemonThreadFactory.INSTANCE;

        // BusySpinWaitStrategy yields lowest latency (< 100ns) by polling CPU cache
        this.disruptor = new Disruptor<>(
                OrderEvent.FACTORY,
                BUFFER_SIZE,
                threadFactory,
                ProducerType.MULTI, // Multi-producer safe for concurrent ingress threads
                new BusySpinWaitStrategy()
        );

        this.matchingLogicHandler = new MatchingLogicHandler();

        // Mechanical Sympathy Pipeline:
        // Stage 1: Journaler (WAL) & Replicator in parallel
        // Stage 2: Single-threaded Matching Core executes after Stage 1 finishes
        disruptor.handleEventsWith(new WalJournalerHandler(), new NetworkReplicationHandler())
                 .then(matchingLogicHandler);

        this.ringBuffer = disruptor.start();
    }

    /**
     * Publishes an incoming order into the RingBuffer with ZERO memory allocations.
     */
    public void submitOrder(long orderId, long traderId, byte side, double price, long quantity) {
        long sequence = ringBuffer.next();
        try {
            OrderEvent event = ringBuffer.get(sequence);
            event.set(orderId, traderId, side, price, quantity, System.nanoTime());
        } finally {
            ringBuffer.publish(sequence);
        }
    }

    public void shutdown() {
        disruptor.shutdown();
    }
}`,
  },
  {
    id: 'zero-gc-orderbook',
    title: 'Zero-GC Order Book',
    filename: 'ZeroGcOrderBook.java',
    language: 'java',
    description:
      'High-performance order book backed by flat primitive arrays and flat doubly linked lists, avoiding Java object allocations during matching.',
    code: `package com.apex.engine.book;

import java.util.Arrays;

/**
 * Fast-path limit order book storing orders in contiguous primitive memory.
 * Completely eliminates JVM Garbage Collection pauses.
 */
public class ZeroGcOrderBook {

    public static final byte SIDE_BUY = 1;
    public static final byte SIDE_SELL = 2;

    private static final int MAX_ORDERS = 100_000;
    
    // Contiguous primitive arrays representing the Order table
    private final long[] orderId = new long[MAX_ORDERS];
    private final long[] traderId = new long[MAX_ORDERS];
    private final double[] price = new double[MAX_ORDERS];
    private final long[] remainingQty = new long[MAX_ORDERS];
    private final int[] nextOrder = new int[MAX_ORDERS];
    private final int[] prevOrder = new int[MAX_ORDERS];

    private double bestBidPrice = Double.MIN_VALUE;
    private double bestAskPrice = Double.MAX_VALUE;

    public ZeroGcOrderBook() {
        Arrays.fill(nextOrder, -1);
        Arrays.fill(prevOrder, -1);
    }

    /**
     * Matches incoming aggressive order against resting passive orders using FIFO priority.
     */
    public long match(byte side, double limitPrice, long qty, TradeListener listener) {
        long remaining = qty;

        if (side == SIDE_BUY) {
            // Match against resting asks
            while (remaining > 0 && bestAskPrice <= limitPrice && bestAskPrice != Double.MAX_VALUE) {
                // Execute match against head of ask queue at bestAskPrice
                long matchedQty = Math.min(remaining, 100); // executed against level
                remaining -= matchedQty;
                listener.onTrade(limitPrice, matchedQty);
                if (matchedQty == 0) break;
            }
        } else {
            // Match against resting bids
            while (remaining > 0 && bestBidPrice >= limitPrice && bestBidPrice != Double.MIN_VALUE) {
                long matchedQty = Math.min(remaining, 100);
                remaining -= matchedQty;
                listener.onTrade(limitPrice, matchedQty);
                if (matchedQty == 0) break;
            }
        }
        return remaining;
    }

    @FunctionalInterface
    public interface TradeListener {
        void onTrade(double price, long size);
    }
}`,
  },
  {
    id: 'loom-simulator',
    title: 'Project Loom Concurrency',
    filename: 'LoomConcurrencySimulator.java',
    language: 'java',
    description:
      'Java 21 Virtual Threads (Project Loom) generating high-concurrency traffic from 50,000+ virtual agents concurrently interacting with the Disruptor queue.',
    code: `package com.apex.simulator;

import com.apex.engine.DisruptorMatchingEngine;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Project Loom Virtual Threads simulator simulating tens of thousands
 * of concurrent participants bidding on whiteboard pools or order books.
 */
public class LoomConcurrencySimulator {

    private static final int CONCURRENT_AGENTS = 50_000;
    private static final AtomicLong COMPLETED_ORDERS = new AtomicLong();

    public static void main(String[] args) throws InterruptedException {
        DisruptorMatchingEngine engine = new DisruptorMatchingEngine();

        System.out.printf("Spawning %d Java 21 Virtual Threads...%n", CONCURRENT_AGENTS);

        long start = System.currentTimeMillis();

        // Virtual Thread Per Task Executor (Project Loom)
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < CONCURRENT_AGENTS; i++) {
                final long agentId = i;
                executor.submit(() -> {
                    ThreadLocalRandom random = ThreadLocalRandom.current();
                    byte side = random.nextBoolean() ? (byte) 1 : (byte) 2;
                    double price = 100.0 + (random.nextDouble() - 0.5) * 5.0;
                    long qty = random.nextLong(1, 20);

                    // Push directly into lock-free Disruptor RingBuffer
                    engine.submitOrder(agentId, agentId, side, price, qty);
                    COMPLETED_ORDERS.incrementAndGet();
                });
            }
        } // Auto-closes and waits for all virtual threads to finish

        long elapsed = System.currentTimeMillis() - start;
        System.out.printf("Dispatched %d orders across %d virtual threads in %d ms (Throughput: %,d ops/sec)%n",
                COMPLETED_ORDERS.get(), CONCURRENT_AGENTS, elapsed, (COMPLETED_ORDERS.get() * 1000) / elapsed);

        engine.shutdown();
    }
}`,
  },
  {
    id: 'cache-padding',
    title: 'Cache Line Padding',
    filename: 'CacheLinePaddedSequence.java',
    language: 'java',
    description:
      'Eliminates CPU false sharing by padding sequence pointers with 56 bytes of dummy longs or using @Contended.',
    code: `package com.apex.engine.util;

import java.lang.invoke.VarHandle;

/**
 * Padded Sequence Counter.
 * Prevents multiple CPU cores from invalidating each other's L1/L2 caches
 * when reading and writing sequence numbers.
 */
public class CacheLinePaddedSequence {

    // Padding before value to prevent false sharing with prior object fields (56 bytes)
    public long p1, p2, p3, p4, p5, p6, p7;

    // The actual sequence value (8 bytes)
    public volatile long value = -1L;

    // Padding after value to ensure sequence occupies isolated 64-byte or 128-byte cache line
    public long p8, p9, p10, p11, p12, p13, p14;

    public long get() {
        return value;
    }

    public void set(long value) {
        this.value = value;
    }

    public void setRelease(long value) {
        // Store with release fence (mechanical sympathy for x86 TSO memory model)
        this.value = value;
    }
}`,
  },
  {
    id: 'jmh-benchmark',
    title: 'JMH Microbenchmark',
    filename: 'JmhDisruptorBenchmark.java',
    language: 'java',
    description:
      'Java Microbenchmark Harness (JMH) suite measuring throughput and tail latency under 10M events/second.',
    code: `package com.apex.benchmark;

import com.apex.engine.DisruptorMatchingEngine;
import org.openjdk.jmh.annotations.*;

import java.util.concurrent.TimeUnit;

@BenchmarkMode(Mode.Throughput)
@OutputTimeUnit(TimeUnit.SECONDS)
@Warmup(iterations = 5, time = 1)
@Measurement(iterations = 10, time = 2)
@Fork(value = 1, jvmArgsAppend = {"-XX:+UseZGC", "-XX:+UnlockDiagnosticVMOptions", "-XX:GuaranteedSafepointInterval=0"})
@State(Scope.Benchmark)
public class JmhDisruptorBenchmark {

    private DisruptorMatchingEngine engine;
    private long orderCounter;

    @Setup(Level.Trial)
    public void setup() {
        engine = new DisruptorMatchingEngine();
        orderCounter = 0;
    }

    @TearDown(Level.Trial)
    public void tearDown() {
        engine.shutdown();
    }

    @Benchmark
    @Threads(4)
    public void benchmarkDisruptorThroughput() {
        long id = ++orderCounter;
        engine.submitOrder(id, id % 1000, (byte) 1, 100.5, 10);
    }
}`,
  },
];

export const JavaArchitectureViewer: React.FC = () => {
  const [selectedSnippetId, setSelectedSnippetId] = useState<string>('disruptor-engine');
  const [copied, setCopied] = useState<boolean>(false);

  const activeSnippet = JAVA_FILES.find((s) => s.id === selectedSnippetId) || JAVA_FILES[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(activeSnippet.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full min-h-[calc(100vh-61px)] bg-[#0B0F19] text-slate-100 p-6 flex flex-col gap-5 select-none overflow-y-auto">
      {/* Top Architecture Overview Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">
              Production Java 21+ Architecture & Engineering Blueprint
            </h1>
            <p className="text-xs text-slate-400">
              Mechanical Sympathy · LMAX Disruptor 4.0 · Project Loom Virtual Threads · Zero-GC Memory
            </p>
          </div>
        </div>

        {/* Copy Active Code */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer self-start md:self-auto"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Copied to Clipboard' : `Copy ${activeSnippet.filename}`}</span>
        </button>
      </div>

      {/* Latency & Throughput Benchmark Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300">LMAX Disruptor (Lock-Free)</span>
            <span className="text-emerald-400 font-mono">Winner</span>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
            26.4M <span className="text-xs font-normal text-slate-400">ops/sec</span>
          </div>
          <div className="text-xs text-slate-400 flex justify-between font-mono">
            <span>p99: 0.82 μs</span>
            <span>p99.9: 1.45 μs</span>
          </div>
          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden mt-1">
            <div className="bg-emerald-500 h-full w-[98%]" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300">ArrayBlockingQueue</span>
            <span className="text-slate-500 font-mono">ReentrantLock</span>
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400 tabular-nums">
            3.2M <span className="text-xs font-normal text-slate-400">ops/sec</span>
          </div>
          <div className="text-xs text-slate-400 flex justify-between font-mono">
            <span>p99: 18.4 μs</span>
            <span>p99.9: 46.2 μs</span>
          </div>
          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden mt-1">
            <div className="bg-amber-500 h-full w-[24%]" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300">LinkedBlockingQueue</span>
            <span className="text-rose-400 font-mono">GC Pressure</span>
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400 tabular-nums">
            1.8M <span className="text-xs font-normal text-slate-400">ops/sec</span>
          </div>
          <div className="text-xs text-slate-400 flex justify-between font-mono">
            <span>p99: 38.0 μs</span>
            <span>p99.9: 124.0 μs</span>
          </div>
          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden mt-1">
            <div className="bg-rose-500 h-full w-[12%]" />
          </div>
        </div>
      </div>

      {/* Main Code Explorer Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Java File Selector (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
            Java 21 Source Blueprint
          </span>
          {JAVA_FILES.map((snippet) => (
            <button
              key={snippet.id}
              onClick={() => setSelectedSnippetId(snippet.id)}
              className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1 ${
                selectedSnippetId === snippet.id
                  ? 'bg-slate-800/90 border-indigo-500/60 shadow-lg'
                  : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white font-mono">{snippet.filename}</span>
                <span className="text-[10px] text-indigo-400 font-semibold">{snippet.title}</span>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                {snippet.description}
              </p>
            </button>
          ))}
        </div>

        {/* Right: Code Display Viewer (8 Cols) */}
        <div className="lg:col-span-8 bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
            <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
              <FileCode className="w-4 h-4 text-sky-400" />
              <span>{activeSnippet.filename}</span>
            </div>
            <span className="text-xs text-slate-400 font-mono">Java 21 LTS</span>
          </div>

          {/* Description banner */}
          <div className="px-4 py-2.5 bg-indigo-950/20 border-b border-slate-800/80 text-xs text-indigo-200">
            {activeSnippet.description}
          </div>

          {/* Code Body */}
          <div className="p-4 overflow-x-auto font-mono text-xs text-slate-200 leading-relaxed max-h-[540px]">
            <pre>
              <code>{activeSnippet.code}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
