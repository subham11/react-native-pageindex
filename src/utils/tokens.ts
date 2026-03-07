import type { TokenCounter } from '../types';

/**
 * Default token counter: ~4 characters per token (GPT-4 average for English).
 * For accurate counts, pass a custom `tokenCounter` using `js-tiktoken`.
 */
export const defaultTokenCounter: TokenCounter = (text: string): number => {
  return Math.ceil((text ?? '').length / 4);
};
