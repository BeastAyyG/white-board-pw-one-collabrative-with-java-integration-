package com.apex.engine;

import java.util.Arrays;

/**
 * Ultra-High-Performance Limit Order Book in Java.
 * - Price-Time Priority (FIFO) matching algorithm
 * - Uses flat primitive arrays and indexed doubly linked list nodes
 * - Zero Garbage Collection on critical path (no Node or Order allocations)
 */
public final class ZeroGcOrderBook {

    private static final int MAX_ORDERS = 200_000;
    private static final int MAX_PRICE_TICKS = 10_000; // e.g. 100.00 base +/- 50.00 at 1-cent ticks

    // Fast order pool: index 0 is reserved as null
    private final long[] orderId = new long[MAX_ORDERS];
    private final long[] traderId = new long[MAX_ORDERS];
    private final byte[] orderSide = new byte[MAX_ORDERS];
    private final long[] initialQty = new long[MAX_ORDERS];
    private final long[] leavesQty = new long[MAX_ORDERS];
    private final double[] orderPrice = new double[MAX_ORDERS];
    private final byte[] optionKey = new byte[MAX_ORDERS];

    // Doubly linked list pointers per order
    private final int[] prevOrderIdx = new int[MAX_ORDERS];
    private final int[] nextOrderIdx = new int[MAX_ORDERS];

    // Price level heads and tails (Price -> Head Order Idx, Tail Order Idx)
    private final int[] bidLevelHead = new int[MAX_PRICE_TICKS];
    private final int[] bidLevelTail = new int[MAX_PRICE_TICKS];
    private final long[] bidLevelVolume = new long[MAX_PRICE_TICKS];

    private final int[] askLevelHead = new int[MAX_PRICE_TICKS];
    private final int[] askLevelTail = new int[MAX_PRICE_TICKS];
    private final long[] askLevelVolume = new long[MAX_PRICE_TICKS];

    // Best Price Pointers (tick indexes)
    private int bestBidTick = -1;
    private int bestAskTick = Integer.MAX_VALUE;

    private int nextFreeOrderSlot = 1;

    // Free-list for safe slot reuse (index 0 stays reserved as null)
    private final int[] freeStack = new int[MAX_ORDERS];
    private int freeTop = 0;

    // Open-addressing orderId -> slot index (power-of-2, 0 key = empty sentinel)
    private static final int ID_INDEX_BITS = 18;
    private static final int ID_INDEX_MASK = (1 << ID_INDEX_BITS) - 1;
    private final long[] idKeys = new long[1 << ID_INDEX_BITS];
    private final int[] idSlots = new int[1 << ID_INDEX_BITS];

    // Operational counters
    private long cancels;
    private long rejectedRests; // limit orders dropped because the pool was full
    private long trades;

    private final double tickSize;
    private final double basePrice;

    public ZeroGcOrderBook(double basePrice, double tickSize) {
        this.basePrice = basePrice;
        this.tickSize = tickSize;
        clear();
    }

    public void clear() {
        Arrays.fill(bidLevelHead, 0);
        Arrays.fill(bidLevelTail, 0);
        Arrays.fill(bidLevelVolume, 0);
        Arrays.fill(askLevelHead, 0);
        Arrays.fill(askLevelTail, 0);
        Arrays.fill(askLevelVolume, 0);
        Arrays.fill(prevOrderIdx, 0);
        Arrays.fill(nextOrderIdx, 0);
        Arrays.fill(idKeys, 0);
        this.bestBidTick = -1;
        this.bestAskTick = Integer.MAX_VALUE;
        this.nextFreeOrderSlot = 1;
        this.freeTop = 0;
        this.cancels = 0;
        this.rejectedRests = 0;
        this.trades = 0;
    }

    private static int idHash(long orderId) {
        long h = orderId * 0x9E3779B97F4A7C15L;
        return (int) (h ^ (h >>> 33)) & ID_INDEX_MASK;
    }

    private void indexId(long orderId, int slot) {
        if (orderId == 0) {
            return;
        }
        int idx = idHash(orderId);
        while (idKeys[idx] != 0) {
            idx = (idx + 1) & ID_INDEX_MASK;
        }
        idKeys[idx] = orderId;
        idSlots[idx] = slot;
    }

    private void unindexId(long orderId) {
        if (orderId == 0) {
            return;
        }
        int idx = idHash(orderId);
        while (idKeys[idx] != 0) {
            if (idKeys[idx] == orderId) {
                // Remove and re-hash the following cluster to keep probes valid.
                idKeys[idx] = 0;
                int next = (idx + 1) & ID_INDEX_MASK;
                while (idKeys[next] != 0) {
                    long rekey = idKeys[next];
                    int reslot = idSlots[next];
                    idKeys[next] = 0;
                    int j = idHash(rekey);
                    while (idKeys[j] != 0) {
                        j = (j + 1) & ID_INDEX_MASK;
                    }
                    idKeys[j] = rekey;
                    idSlots[j] = reslot;
                    next = (next + 1) & ID_INDEX_MASK;
                }
                return;
            }
            idx = (idx + 1) & ID_INDEX_MASK;
        }
    }

    private int findSlot(long orderId) {
        if (orderId == 0) {
            return 0;
        }
        int idx = idHash(orderId);
        while (idKeys[idx] != 0) {
            if (idKeys[idx] == orderId) {
                return idSlots[idx];
            }
            idx = (idx + 1) & ID_INDEX_MASK;
        }
        return 0;
    }

    private void releaseSlot(int slot) {
        prevOrderIdx[slot] = 0;
        nextOrderIdx[slot] = 0;
        leavesQty[slot] = 0;
        freeStack[freeTop++] = slot;
    }

    private int priceToTick(double price) {
        int tick = (int) Math.round((price - (basePrice - 50.0)) / tickSize);
        return Math.max(0, Math.min(MAX_PRICE_TICKS - 1, tick));
    }

    private double tickToPrice(int tick) {
        return (basePrice - 50.0) + (tick * tickSize);
    }

    /**
     * Executes an incoming aggressive or passive order against the book.
     * TYPE_CANCEL events remove the referenced resting order instead of matching.
     */
    public void processOrder(OrderEvent event, TradeConsumer tradeConsumer) {
        if (event.type == OrderEvent.TYPE_CANCEL) {
            if (cancelOrder(event.orderId)) {
                event.matched = true;
            }
            return;
        }
        if (event.side == OrderEvent.SIDE_BUY) {
            matchBuy(event, tradeConsumer);
        } else {
            matchSell(event, tradeConsumer);
        }
    }

    /**
     * Cancels a resting order by id. Returns true when an order was removed.
     */
    public boolean cancelOrder(long orderId) {
        int slot = findSlot(orderId);
        if (slot == 0 || leavesQty[slot] <= 0) {
            return false;
        }
        int tick = priceToTick(orderPrice[slot]);
        byte side = orderSide[slot];
        long leaves = leavesQty[slot];

        if (side == OrderEvent.SIDE_BUY) {
            unlink(slot, tick, bidLevelHead, bidLevelTail);
            bidLevelVolume[tick] -= leaves;
            if (bidLevelHead[tick] == 0) {
                bestBidTick = findNextBidTick(tick);
            }
        } else {
            unlink(slot, tick, askLevelHead, askLevelTail);
            askLevelVolume[tick] -= leaves;
            if (askLevelHead[tick] == 0) {
                bestAskTick = findNextAskTick(tick);
            }
        }
        unindexId(orderId);
        releaseSlot(slot);
        cancels++;
        return true;
    }

    /** Unlinks a slot from its price-level doubly linked list. */
    private void unlink(int slot, int tick, int[] head, int[] tail) {
        int prev = prevOrderIdx[slot];
        int next = nextOrderIdx[slot];
        if (prev != 0) {
            nextOrderIdx[prev] = next;
        } else {
            head[tick] = next;
        }
        if (next != 0) {
            prevOrderIdx[next] = prev;
        } else {
            tail[tick] = prev;
        }
    }

    private void matchBuy(OrderEvent buy, TradeConsumer tradeConsumer) {
        int buyLimitTick = buy.type == OrderEvent.TYPE_MARKET ? Integer.MAX_VALUE : priceToTick(buy.price);
        long remaining = buy.quantity;

        // Price-Time FIFO matching against resting Asks
        while (remaining > 0 && bestAskTick <= buyLimitTick && bestAskTick != Integer.MAX_VALUE) {
            int headOrder = askLevelHead[bestAskTick];
            if (headOrder == 0) {
                // Advance to next ask tick
                bestAskTick = findNextAskTick(bestAskTick + 1);
                continue;
            }

            long available = leavesQty[headOrder];
            long matchQty = Math.min(remaining, available);
            double execPrice = orderPrice[headOrder];

            remaining -= matchQty;
            leavesQty[headOrder] -= matchQty;
            askLevelVolume[bestAskTick] -= matchQty;

            buy.matched = true;
            buy.executedQty += matchQty;
            buy.executedPrice = execPrice;
            trades++;

            tradeConsumer.onTrade(buy.orderId, orderId[headOrder], execPrice, matchQty, OrderEvent.SIDE_BUY, buy.optionKey);

            if (leavesQty[headOrder] == 0) {
                // Dequeue filled resting order
                int next = nextOrderIdx[headOrder];
                askLevelHead[bestAskTick] = next;
                if (next != 0) {
                    prevOrderIdx[next] = 0;
                } else {
                    askLevelTail[bestAskTick] = 0;
                    bestAskTick = findNextAskTick(bestAskTick + 1);
                }
                unindexId(orderId[headOrder]);
                releaseSlot(headOrder);
            }
        }

        // Rest unfilled quantity in Bid book if LIMIT order
        if (remaining > 0 && buy.type == OrderEvent.TYPE_LIMIT) {
            int tick = priceToTick(buy.price);
            int slot = allocateSlot(buy.orderId, buy.traderId, buy.side, buy.price, buy.quantity, remaining, buy.optionKey);
            if (slot == 0) {
                rejectedRests++;
            } else {
                int tail = bidLevelTail[tick];
                if (tail == 0) {
                    bidLevelHead[tick] = slot;
                    bidLevelTail[tick] = slot;
                } else {
                    nextOrderIdx[tail] = slot;
                    prevOrderIdx[slot] = tail;
                    bidLevelTail[tick] = slot;
                }
                bidLevelVolume[tick] += remaining;
                if (tick > bestBidTick) {
                    bestBidTick = tick;
                }
            }
        }
    }

    private void matchSell(OrderEvent sell, TradeConsumer tradeConsumer) {
        int sellLimitTick = sell.type == OrderEvent.TYPE_MARKET ? 0 : priceToTick(sell.price);
        long remaining = sell.quantity;

        // Price-Time FIFO matching against resting Bids
        while (remaining > 0 && bestBidTick >= sellLimitTick && bestBidTick != -1) {
            int headOrder = bidLevelHead[bestBidTick];
            if (headOrder == 0) {
                bestBidTick = findNextBidTick(bestBidTick - 1);
                continue;
            }

            long available = leavesQty[headOrder];
            long matchQty = Math.min(remaining, available);
            double execPrice = orderPrice[headOrder];

            remaining -= matchQty;
            leavesQty[headOrder] -= matchQty;
            bidLevelVolume[bestBidTick] -= matchQty;

            sell.matched = true;
            sell.executedQty += matchQty;
            sell.executedPrice = execPrice;
            trades++;

            tradeConsumer.onTrade(orderId[headOrder], sell.orderId, execPrice, matchQty, OrderEvent.SIDE_SELL, sell.optionKey);

            if (leavesQty[headOrder] == 0) {
                int next = nextOrderIdx[headOrder];
                bidLevelHead[bestBidTick] = next;
                if (next != 0) {
                    prevOrderIdx[next] = 0;
                } else {
                    bidLevelTail[bestBidTick] = 0;
                    bestBidTick = findNextBidTick(bestBidTick - 1);
                }
                unindexId(orderId[headOrder]);
                releaseSlot(headOrder);
            }
        }

        // Rest unfilled quantity in Ask book if LIMIT order
        if (remaining > 0 && sell.type == OrderEvent.TYPE_LIMIT) {
            int tick = priceToTick(sell.price);
            int slot = allocateSlot(sell.orderId, sell.traderId, sell.side, sell.price, sell.quantity, remaining, sell.optionKey);
            if (slot == 0) {
                rejectedRests++;
            } else {
                int tail = askLevelTail[tick];
                if (tail == 0) {
                    askLevelHead[tick] = slot;
                    askLevelTail[tick] = slot;
                } else {
                    nextOrderIdx[tail] = slot;
                    prevOrderIdx[slot] = tail;
                    askLevelTail[tick] = slot;
                }
                askLevelVolume[tick] += remaining;
                if (tick < bestAskTick) {
                    bestAskTick = tick;
                }
            }
        }
    }

    private int allocateSlot(long oId, long tId, byte side, double price, long qty, long leaves, byte optKey) {
        int slot;
        if (freeTop > 0) {
            slot = freeStack[--freeTop];
        } else if (nextFreeOrderSlot < MAX_ORDERS) {
            slot = nextFreeOrderSlot++;
        } else {
            return 0; // pool exhausted: caller counts a rejected rest
        }
        orderId[slot] = oId;
        traderId[slot] = tId;
        orderSide[slot] = side;
        orderPrice[slot] = price;
        initialQty[slot] = qty;
        leavesQty[slot] = leaves;
        optionKey[slot] = optKey;
        prevOrderIdx[slot] = 0;
        nextOrderIdx[slot] = 0;
        indexId(oId, slot);
        return slot;
    }

    private int findNextAskTick(int fromTick) {
        for (int t = fromTick; t < MAX_PRICE_TICKS; t++) {
            if (askLevelHead[t] != 0) return t;
        }
        return Integer.MAX_VALUE;
    }

    private int findNextBidTick(int fromTick) {
        for (int t = fromTick; t >= 0; t--) {
            if (bidLevelHead[t] != 0) return t;
        }
        return -1;
    }

    public double getBestBid() {
        return bestBidTick != -1 ? tickToPrice(bestBidTick) : 0.0;
    }

    public double getBestAsk() {
        return bestAskTick != Integer.MAX_VALUE ? tickToPrice(bestAskTick) : 0.0;
    }

    /** Total trades executed through this book. */
    public long getTrades() {
        return trades;
    }

    /** Total resting orders cancelled by id. */
    public long getCancels() {
        return cancels;
    }

    /** Limit orders dropped because the order pool was exhausted. */
    public long getRejectedRests() {
        return rejectedRests;
    }

    @FunctionalInterface
    public interface TradeConsumer {
        void onTrade(long buyOrderId, long sellOrderId, double price, long qty, byte aggressiveSide, byte optionKey);
    }
}
