import React from 'react';
import { Layers, Activity, HelpCircle, FileCode, Play, Sparkles } from 'lucide-react';

export type ActiveTab = 'whiteboard' | 'engine' | 'mcq' | 'java';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onPrimaryAction: () => void;
  primaryActionLabel: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  onPrimaryAction,
  primaryActionLabel,
}) => {
  return (
    <>
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-slate-900 border-b border-slate-800 text-white select-none">
      {/* Zone 1: Brand Wordmark (Single Text Element) */}
      <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-inner">
          ⚡
        </div>
        <span className="text-base font-semibold tracking-tight text-slate-100">
          Apex Engine & Canvas
        </span>
      </div>

      {/* Zone 2: Navigation Links (Single-Line, 4 Clean Links) */}
      <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
        <button
          onClick={() => onTabChange('whiteboard')}
          className={`flex items-center gap-2 pb-0.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'whiteboard'
              ? 'text-white border-b-2 border-indigo-500 font-semibold'
              : 'hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4 text-indigo-400" />
          Whiteboard Studio
        </button>

        <button
          onClick={() => onTabChange('engine')}
          className={`flex items-center gap-2 pb-0.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'engine'
              ? 'text-white border-b-2 border-indigo-500 font-semibold'
              : 'hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4 text-emerald-400" />
          LMAX Disruptor Engine
        </button>

        <button
          onClick={() => onTabChange('mcq')}
          className={`flex items-center gap-2 pb-0.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'mcq'
              ? 'text-white border-b-2 border-indigo-500 font-semibold'
              : 'hover:text-slate-200'
          }`}
        >
          <HelpCircle className="w-4 h-4 text-amber-400" />
          Virtual MCQ Consensus
        </button>

        <button
          onClick={() => onTabChange('java')}
          className={`flex items-center gap-2 pb-0.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'java'
              ? 'text-white border-b-2 border-indigo-500 font-semibold'
              : 'hover:text-slate-200'
          }`}
        >
          <FileCode className="w-4 h-4 text-sky-400" />
          Java 21 Architecture
        </button>
      </nav>

      {/* Zone 3: Primary Action Button */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onPrimaryAction}
          className="flex items-center gap-2 px-3.5 py-1.5 md:px-4 md:py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-lg shadow-sm transition-all whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="truncate max-w-[140px] md:max-w-none">{primaryActionLabel}</span>
        </button>
      </div>
    </header>

    {/* Mobile Navigation Bar (Visible only on < md screens) */}
    <nav className="flex md:hidden items-center justify-around bg-slate-900/95 border-b border-slate-800 px-2 py-2 text-xs font-medium text-slate-400 overflow-x-auto">
      <button
        onClick={() => onTabChange('whiteboard')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
          activeTab === 'whiteboard'
            ? 'bg-indigo-600/20 text-indigo-300 font-semibold border border-indigo-500/40'
            : 'hover:text-slate-200'
        }`}
      >
        <Layers className="w-3.5 h-3.5" />
        Whiteboard
      </button>

      <button
        onClick={() => onTabChange('engine')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
          activeTab === 'engine'
            ? 'bg-emerald-600/20 text-emerald-300 font-semibold border border-emerald-500/40'
            : 'hover:text-slate-200'
        }`}
      >
        <Activity className="w-3.5 h-3.5" />
        Disruptor
      </button>

      <button
        onClick={() => onTabChange('mcq')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
          activeTab === 'mcq'
            ? 'bg-amber-600/20 text-amber-300 font-semibold border border-amber-500/40'
            : 'hover:text-slate-200'
        }`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
        MCQ Pool
      </button>

      <button
        onClick={() => onTabChange('java')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
          activeTab === 'java'
            ? 'bg-sky-600/20 text-sky-300 font-semibold border border-sky-500/40'
            : 'hover:text-slate-200'
        }`}
      >
        <FileCode className="w-3.5 h-3.5" />
        Java 21
      </button>
    </nav>
  </>);
};
