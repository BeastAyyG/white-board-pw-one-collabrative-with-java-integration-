import { RingSlot, SlotState, Order } from '../types/index.ts';

/**
 * LMAX Disruptor Ring Buffer Simulation Model
 * Implements mechanical sympathy principles:
 * - Cache-friendly continuous ring buffer (fixed power-of-two size)
 * - Sequence bitwise masking: sequence & (bufferSize - 1)
 * - Lock-free multi-stage pipeline: Producer -> Journaler -> MatchingLogic -> GatewayPublisher
 */
export class DisruptorRingBuffer {
  public readonly capacity: number;
  private mask: number;
  private slots: RingSlot[];
  private producerCursor: number = -1;
  private journalerCursor: number = -1;
  private matchingCursor: number = -1;
  private publisherCursor: number = -1;

  constructor(capacity: number = 64) {
    // Ensure capacity is power of two
    this.capacity = Math.pow(2, Math.ceil(Math.log2(Math.max(16, capacity))));
    this.mask = this.capacity - 1;

    this.slots = Array.from({ length: this.capacity }, (_, i) => ({
      index: i,
      sequence: -1,
      state: 'FREE' as SlotState,
      payload: null,
      timestamp: 0,
    }));
  }

  /**
   * Producer claims next slot sequence (single-producer or multi-producer CAS)
   */
  public publish(order: Order): number {
    this.producerCursor++;
    const seq = this.producerCursor;
    const slotIdx = seq & this.mask;

    const slot = this.slots[slotIdx];
    slot.sequence = seq;
    slot.state = 'PUBLISHED';
    slot.payload = order;
    slot.timestamp = Date.now();

    return seq;
  }

  /**
   * Step the Journaler consumer stage (WAL / Persistence)
   */
  public stepJournaler(batchSize: number = 4): number {
    let processed = 0;
    while (this.journalerCursor < this.producerCursor && processed < batchSize) {
      this.journalerCursor++;
      const slotIdx = this.journalerCursor & this.mask;
      const slot = this.slots[slotIdx];
      if (slot.state === 'PUBLISHED') {
        slot.state = 'JOURNALED';
      }
      processed++;
    }
    return processed;
  }

  /**
   * Step the Single-Threaded Business Logic / Matching Engine stage
   */
  public stepMatching(batchSize: number = 4, onMatch?: (order: Order) => void): number {
    let processed = 0;
    while (this.matchingCursor < this.journalerCursor && processed < batchSize) {
      this.matchingCursor++;
      const slotIdx = this.matchingCursor & this.mask;
      const slot = this.slots[slotIdx];
      if (slot.state === 'JOURNALED' && slot.payload) {
        slot.state = 'MATCHED';
        if (onMatch) onMatch(slot.payload);
      }
      processed++;
    }
    return processed;
  }

  /**
   * Step Gateway / Network Publisher consumer stage
   */
  public stepPublisher(batchSize: number = 4): number {
    let processed = 0;
    while (this.publisherCursor < this.matchingCursor && processed < batchSize) {
      this.publisherCursor++;
      const slotIdx = this.publisherCursor & this.mask;
      const slot = this.slots[slotIdx];
      if (slot.state === 'MATCHED') {
        slot.state = 'DISPATCHED';
      }
      processed++;
    }
    return processed;
  }

  public getSlots(): RingSlot[] {
    return this.slots;
  }

  public getCursors() {
    return {
      producer: this.producerCursor,
      journaler: this.journalerCursor,
      matching: this.matchingCursor,
      publisher: this.publisherCursor,
    };
  }

  public getBufferUtilization(): number {
    if (this.producerCursor < 0) return 0;
    const slowestConsumer = Math.min(
      this.journalerCursor,
      this.matchingCursor,
      this.publisherCursor
    );
    const inFlight = Math.max(0, this.producerCursor - slowestConsumer);
    return Math.min(100, Math.round((inFlight / this.capacity) * 100));
  }

  public reset(): void {
    this.producerCursor = -1;
    this.journalerCursor = -1;
    this.matchingCursor = -1;
    this.publisherCursor = -1;
    for (const slot of this.slots) {
      slot.sequence = -1;
      slot.state = 'FREE';
      slot.payload = null;
      slot.timestamp = 0;
    }
  }
}
