import { CanvasElement, Collaborator, Point } from '../types/index.ts';

export const BOT_NAMES = [
  'Ada Lovelace',
  'Martin Fowler',
  'Leslie Lamport',
  'Barbara Liskov',
  'Donald Knuth',
  'Grace Hopper',
  'Ken Thompson',
  'Linus Torvalds',
  'Margaret Hamilton',
  'Edsger Dijkstra',
  'James Gosling',
  'Alan Kay',
];

export const BOT_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#14B8A6', // Teal
];

export const BOT_STICKY_IDEAS = [
  'Zero-GC RingBuffer: pre-allocated event objects prevent JVM stop-the-world pauses',
  'Cache line padding: 128 bytes around Sequencer head/tail stops false sharing',
  'Mechanical Sympathy: align data access with L1/L2 hardware prefetchers',
  'Single-writer principle: 1 thread per OrderBook removes all lock contention',
  'Disruptor DSL: Journaler & Replicator run in parallel before Matching logic',
  'Project Loom virtual threads handle thousands of concurrent client TCP sockets',
  'Price-Time Priority: O(1) level lookup + FIFO queue for fair executions',
  'Aeron IPC transport: zero-copy shared memory queues for < 100ns latency',
  'Multiple-Choice auction: dynamic token pricing reaches Nash consensus',
  'JMH Benchmark: measuring p99.9 latency under 50,000 orders/sec load',
];

export const BOT_ARCH_NODES = [
  { label: 'Client Gateway (Netty)', type: 'rectangle' as const, color: '#38BDF8' },
  { label: 'LMAX RingBuffer (1M Slots)', type: 'ellipse' as const, color: '#818CF8' },
  { label: 'WAL Journaler (RAID 10)', type: 'rectangle' as const, color: '#F472B6' },
  { label: 'Matching Engine (Core 0)', type: 'rectangle' as const, color: '#34D399' },
  { label: 'Market Data Feed (UDP)', type: 'ellipse' as const, color: '#FBBF24' },
];

/**
 * Checks if a point (px, py) is inside or near a canvas element
 */
export function isPointInElement(point: Point, elem: CanvasElement, hitTolerance: number = 10): boolean {
  if (elem.type === 'rectangle' || elem.type === 'sticky') {
    const w = elem.width ?? 160;
    const h = elem.height ?? (elem.type === 'sticky' ? 140 : 100);
    return (
      point.x >= elem.x - hitTolerance &&
      point.x <= elem.x + w + hitTolerance &&
      point.y >= elem.y - hitTolerance &&
      point.y <= elem.y + h + hitTolerance
    );
  }

  if (elem.type === 'ellipse') {
    const rx = (elem.width ?? 160) / 2;
    const ry = (elem.height ?? 100) / 2;
    const cx = elem.x + rx;
    const cy = elem.y + ry;
    const normalized = Math.pow((point.x - cx) / (rx + hitTolerance), 2) + Math.pow((point.y - cy) / (ry + hitTolerance), 2);
    return normalized <= 1;
  }

  if (elem.type === 'text') {
    const w = elem.width ?? 180;
    const h = elem.height ?? 40;
    return (
      point.x >= elem.x - hitTolerance &&
      point.x <= elem.x + w + hitTolerance &&
      point.y >= elem.y - hitTolerance &&
      point.y <= elem.y + h + hitTolerance
    );
  }

  if (elem.type === 'stroke' && elem.points && elem.points.length > 0) {
    for (const p of elem.points) {
      const dist = Math.hypot(p.x - point.x, p.y - point.y);
      if (dist <= elem.strokeWidth + hitTolerance) return true;
    }
  }

  if (elem.type === 'arrow' && elem.points && elem.points.length >= 2) {
    const p1 = elem.points[0];
    const p2 = elem.points[1];
    const distToSegment = distanceToLineSegment(point, p1, p2);
    return distToSegment <= elem.strokeWidth + hitTolerance;
  }

  return false;
}

function distanceToLineSegment(p: Point, a: Point, b: Point): number {
  const l2 = Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

/**
 * Creates a new bot collaborator instance
 */
export function createBotCollaborator(idIndex: number, bounds: { width: number; height: number }): Collaborator {
  const name = `${BOT_NAMES[idIndex % BOT_NAMES.length]} (Bot ${idIndex + 1})`;
  const color = BOT_COLORS[idIndex % BOT_COLORS.length];
  const x = 100 + Math.random() * (bounds.width - 200);
  const y = 100 + Math.random() * (bounds.height - 200);

  return {
    id: `bot-${idIndex}-${Date.now()}`,
    name,
    color,
    cursor: { x, y },
    activeTool: 'pen',
    isBot: true,
    avatarSeed: `${idIndex}`,
    lastAction: 'Joined whiteboard',
    lastActive: Date.now(),
  };
}
