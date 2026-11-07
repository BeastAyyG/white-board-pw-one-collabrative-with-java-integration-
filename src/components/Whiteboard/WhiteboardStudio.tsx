import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  MousePointer,
  Pencil,
  Square,
  Circle,
  ArrowRight,
  StickyNote,
  Type,
  Eraser,
  RotateCcw,
  RotateCw,
  Trash2,
  Download,
  Users,
  Plus,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileJson,
  Crosshair,
  Brain,
  DraftingCompass,
  Footprints,
  Wifi,
  WifiOff,
  RadioTower
} from 'lucide-react';
import { CanvasElement, Collaborator, Point, ToolType } from '../../types/index.ts';
import {
  BOT_NAMES,
  BOT_COLORS,
  BOT_STICKY_IDEAS,
  BOT_ARCH_NODES,
  isPointInElement,
  createBotCollaborator,
} from '../../whiteboard/canvasModel.ts';

const COLOR_PALETTE = [
  '#FFFFFF', // White
  '#94A3B8', // Slate
  '#38BDF8', // Sky
  '#818CF8', // Indigo
  '#34D399', // Emerald
  '#FBBF24', // Amber
  '#F472B6', // Rose
  '#A78BFA', // Purple
];

const STICKY_COLORS = [
  '#FEF08A', // Yellow
  '#BFDBFE', // Blue
  '#BBF7D0', // Green
  '#FBCFE8', // Pink
  '#FED7AA', // Orange
];

interface WhiteboardStudioProps {
  onSpawnBotsRequested?: () => void;
}

export const WhiteboardStudio: React.FC<WhiteboardStudioProps> = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Tools & Styling State
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [selectedColor, setSelectedColor] = useState<string>('#38BDF8');
  const [selectedStickyColor, setSelectedStickyColor] = useState<string>('#FEF08A');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });

  // Elements & History
  const [elements, setElements] = useState<CanvasElement[]>(() => {    // Initial architecture seed diagram
    return [
      {
        id: 'seed-node-1',
        type: 'rectangle',
        x: 180,
        y: 140,
        width: 200,
        height: 80,
        color: '#38BDF8',
        fillColor: 'rgba(56, 189, 248, 0.12)',
        strokeWidth: 2,
        text: 'Netty TCP Gateway\n(10k Clients)',
        authorId: 'system',
        authorName: 'Architect',
        authorColor: '#38BDF8',
        updatedAt: Date.now(),
      },
      {
        id: 'seed-arrow-1',
        type: 'arrow',
        x: 380,
        y: 180,
        points: [{ x: 380, y: 180 }, { x: 480, y: 180 }],
        color: '#94A3B8',
        strokeWidth: 2,
        authorId: 'system',
        authorName: 'Architect',
        authorColor: '#94A3B8',
        updatedAt: Date.now(),
      },
      {
        id: 'seed-node-2',
        type: 'ellipse',
        x: 480,
        y: 130,
        width: 220,
        height: 100,
        color: '#818CF8',
        fillColor: 'rgba(129, 140, 248, 0.12)',
        strokeWidth: 2,
        text: 'LMAX RingBuffer\n(Power-of-2 LockFree)',
        authorId: 'system',
        authorName: 'Architect',
        authorColor: '#818CF8',
        updatedAt: Date.now(),
      },
      {
        id: 'seed-arrow-2',
        type: 'arrow',
        x: 700,
        y: 180,
        points: [{ x: 700, y: 180 }, { x: 800, y: 180 }],
        color: '#94A3B8',
        strokeWidth: 2,
        authorId: 'system',
        authorName: 'Architect',
        authorColor: '#94A3B8',
        updatedAt: Date.now(),
      },
      {
        id: 'seed-node-3',
        type: 'rectangle',
        x: 800,
        y: 140,
        width: 210,
        height: 80,
        color: '#34D399',
        fillColor: 'rgba(52, 211, 153, 0.12)',
        strokeWidth: 2,
        text: 'Single-Thread Core\nFIFO Price-Time Matcher',
        authorId: 'system',
        authorName: 'Architect',
        authorColor: '#34D399',
        updatedAt: Date.now(),
      },
      {
        id: 'seed-sticky-1',
        type: 'sticky',
        x: 520,
        y: 280,
        width: 170,
        height: 130,
        color: '#FEF08A',
        strokeWidth: 1,
        text: 'Rule #1:\nZero memory allocation on matching fast-path! Pre-allocate orders.',
        authorId: 'bot-1',
        authorName: 'Martin Fowler',
        authorColor: '#F59E0B',
        updatedAt: Date.now(),
      },
    ];
  });

  const [undoStack, setUndoStack] = useState<CanvasElement[][]>([]);
  const [redoStack, setRedoStack] = useState<CanvasElement[][]>([]);
  // Live ref mirror of elements for socket handlers (avoids stale closures).
  const elementsRef = useRef<CanvasElement[]>([]);
  useEffect(() => { elementsRef.current = elements; }, [elements]);

  // Drawing interaction
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentElement, setCurrentElement] = useState<CanvasElement | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingTextElementId, setEditingTextElementId] = useState<string | null>(null);

  // Virtual Collaborator Bots
  const [bots, setBots] = useState<Collaborator[]>([]);
  const [isBotsActive, setIsBotsActive] = useState<boolean>(true);
  const [botCount, setBotCount] = useState<number>(8);
  const [botBehavior, setBotBehavior] = useState<'architect' | 'ideator' | 'explorer'>('architect');
  const [followBotId, setFollowBotId] = useState<string | null>(null);
  const botTargetWaypoints = useRef<Map<string, Point>>(new Map());
  const behaviorRef = useRef(botBehavior);
  behaviorRef.current = botBehavior;

  // ---- Live multi-computer collaboration (Java WebSocket server) ----
  const PEER_COLORS = ['#38BDF8', '#34D399', '#FBBF24', '#F472B6', '#A78BFA', '#818CF8', '#F97316', '#2DD4B6'];
  const peerColorFor = (name: string) => {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return PEER_COLORS[h % PEER_COLORS.length];
  };
  const [liveOn, setLiveOn] = useState(false);
  const [liveRoom, setLiveRoom] = useState('main');
  const [displayName, setDisplayName] = useState(
    () => `Guest-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  );
  const [peers, setPeers] = useState<Collaborator[]>([]);
  const [liveStatus, setLiveStatus] = useState<'off' | 'connecting' | 'live' | 'error'>('off');
  const wsRef = useRef<WebSocket | null>(null);
  const liveRoomRef = useRef(liveRoom);
  liveRoomRef.current = liveRoom;
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  const myColorRef = useRef(peerColorFor(displayName));
  const lastCursorSentRef = useRef(0);

  const sendLive = useCallback((obj: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ ...obj, room: liveRoomRef.current }));
    }
  }, []);

  const upsertLive = useCallback((el: CanvasElement) => {
    sendLive({ type: 'element', action: 'upsert', element: el });
  }, [sendLive]);

  const deleteLive = useCallback((id: string) => {
    sendLive({ type: 'element', action: 'delete', element: { id } });
  }, [sendLive]);

  const connectLive = useCallback(() => {
    if (wsRef.current) return;
    setLiveStatus('connecting');
    const host = window.location.hostname || 'localhost';
    const ws = new WebSocket(`ws://${host}:8090/ws/whiteboard`);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', room: liveRoomRef.current, name: displayNameRef.current }));
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.room && msg.room !== liveRoomRef.current) return;
      if (msg.type === 'snapshot') {
        const els = Array.isArray(msg.elements) ? (msg.elements as CanvasElement[]) : [];
        if (els.length === 0) {
          // Fresh room: seed it with my current canvas so late joiners see it.
          elementsRef.current.forEach((el) => {
            ws.send(JSON.stringify({ type: 'element', action: 'upsert', room: liveRoomRef.current, element: el }));
          });
        } else {
          setUndoStack((u) => [...u, elementsRef.current]);
          setElements(els);
        }
        setLiveStatus('live');
        setLiveOn(true);
        setIsBotsActive(false); // real humans now; pause the bot swarm
      } else if (msg.type === 'element') {
        const el = msg.element;
        if (!el || !el.id) return;
        if (msg.action === 'delete') {
          setElements((prev) => prev.filter((e) => e.id !== el.id));
        } else {
          setElements((prev) => {
            const idx = prev.findIndex((e) => e.id === el.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...el, updatedAt: Date.now() } as CanvasElement;
              return next;
            }
            return [...prev, el as CanvasElement];
          });
        }
      } else if (msg.type === 'presence') {
        const name = String(msg.user || 'anon');
        if (name === displayNameRef.current) return;
        if (msg.event === 'leave') {
          setPeers((prev) => prev.filter((p) => p.name !== name));
        } else {
          setPeers((prev) => {
            if (prev.some((p) => p.name === name)) return prev;
            return [...prev, {
              id: `peer-${name}`, name, color: peerColorFor(name),
              cursor: { x: 600, y: 400 }, activeTool: 'select' as ToolType,
              isBot: false, avatarSeed: name, lastAction: 'joined', lastActive: Date.now(),
            }];
          });
        }
      } else if (msg.type === 'cursor') {
        const name = String(msg.user || '');
        if (!name || name === displayNameRef.current) return;
        const pt = { x: Number(msg.x) || 0, y: Number(msg.y) || 0 };
        setPeers((prev) => prev.map((p) =>
          p.name === name ? { ...p, cursor: pt, lastActive: Date.now() } : p
        ));
      }
    };
    ws.onerror = () => setLiveStatus('error');
    ws.onclose = () => {
      wsRef.current = null;
      setLiveOn(false);
      setPeers([]);
      setLiveStatus((s) => (s === 'live' ? 'off' : s));
    };
  }, []);

  const disconnectLive = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      try { ws.send(JSON.stringify({ type: 'leave', room: liveRoomRef.current })); } catch { /* noop */ }
      ws.close();
    }
    wsRef.current = null;
    setLiveOn(false);
    setPeers([]);
    setLiveStatus('off');
  }, []);

  // Close the socket on unmount.
  useEffect(() => () => { wsRef.current?.close(); }, []);

  // Initialize Bots
  useEffect(() => {
    const initialBots: Collaborator[] = [];
    for (let i = 0; i < botCount; i++) {
      initialBots.push(createBotCollaborator(i, { width: 1200, height: 800 }));
    }
    setBots(initialBots);
  }, [botCount]);

  // Header "Spawn Bot Swarm" primary action -> add bots without remounting.
  useEffect(() => {
    const onSpawn = (e: Event) => {
      const count = (e as CustomEvent<{ count?: number }>).detail?.count ?? 15;
      setBotCount((curr) => Math.min(100, curr + count));
      setIsBotsActive(true);
    };
    window.addEventListener('apex:spawn-bots', onSpawn);
    return () => window.removeEventListener('apex:spawn-bots', onSpawn);
  }, []);

  // Bot Autonomous Simulation Loop
  useEffect(() => {
    if (!isBotsActive || bots.length === 0) return;

    const interval = setInterval(() => {
      const behavior = behaviorRef.current;
      // Per-behavior action probabilities: [addNode, addSticky]
      const probs =
        behavior === 'architect'
          ? { node: 0.22, sticky: 0.05 }
          : behavior === 'ideator'
            ? { node: 0.05, sticky: 0.24 }
            : { node: 0, sticky: 0 }; // explorer: roams the canvas

      setBots((prevBots) => {
        return prevBots.map((bot, index) => {
          // Get or create target waypoint
          let target = botTargetWaypoints.current.get(bot.id);
          if (!target || Math.hypot(target.x - bot.cursor.x, target.y - bot.cursor.y) < 15) {
            target = {
              x: 100 + Math.random() * 1000,
              y: 80 + Math.random() * 650,
            };
            botTargetWaypoints.current.set(bot.id, target);

            // Chance to perform an autonomous canvas action
            const actionRoll = Math.random();
            if (actionRoll < probs.sticky) {
              // Bot adds a sticky note with an architectural insight
              const idea = BOT_STICKY_IDEAS[Math.floor(Math.random() * BOT_STICKY_IDEAS.length)];
              const stickyColor = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
              const newSticky: CanvasElement = {
                id: `bot-sticky-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                type: 'sticky',
                x: Math.round(target.x),
                y: Math.round(target.y),
                width: 170,
                height: 130,
                color: stickyColor,
                strokeWidth: 1,
                text: idea,
                authorId: bot.id,
                authorName: bot.name,
                authorColor: bot.color,
                updatedAt: Date.now(),
              };

              setElements((curr) => {
                // Keep total elements bounded to prevent memory bloat
                const pruned = curr.length > 40 ? curr.slice(curr.length - 35) : curr;
                return [...pruned, newSticky];
              });
              bot.lastAction = 'Added sticky note';
            } else if (actionRoll < probs.sticky + probs.node) {
              // Bot draws an architecture node
              const node = BOT_ARCH_NODES[Math.floor(Math.random() * BOT_ARCH_NODES.length)];
              const newNode: CanvasElement = {
                id: `bot-node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                type: node.type,
                x: Math.round(target.x),
                y: Math.round(target.y),
                width: 180,
                height: 80,
                color: node.color,
                fillColor: `${node.color}15`,
                strokeWidth: 2,
                text: node.label,
                authorId: bot.id,
                authorName: bot.name,
                authorColor: bot.color,
                updatedAt: Date.now(),
              };
              setElements((curr) => [...curr, newNode]);
              bot.lastAction = `Created ${node.label}`;
            } else {
              bot.lastAction = behavior === 'explorer' ? 'Exploring canvas' : 'Reviewing architecture';
            }
          }

          // Smooth interpolation towards target waypoint (LERP)
          const dx = target.x - bot.cursor.x;
          const dy = target.y - bot.cursor.y;
          const speed = 0.08;
          const newX = bot.cursor.x + dx * speed;
          const newY = bot.cursor.y + dy * speed;

          return {
            ...bot,
            cursor: { x: newX, y: newY },
            lastActive: Date.now(),
          };
        });
      });

    }, 60);

    return () => clearInterval(interval);
  }, [isBotsActive, bots.length]);

  // Follow-cam: keep the followed bot centered in the viewport.
  useEffect(() => {
    if (!followBotId) return;
    const bot = bots.find((b) => b.id === followBotId);
    const container = containerRef.current;
    if (!bot || !container) return;
    setPan({
      x: container.clientWidth / 2 - bot.cursor.x * zoom,
      y: container.clientHeight / 2 - bot.cursor.y * zoom,
    });
  }, [bots, followBotId, zoom]);

  // Main Canvas Render
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset and fill background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Pan & Zoom transform
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // White board + subtle dot grid
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width / zoom, canvas.height / zoom);
    ctx.fillStyle = '#C9C9C9';
    const gridSize = 24;
    for (let x = 0; x < canvas.width / zoom; x += gridSize) {
      for (let y = 0; y < canvas.height / zoom; y += gridSize) {
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Combine committed elements and currently drawing element
    const allElements = currentElement ? [...elements, currentElement] : elements;

    for (const el of allElements) {
      ctx.save();
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.strokeWidth;
      ctx.fillStyle = el.fillColor || 'transparent';

      if (el.type === 'rectangle') {
        const w = el.width ?? 160;
        const h = el.height ?? 90;
        ctx.beginPath();
        ctx.roundRect(el.x, el.y, w, h, 8);
        ctx.stroke();
        if (el.fillColor) ctx.fill();

        if (el.text) {
          ctx.fillStyle = el.color;
          ctx.font = '13px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const lines = el.text.split('\n');
          lines.forEach((line, idx) => {
            ctx.fillText(line, el.x + w / 2, el.y + h / 2 - (lines.length - 1) * 9 + idx * 18);
          });
        }
      } else if (el.type === 'ellipse') {
        const w = el.width ?? 160;
        const h = el.height ?? 90;
        ctx.beginPath();
        ctx.ellipse(el.x + w / 2, el.y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (el.fillColor) ctx.fill();

        if (el.text) {
          ctx.fillStyle = el.color;
          ctx.font = '13px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const lines = el.text.split('\n');
          lines.forEach((line, idx) => {
            ctx.fillText(line, el.x + w / 2, el.y + h / 2 - (lines.length - 1) * 9 + idx * 18);
          });
        }
      } else if (el.type === 'sticky') {
        const w = el.width ?? 170;
        const h = el.height ?? 130;
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.roundRect(el.x + 3, el.y + 4, w, h, 6);
        ctx.fill();

        // Card body
        ctx.fillStyle = el.color;
        ctx.beginPath();
        ctx.roundRect(el.x, el.y, w, h, 6);
        ctx.fill();

        // Text
        ctx.fillStyle = '#1E293B';
        ctx.font = '12px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const words = (el.text || 'Insight').split(' ');
        let line = '';
        let lineY = el.y + 12;
        for (const word of words) {
          const testLine = line + word + ' ';
          if (ctx.measureText(testLine).width > w - 24) {
            ctx.fillText(line, el.x + 12, lineY);
            line = word + ' ';
            lineY += 16;
            if (lineY > el.y + h - 20) break;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, el.x + 12, lineY);

        // Author tag
        ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
        ctx.font = '10px monospace';
        ctx.fillText(`— ${el.authorName}`, el.x + 12, el.y + h - 18);
      } else if (el.type === 'stroke' && el.points && el.points.length > 1) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x, el.points[i].y);
        }
        ctx.stroke();
      } else if (el.type === 'arrow' && el.points && el.points.length >= 2) {
        const p1 = el.points[0];
        const p2 = el.points[1];
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Arrow head
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const headLen = 12;
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      } else if (el.type === 'text') {
        ctx.fillStyle = el.color;
        ctx.font = '15px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(el.text || 'Text', el.x, el.y + 16);
      }

      // Selection bounding box
      if (selectedElementId === el.id) {
        ctx.strokeStyle = '#6366F1';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        const w = el.width ?? 160;
        const h = el.height ?? 90;
        ctx.strokeRect(el.x - 4, el.y - 4, w + 8, h + 8);
        ctx.setLineDash([]);
      }

      ctx.restore();
    }

    // Render Virtual Collaborator Cursors
    for (const bot of bots) {
      ctx.save();
      const cx = bot.cursor.x;
      const cy = bot.cursor.y;

      // Cursor pointer path
      ctx.fillStyle = bot.color;
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy + 18);
      ctx.lineTo(cx + 4.5, cy + 14);
      ctx.lineTo(cx + 10, cy + 22);
      ctx.lineTo(cx + 13, cy + 20);
      ctx.lineTo(cx + 7.5, cy + 12);
      ctx.lineTo(cx + 14, cy + 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Bot Name Pill
      ctx.fillStyle = bot.color;
      ctx.beginPath();
      ctx.roundRect(cx + 14, cy + 12, bot.name.length * 7 + 14, 20, 4);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(bot.name, cx + 21, cy + 26);

      ctx.restore();
    }

    // Render Live Peer Cursors (real humans on other computers)
    for (const peer of peers) {
      ctx.save();
      const cx = peer.cursor.x;
      const cy = peer.cursor.y;

      ctx.fillStyle = peer.color;
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy + 18);
      ctx.lineTo(cx + 4.5, cy + 14);
      ctx.lineTo(cx + 10, cy + 22);
      ctx.lineTo(cx + 13, cy + 20);
      ctx.lineTo(cx + 7.5, cy + 12);
      ctx.lineTo(cx + 14, cy + 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = peer.color;
      ctx.beginPath();
      ctx.roundRect(cx + 14, cy + 12, peer.name.length * 7 + 14, 20, 4);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(peer.name, cx + 21, cy + 26);

      ctx.restore();
    }

    ctx.restore();
  }, [elements, currentElement, selectedElementId, bots, peers, pan, zoom]);

  // Redraw when state updates
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Resize canvas to container
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        renderCanvas();
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCanvas]);

  // Pointer Interaction Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;

    if (activeTool === 'select') {
      // Hit test elements from front to back
      const hit = [...elements].reverse().find((el) => isPointInElement({ x, y }, el));
      setSelectedElementId(hit ? hit.id : null);
      return;
    }

    if (activeTool === 'eraser') {
      const hit = [...elements].reverse().find((el) => isPointInElement({ x, y }, el));
      if (hit) {
        setUndoStack((prev) => [...prev, elements]);
        setElements((prev) => prev.filter((el) => el.id !== hit.id));
        deleteLive(hit.id);
      }
      return;
    }

    setIsDrawing(true);

    if (activeTool === 'pen') {
      setCurrentElement({
        id: `el-${Date.now()}`,
        type: 'stroke',
        points: [{ x, y }],
        x,
        y,
        color: selectedColor,
        strokeWidth,
        authorId: 'user',
        authorName: 'You',
        authorColor: selectedColor,
        updatedAt: Date.now(),
      });
    } else if (activeTool === 'rectangle' || activeTool === 'ellipse') {
      setCurrentElement({
        id: `el-${Date.now()}`,
        type: activeTool,
        x,
        y,
        width: 1,
        height: 1,
        color: selectedColor,
        fillColor: `${selectedColor}18`,
        strokeWidth,
        authorId: 'user',
        authorName: 'You',
        authorColor: selectedColor,
        updatedAt: Date.now(),
      });
    } else if (activeTool === 'arrow') {
      setCurrentElement({
        id: `el-${Date.now()}`,
        type: 'arrow',
        x,
        y,
        points: [{ x, y }, { x, y }],
        color: selectedColor,
        strokeWidth,
        authorId: 'user',
        authorName: 'You',
        authorColor: selectedColor,
        updatedAt: Date.now(),
      });
    } else if (activeTool === 'sticky') {
      const newSticky: CanvasElement = {
        id: `el-${Date.now()}`,
        type: 'sticky',
        x,
        y,
        width: 170,
        height: 130,
        color: selectedStickyColor,
        strokeWidth: 1,
        text: 'New architecture note...',
        authorId: 'user',
        authorName: 'You',
        authorColor: '#38BDF8',
        updatedAt: Date.now(),
      };
      setUndoStack((prev) => [...prev, elements]);
      setElements((prev) => [...prev, newSticky]);
      upsertLive(newSticky);
      setIsDrawing(false);
      setSelectedElementId(newSticky.id);
    } else if (activeTool === 'text') {
      const newText: CanvasElement = {
        id: `el-${Date.now()}`,
        type: 'text',
        x,
        y,
        width: 180,
        height: 30,
        color: selectedColor,
        strokeWidth: 1,
        text: 'System Component',
        authorId: 'user',
        authorName: 'You',
        authorColor: selectedColor,
        updatedAt: Date.now(),
      };
      setUndoStack((prev) => [...prev, elements]);
      setElements((prev) => [...prev, newText]);
      upsertLive(newText);
      setIsDrawing(false);
      setSelectedElementId(newText.id);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;

    // Broadcast my cursor to the live room (throttled).
    if (liveOn) {
      const now = Date.now();
      if (now - lastCursorSentRef.current > 120) {
        lastCursorSentRef.current = now;
        sendLive({ type: 'cursor', user: displayNameRef.current, x: Math.round(x), y: Math.round(y) });
      }
    }

    if (!isDrawing || !currentElement) return;

    if (currentElement.type === 'stroke') {
      setCurrentElement((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          points: [...(prev.points || []), { x, y }],
        };
      });
    } else if (currentElement.type === 'rectangle' || currentElement.type === 'ellipse') {
      setCurrentElement((prev) => {
        if (!prev) return null;
        const w = x - prev.x;
        const h = y - prev.y;
        return {
          ...prev,
          width: Math.abs(w),
          height: Math.abs(h),
          x: w < 0 ? x : prev.x,
          y: h < 0 ? y : prev.y,
        };
      });
    } else if (currentElement.type === 'arrow') {
      setCurrentElement((prev) => {
        if (!prev || !prev.points) return null;
        return {
          ...prev,
          points: [prev.points[0], { x, y }],
        };
      });
    }
  };

  const handlePointerUp = () => {
    if (isDrawing && currentElement) {
      setUndoStack((prev) => [...prev, elements]);
      setRedoStack([]);
      setElements((prev) => [...prev, currentElement]);
      upsertLive(currentElement);
      setCurrentElement(null);
    }
    setIsDrawing(false);
  };

  // Undo / Redo
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, elements]);
    setUndoStack((u) => u.slice(0, u.length - 1));
    setElements(prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, elements]);
    setRedoStack((r) => r.slice(0, r.length - 1));
    setElements(next);
  };

  const handleClear = () => {
    setUndoStack((prev) => [...prev, elements]);
    setElements([]);
    setSelectedElementId(null);
    sendLive({ type: 'clear' });
  };

  const handleExportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `whiteboard-architecture-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(elements, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `whiteboard-elements-${Date.now()}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Add more bot collaborators
  const handleAddBots = (delta: number) => {
    setBotCount((curr) => Math.max(0, Math.min(100, curr + delta)));
  };

  return (
    <div className="relative w-full h-[calc(100vh-101px)] bg-[#008080] overflow-hidden flex flex-col select-none">
      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-2 right-2 md:right-auto md:left-6 z-20 flex items-center gap-2 bg-[#C0C0C0] border-2 border-black rounded-none px-2.5 py-1.5 md:px-3 md:py-2 shadow-[4px_4px_0_rgba(0,0,0,0.45)] overflow-x-auto max-w-[calc(100vw-16px)]">
        {/* Tool Selector Buttons */}
        <div className="flex items-center gap-1 border-r border-black pr-2">
          <button
            onClick={() => setActiveTool('select')}
            className={`p-2 ${
              activeTool === 'select' ? 'win-btn-selected' : 'win-btn'
            }`}
            title="Select & Move"
          >
            <MousePointer className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveTool('pen')}
            className={`p-2 ${
              activeTool === 'pen' ? 'win-btn-selected' : 'win-btn'
            }`}
            title="Freehand Vector Pen"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveTool('rectangle')}
            className={`p-2 ${
              activeTool === 'rectangle' ? 'win-btn-selected' : 'win-btn'
            }`}
            title="Architecture Box"
          >
            <Square className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveTool('ellipse')}
            className={`p-2 ${
              activeTool === 'ellipse' ? 'win-btn-selected' : 'win-btn'
            }`}
            title="RingBuffer Ellipse"
          >
            <Circle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveTool('arrow')}
            className={`p-2 ${
              activeTool === 'arrow' ? 'win-btn-selected' : 'win-btn'
            }`}
            title="Connector Arrow"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveTool('sticky')}
            className={`p-2 ${
              activeTool === 'sticky' ? 'win-btn-sticky' : 'win-btn'
            }`}
            title="Architecture Sticky Note"
          >
            <StickyNote className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveTool('text')}
            className={`p-2 ${
              activeTool === 'text' ? 'win-btn-selected' : 'win-btn'
            }`}
            title="Text Component"
          >
            <Type className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveTool('eraser')}
            className={`p-2 ${
              activeTool === 'eraser' ? 'win-btn-danger' : 'win-btn'
            }`}
            title="Eraser"
          >
            <Eraser className="w-4 h-4" />
          </button>
        </div>

        {/* Color Palette */}
        {activeTool !== 'sticky' ? (
          <div className="flex items-center gap-1.5 border-r border-black pr-2">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedColor(c)}
                className={`w-5 h-5 rounded-full transition-transform ${
                  selectedColor === c ? 'scale-125 ring-2 ring-indigo-400' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 border-r border-black pr-2">
            {STICKY_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedStickyColor(c)}
                className={`w-5 h-5 rounded-sm transition-transform ${
                  selectedStickyColor === c ? 'scale-125 ring-2 ring-white' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}

        {/* History & Canvas Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="p-2 win-btn disabled:opacity-30 disabled:cursor-not-allowed"
            title="Undo"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="p-2 win-btn disabled:opacity-30 disabled:cursor-not-allowed"
            title="Redo"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleClear}
            className="p-2 win-btn"
            title="Clear Canvas"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleExportPng}
            className="p-2 win-btn"
            title="Export PNG Diagram"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleExportJson}
            className="p-2 win-btn"
            title="Export Elements JSON"
          >
            <FileJson className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Top Right: Live Collaborator Presence Strip */}
      <div className="absolute top-16 left-2 md:top-4 md:left-auto md:right-6 z-20 flex items-center gap-2.5 md:gap-3 bg-[#C0C0C0] border-2 border-black rounded-none px-3 py-1.5 md:px-4 md:py-2 shadow-[4px_4px_0_rgba(0,0,0,0.45)] max-w-[calc(100vw-16px)] overflow-x-auto">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#0000CD]" />
          <span className="text-xs font-semibold text-black">
            {1 + bots.length + peers.length} Collaborators
          </span>
        </div>

        {/* User Avatars List */}
        <div className="flex items-center -space-x-1.5 overflow-hidden">
          {/* Host User */}
          <div
            className="w-7 h-7 rounded-full bg-[#0000CD] border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold text-white shadow"
            title="You (Session Host)"
          >
            You
          </div>
          {/* Bot Avatars (click to follow a collaborator's camera) */}
          {bots.slice(0, 5).map((bot) => (
            <button
              key={bot.id}
              onClick={() => setFollowBotId((curr) => (curr === bot.id ? null : bot.id))}
              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white shadow transition-transform hover:scale-110 cursor-pointer ${
                followBotId === bot.id ? 'border-indigo-400 scale-110' : 'border-slate-900'
              }`}
              style={{ backgroundColor: bot.color }}
              title={`${bot.name} — ${bot.lastAction} (click to ${followBotId === bot.id ? 'stop following' : 'follow'})`}
            >
              {followBotId === bot.id ? <Crosshair className="w-3.5 h-3.5" /> : bot.name.charAt(0)}
            </button>
          ))}
          {bots.length > 5 && (
            <div className="w-7 h-7 rounded-full bg-[#C0C0C0] border-2 border-slate-900 flex items-center justify-center text-[10px] font-medium text-[#1F1F1F]">
              +{bots.length - 5}
            </div>
          )}
        </div>

        {/* Bot Controls */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-black">
          {/* Behavior mode selector */}
          <div className="flex items-center gap-0.5 bg-white rounded-none p-0.5" title="Bot swarm behavior">
            {(
              [
                { id: 'architect', icon: DraftingCompass, label: 'Architects draw nodes' },
                { id: 'ideator', icon: Brain, label: 'Ideators drop stickies' },
                { id: 'explorer', icon: Footprints, label: 'Explorers roam only' },
              ] as const
            ).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setBotBehavior(id)}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  botBehavior === id ? 'bg-[#0000CD] text-white' : 'text-[#404040] hover:text-black'
                }`}
                title={label}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsBotsActive(!isBotsActive)}
            className={`p-1.5 rounded-none text-xs font-medium flex items-center gap-1 transition-colors ${
              isBotsActive
                ? 'bg-emerald-950/60 text-[#047857] border border-emerald-800/60'
                : 'bg-[#C0C0C0] text-[#404040]'
            }`}
            title={isBotsActive ? 'Pause Bot Swarm' : 'Resume Bot Swarm'}
          >
            {isBotsActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isBotsActive ? 'Active' : 'Paused'}
          </button>

          <button
            onClick={() => handleAddBots(5)}
            className="px-2 py-1 bg-[#C0C0C0] hover:bg-slate-700 text-black text-xs rounded-none flex items-center gap-1 font-medium transition-colors"
            title="Spawn +5 Collaborator Bots"
          >
            <Plus className="w-3 h-3 text-[#0000CD]" />
            +5 Bots
          </button>
        </div>

        {/* Live multi-computer collaboration */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-black" title="Join a live room hosted by the Java server">
          <RadioTower className={`w-4 h-4 ${liveOn ? 'text-[#047857]' : 'text-[#404040]'}`} />
          {!liveOn && (
            <>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 16))}
                placeholder="Name"
                className="bg-white text-xs text-black px-2 py-1 rounded-none border border-black focus:outline-none focus:border-[#0000CD] w-20"
                title="Your display name"
              />
              <input
                value={liveRoom}
                onChange={(e) => setLiveRoom(e.target.value.slice(0, 24) || 'main')}
                placeholder="Room"
                className="bg-white text-xs text-black px-2 py-1 rounded-none border border-black focus:outline-none focus:border-[#0000CD] w-20"
                title="Room name — everyone with the same room draws together"
              />
            </>
          )}
          <button
            onClick={() => (liveOn ? disconnectLive() : connectLive())}
            disabled={liveStatus === 'connecting'}
            className={`px-2.5 py-1 text-xs font-semibold rounded-none flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
              liveOn
                ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60 hover:bg-rose-900/60'
                : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/60'
            }`}
            title={liveOn ? `Leave live room "${liveRoom}"` : 'Connect to the live whiteboard server on this machine (port 8090)'}
          >
            {liveOn ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
            {liveStatus === 'connecting' ? 'Connecting…' : liveOn ? `Live: ${liveRoom}` : 'Go Live'}
          </button>
          {liveStatus === 'error' && (
            <span className="text-[10px] text-[#DC2626]">server unreachable</span>
          )}
          {/* Live peer avatars */}
          {peers.slice(0, 4).map((p) => (
            <div
              key={p.id}
              className="w-7 h-7 rounded-full border-2 border-[#047857] flex items-center justify-center text-[10px] font-bold text-white shadow"
              style={{ backgroundColor: p.color }}
              title={`${p.name} (live)`}
            >
              {p.name.charAt(0).toUpperCase()}
            </div>
          ))}
          {peers.length > 4 && (
            <div className="w-7 h-7 rounded-full bg-[#C0C0C0] border-2 border-slate-900 flex items-center justify-center text-[10px] font-medium text-[#1F1F1F]">
              +{peers.length - 4}
            </div>
          )}
        </div>
      </div>

      {/* Main Vector Canvas */}
      <div ref={containerRef} className="flex-1 w-full h-full relative cursor-crosshair">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute inset-0 w-full h-full touch-none"
        />
      </div>

      {/* Bottom Zoom & View Controls */}
      <div className="absolute bottom-4 left-6 z-20 flex items-center gap-2 bg-[#C0C0C0] border-2 border-black rounded-none px-3 py-1.5 text-xs text-[#1F1F1F] shadow-[4px_4px_0_rgba(0,0,0,0.45)]">
        <button
          onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(1))))}
          className="p-1 hover:text-black"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="font-mono tabular-nums px-1">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.1).toFixed(1))))}
          className="p-1 hover:text-black"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="ml-1 p-1 hover:text-black text-[#404040]"
          title="Reset View"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Selected Element Quick Editor (if selected) */}
      {selectedElementId && (
        <div className="absolute bottom-4 right-6 z-20 bg-white  border border-[#0000CD] rounded-none p-3 shadow-[4px_4px_0_rgba(0,0,0,0.45)] flex items-center gap-3">
          <span className="text-xs font-medium text-[#0000CD]">Selected Node</span>
          <input
            type="text"
            placeholder="Edit text..."
            value={elements.find((el) => el.id === selectedElementId)?.text || ''}
            onChange={(e) => {
              const val = e.target.value;
              setElements((prev) =>
                prev.map((el) => (el.id === selectedElementId ? { ...el, text: val } : el))
              );
            }}
            onBlur={() => {
              const el = elements.find((el) => el.id === selectedElementId);
              if (el) upsertLive(el);
            }}
            className="bg-[#C0C0C0] text-xs text-black px-3 py-1.5 rounded-none border border-black focus:outline-none focus:border-[#0000CD] w-48"
          />
          <button
            onClick={() => {
              setElements((prev) => prev.filter((el) => el.id !== selectedElementId));
              if (selectedElementId) deleteLive(selectedElementId);
              setSelectedElementId(null);
            }}
            className="px-2.5 py-1.5 text-xs text-[#DC2626] hover:bg-rose-950/40 rounded-none transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};
