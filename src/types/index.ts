/**
 * Core type definitions for Collaborative Whiteboard & LMAX Disruptor Matching Engine
 */

export type ToolType = 'select' | 'pen' | 'rectangle' | 'ellipse' | 'arrow' | 'sticky' | 'text' | 'eraser';

export interface Point {
  x: number;
  y: number;
}

export interface CanvasElement {
  id: string;
  type: 'stroke' | 'rectangle' | 'ellipse' | 'arrow' | 'sticky' | 'text';
  points?: Point[];
  x: number;
  y: number;
  width?: number;
  height?: number;
  color: string;
  fillColor?: string;
  strokeWidth: number;
  text?: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  updatedAt: number;
}

export interface Collaborator {
  id: string;
  name: string;
  color: string;
  cursor: Point;
  activeTool: ToolType;
  isBot: boolean;
  avatarSeed: string;
  lastAction: string;
  lastActive: number;
}

// Matching Engine Types
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';
export type OrderStatus = 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';

export interface Order {
  id: string;
  traderId: string;
  traderName: string;
  side: OrderSide;
  type: OrderType;
  price: number; // 0 for market
  size: number;
  filledSize: number;
  timestamp: number;
  status: OrderStatus;
  optionKey?: string; // For MCQ auction: 'A' | 'B' | 'C' | 'D'
}

export interface Trade {
  id: string;
  buyOrderId: string;
  sellOrderId: string;
  buyerName: string;
  sellerName: string;
  price: number;
  size: number;
  timestamp: number;
  aggressiveSide: OrderSide;
  optionKey?: string;
}

export interface OrderBookLevel {
  price: number;
  totalVolume: number;
  orderCount: number;
  orders: Order[];
}

export interface OrderBookState {
  bids: OrderBookLevel[]; // Sorted descending by price
  asks: OrderBookLevel[]; // Sorted ascending by price
  lastTradePrice: number;
  lastTradeTimestamp: number;
  midPrice: number;
  spread: number;
}

// LMAX Disruptor Ring Buffer simulation types
export type SlotState = 'FREE' | 'WRITING' | 'PUBLISHED' | 'JOURNALED' | 'MATCHED' | 'DISPATCHED';

export interface RingSlot {
  index: number;
  sequence: number;
  state: SlotState;
  payload: Order | null;
  timestamp: number;
}

export interface DisruptorMetrics {
  totalProcessed: number;
  throughputOpsSec: number;
  avgLatencyUs: number;
  p99LatencyUs: number;
  maxLatencyUs: number;
  ringCapacity: number;
  producerCursor: number;
  consumerCursor: number;
  ringBufferUsage: number; // 0 - 100%
}

// Multiple Choice Consensus simulation
export interface MCQQuestion {
  id: string;
  title: string;
  context: string;
  options: {
    key: 'A' | 'B' | 'C' | 'D';
    label: string;
    isCorrect?: boolean;
    poolVolume: number;
    impliedOdds: number; // 0 - 100%
    bidsCount: number;
  }[];
  totalBidsVolume: number;
}
