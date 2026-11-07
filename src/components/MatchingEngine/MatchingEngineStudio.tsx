import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Zap,
  Play,
  Pause,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Activity,
  Layers,
  BarChart3,
  TrendingUp,
  Cpu,
  Clock
} from 'lucide-react';
import { MatchingEngine } from '../../engine/matchingEngine.ts';
import { DisruptorRingBuffer } from '../../engine/ringBuffer.ts';
import { Order, Trade, OrderBookState, OrderSide, OrderType, DisruptorMetrics } from '../../types/index.ts';

export const MatchingEngineStudio: React.FC = () => {
  // Matching Engine & Disruptor Instances (persisted in refs)
  const engineRef = useRef<MatchingEngine>(new MatchingEngine(100.0));
  const ringBufferRef = useRef<DisruptorRingBuffer>(new DisruptorRingBuffer(64));

  // Market & Order Book State
  const [orderBook, setOrderBook] = useState<OrderBookState>(() =>
    engineRef.current.getOrderBookState()
  );
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);

  // Simulation Controls State
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [simulatedTradersCount, setSimulatedTradersCount] = useState<number>(1000);
  const [targetOpsPerSec, setTargetOpsPerSec] = useState<number>(2500);

  // Manual Order Input State
  const [orderSide, setOrderSide] = useState<OrderSide>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('LIMIT');
  const [orderPrice, setOrderPrice] = useState<number>(100.0);
  const [orderSize, setOrderSize] = useState<number>(5);

  // Performance Telemetry
  const [metrics, setMetrics] = useState<DisruptorMetrics>({
    totalProcessed: 0,
    throughputOpsSec: 0,
    avgLatencyUs: 1.2,
    p99LatencyUs: 3.4,
    maxLatencyUs: 7.8,
    ringCapacity: 64,
    producerCursor: 0,
    consumerCursor: 0,
    ringBufferUsage: 12,
  });

  const lastProcessedCount = useRef<number>(0);
  const totalProcessedRef = useRef<number>(0);
  const latencySamples = useRef<number[]>([]);

  // Initialize seed orders into the book for realistic depth
  useEffect(() => {
    const engine = engineRef.current;
    // Seed initial bids
    for (let i = 1; i <= 6; i++) {
      engine.processOrder({
        id: `seed-bid-${i}`,
        traderId: `mm-bid-${i}`,
        traderName: `MarketMaker_B${i}`,
        side: 'BUY',
        type: 'LIMIT',
        price: Number((100.0 - i * 0.25).toFixed(2)),
        size: Math.floor(10 + Math.random() * 40),
      });
    }
    // Seed initial asks
    for (let i = 1; i <= 6; i++) {
      engine.processOrder({
        id: `seed-ask-${i}`,
        traderId: `mm-ask-${i}`,
        traderName: `MarketMaker_A${i}`,
        side: 'SELL',
        type: 'LIMIT',
        price: Number((100.0 + i * 0.25).toFixed(2)),
        size: Math.floor(10 + Math.random() * 40),
      });
    }
    setOrderBook(engine.getOrderBookState());
  }, []);

  // Simulation generator loop
  useEffect(() => {
    if (!isSimulating) return;

    // Run batch bursts every 50ms to reach desired targetOpsPerSec
    const batchIntervalMs = 50;
    const batchSize = Math.max(1, Math.round((targetOpsPerSec * batchIntervalMs) / 1000));

    const interval = setInterval(() => {
      const engine = engineRef.current;
      const ring = ringBufferRef.current;

      const basePrice = engine.getOrderBookState().midPrice || 100.0;

      for (let i = 0; i < batchSize; i++) {
        const side: OrderSide = Math.random() > 0.5 ? 'BUY' : 'SELL';
        const isMarket = Math.random() < 0.2; // 20% aggressive market orders
        const delta = (Math.random() - 0.5) * 1.5;
        const price = isMarket
          ? 0
          : Number(Math.max(10, side === 'BUY' ? basePrice - Math.abs(delta) : basePrice + Math.abs(delta)).toFixed(2));
        const size = Math.floor(1 + Math.random() * 15);
        const traderIdx = Math.floor(Math.random() * simulatedTradersCount);

        const order: Order = {
          id: `sim-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
          traderId: `agent-${traderIdx}`,
          traderName: `Trader_${traderIdx}`,
          side,
          type: isMarket ? 'MARKET' : 'LIMIT',
          price,
          size,
          filledSize: 0,
          timestamp: Date.now(),
          status: 'NEW',
        };

        const t0 = performance.now();

        // 1. Publish into Disruptor RingBuffer
        ring.publish(order);

        // 2. Step Journaler (WAL)
        ring.stepJournaler(1);

        // 3. Step Matching Core
        ring.stepMatching(1, (o) => {
          engine.processOrder(o);
        });

        // 4. Step Gateway Dispatcher
        ring.stepPublisher(1);

        const t1 = performance.now();
        const latencyUs = (t1 - t0) * 1000;
        latencySamples.current.push(latencyUs);
        if (latencySamples.current.length > 200) latencySamples.current.shift();

        totalProcessedRef.current++;
      }

      // Update state at throttled frame rate
      setOrderBook(engine.getOrderBookState());
      setRecentTrades(engine.getRecentTrades().slice(0, 15));
    }, batchIntervalMs);

    return () => clearInterval(interval);
  }, [isSimulating, targetOpsPerSec, simulatedTradersCount]);

  // Telemetry calculation loop (every 500ms)
  useEffect(() => {
    const timer = setInterval(() => {
      const currentCount = totalProcessedRef.current;
      const delta = currentCount - lastProcessedCount.current;
      lastProcessedCount.current = currentCount;
      const throughput = delta * 2; // 500ms interval => * 2 for ops/sec

      const samples = latencySamples.current;
      let avg = 1.2;
      let p99 = 3.4;
      let max = 7.8;

      if (samples.length > 0) {
        const sorted = [...samples].sort((a, b) => a - b);
        avg = Number((samples.reduce((s, v) => s + v, 0) / samples.length).toFixed(1));
        p99 = Number((sorted[Math.floor(sorted.length * 0.99)] || avg).toFixed(1));
        max = Number((sorted[sorted.length - 1] || avg).toFixed(1));
      }

      const ring = ringBufferRef.current;
      const cursors = ring.getCursors();

      setMetrics({
        totalProcessed: currentCount,
        throughputOpsSec: throughput,
        avgLatencyUs: avg,
        p99LatencyUs: p99,
        maxLatencyUs: max,
        ringCapacity: ring.capacity,
        producerCursor: cursors.producer,
        consumerCursor: cursors.matching,
        ringBufferUsage: ring.getBufferUtilization(),
      });
    }, 500);

    return () => clearInterval(timer);
  }, []);

  // Handle Manual Order Submission
  const handleManualOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const engine = engineRef.current;
    const ring = ringBufferRef.current;

    const order: Order = {
      id: `manual-${Date.now()}`,
      traderId: 'user-trader',
      traderName: 'You (Host)',
      side: orderSide,
      type: orderType,
      price: orderType === 'MARKET' ? 0 : orderPrice,
      size: orderSize,
      filledSize: 0,
      timestamp: Date.now(),
      status: 'NEW',
    };

    ring.publish(order);
    ring.stepJournaler(1);
    ring.stepMatching(1, (o) => engine.processOrder(o));
    ring.stepPublisher(1);

    setOrderBook(engine.getOrderBookState());
    setRecentTrades(engine.getRecentTrades().slice(0, 15));
    totalProcessedRef.current++;
  };

  // Burst Injector
  const handleInjectBurst = () => {    const engine = engineRef.current;
    const ring = ringBufferRef.current;
    const basePrice = engine.getOrderBookState().midPrice || 100.0;

    for (let i = 0; i < 500; i++) {
      const side: OrderSide = Math.random() > 0.5 ? 'BUY' : 'SELL';
      const isMarket = Math.random() < 0.35;
      const delta = (Math.random() - 0.5) * 2;
      const price = isMarket ? 0 : Number((basePrice + delta).toFixed(2));
      const size = Math.floor(1 + Math.random() * 20);

      const order: Order = {
        id: `burst-${Date.now()}-${i}`,
        traderId: `burst-agent-${i}`,
        traderName: `BurstBot_${i}`,
        side,
        type: isMarket ? 'MARKET' : 'LIMIT',
        price,
        size,
        filledSize: 0,
        timestamp: Date.now(),
        status: 'NEW',
      };

      ring.publish(order);
      ring.stepJournaler(1);
      ring.stepMatching(1, (o) => engine.processOrder(o));
      ring.stepPublisher(1);
      totalProcessedRef.current++;
    }

    setOrderBook(engine.getOrderBookState());
    setRecentTrades(engine.getRecentTrades().slice(0, 15));
  };

  // Header "Inject 10k Load Burst" primary action -> run a 10k burst (20 x 500).
  const burstHandlerRef = useRef(handleInjectBurst);
  burstHandlerRef.current = handleInjectBurst;
  useEffect(() => {
    const onBurst = () => {
      for (let i = 0; i < 20; i++) burstHandlerRef.current();
    };
    window.addEventListener('apex:inject-burst', onBurst);
    return () => window.removeEventListener('apex:inject-burst', onBurst);
  }, []);

  // Max volume in visible book for scaling depth bars
  const maxVolume = useMemo(() => {
    const allVols = [
      ...orderBook.bids.map((b) => b.totalVolume),
      ...orderBook.asks.map((a) => a.totalVolume),
    ];
    return Math.max(1, ...allVols);
  }, [orderBook]);

  const ringSlots = ringBufferRef.current.getSlots();

  return (
    <div className="w-full h-full bg-[#008080] text-black p-6 flex flex-col gap-5 select-none overflow-y-auto">
      {/* Top Telemetry KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-white border border-black rounded-none p-3.5 flex flex-col">
          <div className="flex items-center justify-between text-xs text-[#404040] mb-1">
            <span>Throughput</span>
            <Flame className="w-3.5 h-3.5 text-[#92400E]" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-black flex items-baseline gap-1.5">
            {metrics.throughputOpsSec.toLocaleString()}
            <span className="text-xs font-normal text-[#404040]">ops/sec</span>
          </div>
        </div>

        <div className="bg-white border border-black rounded-none p-3.5 flex flex-col">
          <div className="flex items-center justify-between text-xs text-[#404040] mb-1">
            <span>p99 Latency</span>
            <Zap className="w-3.5 h-3.5 text-[#0000CD]" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-[#0000CD] flex items-baseline gap-1.5">
            {metrics.p99LatencyUs}
            <span className="text-xs font-normal text-[#404040]">μs</span>
          </div>
        </div>

        <div className="bg-white border border-black rounded-none p-3.5 flex flex-col">
          <div className="flex items-center justify-between text-xs text-[#404040] mb-1">
            <span>Simulated Traders</span>
            <Activity className="w-3.5 h-3.5 text-[#047857]" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-300 flex items-baseline gap-1.5">
            {simulatedTradersCount.toLocaleString()}
            <span className="text-xs font-normal text-[#404040]">agents</span>
          </div>
        </div>

        <div className="bg-white border border-black rounded-none p-3.5 flex flex-col">
          <div className="flex items-center justify-between text-xs text-[#404040] mb-1">
            <span>Mid Price & Spread</span>
            <TrendingUp className="w-3.5 h-3.5 text-[#0369A1]" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-black flex items-baseline gap-2">
            ${orderBook.midPrice.toFixed(2)}
            <span className="text-xs font-medium text-[#404040]">
              spread ${orderBook.spread.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="bg-white border border-black rounded-none p-3.5 flex flex-col">
          <div className="flex items-center justify-between text-xs text-[#404040] mb-1">
            <span>Total Matched</span>
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-purple-300 flex items-baseline gap-1.5">
            {metrics.totalProcessed.toLocaleString()}
            <span className="text-xs font-normal text-[#404040]">events</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Order Book + LMAX RingBuffer + Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: L2 Order Book Ladder (5 Cols) */}
        <div className="lg:col-span-5 bg-white border border-black rounded-none p-4 flex flex-col gap-3 shadow-[4px_4px_0_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between border-b border-black pb-2.5">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#0000CD]" />
              <h2 className="text-sm font-semibold text-black">
                L2 Depth Order Book (FIFO Priority)
              </h2>
            </div>
            <span className="text-xs font-mono text-[#404040]">BTC/USD</span>
          </div>

          {/* Book Headers */}
          <div className="grid grid-cols-3 text-xs font-medium text-black px-2 py-1 bg-[#C0C0C0] rounded-none border border-black">
            <span>Price (USD)</span>
            <span className="text-right">Size</span>
            <span className="text-right">Depth</span>
          </div>

          {/* Asks (Sells) - Sorted ascending */}
          <div className="flex flex-col-reverse gap-0.5">
            {orderBook.asks.slice(0, 6).map((ask) => {
              const depthPct = Math.min(100, Math.round((ask.totalVolume / maxVolume) * 100));
              return (
                <div
                  key={`ask-${ask.price}`}
                  className="relative grid grid-cols-3 text-xs font-mono tabular-nums px-2 py-1.5 rounded hover:bg-[#D4D4D4]/50 transition-colors"
                >
                  <div
                    className="absolute inset-y-0 right-0 bg-rose-500/15 rounded pointer-events-none"
                    style={{ width: `${depthPct}%` }}
                  />
                  <span className="text-[#DC2626] font-semibold relative z-10">
                    ${ask.price.toFixed(2)}
                  </span>
                  <span className="text-right text-[#1F1F1F] relative z-10">{ask.totalVolume}</span>
                  <span className="text-right text-[#404040] relative z-10">{depthPct}%</span>
                </div>
              );
            })}
          </div>

          {/* Mid Market Spread Bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-950/70 border-y border-black rounded-none text-xs font-mono">
            <span className="text-[#D4D4D4]">
              Spread: <strong className="text-white">${orderBook.spread.toFixed(2)}</strong>
            </span>
            <span className="text-[#D4D4D4]">
              Last Executed:{' '}
              <strong className="text-[#047857]">${orderBook.lastTradePrice.toFixed(2)}</strong>
            </span>
          </div>

          {/* Bids (Buys) - Sorted descending */}
          <div className="flex flex-col gap-0.5">
            {orderBook.bids.slice(0, 6).map((bid) => {
              const depthPct = Math.min(100, Math.round((bid.totalVolume / maxVolume) * 100));
              return (
                <div
                  key={`bid-${bid.price}`}
                  className="relative grid grid-cols-3 text-xs font-mono tabular-nums px-2 py-1.5 rounded hover:bg-[#D4D4D4]/50 transition-colors"
                >
                  <div
                    className="absolute inset-y-0 right-0 bg-emerald-500/15 rounded pointer-events-none"
                    style={{ width: `${depthPct}%` }}
                  />
                  <span className="text-[#047857] font-semibold relative z-10">
                    ${bid.price.toFixed(2)}
                  </span>
                  <span className="text-right text-[#1F1F1F] relative z-10">{bid.totalVolume}</span>
                  <span className="text-right text-[#404040] relative z-10">{depthPct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Middle Column: LMAX Disruptor Ring Buffer Visualizer (4 Cols) */}
        <div className="lg:col-span-4 bg-white border border-black rounded-none p-4 flex flex-col gap-3.5 shadow-[4px_4px_0_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between border-b border-black pb-2.5">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0000CD]" />
              <h2 className="text-sm font-semibold text-black">
                LMAX Disruptor RingBuffer (64 Slots)
              </h2>
            </div>
            <span className="text-xs font-mono text-[#0000CD]">
              Usage: {metrics.ringBufferUsage}%
            </span>
          </div>

          {/* Pipeline Stages Legend */}
          <div className="grid grid-cols-2 gap-2 text-[11px] font-medium text-black bg-[#E8E8E8] p-2.5 rounded-none border border-black">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0000CD]" />
              <span>1. Producer Seq: {metrics.producerCursor}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-pink-500" />
              <span>2. WAL Journaler</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>3. Single-Thread Match Core</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
              <span>4. Gateway Publisher</span>
            </div>
          </div>

          {/* 64-Slot Visual Grid */}
          <div className="grid grid-cols-8 gap-1.5 p-2 bg-slate-950/80 rounded-none border border-black/80">
            {ringSlots.map((slot) => {
              let bg = 'bg-[#D4D4D4] border-black text-slate-600';
              if (slot.state === 'PUBLISHED') bg = 'bg-[#0000CD]/80 border-indigo-400 text-white';
              else if (slot.state === 'JOURNALED') bg = 'bg-pink-500/80 border-pink-400 text-white';
              else if (slot.state === 'MATCHED') bg = 'bg-emerald-500/80 border-emerald-400 text-white';
              else if (slot.state === 'DISPATCHED') bg = 'bg-sky-500/50 border-sky-400 text-sky-100';

              return (
                <div
                  key={slot.index}
                  className={`h-7 rounded flex items-center justify-center text-[10px] font-mono border transition-all ${bg}`}
                  title={`Slot #${slot.index} | Seq: ${slot.sequence} | State: ${slot.state}`}
                >
                  {slot.index}
                </div>
              );
            })}
          </div>

          {/* Real-time Trade Execution Tape */}
          <div className="flex flex-col gap-2 mt-auto">
            <div className="flex items-center justify-between text-xs text-[#404040] border-b border-black pb-1">
              <span className="font-semibold text-[#1F1F1F]">Live Trade Tape</span>
              <span className="font-mono">{recentTrades.length} printed</span>
            </div>
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto font-mono text-xs">
              {recentTrades.slice(0, 5).map((tr) => (
                <div
                  key={tr.id}
                  className="flex items-center justify-between px-2 py-1 bg-slate-950/40 rounded"
                >
                  <div className="flex items-center gap-1.5">
                    {tr.aggressiveSide === 'BUY' ? (
                      <ArrowUpRight className="w-3.5 h-3.5 text-[#047857]" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5 text-[#DC2626]" />
                    )}
                    <span
                      className={tr.aggressiveSide === 'BUY' ? 'text-[#047857]' : 'text-[#DC2626]'}
                    >
                      ${tr.price.toFixed(2)}
                    </span>
                  </div>
                  <span className="text-[#1F1F1F]">{tr.size} units</span>
                  <span className="text-[#404040] text-[10px]">
                    {new Date(tr.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Simulation Controller & Order Entry (3 Cols) */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* Concurrency Simulation Control */}
          <div className="bg-white border border-black rounded-none p-4 flex flex-col gap-3 shadow-[4px_4px_0_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-black flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#047857]" />
                Concurrent Multi-User Bot Swarm
              </h3>
            </div>

            {/* Simulated Traders Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-[#404040]">
                <span>Active Virtual Traders</span>
                <span className="font-mono text-[#047857]">{simulatedTradersCount} bots</span>
              </div>
              <input
                type="range"
                min="50"
                max="5000"
                step="50"
                value={simulatedTradersCount}
                onChange={(e) => setSimulatedTradersCount(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Target Ops/Sec Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-[#404040]">
                <span>Load Target (Ops/sec)</span>
                <span className="font-mono text-[#92400E]">{targetOpsPerSec} ops/s</span>
              </div>
              <input
                type="range"
                min="200"
                max="10000"
                step="200"
                value={targetOpsPerSec}
                onChange={(e) => setTargetOpsPerSec(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={() => setIsSimulating(!isSimulating)}
                className={`py-2 px-3 rounded-none text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  isSimulating
                    ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60 hover:bg-rose-900/60'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
                }`}
              >
                {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isSimulating ? 'Pause Load' : 'Start Swarm'}
              </button>

              <button
                onClick={handleInjectBurst}
                className="py-2 px-3 bg-[#0000CD] hover:bg-[#0000CD] text-white rounded-none text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Flame className="w-3.5 h-3.5 text-amber-300" />
                +500 Burst
              </button>
            </div>
          </div>

          {/* Manual Order Entry */}
          <form
            onSubmit={handleManualOrderSubmit}
            className="bg-white border border-black rounded-none p-4 flex flex-col gap-3 shadow-[4px_4px_0_rgba(0,0,0,0.45)]"
          >
            <h3 className="text-sm font-semibold text-black">Submit Manual Order</h3>

            {/* Buy / Sell Buttons */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-none">
              <button
                type="button"
                onClick={() => setOrderSide('BUY')}
                className={`py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  orderSide === 'BUY' ? 'bg-emerald-600 text-white' : 'text-[#404040] hover:text-black'
                }`}
              >
                Buy (Bid)
              </button>
              <button
                type="button"
                onClick={() => setOrderSide('SELL')}
                className={`py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  orderSide === 'SELL' ? 'bg-rose-600 text-white' : 'text-[#404040] hover:text-black'
                }`}
              >
                Sell (Ask)
              </button>
            </div>

            {/* Limit / Market Toggle */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-none">
              <button
                type="button"
                onClick={() => setOrderType('LIMIT')}
                className={`py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  orderType === 'LIMIT' ? 'bg-[#0000CD] text-white' : 'text-[#404040] hover:text-black'
                }`}
              >
                Limit
              </button>
              <button
                type="button"
                onClick={() => setOrderType('MARKET')}
                className={`py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  orderType === 'MARKET' ? 'bg-[#0000CD] text-white' : 'text-[#404040] hover:text-black'
                }`}
              >
                Market
              </button>
            </div>

            {/* Price Field */}
            {orderType === 'LIMIT' && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#404040]">Price (USD)</label>
                <input
                  type="number"
                  step="0.1"
                  value={orderPrice}
                  onChange={(e) => setOrderPrice(Number(e.target.value))}
                  className="bg-slate-950 border border-black rounded-none px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#0000CD]"
                />
              </div>
            )}

            {/* Size Field */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#404040]">Quantity (Units)</label>
              <input
                type="number"
                min="1"
                max="1000"
                value={orderSize}
                onChange={(e) => setOrderSize(Number(e.target.value))}
                className="bg-slate-950 border border-black rounded-none px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#0000CD]"
              />
            </div>

            <button
              type="submit"
              className={`w-full py-2 rounded-none text-xs font-semibold shadow-md transition-all cursor-pointer ${
                orderSide === 'BUY'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-rose-600 hover:bg-rose-500 text-white'
              }`}
            >
              Execute {orderSide} {orderType}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
