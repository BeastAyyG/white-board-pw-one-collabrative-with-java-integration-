# Apex Engineering Workbench

A dual-system engineering workbench: a **real-time collaborative whiteboard** with live bot collaborators, and a **high-throughput order matching engine** built on the LMAX Disruptor pattern, with a production-grade **Java 21 backend**.

## What is inside

| Area | Tech | Highlights |
|---|---|---|
| Collaborative whiteboard | React + Canvas | Pen, shapes, arrows, stickies, text, eraser, undo/redo, PNG/JSON export, bot swarm with behavior modes (architect / ideator / explorer), click-to-follow camera |
| Matching engine studio | TypeScript | Price-time (FIFO) matching, L2 depth ladder, live trade tape, Disruptor ring-buffer visualizer, latency telemetry, manual order entry, 10k load bursts |
| MCQ consensus arena | TypeScript | Thousands of simulated voters bidding confidence tokens; live consensus odds |
| Java backend | Java 21, LMAX Disruptor 4, Netty, Jackson, Agrona, JMH | Zero-GC order book, memory-mapped WAL journaler, UDP replication, virtual-thread whiteboard WebSocket server with rooms + snapshots |

## Frontend (web workbench)

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build -> dist/
npm run lint     # tsc --noEmit
```

Frontend tests (node:test, no runner needed):

```bash
npx tsx --test src/engine/matchingEngine.test.ts src/whiteboard/canvasModel.test.ts
```

## Java backend

Requirements: JDK 21 and Maven.

```bash
cd java
mvn package                 # runs all JUnit tests, builds apex-engine.jar (fat jar)

# One-shot demo: seed book, market sweep, cancel, WAL replay proof
java -jar target/apex-engine.jar

# Collaborative whiteboard WebSocket server (rooms, snapshots, cursor relay)
java -cp target/apex-engine.jar com.apex.whiteboard.WhiteboardServer 8080
# -> ws://localhost:8080/ws/whiteboard

# 10,000 Project Loom virtual-thread order simulation
java -cp target/apex-engine.jar com.apex.simulator.LoomSimulationMain

# JMH throughput benchmark
java -cp target/apex-engine.jar org.openjdk.jmh.Main JmhDisruptorBenchmark
```

Useful JVM flags:

```bash
-Dapex.wal.dir=./wal            # write-ahead log directory (default ./wal)
-Dapex.replicate=host:port      # best-effort UDP replication target (off by default)
```

### Java sources (`java/src/main/java/com/apex/`)

- `engine/DisruptorMatchingEngine.java` - LMAX Disruptor pipeline: journaler + replicator (stage 1, parallel) -> single-threaded matching core (stage 2)
- `engine/ZeroGcOrderBook.java` - price-time FIFO book over flat primitive arrays; indexed doubly linked lists; cancel-by-id; free-list slot reuse; zero allocation on the match path
- `engine/OrderEvent.java` - pre-allocated ring-buffer event
- `engine/WriteAheadLog.java` - memory-mapped WAL, fixed 64-byte records, 64 MiB segments, replay support
- `engine/UdpReplicator.java` - best-effort UDP replication (enabled via `-Dapex.replicate`)
- `engine/util/CacheLinePaddedSequence.java` - false-sharing-free sequence counter
- `whiteboard/WhiteboardServer.java` - Netty WebSocket server, virtual-thread workers, rooms, snapshot-on-join
- `simulator/LoomSimulationMain.java` - 10k virtual threads x 20 orders
- `benchmark/JmhDisruptorBenchmark.java` - JMH throughput benchmark
- `demo/EngineDemoMain.java` - runnable end-to-end demo

### Whiteboard wire protocol (JSON text frames)

```jsonc
// join a room (server replies with a snapshot of current elements)
{"type":"join","room":"main","user":"Asha","color":"#38BDF8"}
// upsert an element (stored last-write-wins, relayed to the room)
{"type":"element","room":"main","action":"upsert","element":{"id":"el-1","type":"sticky","x":10,"y":20,"text":"hi"}}
{"type":"delete","room":"main","id":"el-1"}
{"type":"clear","room":"main"}
// cursor positions are relayed, never stored
{"type":"cursor","room":"main","user":"Asha","x":120.5,"y":300.0}
{"type":"leave","room":"main"}
// server -> client
{"type":"snapshot","room":"main","elements":[...]}
{"type":"presence","room":"main","event":"join","user":"Asha"}
```

## Project layout

```
src/                        # React workbench
  components/Whiteboard/    # canvas studio + bot swarm
  components/MatchingEngine/# engine studio + MCQ consensus view
  components/JavaArchitecture/ # copyable Java 21 blueprints (mirror java/)
  engine/                   # TS matching engine + ring-buffer model + tests
  whiteboard/               # canvas model + tests
java/                       # Java 21 backend (Maven)
  src/main/java/com/apex/...
  src/test/java/com/apex/...# JUnit 5 tests
```

The code shown in the **Java Architecture** tab mirrors the real sources under `java/`; both were written to stay in sync.
