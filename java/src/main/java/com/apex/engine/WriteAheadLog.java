package com.apex.engine;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Memory-mapped write-ahead log (WAL) backing the matching engine's journaler stage.
 *
 * <p>Fixed 64-byte records, 64 MiB segment files, single-writer (the Disruptor
 * journaler thread). The append fast path performs zero object allocations:
 * records are written with absolute puts into a pre-allocated
 * {@link MappedByteBuffer} view.
 *
 * <p>Record layout (64 bytes):
 * <pre>
 *  0  - sequence    (long)
 *  8  - orderId     (long)
 *  16 - traderId    (long)
 *  24 - side        (byte)
 *  25 - type        (byte)
 *  26 - optionKey   (byte)
 *  27 - reserved    (5 bytes)
 *  32 - price       (double)
 *  40 - quantity    (long)
 *  48 - timestampNs (long)
 *  56 - reserved    (8 bytes)
 * </pre>
 */
public final class WriteAheadLog implements AutoCloseable {

    public static final int RECORD_SIZE = 64;

    private static final long SEGMENT_SIZE = 64L * 1024 * 1024;
    private static final long HEADER_SIZE = 8; // record count
    private static final long MAX_RECORDS_PER_SEGMENT = (SEGMENT_SIZE - HEADER_SIZE) / RECORD_SIZE;

    private final Path dir;
    private final List<Path> segmentFiles = new ArrayList<>();

    private RandomAccessFile raf;
    private FileChannel channel;
    private MappedByteBuffer mapped;
    private int segmentIndex;
    private long recordsInSegment;
    private long totalRecords;

    public WriteAheadLog(Path dir) throws IOException {
        this.dir = dir;
        Files.createDirectories(dir);

        // Resume numbering after any existing segments.
        int max = -1;
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(dir, "wal-*.dat")) {
            for (Path p : ds) {
                segmentFiles.add(p);
                try {
                    int n = Integer.parseInt(p.getFileName().toString().substring(4, 10));
                    max = Math.max(max, n);
                } catch (NumberFormatException ignored) {
                    // ignore foreign files
                }
            }
        }
        segmentFiles.sort(Comparator.comparing(Path::toString));
        this.segmentIndex = max + 1;
        // The active write segment opens lazily on first append, so a
        // read-only replay never creates empty segment files.
    }

    public WriteAheadLog() throws IOException {
        this(Paths.get(System.getProperty("apex.wal.dir", "./wal")));
    }

    private Path segmentPath(int index) {
        return dir.resolve(String.format("wal-%06d.dat", index));
    }

    private void openSegment() throws IOException {
        Path path = segmentPath(segmentIndex);
        segmentFiles.add(path);
        raf = new RandomAccessFile(path.toFile(), "rw");
        raf.setLength(SEGMENT_SIZE);
        channel = raf.getChannel();
        mapped = channel.map(FileChannel.MapMode.READ_WRITE, 0, SEGMENT_SIZE);
        recordsInSegment = 0;
        mapped.putLong(0, 0L); // header: record count
    }

    /**
     * Appends one order event. Called only by the single journaler thread.
     * Zero allocations on this path.
     */
    public void append(long sequence, long orderId, long traderId,
                       byte side, byte type, byte optionKey,
                       double price, long quantity, long timestampNs) throws IOException {
        if (mapped == null) {
            openSegment();
        }
        if (recordsInSegment >= MAX_RECORDS_PER_SEGMENT) {
            rollSegment();
        }
        int offset = (int) (HEADER_SIZE + recordsInSegment * RECORD_SIZE);
        mapped.putLong(offset, sequence);
        mapped.putLong(offset + 8, orderId);
        mapped.putLong(offset + 16, traderId);
        mapped.put(offset + 24, side);
        mapped.put(offset + 25, type);
        mapped.put(offset + 26, optionKey);
        mapped.putDouble(offset + 32, price);
        mapped.putLong(offset + 40, quantity);
        mapped.putLong(offset + 48, timestampNs);
        // bytes 27-31 and 56-63 left as zero reservation

        recordsInSegment++;
        totalRecords++;
        mapped.putLong(0, recordsInSegment); // header count
    }

    private void rollSegment() throws IOException {
        flush();
        closeSegment();
        segmentIndex++;
        openSegment();
    }

    /** Forces buffered pages to durable storage. */
    public void flush() {
        if (mapped != null) {
            mapped.force();
        }
    }

    private void closeSegment() throws IOException {
        if (mapped != null) {
            unmap(mapped); // release the mapping so the file can be deleted (Windows)
            mapped = null;
        }
        if (channel != null) {
            channel.close();
            channel = null;
        }
        if (raf != null) {
            raf.close();
            raf = null;
        }
    }

    /**
     * Synchronously releases a memory mapping via {@code Unsafe.invokeCleaner}.
     * Without this, Windows refuses to delete a mapped file until GC runs.
     */
    private static void unmap(MappedByteBuffer buf) {
        try {
            Class<?> unsafeClass = Class.forName("sun.misc.Unsafe");
            java.lang.reflect.Field theUnsafe = unsafeClass.getDeclaredField("theUnsafe");
            theUnsafe.setAccessible(true);
            Object unsafe = theUnsafe.get(null);
            unsafeClass.getMethod("invokeCleaner", java.nio.ByteBuffer.class).invoke(unsafe, buf);
        } catch (Exception e) {
            // Best effort: the mapping still releases when GC collects the buffer.
        }
    }

    @Override
    public void close() throws IOException {
        flush();
        closeSegment();
    }

    public long getTotalRecords() {
        return totalRecords;
    }

    /** Functional interface for WAL replay; receives raw record fields. */
    @FunctionalInterface
    public interface RecordHandler {
        void onRecord(long sequence, long orderId, long traderId, byte side, byte type,
                      byte optionKey, double price, long quantity, long timestampNs);
    }

    /**
     * Replays every committed record across all segment files, in order.
     * Used for crash recovery and for the demo to prove the journal is real.
     */
    public void readAll(RecordHandler handler) throws IOException {
        List<Path> files = new ArrayList<>(segmentFiles);
        files.sort(Comparator.comparing(Path::toString));
        for (Path path : files) {
            if (!Files.exists(path)) {
                continue;
            }
            try (RandomAccessFile r = new RandomAccessFile(path.toFile(), "r");
                 FileChannel ch = r.getChannel()) {
                long size = Math.min(ch.size(), SEGMENT_SIZE);
                if (size <= HEADER_SIZE) {
                    continue;
                }
                MappedByteBuffer buf = ch.map(FileChannel.MapMode.READ_ONLY, 0, size);
                try {
                    long count = buf.getLong(0);
                    long maxReadable = (size - HEADER_SIZE) / RECORD_SIZE;
                    long n = Math.min(count, maxReadable);
                    for (long i = 0; i < n; i++) {
                        int offset = (int) (HEADER_SIZE + i * RECORD_SIZE);
                        handler.onRecord(
                                buf.getLong(offset),
                                buf.getLong(offset + 8),
                                buf.getLong(offset + 16),
                                buf.get(offset + 24),
                                buf.get(offset + 25),
                                buf.get(offset + 26),
                                buf.getDouble(offset + 32),
                                buf.getLong(offset + 40),
                                buf.getLong(offset + 48));
                    }
                } finally {
                    unmap(buf);
                }
            }
        }
    }
}
