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

  return (
    <div className="min-h-screen bg-[#0B0F19] flex flex-col font-sans text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        onPrimaryAction={handlePrimaryAction}
        primaryActionLabel={getPrimaryActionLabel()}
      />

      <main className="flex-1 w-full overflow-hidden">
        {activeTab === 'whiteboard' && <WhiteboardStudio />}
        {activeTab === 'engine' && <MatchingEngineStudio />}
        {activeTab === 'mcq' && <MCQConsensusView />}
        {activeTab === 'java' && <JavaArchitectureViewer />}
      </main>
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
