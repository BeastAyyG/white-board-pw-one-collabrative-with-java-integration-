import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchingEngine } from './matchingEngine.ts';
import { DisruptorRingBuffer } from './ringBuffer.ts';
import { Order } from '../types/index.ts';

test('MatchingEngine places non-matching limit orders in book', () => {
  const engine = new MatchingEngine(100.0);

  // Submit Limit Buy at $99.00
  const buyRes = engine.processOrder({
    id: 'B1',
    traderId: 'T1',
    traderName: 'Alice',
    side: 'BUY',
    type: 'LIMIT',
    price: 99.0,
    size: 10,
  });

  assert.equal(buyRes.trades.length, 0);
  assert.notEqual(buyRes.remainingOrder, null);
  assert.equal(engine.getActiveOrderCount(), 1);

  // Submit Limit Sell at $101.00
  const sellRes = engine.processOrder({
    id: 'S1',
    traderId: 'T2',
    traderName: 'Bob',
    side: 'SELL',
    type: 'LIMIT',
    price: 101.0,
    size: 5,
  });

  assert.equal(sellRes.trades.length, 0);
  assert.equal(engine.getActiveOrderCount(), 2);

  const state = engine.getOrderBookState();
  assert.equal(state.bids.length, 1);
  assert.equal(state.bids[0].price, 99.0);
  assert.equal(state.bids[0].totalVolume, 10);
  assert.equal(state.asks.length, 1);
  assert.equal(state.asks[0].price, 101.0);
  assert.equal(state.asks[0].totalVolume, 5);
  assert.equal(state.spread, 2.0);
});

test('MatchingEngine enforces Price-Time Priority FIFO matching', () => {
  const engine = new MatchingEngine(100.0);

  // Two sell orders at the same price ($100.00), S1 arrived first, S2 arrived second
  engine.processOrder({
    id: 'S1',
    traderId: 'T1',
    traderName: 'Alice',
    side: 'SELL',
    type: 'LIMIT',
    price: 100.0,
    size: 10,
    timestamp: 1000,
  });

  engine.processOrder({
    id: 'S2',
    traderId: 'T2',
    traderName: 'Bob',
    side: 'SELL',
    type: 'LIMIT',
    price: 100.0,
    size: 10,
    timestamp: 1001,
  });

  // Buyer arrives asking for 15 units at $100.00
  const res = engine.processOrder({
    id: 'B1',
    traderId: 'T3',
    traderName: 'Charlie',
    side: 'BUY',
    type: 'LIMIT',
    price: 100.0,
    size: 15,
    timestamp: 1002,
  });

  // FIFO check: S1 should be fully matched first (10 units), then S2 partially matched (5 units)
  assert.equal(res.trades.length, 2);
  assert.equal(res.trades[0].sellOrderId, 'S1');
  assert.equal(res.trades[0].size, 10);
  assert.equal(res.trades[1].sellOrderId, 'S2');
  assert.equal(res.trades[1].size, 5);

  const state = engine.getOrderBookState();
  assert.equal(state.bids.length, 0);
  assert.equal(state.asks.length, 1);
  assert.equal(state.asks[0].totalVolume, 5); // 10 - 5 remaining on S2
});

test('MatchingEngine handles Market Order sweeps and cancellations', () => {
  const engine = new MatchingEngine(100.0);

  engine.processOrder({
    id: 'S1',
    traderId: 'T1',
    traderName: 'Alice',
    side: 'SELL',
    type: 'LIMIT',
    price: 100.0,
    size: 10,
  });

  engine.processOrder({
    id: 'S2',
    traderId: 'T2',
    traderName: 'Bob',
    side: 'SELL',
    type: 'LIMIT',
    price: 102.0,
    size: 10,
  });

  // Market order buying 15 sweeps through level 100 and into level 102
  const marketBuy = engine.processOrder({
    id: 'MB1',
    traderId: 'T3',
    traderName: 'MarketTrader',
    side: 'BUY',
    type: 'MARKET',
    price: 0,
    size: 15,
  });

  assert.equal(marketBuy.trades.length, 2);
  assert.equal(marketBuy.trades[0].price, 100.0);
  assert.equal(marketBuy.trades[0].size, 10);
  assert.equal(marketBuy.trades[1].price, 102.0);
  assert.equal(marketBuy.trades[1].size, 5);

  // Cancel remaining 5 on S2
  const cancelSuccess = engine.cancelOrder('S2');
  assert.equal(cancelSuccess, true);
  assert.equal(engine.getActiveOrderCount(), 0);
});

test('DisruptorRingBuffer sequence indexing and stage cursors', () => {
  const ring = new DisruptorRingBuffer(16);
  assert.equal(ring.capacity, 16);

  const mockOrder: Order = {
    id: 'O1',
    traderId: 'T1',
    traderName: 'Alice',
    side: 'BUY',
    type: 'LIMIT',
    price: 100,
    size: 1,
    filledSize: 0,
    timestamp: Date.now(),
    status: 'NEW',
  };

  const seq0 = ring.publish(mockOrder);
  assert.equal(seq0, 0);

  const slots = ring.getSlots();
  assert.equal(slots[0].state, 'PUBLISHED');
  assert.equal(slots[0].sequence, 0);

  // Step journaler
  const journaled = ring.stepJournaler(1);
  assert.equal(journaled, 1);
  assert.equal(slots[0].state, 'JOURNALED');

  // Step matching
  let matchedOrder: Order | null = null;
  const matched = ring.stepMatching(1, (o) => {
    matchedOrder = o;
  });
  assert.equal(matched, 1);
  assert.equal(slots[0].state, 'MATCHED');
  assert.notEqual(matchedOrder, null);

  // Step publisher
  const published = ring.stepPublisher(1);
  assert.equal(published, 1);
  assert.equal(slots[0].state, 'DISPATCHED');
});
