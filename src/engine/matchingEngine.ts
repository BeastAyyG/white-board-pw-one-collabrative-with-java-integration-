import { Order, Trade, OrderBookLevel, OrderBookState, OrderSide, OrderType } from '../types/index.ts';

/**
 * Pure, deterministic Price-Time Priority (FIFO) Order Matching Engine
 * Compatible with LMAX Disruptor single-threaded business logic execution model.
 */
export class MatchingEngine {
  private bids: Map<number, Order[]> = new Map(); // Price -> Array of orders in arrival order (FIFO)
  private asks: Map<number, Order[]> = new Map(); // Price -> Array of orders in arrival order (FIFO)
  private orderMap: Map<string, { order: Order; price: number; side: OrderSide }> = new Map();
  private trades: Trade[] = [];
  private lastTradePrice: number = 100.0;
  private lastTradeTimestamp: number = Date.now();
  private tradeCounter: number = 0;

  constructor(initialMidPrice: number = 100.0) {
    this.lastTradePrice = initialMidPrice;
  }

  /**
   * Submits an order into the matching engine.
   * Returns newly executed trades (if any).
   */
  public processOrder(orderInput: {
    id: string;
    traderId: string;
    traderName: string;
    side: OrderSide;
    type: OrderType;
    price: number;
    size: number;
    timestamp?: number;
    optionKey?: string;
  }): { trades: Trade[]; remainingOrder: Order | null } {
    const timestamp = orderInput.timestamp ?? Date.now();
    const order: Order = {
      ...orderInput,
      filledSize: 0,
      timestamp,
      status: 'NEW',
    };

    const executedTrades: Trade[] = [];

    if (order.side === 'BUY') {
      this.matchBuyOrder(order, executedTrades);
    } else {
      this.matchSellOrder(order, executedTrades);
    }

    if (order.filledSize === order.size) {
      order.status = 'FILLED';
      return { trades: executedTrades, remainingOrder: null };
    }

    if (order.type === 'MARKET') {
      // Market order with unfilled balance is cancelled (Immediate or Cancel style)
      order.status = order.filledSize > 0 ? 'PARTIALLY_FILLED' : 'REJECTED';
      return { trades: executedTrades, remainingOrder: null };
    }

    // Limit order rests on the book
    order.status = order.filledSize > 0 ? 'PARTIALLY_FILLED' : 'NEW';
    this.insertIntoBook(order);
    return { trades: executedTrades, remainingOrder: order };
  }

  private matchBuyOrder(incomingBuy: Order, executedTrades: Trade[]): void {
    const sortedAskPrices = Array.from(this.asks.keys()).sort((a, b) => a - b);

    for (const askPrice of sortedAskPrices) {
      if (incomingBuy.type === 'LIMIT' && askPrice > incomingBuy.price) {
        break; // Best ask is higher than limit buy price
      }

      const ordersAtPrice = this.asks.get(askPrice);
      if (!ordersAtPrice || ordersAtPrice.length === 0) continue;

      let i = 0;
      while (i < ordersAtPrice.length && incomingBuy.filledSize < incomingBuy.size) {
        const restingAsk = ordersAtPrice[i];
        const remainingIncoming = incomingBuy.size - incomingBuy.filledSize;
        const remainingResting = restingAsk.size - restingAsk.filledSize;

        const matchQty = Math.min(remainingIncoming, remainingResting);
        incomingBuy.filledSize += matchQty;
        restingAsk.filledSize += matchQty;

        const trade: Trade = {
          id: `T-${++this.tradeCounter}`,
          buyOrderId: incomingBuy.id,
          sellOrderId: restingAsk.id,
          buyerName: incomingBuy.traderName,
          sellerName: restingAsk.traderName,
          price: askPrice, // Execution price is maker's price
          size: matchQty,
          timestamp: Date.now(),
          aggressiveSide: 'BUY',
          optionKey: incomingBuy.optionKey ?? restingAsk.optionKey,
        };

        executedTrades.push(trade);
        this.trades.unshift(trade);
        if (this.trades.length > 200) this.trades.pop();

        this.lastTradePrice = askPrice;
        this.lastTradeTimestamp = trade.timestamp;

        if (restingAsk.filledSize === restingAsk.size) {
          restingAsk.status = 'FILLED';
          this.orderMap.delete(restingAsk.id);
          ordersAtPrice.splice(i, 1);
        } else {
          restingAsk.status = 'PARTIALLY_FILLED';
          i++;
        }
      }

      if (ordersAtPrice.length === 0) {
        this.asks.delete(askPrice);
      }

      if (incomingBuy.filledSize >= incomingBuy.size) {
        break;
      }
    }
  }

  private matchSellOrder(incomingSell: Order, executedTrades: Trade[]): void {
    const sortedBidPrices = Array.from(this.bids.keys()).sort((a, b) => b - a);

    for (const bidPrice of sortedBidPrices) {
      if (incomingSell.type === 'LIMIT' && bidPrice < incomingSell.price) {
        break; // Best bid is lower than limit sell price
      }

      const ordersAtPrice = this.bids.get(bidPrice);
      if (!ordersAtPrice || ordersAtPrice.length === 0) continue;

      let i = 0;
      while (i < ordersAtPrice.length && incomingSell.filledSize < incomingSell.size) {
        const restingBid = ordersAtPrice[i];
        const remainingIncoming = incomingSell.size - incomingSell.filledSize;
        const remainingResting = restingBid.size - restingBid.filledSize;

        const matchQty = Math.min(remainingIncoming, remainingResting);
        incomingSell.filledSize += matchQty;
        restingBid.filledSize += matchQty;

        const trade: Trade = {
          id: `T-${++this.tradeCounter}`,
          buyOrderId: restingBid.id,
          sellOrderId: incomingSell.id,
          buyerName: restingBid.traderName,
          sellerName: incomingSell.traderName,
          price: bidPrice, // Maker price
          size: matchQty,
          timestamp: Date.now(),
          aggressiveSide: 'SELL',
          optionKey: incomingSell.optionKey ?? restingBid.optionKey,
        };

        executedTrades.push(trade);
        this.trades.unshift(trade);
        if (this.trades.length > 200) this.trades.pop();

        this.lastTradePrice = bidPrice;
        this.lastTradeTimestamp = trade.timestamp;

        if (restingBid.filledSize === restingBid.size) {
          restingBid.status = 'FILLED';
          this.orderMap.delete(restingBid.id);
          ordersAtPrice.splice(i, 1);
        } else {
          restingBid.status = 'PARTIALLY_FILLED';
          i++;
        }
      }

      if (ordersAtPrice.length === 0) {
        this.bids.delete(bidPrice);
      }

      if (incomingSell.filledSize >= incomingSell.size) {
        break;
      }
    }
  }

  private insertIntoBook(order: Order): void {
    const book = order.side === 'BUY' ? this.bids : this.asks;
    if (!book.has(order.price)) {
      book.set(order.price, []);
    }
    book.get(order.price)!.push(order);
    this.orderMap.set(order.id, { order, price: order.price, side: order.side });
  }

  /**
   * Cancel an existing order by id
   */
  public cancelOrder(orderId: string): boolean {
    const entry = this.orderMap.get(orderId);
    if (!entry) return false;

    const book = entry.side === 'BUY' ? this.bids : this.asks;
    const ordersAtPrice = book.get(entry.price);
    if (!ordersAtPrice) return false;

    const idx = ordersAtPrice.findIndex(o => o.id === orderId);
    if (idx !== -1) {
      const removed = ordersAtPrice.splice(idx, 1)[0];
      removed.status = 'CANCELLED';
      this.orderMap.delete(orderId);
      if (ordersAtPrice.length === 0) {
        book.delete(entry.price);
      }
      return true;
    }
    return false;
  }

  /**
   * Aggregates L2 book state
   */
  public getOrderBookState(maxDepth: number = 8): OrderBookState {
    const bidsLevels: OrderBookLevel[] = [];
    const asksLevels: OrderBookLevel[] = [];

    const sortedBidPrices = Array.from(this.bids.keys()).sort((a, b) => b - a);
    for (const price of sortedBidPrices.slice(0, maxDepth)) {
      const orders = this.bids.get(price) || [];
      const volume = orders.reduce((sum, o) => sum + (o.size - o.filledSize), 0);
      bidsLevels.push({
        price,
        totalVolume: volume,
        orderCount: orders.length,
        orders: [...orders],
      });
    }

    const sortedAskPrices = Array.from(this.asks.keys()).sort((a, b) => a - b);
    for (const price of sortedAskPrices.slice(0, maxDepth)) {
      const orders = this.asks.get(price) || [];
      const volume = orders.reduce((sum, o) => sum + (o.size - o.filledSize), 0);
      asksLevels.push({
        price,
        totalVolume: volume,
        orderCount: orders.length,
        orders: [...orders],
      });
    }

    const bestBid = bidsLevels.length > 0 ? bidsLevels[0].price : this.lastTradePrice;
    const bestAsk = asksLevels.length > 0 ? asksLevels[0].price : this.lastTradePrice;
    const spread = Math.max(0, Number((bestAsk - bestBid).toFixed(2)));
    const midPrice = Number(((bestBid + bestAsk) / 2).toFixed(2));

    return {
      bids: bidsLevels,
      asks: asksLevels,
      lastTradePrice: this.lastTradePrice,
      lastTradeTimestamp: this.lastTradeTimestamp,
      midPrice,
      spread,
    };
  }

  public getRecentTrades(): Trade[] {
    return [...this.trades];
  }

  public getActiveOrderCount(): number {
    return this.orderMap.size;
  }

  public clear(): void {
    this.bids.clear();
    this.asks.clear();
    this.orderMap.clear();
    this.trades = [];
  }
}
