package com.apex.engine;

import com.lmax.disruptor.EventFactory;

/**
 * Pre-allocated Event object residing in the LMAX RingBuffer.
 * Pre-allocation guarantees Zero Garbage Collection during runtime.
 */
public final class OrderEvent {

    public static final byte SIDE_BUY = 1;
    public static final byte SIDE_SELL = 2;

    public static final byte TYPE_LIMIT = 1;
    public static final byte TYPE_MARKET = 2;
    public static final byte TYPE_CANCEL = 3;

    // Fields
    public long orderId;
    public long traderId;
    public byte side;
    public byte type;
    public double price;
    public long quantity;
    public long timestampNs;
    public byte optionKey; // 0=None, 1=A, 2=B, 3=C, 4=D for MCQ Consensus

    // Result flags populated by matching handler
    public boolean matched;
    public long executedQty;
    public double executedPrice;

    public void set(long orderId, long traderId, byte side, byte type, double price, long quantity, byte optionKey) {
        this.orderId = orderId;
        this.traderId = traderId;
        this.side = side;
        this.type = type;
        this.price = price;
        this.quantity = quantity;
        this.optionKey = optionKey;
        this.timestampNs = System.nanoTime();
        this.matched = false;
        this.executedQty = 0;
        this.executedPrice = 0.0;
    }

    public void clear() {
        this.orderId = 0;
        this.traderId = 0;
        this.side = 0;
        this.type = 0;
        this.price = 0.0;
        this.quantity = 0;
        this.optionKey = 0;
        this.matched = false;
    }

    public static final EventFactory<OrderEvent> FACTORY = OrderEvent::new;
}
