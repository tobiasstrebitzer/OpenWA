import { WorldState } from './state';
import { Scenario, WorldEvent } from './types';

export type WorldListener = (event: WorldEvent) => void;

// A Simulation is a scenario opened at a point in time. The cursor partitions the (time-sorted) event
// log into "already happened" (folded into `state`) and "future". `advanceTo` replays future events
// past the cursor, notifying the listener as each crosses - this is how inbound traffic is driven.
// `append` adds a live event at the current cursor (sends, injected inbound) and surfaces it the same way.
export class Simulation {
  private readonly events: WorldEvent[];
  private readonly state = new WorldState();
  private cursor: number;
  private nextIndex = 0;
  private listener?: WorldListener;

  readonly me: { phone: string; pushName: string };

  constructor(scenario: Scenario) {
    this.me = scenario.me;
    this.events = [...scenario.events].sort((a, b) => a.t - b.t);
    const last = this.events.length ? this.events[this.events.length - 1].t : 0;
    this.cursor = scenario.checkoutAt ?? last;
    this.replayUpTo(this.cursor);
  }

  onEvent(listener: WorldListener): void {
    this.listener = listener;
  }

  get world(): WorldState {
    return this.state;
  }

  get now(): number {
    return this.cursor;
  }

  // Fold every event with t <= target into the state WITHOUT notifying (used once at open time).
  private replayUpTo(target: number): void {
    while (this.nextIndex < this.events.length && this.events[this.nextIndex].t <= target) {
      this.state.apply(this.events[this.nextIndex]);
      this.nextIndex++;
    }
  }

  // Move the cursor forward, applying and emitting each event crossed. No-op if target <= cursor.
  advanceTo(target: number): void {
    if (target <= this.cursor) return;
    while (this.nextIndex < this.events.length && this.events[this.nextIndex].t <= target) {
      const event = this.events[this.nextIndex];
      this.state.apply(event);
      this.nextIndex++;
      this.listener?.(event);
    }
    this.cursor = target;
  }

  // Add a live event at the current cursor and surface it immediately. Returns the stamped event.
  append(event: WorldEvent): WorldEvent {
    const stamped = { ...event, t: this.cursor } as WorldEvent;
    this.events.splice(this.nextIndex, 0, stamped);
    this.nextIndex++;
    this.state.apply(stamped);
    this.listener?.(stamped);
    return stamped;
  }
}
