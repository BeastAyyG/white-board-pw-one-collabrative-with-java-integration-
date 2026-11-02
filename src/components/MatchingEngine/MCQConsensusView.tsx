import React, { useState, useEffect, useRef } from 'react';
import { HelpCircle, Users, Sparkles, Trophy, CheckCircle2, TrendingUp, Cpu, Flame, Play, Pause } from 'lucide-react';
import { MatchingEngine } from '../../engine/matchingEngine.ts';
import { MCQQuestion, Order } from '../../types/index.ts';

const QUESTIONS: MCQQuestion[] = [
  {
    id: 'q1',
    title: 'Which concurrency pattern guarantees the lowest tail latency for order book processing?',
    context:
      'High-frequency trading exchanges need to avoid lock contention, context switches, and cache invalidation storms.',
    options: [
      {
        key: 'A',
        label: 'Single-Thread Core with LMAX Disruptor RingBuffer',
        isCorrect: true,
        poolVolume: 4200,
        impliedOdds: 78,
        bidsCount: 1420,
      },
      {
        key: 'B',
        label: 'Java synchronized blocks on OrderBook object',
        isCorrect: false,
        poolVolume: 320,
        impliedOdds: 6,
        bidsCount: 110,
      },
      {
        key: 'C',
        label: 'ThreadPool with ConcurrentLinkedQueue',
        isCorrect: false,
        poolVolume: 580,
        impliedOdds: 11,
        bidsCount: 195,
      },
      {
        key: 'D',
        label: 'Actor model with Akka asynchronous mailboxes',
        isCorrect: false,
        poolVolume: 280,
        impliedOdds: 5,
        bidsCount: 95,
      },
    ],
    totalBidsVolume: 5380,
  },
  {
    id: 'q2',
    title: 'How does LMAX Disruptor eliminate false sharing between producer and consumer threads?',
    context:
      'When independent variables reside on the same 64-byte L1/L2 cache line, concurrent writes force cache line invalidations.',
    options: [
      {
        key: 'A',
        label: 'Cache line padding with @Contended or 128 bytes dummy fields',
        isCorrect: true,
        poolVolume: 3800,
        impliedOdds: 82,
        bidsCount: 1250,
      },
      {
        key: 'B',
        label: 'Using volatile variables without locks',
        isCorrect: false,
        poolVolume: 420,
        impliedOdds: 9,
        bidsCount: 140,
      },
      {
        key: 'C',
        label: 'Calling Thread.yield() after every write',
        isCorrect: false,
        poolVolume: 180,
        impliedOdds: 4,
        bidsCount: 60,
      },
      {
        key: 'D',
        label: 'Compacting JVM heap with ZGC generational collection',
        isCorrect: false,
        poolVolume: 230,
        impliedOdds: 5,
        bidsCount: 75,
      },
    ],
    totalBidsVolume: 4630,
  },
];

export const MCQConsensusView: React.FC = () => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [questions, setQuestions] = useState<MCQQuestion[]>(QUESTIONS);
  const [userSelectedOption, setUserSelectedOption] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [isSwarmActive, setIsSwarmActive] = useState<boolean>(true);
  const [simulatedVoterCount, setSimulatedVoterCount] = useState<number>(3500);
  const [totalVotesProcessed, setTotalVotesProcessed] = useState<number>(14250);
  const [opsPerSec, setOpsPerSec] = useState<number>(1850);

  const engineRef = useRef<MatchingEngine>(new MatchingEngine(50.0));

  const currentQ = questions[currentQuestionIndex];

  // Simulated concurrent voter swarm
  useEffect(() => {
    if (!isSwarmActive) return;

    const interval = setInterval(() => {
      // Generate a batch of virtual voter orders
      const batchSize = Math.floor(15 + Math.random() * 25);
      const chosenKey: 'A' | 'B' | 'C' | 'D' =
        Math.random() < 0.75
          ? 'A' // Correct answer gets organic crowd consensus
          : (['B', 'C', 'D'][Math.floor(Math.random() * 3)] as 'B' | 'C' | 'D');

      const voteWeight = Math.floor(1 + Math.random() * 10);

      // Match through the engine
      engineRef.current.processOrder({
        id: `vote-${Date.now()}-${Math.random()}`,
        traderId: `student-${Math.floor(Math.random() * simulatedVoterCount)}`,
        traderName: `Voter_${Math.floor(Math.random() * simulatedVoterCount)}`,
        side: 'BUY',
        type: 'MARKET',
        price: 0,
        size: voteWeight,
        optionKey: chosenKey,
      });

      setQuestions((prevList) => {
        return prevList.map((q, idx) => {
          if (idx !== currentQuestionIndex) return q;

          const updatedOptions = q.options.map((opt) => {
            if (opt.key === chosenKey) {
              const newVol = opt.poolVolume + voteWeight;
              const newBids = opt.bidsCount + 1;
              return { ...opt, poolVolume: newVol, bidsCount: newBids };
            }
            return opt;
          });

          const newTotalVol = updatedOptions.reduce((sum, o) => sum + o.poolVolume, 0);
          const withOdds = updatedOptions.map((opt) => ({
            ...opt,
            impliedOdds: Math.round((opt.poolVolume / newTotalVol) * 100),
          }));

          return {
            ...q,
            options: withOdds,
            totalBidsVolume: newTotalVol,
          };
        });
      });

      setTotalVotesProcessed((v) => v + batchSize);
      setOpsPerSec(Math.round(1500 + Math.random() * 700));
    }, 80);

    return () => clearInterval(interval);
  }, [isSwarmActive, currentQuestionIndex, simulatedVoterCount]);

  const handleCastVote = (optionKey: 'A' | 'B' | 'C' | 'D') => {
    setUserSelectedOption(optionKey);
    const voteWeight = 250;

    engineRef.current.processOrder({
      id: `user-vote-${Date.now()}`,
      traderId: 'user',
      traderName: 'You (Host)',
      side: 'BUY',
      type: 'LIMIT',
      price: 50.0,
      size: voteWeight,
      optionKey,
    });

    setQuestions((prevList) => {
      return prevList.map((q, idx) => {
        if (idx !== currentQuestionIndex) return q;
        const updated = q.options.map((o) => {
          if (o.key === optionKey) {
            return {
              ...o,
              poolVolume: o.poolVolume + voteWeight,
              bidsCount: o.bidsCount + 1,
            };
          }
          return o;
        });
        const total = updated.reduce((s, o) => s + o.poolVolume, 0);
        return {
          ...q,
          options: updated.map((o) => ({
            ...o,
            impliedOdds: Math.round((o.poolVolume / total) * 100),
          })),
          totalBidsVolume: total,
        };
      });
    });
  };

  const handleSurgeVoters = () => {
    setQuestions((prevList) => {
      return prevList.map((q, idx) => {
        if (idx !== currentQuestionIndex) return q;
        const updated = q.options.map((o) => {
          const boost = o.key === 'A' ? 2000 : 300;
          return {
            ...o,
            poolVolume: o.poolVolume + boost,
            bidsCount: o.bidsCount + 250,
          };
        });
        const total = updated.reduce((s, o) => s + o.poolVolume, 0);
        return {
          ...q,
          options: updated.map((o) => ({
            ...o,
            impliedOdds: Math.round((o.poolVolume / total) * 100),
          })),
          totalBidsVolume: total,
        };
      });
    });
    setTotalVotesProcessed((v) => v + 1000);
  };

  return (
    <div className="w-full min-h-[calc(100vh-61px)] bg-[#0B0F19] text-slate-100 p-6 flex flex-col gap-5 select-none overflow-y-auto">
      {/* Top Banner KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Concurrent Simulated Participants</span>
            <Users className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-white flex items-baseline gap-1.5">
            {simulatedVoterCount.toLocaleString()}
            <span className="text-xs font-normal text-slate-500">agents</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Disruptor Ingestion Speed</span>
            <Flame className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-amber-300 flex items-baseline gap-1.5">
            {opsPerSec.toLocaleString()}
            <span className="text-xs font-normal text-slate-500">votes/sec</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Total Orders Settled</span>
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-300 flex items-baseline gap-1.5">
            {totalVotesProcessed.toLocaleString()}
            <span className="text-xs font-normal text-slate-500">matched</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Consensus Leader</span>
            <Trophy className="w-3.5 h-3.5 text-yellow-400" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-yellow-300 flex items-baseline gap-2">
            Option A
            <span className="text-xs font-medium text-slate-400">
              ({currentQ.options[0].impliedOdds}% consensus)
            </span>
          </div>
        </div>
      </div>

      {/* Main MCQ Pool Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: The MCQ Question & Liquidity Options (8 Cols) */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-col gap-5 shadow-xl">
          {/* Question Selector Tabs */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-indigo-400" />
              <span className="text-sm font-semibold text-slate-200">
                Question {currentQuestionIndex + 1} of {questions.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {questions.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCurrentQuestionIndex(idx);
                    setUserSelectedOption(null);
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    currentQuestionIndex === idx
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Q{idx + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Question Title & Scenario */}
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-bold text-white tracking-tight">{currentQ.title}</h2>
            <p className="text-xs text-slate-400 leading-relaxed">{currentQ.context}</p>
          </div>

          {/* Interactive Multiple Choice Options with Real-Time Depth */}
          <div className="flex flex-col gap-3">
            {currentQ.options.map((opt) => {
              const isSelected = userSelectedOption === opt.key;
              return (
                <div
                  key={opt.key}
                  onClick={() => handleCastVote(opt.key)}
                  className={`relative overflow-hidden border rounded-xl p-4 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  {/* Real-time Depth Background Bar */}
                  <div
                    className={`absolute inset-y-0 left-0 transition-all duration-300 pointer-events-none ${
                      opt.key === 'A' ? 'bg-indigo-600/20' : 'bg-slate-800/20'
                    }`}
                    style={{ width: `${opt.impliedOdds}%` }}
                  />

                  <div className="relative z-10 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {opt.key}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-100">{opt.label}</span>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 font-mono">
                          <span>{opt.bidsCount.toLocaleString()} votes placed</span>
                          <span>·</span>
                          <span>{opt.poolVolume.toLocaleString()} token depth</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 text-right font-mono">
                      <div className="flex flex-col">
                        <span className="text-lg font-bold text-white tabular-nums">
                          {opt.impliedOdds}%
                        </span>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                          Consensus
                        </span>
                      </div>
                      {opt.isCorrect && (
                        <div className="hidden sm:flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Correct</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {userSelectedOption && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-center justify-between text-xs text-emerald-300">
              <span>Your vote on Option {userSelectedOption} was ingested and matched into the pool!</span>
              <span className="font-mono font-semibold">+250 tokens allocated</span>
            </div>
          )}
        </div>

        {/* Right: Simulation Mechanics & Swarm Controls (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              Massive Multi-User Simulation
            </h3>

            <p className="text-xs text-slate-400 leading-relaxed">
              Simulates thousands of concurrent students or traders submitting answers to the
              matching engine. The price-time priority algorithm balances liquidity pools and
              computes dynamic consensus probability in sub-millisecond intervals.
            </p>

            {/* Voter Swarm Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Simulated Participants</span>
                <span className="font-mono text-indigo-400">
                  {simulatedVoterCount.toLocaleString()}
                </span>
              </div>
              <input
                type="range"
                min="500"
                max="10000"
                step="500"
                value={simulatedVoterCount}
                onChange={(e) => setSimulatedVoterCount(Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            {/* Swarm Actions */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setIsSwarmActive(!isSwarmActive)}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  isSwarmActive
                    ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60 hover:bg-rose-900/60'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
                }`}
              >
                {isSwarmActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isSwarmActive ? 'Pause Swarm' : 'Resume Swarm'}
              </button>

              <button
                onClick={handleSurgeVoters}
                className="py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                +1,000 Votes
              </button>
            </div>
          </div>

          {/* Mechanical Sympathy Note */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col gap-2.5 shadow-xl text-xs text-slate-400">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Algorithmic Consensus Dynamics
            </span>
            <p className="leading-relaxed">
              In high-concurrency collective intelligence experiments, thousands of independent
              agents voting via an order book filter out noisy guesses, allowing the wisdom of the
              crowd to converge on the mathematically optimal choice with sub-microsecond latency.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
