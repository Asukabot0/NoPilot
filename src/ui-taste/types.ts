/**
 * UI Taste system shared TypeScript type definitions.
 * Derived from spec MOD-001 data models.
 */

// ---------------------------------------------------------------------------
// Core data models
// ---------------------------------------------------------------------------

export interface VariantMetadata {
  title: string;
  prompt: string;
  creativeRange: 'REFINE' | 'REIMAGINE';
  modelId: string | null;
  generatedAt: string;
}

export interface DesignVariant {
  id: string;
  screenId: string;
  htmlCode: string;
  screenshotUrl: string | null;
  metadata: VariantMetadata;
  provider: string;
  deviceType: 'MOBILE' | 'TABLET' | 'DESKTOP';
}

export interface TypographyScale {
  display: string;
  headline: string;
  body: string;
  label: string;
}

export interface DesignDNA {
  colorPalette: Record<string, string>;
  typography: TypographyScale;
  spacing: number[];
  borderRadius: Record<string, string>;
  shadows: string[];
  animationLevel: 'none' | 'subtle' | 'moderate' | 'expressive';
  designMd: string;
  rawProviderData: unknown;
}

export interface DesignSystemRef {
  id: string;
  provider: string;
  projectId: string | null;
}

export interface PageSpec {
  name: string;
  description: string;
  platform: 'ios' | 'android' | 'web' | 'desktop';
  deviceType: 'MOBILE' | 'TABLET' | 'DESKTOP';
  existingStyleConstraint: string | null;
}

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

export interface GenerateScreenRequest {
  pageSpec: PageSpec;
  prompt: string;
  designSystemRef: DesignSystemRef | null;
  language: string;
  fontStack: string;
}

export interface GenerateVariantsRequest {
  baseVariant: DesignVariant;
  count: number;
  creativeRange: 'REFINE' | 'REIMAGINE';
  prompt: string;
  designConstraint: string | null;
}

export interface HybridSelection {
  variantId: string;
  dimensions: string[];
}

export interface SelectionResult {
  action: 'select' | 'iterate' | 'rollback' | 'regenerate_pair';
  selectedVariantId: string | null;
  feedback: string | null;
  hybridSelections: HybridSelection[] | null;
  rollbackToRound: number | null;
  round: number;
  overrideDesignSystem?: boolean;
}

// ---------------------------------------------------------------------------
// Preview engine types
// ---------------------------------------------------------------------------

export interface PreviewSession {
  id: string;
  port: number;
  url: string;
  currentRound: number;
  timeoutMs: number;
}

// ---------------------------------------------------------------------------
// Post-processor types
// ---------------------------------------------------------------------------

export interface PostProcessOptions {
  targetFontStack: string;
  inlineAssets: boolean;
  verifyResponsive: boolean;
  assetDownloadTimeout: number;
}

export interface PostProcessReport {
  fontPatchCount: number;
  assetsInlined: number;
  assetsFailed: string[];
  responsiveInjected: boolean;
}

// ---------------------------------------------------------------------------
// Style detector types (MOD-006)
// ---------------------------------------------------------------------------

export interface StyleProfile {
  source: 'css' | 'scss' | 'tailwind' | 'screenshot' | 'design-tokens';
  colors: Record<string, string>;
  fonts: string[];
  spacingScale: number[];
  borderRadius: Record<string, string>;
  shadows: string[];
  breakpoints: Record<string, string> | null;
  darkMode: boolean | null;
  componentLibrary: string | null;
  confidence: number;
}

export interface StyleFileMatch {
  path: string;
  type: 'css' | 'scss' | 'tailwind-config' | 'design-tokens' | 'theme-file';
  priority: number;
}

// ---------------------------------------------------------------------------
// Device preset types (MOD-004)
// ---------------------------------------------------------------------------

export interface DevicePreset {
  name: string;
  width: number;
  height: number;
  hasBezel: boolean;
  category: 'phone' | 'tablet' | 'desktop' | 'special';
}

// ---------------------------------------------------------------------------
// Orchestrator types
// ---------------------------------------------------------------------------

export interface TasteOrchestratorOptions {
  projectRoot: string;
  screenshots: string[];
  language: string;
  fontStack: string;
  liteMode: boolean;
  /** For testing: auto-select a variant instead of waiting for browser */
  autoSelectVariantId?: string;
}

export interface PageResult {
  page: PageSpec;
  selectedVariant: DesignVariant;
  darkVariant: DesignVariant | null;
  dna: DesignDNA;
  iterationRounds: number;
}

export interface TasteExplorationResult {
  pages: PageResult[];
  tokensPath: string;
  mockupsDir: string;
  designSystemRef: DesignSystemRef | null;
  stitchProjectId: string | null;
  tier: 1 | 2 | 3;
  totalApiCalls: number;
}

// ---------------------------------------------------------------------------
// UITasteConstraint — persisted to discover.json
// ---------------------------------------------------------------------------

export interface UITasteConstraint {
  designDNA: DesignDNA;
  tokensPath: string;
  mockupsDir: string;
  stitchProjectId: string | null;
  tier: 1 | 2 | 3;
  selectedPages: Array<{
    name: string;
    mockupFile: string;
    darkMockupFile: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// DesignProvider interface
// ---------------------------------------------------------------------------

export interface DesignProvider {
  name(): string;
  isAvailable(): Promise<boolean>;
  generateScreen(request: GenerateScreenRequest): Promise<DesignVariant>;
  generateVariants(request: GenerateVariantsRequest): Promise<DesignVariant[]>;
  extractDesignContext(variant: DesignVariant): Promise<DesignDNA>;
  createDesignSystem(dna: DesignDNA): Promise<DesignSystemRef>;
  applyDesignSystem(projectId: string, ref: DesignSystemRef): Promise<void>;
}
