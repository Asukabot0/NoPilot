/**
 * UI Taste module — re-exports for the public API.
 */
export type {
  DesignProvider,
  DesignVariant,
  DesignDNA,
  DesignSystemRef,
  PageSpec,
  GenerateScreenRequest,
  GenerateVariantsRequest,
  SelectionResult,
  PreviewSession,
  PostProcessOptions,
  PostProcessReport,
  TasteOrchestratorOptions,
  TasteExplorationResult,
  PageResult,
  HybridSelection,
  VariantMetadata,
  TypographyScale,
  StyleProfile,
  StyleFileMatch,
  DevicePreset,
  UITasteConstraint,
} from './types.js';

export { ProviderRegistry, ProviderUnavailableError } from './design-provider.js';
export type { DetectResult } from './design-provider.js';
export { StitchProvider, QuotaTracker } from './stitch-provider.js';
export type { QuotaStatus } from './stitch-provider.js';
export { AgentHTMLProvider, QUALITY_CHECKLIST } from './agent-html-provider.js';
export { PreviewEngine, DEVICE_PRESETS } from './preview-engine.js';
export { IterationEngine } from './iteration-engine.js';
export type { IterationOutcome, IterationHistory, FeedbackEntry } from './iteration-engine.js';
export { PostProcessor } from './post-processor.js';
export { StyleDetector } from './style-detector.js';
export { TokenExporter, hexToSRGB } from './token-exporter.js';
export type { DTCGToken, DTCGTokenFile } from './token-exporter.js';
export { TasteOrchestrator } from './taste-orchestrator.js';
export type { OrchestratorState, NotificationType } from './taste-orchestrator.js';
