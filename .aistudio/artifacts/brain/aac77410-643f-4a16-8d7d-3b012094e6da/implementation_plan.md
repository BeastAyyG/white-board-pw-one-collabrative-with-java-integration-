# Real-Time Collaborative Whiteboard & High-Performance Order Matching Engine

An interactive dual-system engineering workbench and simulation platform combining a live multi-user collaborative whiteboard with virtual bot participants, a high-throughput Price-Time Priority FIFO matching engine modeled on the LMAX Disruptor pattern, and a production Java 21+ low-latency architectural blueprint.

### User Review & Critical Decisions

> [!IMPORTANT]
> The clarifying interview confirmed three foundational requirements:
> - **Primary Deliverable**: Real-time collaborative whiteboard with live virtual participants and interactive canvas tools.
> - **Multi-User Simulation**: Configurable bots and virtual agents interacting concurrently on both the whiteboard and matching pools (simulating thousands of operations).
> - **Matching Architecture**: Ultra-low-latency Price-Time Priority (FIFO) order matching engine utilizing the LMAX Disruptor ring-buffer pattern, capable of processing order books and live virtual MCQ consensus bidding.

- **Confirmed Decision 1**: Dual-mode workbench allowing seamless switching between the **Collaborative Whiteboard** (with live bot cursor/drawing swarms) and the **Disruptor Matching Engine** (with live order book, trade tape, LMAX ring-buffer inspector, and MCQ consensus auction).
- **Confirmed Decision 2**: Built-in interactive Java Architecture & Code Blueprint tab providing copy-ready, production-grade Java 21 code (Project Loom virtual threads, LMAX Disruptor 4.x, cache-line padding, Agrona primitives, and JMH benchmark configurations).

---

## 1. Overview & Core Concept

### What It Does
1. **Collaborative Whiteboard Studio**:
   - Interactive vector canvas supporting freehand drawing, geometric shapes (rectangles, ellipses, arrows, flow nodes), sticky notes, rich text, and selection/transform tools.
   - Live virtual collaboration: Spawn 5 to 500+ simulated bot collaborators that move realistic cursors, brainstorm ideas on sticky notes, connect architecture diagrams, and broadcast real-time state mutations.
   - Multi-user presence bar with participant avatars, activity indicators, color tags, and follow-user camera tracking.

2. **High-Performance Order Matching Engine (LMAX Disruptor Pattern)**:
   - Price-Time Priority (FIFO) matching engine executing limit orders, market orders, cancel requests, and trade settlement.
   - Dual-scenario modes:
     - *Financial Market Order Book*: Level 2 depth ladder (Bids vs Asks), spread calculation, order book depth charts, and real-time execution tape.
     - *Virtual MCQ Consensus / Prediction Market*: Thousands of simulated participants submit weighted predictions and bids on multiple-choice questions, matching consensus bets with microsecond resolution.
   - Visual LMAX Disruptor Ring Buffer: Live interactive visualization of RingBuffer slots, Producer Cursor, Gating Sequences, Batch Consumers, and zero-allocation event pipelines.
   - Concurrency Stress Benchmarks: Run simulations pushing 1,000 to 20,000+ orders per second with live throughput (ops/sec), p50/p99/p99.9 latency telemetry, and queue saturation monitors.

3. **Production Java System Blueprint**:
   - In-depth, production-ready Java 21 reference implementation covering:
     - Lock-free memory layout & `@jdk.internal.vm.annotation.Contended` cache-line padding to eliminate false sharing.
     - Disruptor DSL configuration with `BusySpinWaitStrategy` / `YieldingWaitStrategy`.
     - Fast-path limit order book using primitive heaps and flat array doubly linked lists.
     - Netty + Aeron IPC transport architecture for microsecond network ingress.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Whiteboard Collaboration Flow**:
   - User enters the canvas, selects a tool (Pen, Rectangle, Sticky, Arrow, Eraser), and draws freely.
   - User clicks **"Spawn Bot Swarm"**, selects bot behaviors (e.g., *Architecture Designers*, *Sticky Ideators*, *Flow Connectors*), and watches virtual collaborators actively brainstorm, move cursors, and drop sticky notes on the canvas.
   - User can filter or pause bots, follow a specific bot's viewport, undo/redo local actions, or export the canvas to PNG/JSON.

2. **Matching Engine & Simulation Flow**:
   - User switches to the **Matching Engine** tab.
   - Live L2 order book displays real-time bids (green) and asks (red) around a dynamic mid-market price.
   - User can manually submit Limit or Market Buy/Sell orders and observe instant matching in the trade execution log.
   - User adjusts the **Simulation Stress Test** controls (e.g., 2,500 active traders, Poisson order arrival, aggressive taker ratio) and toggles the simulation.
   - The LMAX Disruptor Ring Buffer animates sequence claims, producer-consumer barrier locks, and batch event handlers in real time, accompanied by live ops/sec and latency percentiles.

3. **MCQ Consensus Mode**:
   - Switches order book into a Multi-Choice Question Virtual Arena (Options A, B, C, D).
   - Thousands of simulated students/traders bet confidence tokens, matching liquidity pools to find the dynamic consensus probability in real-time.

### Visual Identity & Theme
- **Aesthetic Direction**: High-precision engineering workbench with a sleek dark slate canvas (`#0A0E17`), clean technical hairline dividers (`#1E293B`), and vibrant functional accenting.
- **Color Palette**:
  - Background Neutral: `#0B0F19` (Canvas deep background) and `#111827` (Panel surfaces).
  - Accent Bids / Success: `#10B981` (Emerald 500)
  - Accent Asks / Alerts: `#F43F5E` (Rose 500)
  - Disruptor Sequence Ring: `#6366F1` (Indigo 500) and `#38BDF8` (Sky 400)
  - Whiteboard Sticky Notes: `#FEF08A` (Yellow), `#BFDBFE` (Blue), `#BBF7D0` (Green), `#FBCFE8` (Pink).
- **Typography**:
  - Primary UI: `Plus Jakarta Sans` or modern clean sans-serif for sharp navigational clarity.
  - Telemetry & Metrics: Monospace with tabular numerals (`font-mono tabular-nums`) for jitter-free prices, order quantities, nanosecond latencies, and execution counters.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Client-Side High-Speed Engine Simulation + Full Java Production Code vs. Server-Only Proxy**:
  - *Chosen Approach*: Implement a zero-allocation, lock-free ring-buffer simulator in TypeScript that runs at 60 FPS in the browser for immediate interactive tactile feedback, coupled with full copyable Java 21 source code files and architecture specs.
  - *Why*: Allows instant hands-on manipulation, visual ring-buffer step-through, and stress testing of thousands of simulated agents directly in the UI without server cold-starts or network throttling.
- **Decision 2: Canvas Rendering Strategy for Whiteboard**:
  - *Chosen Approach*: High-performance HTML5 Canvas with vector math, offscreen double-buffering, and React-friendly state layers.
  - *Why*: Renders hundreds of simultaneous cursor interpolations and thousands of vector strokes smoothly at 60 FPS without DOM node bloat.
- **Decision 3: LMAX Disruptor Mechanical Sympathy Model**:
  - *Chosen Approach*: Faithfully replicate the 3-stage pipeline (Journaler/Replication -> Matching Engine Single Thread -> Gateway Marshaller) with sequence barriers and ring-buffer visualization.
  - *Why*: Gives users direct visual comprehension of why single-threaded lock-free architectures outperform multi-threaded locked data structures by 100x.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Application Shell & Top Bar                      │
│   [Platform Title] — [Whiteboard | Matching Engine | Java Specs] — [Controls]│
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         ▼                                                       ▼
┌─────────────────────────────────┐   ┌──────────────────────────────────┐
│   Collaborative Whiteboard      │   │   High-Performance Engine        │
│  ┌───────────────────────────┐  │   │  ┌────────────────────────────┐  │
│  │ HTML5 Vector Canvas Engine│  │   │  │ L2 Order Book Ladder       │  │
│  │ - Freehand, Shapes, Text  │  │   │  │ - Bids/Asks Price-Time FIFO│  │
│  │ - Sticky Notes & Pointers │  │   │  │ - Trade Execution Tape     │  │
│  └─────────────┬─────────────┘  │   │  └─────────────┬──────────────┘  │
│                │                │   │                │                 │
│  ┌─────────────▼─────────────┐  │   │  ┌─────────────▼──────────────┐  │
│  │ Virtual Bot Swarm Agent   │  │   │  │ LMAX Disruptor Ring Buffer │  │
│  │ - 5 to 500+ Bot Generators│  │   │  │ - Sequencer & Ring Slots   │  │
│  │ - Spatial Clustering      │  │   │  │ - Batch Event Handlers     │  │
│  │ - Smooth Cursor Vectors   │  │   │  │ - Latency Telemetry (p99)  │  │
│  └───────────────────────────┘  │   │  └─────────────┬──────────────┘  │
│                                 │   │                │                 │
│                                 │   │  ┌─────────────▼──────────────┐  │
│                                 │   │  │ MCQ Virtual Consensus Pool │  │
│                                 │   │  │ - Thousands of multi-choice│  │
│                                 │   │  │   answer tokens matched    │  │
│                                 │   │  └────────────────────────────┘  │
└─────────────────────────────────┘   └──────────────────────────────────┘
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         ▼                                                       ▼
┌─────────────────────────────────┐   ┌──────────────────────────────────┐
│   Java 21 Architecture Center   │   │   Deterministic Unit Tests       │
│  - Disruptor Engine Benchmark   │   │  - FIFO Price-Time Match Logic   │
│  - Project Loom Virtual Threads │   │  - RingBuffer Sequence Math      │
│  - Cache-Line Padded Queues     │   │  - Whiteboard Vector Bounds      │
└─────────────────────────────────┘   └──────────────────────────────────┘
```

### Data Models & State Contracts
1. **Order & Trade Entities**:
   - `Order`: `{ id, side: 'BUY' | 'SELL', price: number, size: number, timestamp: number, type: 'LIMIT' | 'MARKET', traderId: string }`
   - `Trade`: `{ id, buyOrderId, sellOrderId, price, size, timestamp, aggressiveSide }`
   - `OrderBookLevel`: `{ price: number, totalVolume: number, orderCount: number, orders: Order[] }`
2. **Ring Buffer Event**:
   - `OrderEvent`: `{ sequence: number, order: Order, processedTimestamp: number, state: 'UNALLOCATED' | 'PUBLISHED' | 'MATCHED' | 'REJECTED' }`
3. **Whiteboard Canvas Entity**:
   - `CanvasElement`: `{ id, type: 'stroke' | 'rectangle' | 'ellipse' | 'sticky' | 'arrow' | 'text', points, x, y, width, height, color, text, authorId, updatedAt }`
   - `Collaborator`: `{ id, name, color, cursor: { x, y }, activeTool, isBot: boolean, lastAction }`
