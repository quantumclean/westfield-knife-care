/** What the Preact shell needs from either game mode's engine. */
import type { KnifeId } from "./levels.ts";
import type { Action, GameEvent, Phase, World } from "./sim/world.ts";

export interface EngineCallbacks {
  onPhase(phase: Phase): void;
  /** Every frame, for the HUD (which writes to the DOM directly, not via Preact). */
  onFrame(world: World): void;
  onEvent(e: GameEvent): void;
}

export interface EngineOptions {
  /** Time multiplier for playtesting and tests (?speed=4). */
  speed: number;
}

export interface GameEngine {
  readonly world: World;
  setPaused(paused: boolean): void;
  setReducedMotion(still: boolean): void;
  setLengths(l1: number, l2: number): void;
  configure(options: { knife: KnifeId; hardcore: boolean }): void;
  start(): void;
  action(a: Action): void;
  quit(): void;
  sharpen(): void;
  lane(lane: 0 | 1 | 2): void;
  sweep(): void;
  /** Street mode: propose to the nearest neighbor (keyboard). */
  propose(): void;
  debug(): unknown;
  destroy(): void;
}
