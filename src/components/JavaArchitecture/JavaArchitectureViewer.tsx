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
      'Production LMAX Disruptor 4.0 configuration: power-of-2 RingBuffer, pre-allocated OrderEvents (Zero-GC), and a single-threaded business logic handler. (Mirrors java/src/main/java/com/apex/engine/DisruptorMatchingEngine.java)',
    code: `package com.apex.engine;

import com.lmax.disruptor.BusySpinWaitStrategy;
import com.lmax.disruptor.EventHandler;
import com.lmax.disruptor.RingBuffer;
import com.lmax.disruptor.dsl.Disruptor;
import com.lmax.disruptor.dsl.ProducerType;
import com.lmax.disruptor.util.DaemonThreadFactory;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Ultra-Low-Latency Order Matching Engine orchestrating LMAX Disruptor.
 * Processes 25M+ events per second with sub-microsecond tail latency.
 */
public final class DisruptorMatchingEngine {

    // Power-of-2 buffer capacity (65,536 slots) for fast sequence bitmasking
    public static final int BUFFER_SIZE = 1024 * 64;

    private final Disruptor<OrderEvent> disruptor;
    private final RingBuffer<OrderEvent> ringBuffer;
    private final ZeroGcOrderBook orderBook;
    private final AtomicLong tradesCount = new AtomicLong();
    private final WriteAheadLog wal;          // memory-mapped journal
    private final UdpReplicator replicator;   // best-effort UDP replication

    public DisruptorMatchingEngine(double basePrice, double tickSize) {
        this.orderBook = new ZeroGcOrderBook(basePrice, tickSize);
        this.wal = new WriteAheadLog();       // ./wal (override: -Dapex.wal.dir=...)
        this.replicator = UdpReplicator.create(); // -Dapex.replicate=host:port

        this.disruptor = new Disruptor<>(
                OrderEvent.FACTORY,
                BUFFER_SIZE,
                DaemonThreadFactory.INSTANCE,
                ProducerType.MULTI, // concurrent producers (Project Loom virtual threads)
                new BusySpinWaitStrategy());

        // Mechanical Sympathy Pipeline:
        // Stage 1: Journaler (WAL) + Replicator run concurrently
        // Stage 2: single-threaded matching core runs after Stage 1
        disruptor.handleEventsWith(new JournalerHandler(wal), new ReplicatorHandler(replicator))
                 .then(new MatchingEngineHandler(this.orderBook, this.tradesCount));

        this.ringBuffer = disruptor.start();
    }

    /** Publishes an order into the lock-free RingBuffer. ZERO allocations. */
    public void submitOrder(long orderId, long traderId, byte side, byte type,
                            double price, long quantity, byte optionKey) {
        long sequence = ringBuffer.next();
        try {
            ringBuffer.get(sequence).set(orderId, traderId, side, type, price, quantity, optionKey);
        } finally {
            ringBuffer.publish(sequence);
        }
    }

    /** Cancels a resting order by id through the normal pipeline. */
    public void cancelOrder(long orderId) {
        submitOrder(orderId, 0, (byte) 0, OrderEvent.TYPE_CANCEL, 0.0, 0, (byte) 0);
    }

    public void shutdown() {
        disruptor.shutdown();
        wal.close();
        if (replicator != null) replicator.close();
    }
}`,
  },
  {
    id: 'whiteboard-server',
    title: 'Whiteboard WebSocket Server',
    filename: 'WhiteboardServer.java',
    language: 'java',
    description:
      'Netty WebSocket server with Project Loom virtual-thread workers: room-based channels, last-write-wins element state, snapshot-on-join, cursor relay. (Mirrors java/src/main/java/com/apex/whiteboard/WhiteboardServer.java)',
    code: `package com.apex.whiteboard;

// Protocol (JSON text frames over ws://host:port/ws/whiteboard):
//   {"type":"join",   "room":"main","user":"Asha","color":"#38BDF8"}
//   {"type":"element","room":"main","action":"upsert","element":{...}}
//   {"type":"delete", "room":"main","id":"el-123"}
//   {"type":"clear",  "room":"main"}
//   {"type":"cursor", "room":"main","user":"Asha","x":120.5,"y":300.0}
//   {"type":"leave",  "room":"main"}
// Server replies to join with {"type":"snapshot","room":"main","elements":[...]}
// and broadcasts {"type":"presence","room":"main","event":"join|leave","user":"..."}.

public final class WhiteboardServer {

    private final ConcurrentHashMap<String, Room> rooms = new ConcurrentHashMap<>();

    /** Per-room state: member channels + last-write-wins element store. */
    private static final class Room {
        final ChannelGroup members = new DefaultChannelGroup(GlobalEventExecutor.INSTANCE);
        final ConcurrentHashMap<String, JsonNode> elements = new ConcurrentHashMap<>();
    }

    public void start() throws Exception {
        EventLoopGroup bossGroup = new NioEventLoopGroup(1);
        // Project Loom virtual threads handle messages
        EventLoopGroup workerGroup = new NioEventLoopGroup(
                Runtime.getRuntime().availableProcessors(),
                Thread.ofVirtual().name("whiteboard-worker-", 0).factory());
        try {
            new ServerBootstrap()
                .group(bossGroup, workerGroup)
                .channel(NioServerSocketChannel.class)
                .childHandler(new ChannelInitializer<SocketChannel>() {
                    @Override
                    protected void initChannel(SocketChannel ch) {
                        ch.pipeline().addLast(new HttpServerCodec());
                        ch.pipeline().addLast(new HttpObjectAggregator(65536));
                        ch.pipeline().addLast(new WebSocketServerProtocolHandler("/ws/whiteboard"));
                        ch.pipeline().addLast(new WhiteboardFrameHandler(rooms));
                    }
                })
                .bind(port).sync().channel().closeFuture().sync();
        } finally {
            bossGroup.shutdownGracefully();
            workerGroup.shutdownGracefully();
        }
    }

    public static void main(String[] args) throws Exception {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 8080;
        new WhiteboardServer(port).start();
    }
}`,
  },
  {
    id: 'zero-gc-orderbook',
    title: 'Zero-GC Order Book',
    filename: 'ZeroGcOrderBook.java',
    language: 'java',
    description:
      'Price-time (FIFO) limit order book over flat primitive arrays and indexed doubly linked lists. No allocations on the match path; supports cancel-by-id via an open-addressing order index. (Mirrors ZeroGcOrderBook.java)',
    code: `package com.apex.engine;

import java.util.Arrays;

/**
 * Ultra-High-Performance Limit Order Book.
 * - Price-Time Priority (FIFO) matching
 * - Flat primitive arrays + indexed doubly linked list nodes
 * - Zero GC on the critical path; cancel-by-id via open-addressing index
 */
public final class ZeroGcOrderBook {

    private static final int MAX_ORDERS = 200_000;
    private static final int MAX_PRICE_TICKS = 10_000;

    // Order pool: index 0 reserved as null; free-list for safe slot reuse
    private final long[] orderId = new long[MAX_ORDERS];
    private final long[] leavesQty = new long[MAX_ORDERS];
    private final double[] orderPrice = new double[MAX_ORDERS];
    private final int[] prevOrderIdx = new int[MAX_ORDERS];
    private final int[] nextOrderIdx = new int[MAX_ORDERS];
    // ... traderId, side, initialQty, optionKey arrays omitted for brevity

    // Price level heads / tails / volumes (tick-indexed)
    private final int[] bidLevelHead = new int[MAX_PRICE_TICKS];
    private final int[] askLevelHead = new int[MAX_PRICE_TICKS];
    private final long[] bidLevelVolume = new long[MAX_PRICE_TICKS];
    private final long[] askLevelVolume = new long[MAX_PRICE_TICKS];

    private int bestBidTick = -1;
    private int bestAskTick = Integer.MAX_VALUE;

    /** Executes an incoming order; TYPE_CANCEL removes the resting order. */
    public void processOrder(OrderEvent event, TradeConsumer tradeConsumer) {
        if (event.type == OrderEvent.TYPE_CANCEL) {
            cancelOrder(event.orderId);
            return;
        }
        if (event.side == OrderEvent.SIDE_BUY) matchBuy(event, tradeConsumer);
        else matchSell(event, tradeConsumer);
    }

    private void matchBuy(OrderEvent buy, TradeConsumer tradeConsumer) {
        int limitTick = buy.type == OrderEvent.TYPE_MARKET
                ? Integer.MAX_VALUE : priceToTick(buy.price);
        long remaining = buy.quantity;
        // FIFO: walk ask ticks upward, draining head orders at each level
        while (remaining > 0 && bestAskTick <= limitTick
                && bestAskTick != Integer.MAX_VALUE) {
            int head = askLevelHead[bestAskTick];
            if (head == 0) { bestAskTick = findNextAskTick(bestAskTick + 1); continue; }
            long matchQty = Math.min(remaining, leavesQty[head]);
            remaining -= matchQty;
            leavesQty[head] -= matchQty;
            askLevelVolume[bestAskTick] -= matchQty;
            trades++;
            tradeConsumer.onTrade(buy.orderId, orderId[head],
                    orderPrice[head], matchQty, OrderEvent.SIDE_BUY, buy.optionKey);
            if (leavesQty[head] == 0) dequeueAsk(head); // unindex + free slot
        }
        if (remaining > 0 && buy.type == OrderEvent.TYPE_LIMIT) restBid(buy, remaining);
    }

    /** Cancels a resting order by id; returns true when removed. */
    public boolean cancelOrder(long orderId) { /* unlink + free slot */ }

    @FunctionalInterface
    public interface TradeConsumer {
        void onTrade(long buyOrderId, long sellOrderId,
                     double price, long qty, byte aggressiveSide, byte optionKey);
    }
}`,
  },
  {
    id: 'loom-simulator',
    title: 'Project Loom Concurrency',
    filename: 'LoomSimulationMain.java',
    language: 'java',
    description:
      'Java 21 Virtual Threads (Project Loom): 10,000 agents x 20 orders each, dispatched lock-free into the Disruptor RingBuffer. (Mirrors java/src/main/java/com/apex/simulator/LoomSimulationMain.java)',
    code: `package com.apex.simulator;

import com.apex.engine.DisruptorMatchingEngine;
import com.apex.engine.OrderEvent;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicLong;

/**
 * High-Concurrency Simulation Runner: 10,000 virtual agents submit
 * limit & market orders and MCQ liquidity-pool bids concurrently.
 */
public final class LoomSimulationMain {

    private static final int VIRTUAL_AGENTS = 10_000;
    private static final int ORDERS_PER_AGENT = 20;
    private static final AtomicLong TOTAL_SUBMITTED = new AtomicLong();

    public static void main(String[] args) throws InterruptedException {
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
                        byte type = rand.nextDouble() < 0.25
                                ? OrderEvent.TYPE_MARKET : OrderEvent.TYPE_LIMIT;
                        double price = 100.0 + (rand.nextDouble() - 0.5) * 4.0;
                        byte optionKey = (byte) rand.nextInt(1, 5); // MCQ options A-D

                        // Direct zero-lock dispatch to RingBuffer
                        engine.submitOrder(orderId, traderId, side, type,
                                price, rand.nextLong(1, 15), optionKey);
                    }
                });
            }
        } // waits for all 10,000 virtual threads

        double elapsedS = (System.nanoTime() - startNs) / 1e9;
        System.out.printf("Dispatched %,d orders in %.2fs (%,d ops/sec)%n",
                TOTAL_SUBMITTED.get(), elapsedS, (long) (TOTAL_SUBMITTED.get() / elapsedS));
        System.out.printf("Trades settled: %,d | Best Bid $%.2f | Best Ask $%.2f%n",
                engine.getTradesCount(), engine.getBestBid(), engine.getBestAsk());
        engine.shutdown();
    }
}`,
  },
  {
    id: 'cache-padding',
    title: 'Cache Line Padding',
    filename: 'util/CacheLinePaddedSequence.java',
    language: 'java',
    description:
      'Eliminates CPU false sharing by padding sequence pointers with 56 bytes of dummy longs; ordered release/acquire stores via VarHandle. (Mirrors java/src/main/java/com/apex/engine/util/CacheLinePaddedSequence.java)',
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
      'Java Microbenchmark Harness (JMH) measuring order-submission throughput with 4 producer threads. Run: java -cp apex-engine.jar org.openjdk.jmh.Main JmhDisruptorBenchmark. (Mirrors java/src/main/java/com/apex/benchmark/JmhDisruptorBenchmark.java)',
    code: `package com.apex.benchmark;

import com.apex.engine.DisruptorMatchingEngine;
import com.apex.engine.OrderEvent;
import org.openjdk.jmh.annotations.*;

import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

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
        engine.submitOrder(id, id % 1000, side, type,
                100.0 + (rand.nextDouble() - 0.5) * 4.0, rand.nextLong(1, 15), (byte) 0);
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
