import React, { useState } from 'react';
import { Header, ActiveTab } from './components/Header.tsx';
import { WhiteboardStudio } from './components/Whiteboard/WhiteboardStudio.tsx';
import { MatchingEngineStudio } from './components/MatchingEngine/MatchingEngineStudio.tsx';
import { MCQConsensusView } from './components/MatchingEngine/MCQConsensusView.tsx';
import { JavaArchitectureViewer } from './components/JavaArchitecture/JavaArchitectureViewer.tsx';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('whiteboard');
  const [actionTrigger, setActionTrigger] = useState<number>(0);

  const getPrimaryActionLabel = (): string => {
    switch (activeTab) {
      case 'whiteboard':
        return 'Spawn Bot Swarm';
      case 'engine':
        return 'Inject 10k Load Burst';
      case 'mcq':
        return 'Simulate 5k Voters';
      case 'java':
        return 'Copy Java Blueprint';
    }
  };

  const handlePrimaryAction = () => {
    setActionTrigger((prev) => prev + 1);

    if (activeTab === 'java') {
      navigator.clipboard.writeText(`// Apex Low-Latency Disruptor & Matching Engine Blueprint for Java 21
// See full architecture tabs inside the Java Architecture Explorer.`);
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
        {activeTab === 'whiteboard' && <WhiteboardStudio key={`wb-${actionTrigger}`} />}
        {activeTab === 'engine' && <MatchingEngineStudio key={`eng-${actionTrigger}`} />}
        {activeTab === 'mcq' && <MCQConsensusView key={`mcq-${actionTrigger}`} />}
        {activeTab === 'java' && <JavaArchitectureViewer />}
      </main>
    </div>
  );
}
