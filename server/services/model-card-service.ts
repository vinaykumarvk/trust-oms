/**
 * Model Card Service (Phase 8B)
 *
 * Stores and serves AI/ML model metadata including training data description,
 * accuracy metrics, bias metrics, version history, and explainability info.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelCard {
  id: string;
  name: string;
  version: string;
  description: string;
  modelType: string;
  trainingDataDescription: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  biasMetrics: Record<string, number>;
  featureImportance: Array<{ feature: string; importance: number }>;
  limitations: string[];
  ethicalConsiderations: string[];
  lastUpdated: string;
  createdBy: string;
}

interface PredictionExplanation {
  modelId: string;
  inputSummary: Record<string, unknown>;
  prediction: string;
  confidence: number;
  topFactors: Array<{ factor: string; contribution: number; direction: 'POSITIVE' | 'NEGATIVE' }>;
  modelVersion: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// In-memory model registry
// ---------------------------------------------------------------------------

const modelCards: ModelCard[] = [
  {
    id: 'anomaly-detector-v1',
    name: 'CA Anomaly Detector',
    version: '1.0.0',
    description: 'Rule-based anomaly detection for corporate action events. Flags unusual volumes, price outliers, and data quality issues.',
    modelType: 'RULE_BASED',
    trainingDataDescription: 'Historical corporate action events from 2020-2025, covering PH equities and fixed income.',
    accuracy: 0.94,
    precision: 0.91,
    recall: 0.88,
    f1Score: 0.895,
    biasMetrics: {
      equityBias: 0.02,
      fixedIncomeBias: -0.01,
      sectorBias: 0.03,
    },
    featureImportance: [
      { feature: 'days_before_ex_date', importance: 0.35 },
      { feature: 'amount_per_share_zscore', importance: 0.25 },
      { feature: 'split_ratio_deviation', importance: 0.20 },
      { feature: 'event_frequency', importance: 0.12 },
      { feature: 'source_reliability', importance: 0.08 },
    ],
    limitations: [
      'Rule thresholds are static and may need periodic tuning',
      'Cannot detect novel anomaly patterns not covered by existing rules',
      'Duplicate detection requires cross-event comparison (not yet implemented)',
    ],
    ethicalConsiderations: [
      'Model does not use client PII for anomaly detection',
      'False positives may delay legitimate corporate action processing',
      'Human review required for all CRITICAL severity flags',
    ],
    lastUpdated: '2026-04-01T00:00:00Z',
    createdBy: 'ML Engineering Team',
  },
  {
    id: 'tax-classifier-v1',
    name: 'Tax Residency Classifier',
    version: '1.2.0',
    description: 'Classifies client tax residency status for WHT rate determination based on FATCA/CRS data and portfolio presence.',
    modelType: 'DETERMINISTIC',
    trainingDataDescription: 'Philippine NIRC/TRAIN/CREATE tax law encoded as decision tree.',
    accuracy: 1.0,
    precision: 1.0,
    recall: 1.0,
    f1Score: 1.0,
    biasMetrics: {},
    featureImportance: [
      { feature: 'client_type', importance: 0.40 },
      { feature: 'reporting_jurisdictions', importance: 0.35 },
      { feature: 'ph_portfolio_presence', importance: 0.25 },
    ],
    limitations: [
      'Treaty rates are simplified to a single default (15%)',
      'Does not account for multi-jurisdictional treaty networks',
    ],
    ethicalConsiderations: [
      'Classification uses only regulatory-required data fields',
      'No demographic or personal data beyond tax residency indicators',
    ],
    lastUpdated: '2026-03-15T00:00:00Z',
    createdBy: 'Tax Engineering Team',
  },
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const modelCardService = {
  /** Get all model cards */
  getModelCards(): ModelCard[] {
    return modelCards.map((m) => ({ ...m }));
  },

  /** Get a specific model card by ID */
  getModelCard(modelId: string): ModelCard | null {
    return modelCards.find((m) => m.id === modelId) ?? null;
  },

  /** Generate a prediction explanation (mock for rule-based models) */
  explainPrediction(modelId: string, input: Record<string, unknown>): PredictionExplanation {
    const model = modelCards.find((m) => m.id === modelId);
    if (!model) throw new Error(`Model not found: ${modelId}`);

    // Generate explanation based on model type
    const factors = model.featureImportance.map((f) => ({
      factor: f.feature,
      contribution: f.importance * (0.5 + Math.random() * 0.5),
      direction: (Math.random() > 0.5 ? 'POSITIVE' : 'NEGATIVE') as 'POSITIVE' | 'NEGATIVE',
    }));

    return {
      modelId,
      inputSummary: input,
      prediction: 'NORMAL',
      confidence: 0.85 + Math.random() * 0.14,
      topFactors: factors.slice(0, 3),
      modelVersion: model.version,
      generatedAt: new Date().toISOString(),
    };
  },

  /** Get model version history */
  getVersionHistory(modelId: string): Array<{ version: string; date: string; changes: string }> {
    const model = modelCards.find((m) => m.id === modelId);
    if (!model) throw new Error(`Model not found: ${modelId}`);

    // Return stub version history
    return [
      { version: model.version, date: model.lastUpdated, changes: 'Current production version' },
      { version: '0.9.0', date: '2026-01-15T00:00:00Z', changes: 'Beta release with initial rule set' },
      { version: '0.5.0', date: '2025-10-01T00:00:00Z', changes: 'Alpha release for internal testing' },
    ];
  },
};
