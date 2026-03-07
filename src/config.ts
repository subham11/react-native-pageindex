import type { PageIndexOptions, MdPageIndexOptions } from './types';

export const DEFAULT_PDF_OPTIONS: Required<Omit<PageIndexOptions, 'tokenCounter' | 'onProgress'>> = {
  tocCheckPageNum: 20,
  maxPageNumEachNode: 10,
  maxTokenNumEachNode: 20000,
  ifAddNodeId: true,
  ifAddNodeSummary: true,
  ifAddDocDescription: false,
  ifAddNodeText: false,
};

export const DEFAULT_MD_OPTIONS: Required<Omit<MdPageIndexOptions, 'tokenCounter' | 'onProgress'>> = {
  ifThinning: false,
  minTokenThreshold: 5000,
  ifAddNodeSummary: true,
  summaryTokenThreshold: 200,
  ifAddDocDescription: false,
  ifAddNodeText: false,
  ifAddNodeId: true,
};
