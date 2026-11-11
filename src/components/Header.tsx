import React from 'react';
import { Layers, HelpCircle, FileCode, Sparkles } from 'lucide-react';

export type ActiveTab = 'whiteboard' | 'engine' | 'mcq' | 'java';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onPrimaryAction: () => void;
  primaryActionLabel: string;
  /** Narrow window (windowed mode): icon-only nav so the header fits. */
  compact?: boolean;
}

const TABS: { id: ActiveTab; label: string; short: string; icon: React.ReactNode }[] = [
  { id: 'whiteboard', label: 'Whiteboard Studio', short: 'Whiteboard', icon: <Layers className="w-4 h-4" /> },
  { id: 'mcq', label: 'Virtual MCQ Consensus', short: 'MCQ Pool', icon: <HelpCircle className="w-4 h-4" /> },
  { id: 'java', label: 'Java 21 Architecture', short: 'Java 21', icon: <FileCode className="w-4 h-4" /> },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  onPrimaryAction,
  primaryActionLabel,
  compact = false,
}) => {
  return (
    <>
      <header className="flex items-center justify-between gap-4 px-3 py-2 bg-[#C0C0C0] border-b-2 border-black text-black select-none">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <div className="w-8 h-8 win-titlebar-blue flex items-center justify-center font-pixel text-2xl leading-none border-2 border-black">
            &#9783;
          </div>
          <div className="leading-none">
            <span className="font-pixel text-[24px] leading-none tracking-wide block">
              COLLABORATIVE WHITEBOARD
            </span>
            <span className="text-[11px] font-bold block mt-0.5">
              the null pointers &middot; CSE 213
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-1.5 text-xs font-bold">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-2 py-1.5 whitespace-nowrap shrink-0 ${
                activeTab === tab.id ? 'win-btn-selected' : 'win-btn'
              }`}
            >
              {tab.icon}
              <span className={compact ? 'hidden' : 'hidden xl:inline'}>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Zone 3: Primary Action Button */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onPrimaryAction}
            className="win-btn-selected flex items-center gap-2 px-3 py-1.5 text-xs font-bold whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="truncate max-w-[120px] md:max-w-none">{primaryActionLabel}</span>
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar (Visible only on < md screens) */}
      <nav className="flex md:hidden items-center justify-around bg-[#C0C0C0] border-b-2 border-black px-2 py-2 text-xs font-bold overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 whitespace-nowrap shrink-0 ${
              activeTab === tab.id ? 'win-btn-selected' : 'win-btn'
            }`}
          >
            {tab.icon}
            {tab.short}
          </button>
        ))}
      </nav>
    </>
  );
};
