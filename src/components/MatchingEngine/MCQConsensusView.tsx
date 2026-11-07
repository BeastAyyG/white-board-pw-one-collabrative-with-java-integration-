import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HelpCircle, Users, Trophy, CheckCircle2, Timer, Play, GraduationCap, Radio, WifiOff } from 'lucide-react';

/**
 * PW-style live quiz (replaces the simulated-voter MCQ consensus view).
 *
 * The teacher presents a question, real people tap A / B / C / D, and when
 * the poll closes the AI Teacher explains the answer. No fake voters, no
 * votes-per-second: the tally starts at zero and only real votes count.
 *
 * Votes travel over the same Java WebSocket room as the whiteboard
 * (ws://host:8090/ws/whiteboard, room "main"). With no server reachable the
 * tab still works in demo mode: your vote counts on this screen only.
 */

type OptionKey = 'A' | 'B' | 'C' | 'D';
type Phase = 'idle' | 'open' | 'revealed';

interface QuizOption {
  key: OptionKey;
  label: string;
  isCorrect: boolean;
}

interface QuizQuestion {
  id: string;
  title: string;
  context: string;
  options: QuizOption[];
  explanation: string;
  trap: string;
}

const POLL_SECONDS = 30;
const ROOM = 'main';

const QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1',
    title: 'Which concurrency pattern guarantees the lowest tail latency for order book processing?',
    context:
      'High-frequency trading exchanges need to avoid lock contention, context switches, and cache invalidation storms.',
    options: [
      { key: 'A', label: 'Single-Thread Core with LMAX Disruptor RingBuffer', isCorrect: true },
      { key: 'B', label: 'Java synchronized blocks on OrderBook object', isCorrect: false },
      { key: 'C', label: 'ThreadPool with ConcurrentLinkedQueue', isCorrect: false },
      { key: 'D', label: 'Actor model with Akka asynchronous mailboxes', isCorrect: false },
    ],
    explanation:
      'One thread owns the whole match path, so there is no lock to contend for, no context switch, and no cache line bouncing between cores. The Disruptor ring buffer is pre-allocated, so the hot path allocates nothing and the GC never pauses a match. That is why tail latency stays in single-digit microseconds instead of spiking under load.',
    trap: 'Most classes pick B. Synchronized blocks feel safe, but every match then queues on one monitor and every core invalidates the same cache line, which is exactly what inflates p99.',
  },
  {
    id: 'q2',
    title: 'How does LMAX Disruptor eliminate false sharing between producer and consumer threads?',
    context:
      'When independent variables reside on the same 64-byte L1/L2 cache line, concurrent writes force cache line invalidations.',
    options: [
      { key: 'A', label: 'Cache line padding with @Contended or 128 bytes dummy fields', isCorrect: true },
      { key: 'B', label: 'Using volatile variables without locks', isCorrect: false },
      { key: 'C', label: 'Calling Thread.yield() after every write', isCorrect: false },
      { key: 'D', label: 'Compacting JVM heap with ZGC generational collection', isCorrect: false },
    ],
    explanation:
      'Two threads writing different variables that share one 64-byte cache line force the line to bounce between cores on every write. Padding puts each hot variable on its own line, so a write invalidates nothing the other thread owns. The Disruptor pads its sequence counters to 128 bytes for the same reason.',
    trap: 'Volatile fixes visibility, not sharing. A volatile write to a shared line still invalidates every other core’s copy, so the bouncing continues.',
  },
  {
    id: 'q3',
    title: 'What does a Project Loom virtual thread give you that a platform thread pool does not?',
    context:
      'The matching engine runs 10,000 simulated traders. Each one blocks on I/O while it waits for market data.',
    options: [
      { key: 'A', label: 'Thousands of cheap threads that park without holding an OS thread', isCorrect: true },
      { key: 'B', label: 'Faster garbage collection for short-lived objects', isCorrect: false },
      { key: 'C', label: 'Automatic parallelisation of sequential loops', isCorrect: false },
      { key: 'D', label: 'A lock-free replacement for synchronized blocks', isCorrect: false },
    ],
    explanation:
      'A virtual thread costs a few kilobytes and parks without holding an OS thread, so a million of them can block on I/O at once while a small pool of carrier threads does the real work. A platform thread costs around a megabyte of stack and blocks its OS thread, so a thread pool stalls once every thread is waiting.',
    trap: 'Loom does not parallelise your code. It only makes blocking cheap. A slow loop is still a slow loop, it just stops wasting a whole OS thread while it waits.',
  },
  {
    id: 'q4',
    title: 'Why is the order book kept as flat primitive arrays instead of a tree of Order objects?',
    context:
      'The matching loop walks price levels in order, thousands of times a second, on the hottest path in the engine.',
    options: [
      { key: 'A', label: 'Contiguous arrays keep the hot data in L1/L2 cache and avoid pointer chasing', isCorrect: true },
      { key: 'B', label: 'Arrays let the JVM skip garbage collection entirely', isCorrect: false },
      { key: 'C', label: 'Trees cannot store price-time priority', isCorrect: false },
      { key: 'D', label: 'Primitive arrays use less heap only for small books', isCorrect: false },
    ],
    explanation:
      'The match loop walks price levels in order, so a flat array means sequential access that the CPU prefetcher loves: the next level is already in L1/L2 before you need it. A tree of Order objects means pointer chasing through the heap, a cache miss per level, and an allocation every time an order is created.',
    trap: 'Arrays do not switch the GC off. The win is cache locality and zero allocation on the match path, not escaping the collector.',
  },
];

function tallyOf(voters: Record<string, OptionKey>): Record<OptionKey, number> {
  const t: Record<OptionKey, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const v of Object.values(voters)) {
    t[v] += 1;
  }
  return t;
}

export const MCQConsensusView: React.FC = () => {
  const [qIndex, setQIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [voters, setVoters] = useState<Record<string, OptionKey>>({});
  const [myName, setMyName] = useState(() => `Guest-${Math.floor(1000 + Math.random() * 9000)}`);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [connected, setConnected] = useState<'connecting' | 'live' | 'demo'>('connecting');
  const [notice, setNotice] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const qIdRef = useRef(QUESTIONS[0].id);
  qIdRef.current = QUESTIONS[qIndex].id;
  const myNameRef = useRef(myName);
  myNameRef.current = myName;

  const question = QUESTIONS[qIndex];
  const tally = tallyOf(voters);
  const totalVotes = Object.keys(voters).length;
  const myVote: OptionKey | null = voters[myName] ?? null;
  const correctKey = question.options.find((o) => o.isCorrect)?.key ?? 'A';
  const leadingKey: OptionKey | null =
    totalVotes === 0
      ? null
      : (Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0] as OptionKey);
  const leadingPct = leadingKey && totalVotes > 0 ? Math.round((tally[leadingKey] / totalVotes) * 100) : 0;
  const correctCount = phase === 'revealed' ? tally[correctKey] : 0;
  const correctPct = phase === 'revealed' && totalVotes > 0 ? Math.round((correctCount / totalVotes) * 100) : 0;

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const requestTally = useCallback(
    (questionId: string) => {
      send({ type: 'tally', room: ROOM, question: questionId });
    },
    [send],
  );

  const startPoll = useCallback(() => {
    setPhase('open');
    setTimeLeft(POLL_SECONDS);
    setNotice(null);
    send({ type: 'poll', room: ROOM, question: qIdRef.current, action: 'open' });
  }, [send]);

  const reveal = useCallback(() => {
    setPhase('revealed');
    setTimeLeft(null);
    send({ type: 'poll', room: ROOM, question: qIdRef.current, action: 'reveal' });
  }, [send]);

  const revealRef = useRef(reveal);
  revealRef.current = reveal;

  const switchQuestion = useCallback(
    (idx: number) => {
      const next = QUESTIONS[idx];
      if (!next) return;
      setQIndex(idx);
      setPhase('idle');
      setTimeLeft(null);
      setVoters({});
      setNotice(null);
      send({ type: 'question', room: ROOM, question: next.id });
      requestTally(next.id);
    },
    [send, requestTally],
  );

  const nextQuestion = useCallback(() => {
    switchQuestion((qIndex + 1) % QUESTIONS.length);
  }, [qIndex, switchQuestion]);

  // Header primary action ("Poll Control"): start -> reveal -> next.
  useEffect(() => {
    const onPrimary = () => {
      if (phase === 'open') revealRef.current();
      else if (phase === 'revealed') nextQuestion();
      else startPoll();
    };
    window.addEventListener('apex:mcq-primary', onPrimary);
    return () => window.removeEventListener('apex:mcq-primary', onPrimary);
  }, [phase, startPoll, nextQuestion]);

  // 30-second poll countdown; the timer auto-reveals at zero.
  useEffect(() => {
    if (phase !== 'open' || timeLeft === null) return;
    if (timeLeft <= 0) {
      revealRef.current();
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft]);

  // Live votes over the whiteboard WebSocket room. Falls back to demo mode
  // (votes stay on this screen) when no Java server is reachable.
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      const host = window.location.hostname;
      ws = new WebSocket(`ws://${host}:8090/ws/whiteboard`);
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected('live');
        ws?.send(JSON.stringify({ type: 'join', room: ROOM, user: myNameRef.current, color: '#0000CD' }));
        ws?.send(JSON.stringify({ type: 'tally', room: ROOM, question: qIdRef.current }));
      };
      ws.onmessage = (ev) => {
        let msg: any;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.room && msg.room !== ROOM) return;
        if (msg.type === 'snapshot' && msg.votes) {
          const mine = msg.votes[qIdRef.current] as Record<string, OptionKey> | undefined;
          if (mine) setVoters(mine);
        } else if (msg.type === 'vote' && msg.question === qIdRef.current && msg.user && msg.option) {
          setVoters((prev) => ({ ...prev, [msg.user]: msg.option }));
        } else if (msg.type === 'tally' && msg.question === qIdRef.current && msg.voters) {
          setVoters(msg.voters as Record<string, OptionKey>);
        } else if (msg.type === 'question' && msg.question) {
          const idx = QUESTIONS.findIndex((q) => q.id === msg.question);
          if (idx >= 0) {
            setQIndex(idx);
            setPhase('idle');
            setTimeLeft(null);
            setVoters({});
            setNotice(null);
          }
        } else if (msg.type === 'poll' && msg.question === qIdRef.current) {
          if (msg.action === 'open') {
            setPhase('open');
            setTimeLeft(POLL_SECONDS);
            setNotice(null);
          } else if (msg.action === 'reveal') {
            setPhase('revealed');
            setTimeLeft(null);
          }
        }
      };
      ws.onerror = () => setConnected('demo');
      ws.onclose = () => setConnected((c) => (c === 'live' ? 'demo' : c));
    } catch {
      setConnected('demo');
    }
    return () => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    };
  }, []);

  const castVote = (key: OptionKey) => {
    if (phase !== 'open') {
      setNotice(
        phase === 'idle'
          ? 'The teacher has not started the poll yet. Wait for the poll to open.'
          : 'Poll closed. Votes are locked in, the AI Teacher is explaining the answer.',
      );
      return;
    }
    setVoters((prev) => ({ ...prev, [myName]: key }));
    setNotice(null);
    send({ type: 'vote', room: ROOM, question: question.id, option: key, user: myName });
  };

  return (
    <div className="w-full h-full bg-[#008080] text-black p-6 flex flex-col gap-5 select-none overflow-y-auto">
      {/* Live poll KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white border border-black rounded-none p-3.5 flex flex-col">
          <div className="flex items-center justify-between text-xs text-[#404040] mb-1">
            <span>Students answered</span>
            <Users className="w-3.5 h-3.5 text-[#0000CD]" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-black flex items-baseline gap-1.5">
            {totalVotes}
            <span className="text-xs font-normal text-[#404040]">votes</span>
          </div>
        </div>

        <div className="bg-white border border-black rounded-none p-3.5 flex flex-col">
          <div className="flex items-center justify-between text-xs text-[#404040] mb-1">
            <span>Leading option</span>
            <Trophy className="w-3.5 h-3.5 text-yellow-400" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-black flex items-baseline gap-2">
            {leadingKey ? `Option ${leadingKey}` : '—'}
            {leadingKey && (
              <span className="text-xs font-medium text-[#404040]">({leadingPct}% of votes)</span>
            )}
          </div>
        </div>

        <div className="bg-white border border-black rounded-none p-3.5 flex flex-col">
          <div className="flex items-center justify-between text-xs text-[#404040] mb-1">
            <span>Correct picks</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#047857]" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-black flex items-baseline gap-2">
            {phase === 'revealed' ? `${correctCount}` : '—'}
            {phase === 'revealed' && (
              <span className="text-xs font-medium text-[#404040]">({correctPct}% got it right)</span>
            )}
          </div>
        </div>

        <div className="bg-white border border-black rounded-none p-3.5 flex flex-col">
          <div className="flex items-center justify-between text-xs text-[#404040] mb-1">
            <span>Time left</span>
            <Timer className="w-3.5 h-3.5 text-[#92400E]" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-black flex items-baseline gap-1.5">
            {phase === 'open' && timeLeft !== null ? `${timeLeft}s` : phase === 'revealed' ? 'Closed' : 'Not started'}
          </div>
        </div>
      </div>

      {/* Main quiz section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: the question students answer (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-black rounded-none p-6 flex flex-col gap-5 shadow-[4px_4px_0_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between border-b border-black pb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-[#0000CD]" />
              <span className="text-sm font-semibold text-black">
                Question {qIndex + 1} of {QUESTIONS.length}
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 ${
                  phase === 'open'
                    ? 'bg-[#047857] text-white'
                    : phase === 'revealed'
                      ? 'bg-[#0000CD] text-white'
                      : 'bg-[#C0C0C0] text-black'
                }`}
              >
                {phase === 'open' ? 'POLL OPEN' : phase === 'revealed' ? 'ANSWER REVEALED' : 'WAITING'}
              </span>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-[#404040]">
              Answering as
              <input
                value={myName}
                onChange={(e) => setMyName(e.target.value.slice(0, 20) || 'Guest')}
                className="win-sunken px-2 py-1 text-xs font-bold text-black w-28 outline-none"
                aria-label="Your name"
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-bold text-black tracking-tight">{question.title}</h2>
            <p className="text-xs text-[#404040] leading-relaxed">{question.context}</p>
          </div>

          {/* A / B / C / D: tap to vote while the poll is open */}
          <div className="flex flex-col gap-3">
            {question.options.map((opt) => {
              const count = tally[opt.key];
              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const isMine = myVote === opt.key;
              const isCorrectRow = phase === 'revealed' && opt.isCorrect;
              return (
                <div
                  key={opt.key}
                  onClick={() => castVote(opt.key)}
                  className={`relative overflow-hidden border rounded-none p-4 cursor-pointer transition-all ${
                    isCorrectRow
                      ? 'border-[#047857] bg-[#FFFF99]'
                      : isMine
                        ? 'border-[#0000CD] bg-[#0000CD]/10'
                        : 'border-black bg-white hover:border-black'
                  }`}
                >
                  {/* Live vote bar */}
                  <div
                    className={`absolute inset-y-0 left-0 transition-all duration-300 pointer-events-none ${
                      isCorrectRow ? 'bg-[#047857]/20' : 'bg-[#0000CD]/10'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative z-10 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`w-8 h-8 rounded-none flex items-center justify-center font-bold text-sm shrink-0 ${
                          isCorrectRow
                            ? 'bg-[#047857] text-white'
                            : isMine
                              ? 'bg-[#0000CD] text-white'
                              : 'bg-[#C0C0C0] text-[#1F1F1F]'
                        }`}
                      >
                        {opt.key}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-black">{opt.label}</span>
                        <div className="flex items-center gap-2 text-xs text-[#404040] mt-0.5 font-mono">
                          <span>
                            {count} vote{count === 1 ? '' : 's'}
                          </span>
                          {isMine && <span className="font-bold text-[#0000CD]">· Your pick</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-right font-mono">
                      <div className="flex flex-col">
                        <span className="text-lg font-bold text-black tabular-nums">{pct}%</span>
                        <span className="text-[10px] text-[#404040] uppercase tracking-wider">of votes</span>
                      </div>
                      {isCorrectRow && (
                        <div className="hidden sm:flex items-center gap-1 text-[#047857] text-xs font-semibold">
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

          <div
            className={`p-3 border rounded-none text-xs flex items-center justify-between gap-3 ${
              phase === 'open'
                ? 'bg-[#0000CD]/10 border-[#0000CD]/40 text-black'
                : 'bg-[#C0C0C0]/40 border-black/30 text-[#404040]'
            }`}
          >
            <span>
              {phase === 'open'
                ? myVote
                  ? `Your answer: Option ${myVote}. Tap another option to change it before time runs out.`
                  : 'Poll is open. Tap an option to answer.'
                : phase === 'revealed'
                  ? myVote
                    ? `Poll closed. You picked Option ${myVote}${myVote === correctKey ? ', correct!' : `, the answer was Option ${correctKey}.`}`
                    : 'Poll closed. You did not answer this one.'
                  : 'The teacher has not started the poll yet.'}
            </span>
            {phase === 'open' && timeLeft !== null && (
              <span className="font-pixel text-2xl leading-none tabular-nums shrink-0">{timeLeft}s</span>
            )}
          </div>
          {notice && <div className="text-xs text-[#92400E] font-semibold">{notice}</div>}
        </div>

        {/* Right: teacher controls + AI Teacher (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-white border border-black rounded-none p-5 flex flex-col gap-4 shadow-[4px_4px_0_rgba(0,0,0,0.45)]">
            <h3 className="text-sm font-semibold text-black flex items-center gap-2">
              <Users className="w-4 h-4 text-[#0000CD]" />
              Teacher Controls
            </h3>

            <div className="flex items-center gap-2">
              {QUESTIONS.map((q, idx) => (
                <button
                  key={q.id}
                  onClick={() => switchQuestion(idx)}
                  className={`px-3 py-1 text-xs font-semibold cursor-pointer ${
                    qIndex === idx ? 'win-btn-selected' : 'win-btn'
                  }`}
                >
                  Q{idx + 1}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={startPoll}
                disabled={phase !== 'idle'}
                className="win-btn-selected py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Play className="w-3.5 h-3.5" />
                Start Poll (30s)
              </button>
              <button
                onClick={reveal}
                disabled={phase !== 'open'}
                className="win-btn py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Reveal Answer
              </button>
              <button
                onClick={nextQuestion}
                disabled={phase === 'open'}
                className="win-btn py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                Next Question
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#404040] border-t border-black/20 pt-3">
              {connected === 'live' ? (
                <>
                  <Radio className="w-3.5 h-3.5 text-[#047857]" />
                  <span>Live: votes sync through the Java server.</span>
                </>
              ) : connected === 'connecting' ? (
                <>
                  <Radio className="w-3.5 h-3.5 text-[#92400E]" />
                  <span>Connecting to the Java server…</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-[#92400E]" />
                  <span>Demo mode: no server found, votes stay on this screen.</span>
                </>
              )}
            </div>
          </div>

          {/* AI Teacher explains after the reveal */}
          <div className="border-2 border-black rounded-none p-5 flex flex-col gap-2.5 shadow-[4px_4px_0_rgba(0,0,0,0.45)] text-xs text-black bg-[#FFFF99]">
            <span className="font-semibold flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-[#0000CD]" />
              AI Teacher
            </span>
            {phase === 'revealed' ? (
              <>
                <p className="leading-relaxed">{question.explanation}</p>
                <p className="leading-relaxed">
                  <strong>Watch out: </strong>
                  {question.trap}
                </p>
                <p className="leading-relaxed font-semibold">
                  {totalVotes > 0
                    ? `${correctPct}% of the class got it right. ${leadingKey === correctKey ? 'The crowd was right this time.' : `Most of the class picked Option ${leadingKey}.`}`
                    : 'Nobody voted on this one.'}
                </p>
              </>
            ) : (
              <p className="leading-relaxed text-[#404040]">
                The AI Teacher explains the answer once the poll closes. No peeking, answer first,
                then learn why.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
