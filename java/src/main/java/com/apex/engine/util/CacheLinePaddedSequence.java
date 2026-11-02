package com.apex.engine.util;

import java.lang.invoke.MethodHandles;
import java.lang.invoke.VarHandle;

/**
 * Cache-line-padded sequence counter.
 *
 * <p>Prevents false sharing: without padding, a producer cursor and a consumer
 * cursor landing on the same 64-byte cache line would force the CPUs to bounce
 * the line between cores on every write. The 56 bytes of dummy longs isolate
 * the value on its own cache line.
 */
public class CacheLinePaddedSequence {

    // Padding before the value (56 bytes) so it starts on a fresh cache line.
    public long p1, p2, p3, p4, p5, p6, p7;

    // The actual sequence value (8 bytes).
    public volatile long value = -1L;

    // Padding after the value (56 bytes) so trailing fields stay off the line.
    public long p8, p9, p10, p11, p12, p13, p14;

    private static final VarHandle VALUE;

    static {
        try {
            VALUE = MethodHandles.lookup().findVarHandle(CacheLinePaddedSequence.class, "value", long.class);
        } catch (ReflectiveOperationException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    public long get() {
        return value;
    }

    public void set(long v) {
        value = v;
    }

    /** Ordered store with release semantics (cheap on x86 TSO, real fence on ARM). */
    public void setRelease(long v) {
        VALUE.setRelease(this, v);
    }

    public long getAcquire() {
        return (long) VALUE.getAcquire(this);
    }
}
