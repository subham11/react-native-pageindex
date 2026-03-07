import type { ProgressCallback, ProgressInfo } from '../types';

/**
 * Manages progress reporting across an ordered list of named steps.
 * Each call to `report()` (or `advance()`) moves to the next step and
 * fires the user-supplied `onProgress` callback.
 */
export class ProgressReporter {
  private readonly cb: ProgressCallback | undefined;
  private readonly steps: readonly string[];
  private currentIndex = 0;

  constructor(steps: readonly string[], onProgress?: ProgressCallback) {
    this.steps = steps;
    this.cb = onProgress;
  }

  /**
   * Report progress for a specific named step.
   * Looks the step up in the list to compute the correct percentage.
   */
  report(step: string, detail?: string): void {
    if (!this.cb) return;
    const idx = this.steps.indexOf(step);
    if (idx !== -1) this.currentIndex = idx;
    const percent = Math.round((this.currentIndex / Math.max(this.steps.length - 1, 1)) * 100);
    this.emit({ step, percent, detail });
  }

  /**
   * Advance to the next step automatically (for sub-steps not in the list).
   */
  advance(step: string, detail?: string): void {
    if (!this.cb) return;
    const percent = Math.round((this.currentIndex / Math.max(this.steps.length - 1, 1)) * 100);
    this.emit({ step, percent, detail });
  }

  /**
   * Report an exact percentage override (useful for per-page loops).
   */
  reportAt(percent: number, step: string, detail?: string): void {
    if (!this.cb) return;
    this.emit({ step, percent: Math.min(100, Math.max(0, Math.round(percent))), detail });
  }

  private emit(info: ProgressInfo): void {
    try {
      this.cb?.(info);
    } catch {
      // Never let a user callback crash the pipeline
    }
  }
}

/** No-op reporter used when no callback is supplied. */
export const NULL_REPORTER = new ProgressReporter([]);
