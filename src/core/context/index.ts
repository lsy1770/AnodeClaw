/**
 * Context Management - Barrel Export
 */

export * from './types.js';
export { TokenCounter } from './TokenCounter.js';
export { CompressionStrategyHandler, setCompressionModelAPI } from './CompressionStrategy.js';
export { ContextWindowGuard } from './ContextWindowGuard.js';
export {
  ContextPruner,
  createContextPruner,
  type PrunableMessage,
  type SoftTrimConfig,
  type HardClearConfig,
  type ContextPrunerConfig,
  type PruneResult,
} from './ContextPruner.js';
export {
  StagedSummarizer,
  createStagedSummarizer,
  type SummarizableMessage,
  type StagedSummarizerConfig,
  type StagedSummaryResult,
} from './StagedSummarizer.js';
export {
  HistoryLimiter,
  createHistoryLimiter,
  type LimitableMessage,
  type HistoryLimitConfig,
  type HistoryLimitResult,
} from './HistoryLimiter.js';
export {
  CompactionSafeguard,
  createCompactionSafeguard,
  type SafeguardMessage,
  type FileOperation,
  type ToolFailure,
  type CompactionSafeguardResult,
  type CompactionSafeguardConfig,
} from './CompactionSafeguard.js';
