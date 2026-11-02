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
        this.bestBidTick = -1;
        this.bestAskTick = Integer.MAX_VALUE;
        this.nextFreeOrderSlot = 1;
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
     */
    public void processOrder(OrderEvent event, TradeConsumer tradeConsumer) {
        if (event.side == OrderEvent.SIDE_BUY) {
            matchBuy(event, tradeConsumer);
        } else {
            matchSell(event, tradeConsumer);
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
            }
        }

        // Rest unfilled quantity in Bid book if LIMIT order
        if (remaining > 0 && buy.type == OrderEvent.TYPE_LIMIT) {
            int tick = priceToTick(buy.price);
            int slot = allocateSlot(buy.orderId, buy.traderId, buy.side, buy.price, buy.quantity, remaining, buy.optionKey);

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
            }
        }

        // Rest unfilled quantity in Ask book if LIMIT order
        if (remaining > 0 && sell.type == OrderEvent.TYPE_LIMIT) {
            int tick = priceToTick(sell.price);
            int slot = allocateSlot(sell.orderId, sell.traderId, sell.side, sell.price, sell.quantity, remaining, sell.optionKey);

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

    private int allocateSlot(long oId, long tId, byte side, double price, long qty, long leaves, byte optKey) {
        int slot = nextFreeOrderSlot++;
        if (nextFreeOrderSlot >= MAX_ORDERS) nextFreeOrderSlot = 1;
        orderId[slot] = oId;
        traderId[slot] = tId;
        orderSide[slot] = side;
        orderPrice[slot] = price;
        initialQty[slot] = qty;
        leavesQty[slot] = leaves;
        optionKey[slot] = optKey;
        prevOrderIdx[slot] = 0;
        nextOrderIdx[slot] = 0;
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

    @FunctionalInterface
    public interface TradeConsumer {
        void onTrade(long buyOrderId, long sellOrderId, double price, long qty, byte aggressiveSide, byte optionKey);
    }
}
