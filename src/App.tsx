import React, { useState } from 'react';
import { Header, ActiveTab } from './components/Header.tsx';
import { WhiteboardStudio } from './components/Whiteboard/WhiteboardStudio.tsx';
import { MatchingEngineStudio } from './components/MatchingEngine/MatchingEngineStudio.tsx';
import { MCQConsensusView } from './components/MatchingEngine/MCQConsensusView.tsx';
import { JavaArchitectureViewer } from './components/JavaArchitecture/JavaArchitectureViewer.tsx';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('whiteboard');

  const getPrimaryActionLabel = (): string => {
    switch (activeTab) {
      case 'whiteboard':
        return 'Spawn Bot Swarm';
      case 'engine':
        return 'Inject 10k Load Burst';
      case 'mcq':
        return 'Simulate 5k Voters';
      case 'java':
        return 'Copy Java Quickstart';
    }
  };

  const handlePrimaryAction = () => {
    // The studios listen for these events and act immediately (no remount).
    if (activeTab === 'whiteboard') {
      window.dispatchEvent(new CustomEvent('apex:spawn-bots', { detail: { count: 15 } }));
    } else if (activeTab === 'engine') {
      window.dispatchEvent(new CustomEvent('apex:inject-burst'));
    } else if (activeTab === 'mcq') {
      window.dispatchEvent(new CustomEvent('apex:simulate-voters'));
    } else if (activeTab === 'java') {
      navigator.clipboard.writeText(JAVA_QUICKSTART);
    }
  };

  const tabNames: Record<ActiveTab, string> = {
    whiteboard: 'Whiteboard Studio',
    engine: 'LMAX Disruptor Engine',
    mcq: 'Virtual MCQ Consensus',
    java: 'Java 21 Architecture',
  };

  return (
    <div className="min-h-screen win-desktop flex flex-col font-win text-black antialiased">
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        onPrimaryAction={handlePrimaryAction}
        primaryActionLabel={getPrimaryActionLabel()}
      />

      <main className="flex-1 w-full overflow-hidden min-h-0">
        {activeTab === 'whiteboard' && <WhiteboardStudio />}
        {activeTab === 'engine' && <MatchingEngineStudio />}
        {activeTab === 'mcq' && <MCQConsensusView />}
        {activeTab === 'java' && <JavaArchitectureViewer />}
      </main>

      {/* Taskbar */}
      <footer className="win-taskbar h-10 shrink-0 flex items-center gap-2 px-2 text-black select-none">
        <button
          type="button"
          className="win-btn px-3 py-1 text-sm font-bold flex items-center gap-1.5"
          title="the null pointers"
        >
          <span aria-hidden="true">&#9632;</span> Start
        </button>
        <span className="win-sunken px-2 py-1 text-xs truncate">
          {tabNames[activeTab]}
        </span>
        <span className="ml-auto font-pixel text-xl leading-none tracking-wide">
          SRM UNIVERSITY, AP | 2026 - 27
        </span>
      </footer>
    </div>
  );
}

// Real, runnable quickstart for the Java backend (matches java/ sources).
const JAVA_QUICKSTART = `# Apex Java backend quickstart (needs JDK 21 + Maven)
cd java
mvn -q package -DskipTests          # builds apex-engine.jar (fat jar)
java -jar target/apex-engine.jar    # runs the EngineDemoMain walkthrough

# Whiteboard WebSocket server (rooms, snapshots, cursor relay)
java -cp target/apex-engine.jar com.apex.whiteboard.WhiteboardServer 8080
# -> ws://localhost:8080/ws/whiteboard  (protocol documented in README.md)

# 10,000 virtual-thread order simulation
java -cp target/apex-engine.jar com.apex.simulator.LoomSimulationMain

# JMH throughput benchmark
java -cp target/apex-engine.jar org.openjdk.jmh.Main JmhDisruptorBenchmark

# Optional knobs
# -Dapex.wal.dir=./wal            # write-ahead log directory (default ./wal)
# -Dapex.replicate=host:port      # best-effort UDP replication target
`;
