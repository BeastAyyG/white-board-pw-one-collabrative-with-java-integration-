package com.apex.engine;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ZeroGcOrderBookTest {

    private static OrderEvent limit(long orderId, byte side, double price, long qty) {
        OrderEvent e = new OrderEvent();
        e.set(orderId, 1, side, OrderEvent.TYPE_LIMIT, price, qty, (byte) 0);
        return e;
    }

    private static OrderEvent market(long orderId, byte side, long qty) {
        OrderEvent e = new OrderEvent();
        e.set(orderId, 1, side, OrderEvent.TYPE_MARKET, 0.0, qty, (byte) 0);
        return e;
    }

    private static OrderEvent cancel(long orderId) {
        OrderEvent e = new OrderEvent();
        e.set(orderId, 0, (byte) 0, OrderEvent.TYPE_CANCEL, 0.0, 0, (byte) 0);
        return e;
    }

    private record Trade(long buyId, long sellId, double price, long qty) {}

    private static List<Trade> collect(ZeroGcOrderBook book, OrderEvent e) {
        List<Trade> trades = new ArrayList<>();
        book.processOrder(e, (buyId, sellId, price, qty, side, opt) ->
                trades.add(new Trade(buyId, sellId, price, qty)));
        return trades;
    }

    @Test
    void restingLimitOrdersDoNotCross() {
        ZeroGcOrderBook book = new ZeroGcOrderBook(100.0, 0.01);
        List<Trade> t1 = collect(book, limit(1, OrderEvent.SIDE_BUY, 99.0, 10));
        List<Trade> t2 = collect(book, limit(2, OrderEvent.SIDE_SELL, 101.0, 5));
        assertTrue(t1.isEmpty());
        assertTrue(t2.isEmpty());
        assertEquals(99.0, book.getBestBid(), 1e-9);
        assertEquals(101.0, book.getBestAsk(), 1e-9);
        assertEquals(0, book.getTrades());
    }

    @Test
    void fifoPriorityAcrossSamePriceLevel() {
        ZeroGcOrderBook book = new ZeroGcOrderBook(100.0, 0.01);
        collect(book, limit(1, OrderEvent.SIDE_SELL, 100.0, 10)); // first in queue
        collect(book, limit(2, OrderEvent.SIDE_SELL, 100.0, 5));  // second in queue

        List<Trade> trades = collect(book, market(3, OrderEvent.SIDE_BUY, 12));
        assertEquals(2, trades.size());
        assertEquals(1, trades.get(0).sellId()); // FIFO: order 1 filled first
        assertEquals(10, trades.get(0).qty());
        assertEquals(2, trades.get(1).sellId());
        assertEquals(2, trades.get(1).qty());
        assertEquals(100.0, trades.get(0).price(), 1e-9); // maker price
    }

    @Test
    void limitOrderRestsAfterPartialFill() {
        ZeroGcOrderBook book = new ZeroGcOrderBook(100.0, 0.01);
        collect(book, limit(1, OrderEvent.SIDE_SELL, 100.0, 5));
        List<Trade> trades = collect(book, limit(2, OrderEvent.SIDE_BUY, 100.0, 12));
        assertEquals(1, trades.size());
        assertEquals(5, trades.get(0).qty());
        // Remaining 7 rests as the new best bid.
        assertEquals(100.0, book.getBestBid(), 1e-9);
        assertEquals(0.0, book.getBestAsk());
    }

    @Test
    void cancelRemovesRestingOrder() {
        ZeroGcOrderBook book = new ZeroGcOrderBook(100.0, 0.01);
        collect(book, limit(7, OrderEvent.SIDE_BUY, 98.5, 20));
        assertEquals(98.5, book.getBestBid(), 1e-9);

        List<Trade> trades = collect(book, cancel(7));
        assertTrue(trades.isEmpty());
        assertEquals(1, book.getCancels());
        assertEquals(0.0, book.getBestBid()); // book empty again

        // Cancelling twice is a no-op.
        collect(book, cancel(7));
        assertEquals(1, book.getCancels());
    }

    @Test
    void cancelOfUnknownOrderIsIgnored() {
        ZeroGcOrderBook book = new ZeroGcOrderBook(100.0, 0.01);
        collect(book, cancel(4242));
        assertEquals(0, book.getCancels());
    }

    @Test
    void marketOrderWithEmptyBookTradesNothing() {
        ZeroGcOrderBook book = new ZeroGcOrderBook(100.0, 0.01);
        List<Trade> trades = collect(book, market(9, OrderEvent.SIDE_BUY, 100));
        assertTrue(trades.isEmpty());
        assertEquals(0.0, book.getBestBid());
        assertEquals(0.0, book.getBestAsk());
    }

    @Test
    void priceTimePriorityAcrossLevels() {
        ZeroGcOrderBook book = new ZeroGcOrderBook(100.0, 0.01);
        collect(book, limit(1, OrderEvent.SIDE_SELL, 101.0, 5));
        collect(book, limit(2, OrderEvent.SIDE_SELL, 100.5, 5));
        // Aggressive buy must take the better (lower) ask first.
        List<Trade> trades = collect(book, market(3, OrderEvent.SIDE_BUY, 5));
        assertEquals(1, trades.size());
        assertEquals(2, trades.get(0).sellId());
        assertEquals(100.5, trades.get(0).price(), 1e-9);
    }
}
