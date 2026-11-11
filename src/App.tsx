import React, { useEffect, useState } from 'react';
import { Activity, FileCode, HelpCircle, Layers, Trash2 } from 'lucide-react';
import { Header, ActiveTab } from './components/Header.tsx';
import { WhiteboardStudio } from './components/Whiteboard/WhiteboardStudio.tsx';
import { MatchingEngineStudio } from './components/MatchingEngine/MatchingEngineStudio.tsx';
import { MCQConsensusView } from './components/MatchingEngine/MCQConsensusView.tsx';
import { JavaArchitectureViewer } from './components/JavaArchitecture/JavaArchitectureViewer.tsx';

type WindowState = 'maximized' | 'windowed' | 'minimized';
type DialogKind = 'about' | 'recycle' | 'close-confirm' | null;

const MARQUEE_TEXT =
  'COLLABORATIVE WHITEBOARD \u2022 THE NULL POINTERS \u2022 SRM UNIVERSITY AP \u2022 CSE 213 \u2022 ';

const DESKTOP_ICONS: {
  id: ActiveTab | 'recycle';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'whiteboard', label: 'Whiteboard', icon: Layers },
  { id: 'engine', label: 'Matching Engine', icon: Activity },
  { id: 'mcq', label: 'MCQ Consensus', icon: HelpCircle },
  { id: 'java', label: 'Java 21', icon: FileCode },
  { id: 'recycle', label: 'Recycle Bin', icon: Trash2 },
];

const START_MENU_TABS: {
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'whiteboard', label: 'Whiteboard Studio', icon: Layers },
  { id: 'mcq', label: 'Virtual MCQ Consensus', icon: HelpCircle },
  { id: 'java', label: 'Java 21 Architecture', icon: FileCode },
];

function formatClock(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('whiteboard');
  const [windowState, setWindowState] = useState<WindowState>('maximized');
  const [startOpen, setStartOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [clock, setClock] = useState(() => formatClock(new Date()));

  useEffect(() => {
    const t = setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => clearInterval(t);
  }, []);

  const getPrimaryActionLabel = (): string => {
    switch (activeTab) {
      case 'whiteboard':
        return 'Spawn Bot Swarm';
      case 'engine':
        return 'Inject 10k Load Burst';
      case 'mcq':
        return 'Poll Control';
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
      // The quiz decides: start the poll, reveal the answer, or next question.
      window.dispatchEvent(new CustomEvent('apex:mcq-primary'));
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

  const openTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setWindowState('maximized');
    setStartOpen(false);
  };

  const toggleTaskbarButton = () => {
    setWindowState((s) => (s === 'minimized' ? 'maximized' : 'minimized'));
    setStartOpen(false);
  };

  const titleBar = (
    <div className="win-titlebar-gradient flex items-center gap-2 px-2 h-9 shrink-0 select-none">
      <span className="w-6 h-6 bg-[#0000CD] border border-white/60 flex items-center justify-center text-white text-sm leading-none shrink-0">
        &#9783;
      </span>
      <span className="font-pixel text-2xl leading-none text-white tracking-wide truncate">
        Collaborative Whiteboard - the null pointers
      </span>
      <span className="ml-auto flex items-center gap-1">
        <button type="button" className="win-title-btn" title="About" onClick={() => setDialog('about')}>
          ?
        </button>
        <button
          type="button"
          className="win-title-btn"
          title="Minimize"
          onClick={() => setWindowState('minimized')}
        >
          _
        </button>
        <button
          type="button"
          className="win-title-btn"
          title={windowState === 'windowed' ? 'Maximize' : 'Restore'}
          onClick={() => setWindowState(windowState === 'windowed' ? 'maximized' : 'windowed')}
        >
          &#9633;
        </button>
        <button type="button" className="win-title-btn" title="Close" onClick={() => setDialog('close-confirm')}>
          &#215;
        </button>
      </span>
    </div>
  );

  const marquee = (
    <div className="bg-[#008080] border-b-2 border-black overflow-hidden shrink-0 select-none" aria-hidden="true">
      <div className="win-marquee-track flex whitespace-nowrap font-pixel text-[22px] leading-none text-white py-1 w-max">
        <span className="pr-2">{MARQUEE_TEXT.repeat(4)}</span>
        <span className="pr-2">{MARQUEE_TEXT.repeat(4)}</span>
      </div>
    </div>
  );

  const appWindow = (
    <>
      {titleBar}
      {marquee}
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        onPrimaryAction={handlePrimaryAction}
        primaryActionLabel={getPrimaryActionLabel()}
        compact={windowState === 'windowed'}
      />
      <main className="flex-1 w-full overflow-hidden min-h-0">
        {activeTab === 'whiteboard' && <WhiteboardStudio />}
        {activeTab === 'engine' && <MatchingEngineStudio />}
        {activeTab === 'mcq' && <MCQConsensusView />}
        {activeTab === 'java' && <JavaArchitectureViewer />}
      </main>
    </>
  );

  const desktopIcons = (
    <div className="absolute left-3 top-3 z-10 flex flex-col gap-4 select-none">
      {DESKTOP_ICONS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className="flex flex-col items-center gap-1 w-20 group"
          onClick={() => {
            if (id === 'recycle') {
              setDialog('recycle');
            } else {
              openTab(id);
            }
          }}
        >
          <span className="w-10 h-10 flex items-center justify-center text-white group-hover:bg-white/20 border border-transparent group-hover:border-white/60">
            <Icon className="w-7 h-7" />
          </span>
          <span
            className="font-pixel text-lg leading-none text-white text-center px-1"
            style={{ textShadow: '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000' }}
          >
            {label}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative h-screen win-desktop flex flex-col font-win text-black antialiased overflow-hidden">
      {windowState === 'minimized' ? (
        <div className="flex-1 min-h-0 relative">
          {desktopIcons}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
            <span className="font-pixel text-3xl text-white/80 text-center">
              Collaborative Whiteboard is minimized
            </span>
          </div>
        </div>
      ) : windowState === 'windowed' ? (
        <div className="flex-1 min-h-0 relative flex items-center justify-center p-4 sm:p-8">
          {desktopIcons}
          <div className="win-window w-full max-w-6xl h-full flex flex-col overflow-hidden">
            {appWindow}
          </div>
        </div>
      ) : (
        appWindow
      )}

      {/* Taskbar */}
      <footer className="win-taskbar h-10 shrink-0 flex items-center gap-2 px-2 text-black select-none relative z-30">
        <button
          type="button"
          className={`win-btn px-3 py-1 text-sm font-bold flex items-center gap-1.5 ${startOpen ? 'win-btn-pressed' : ''}`}
          title="the null pointers"
          onClick={() => setStartOpen((o) => !o)}
        >
          <span aria-hidden="true">&#9632;</span> Start
        </button>
        <button
          type="button"
          className="win-sunken px-2 py-1 text-xs truncate max-w-[160px] sm:max-w-xs text-left"
          title={windowState === 'minimized' ? 'Restore Collaborative Whiteboard' : 'Minimize Collaborative Whiteboard'}
          onClick={toggleTaskbarButton}
        >
          {tabNames[activeTab]}
        </button>
        <span className="ml-auto font-pixel text-xl leading-none tracking-wide hidden md:block">
          SRM UNIVERSITY, AP | 2026 - 27
        </span>
        <span className="win-sunken px-2 py-1 text-xs tabular-nums">{clock}</span>
      </footer>

      {/* Start menu */}
      {startOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setStartOpen(false)} aria-hidden="true" />
          <div className="absolute left-2 bottom-11 z-50 w-64 win-panel p-1 flex">
            <div className="w-7 shrink-0 bg-[#0000CD] text-white font-pixel text-xl flex items-center justify-center py-2">
              <span style={{ writingMode: 'vertical-rl' }} className="rotate-180 tracking-wide">
                the null pointers
              </span>
            </div>
            <div className="flex-1 py-1">
              {START_MENU_TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => openTab(id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-bold text-left hover:bg-[#0000CD] hover:text-white"
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </button>
              ))}
              <div className="border-t-2 border-black/20 my-1" />
              <button
                type="button"
                onClick={() => {
                  setStartOpen(false);
                  setDialog('about');
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-bold text-left hover:bg-[#0000CD] hover:text-white"
              >
                <span className="w-4 h-4 flex items-center justify-center font-bold">?</span>
                About Collaborative Whiteboard...
              </button>
            </div>
          </div>
        </>
      )}

      {/* Dialogs */}
      {dialog === 'about' && (
        <WinDialog title="About Collaborative Whiteboard" onClose={() => setDialog(null)}>
          <p className="font-pixel text-3xl leading-none">COLLABORATIVE WHITEBOARD</p>
          <p>Version 1.0 &middot; Advanced Java Programming Project, CSE 213</p>
          <p>
            Built by <strong>the null pointers</strong>: Naga Nikitha Sanaka, Vanshika Chand, Agastya
            Pandey, Sai Aswitha, Khalid Raza.
          </p>
          <p>Department of Computer Science and Engineering, SRM University, AP | 2026 - 27</p>
          <p className="text-xs text-[#404040]">
            Real-time whiteboard over a Java 21 WebSocket server, LMAX Disruptor matching engine,
            and Project Loom virtual threads.
          </p>
          <div className="flex justify-end">
            <button type="button" className="win-btn px-4 py-1 text-sm font-bold" onClick={() => setDialog(null)}>
              OK
            </button>
          </div>
        </WinDialog>
      )}
      {dialog === 'recycle' && (
        <WinDialog title="Recycle Bin" onClose={() => setDialog(null)}>
          <p>Recycle Bin is empty.</p>
          <div className="flex justify-end">
            <button type="button" className="win-btn px-4 py-1 text-sm font-bold" onClick={() => setDialog(null)}>
              OK
            </button>
          </div>
        </WinDialog>
      )}
      {dialog === 'close-confirm' && (
        <WinDialog title="Close Collaborative Whiteboard" onClose={() => setDialog(null)}>
          <p>Close Collaborative Whiteboard? Your board is saved on the server.</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="win-btn px-4 py-1 text-sm font-bold"
              onClick={() => {
                setDialog(null);
                setWindowState('minimized');
              }}
            >
              Yes
            </button>
            <button type="button" className="win-btn px-4 py-1 text-sm font-bold" onClick={() => setDialog(null)}>
              No
            </button>
          </div>
        </WinDialog>
      )}
    </div>
  );
}

function WinDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="win-window w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="win-titlebar-blue flex items-center gap-2 px-2 py-1 select-none">
          <span className="font-pixel text-xl leading-none truncate">{title}</span>
          <button type="button" className="win-title-btn ml-auto" title="Close" onClick={onClose}>
            &#215;
          </button>
        </div>
        <div className="p-4 text-sm flex flex-col gap-3">{children}</div>
      </div>
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
