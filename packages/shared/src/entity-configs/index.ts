import type { EntityFieldDefaults } from './types';

export type {
  FieldDefaults,
  EntityFieldDefaults,
  MergedFieldConfig,
  MergedEntityConfig,
  CrossValidationRule,
} from './types';

// Entity config exports
export { countryFieldConfig } from './country';
export { currencyFieldConfig } from './currency';
export { assetClassFieldConfig } from './asset-class';
export { branchFieldConfig } from './branch';
export { exchangeFieldConfig } from './exchange';
export { trustProductTypeFieldConfig } from './trust-product-type';
export { feeTypeFieldConfig } from './fee-type';
export { taxCodeFieldConfig } from './tax-code';
export { counterpartyFieldConfig } from './counterparty';
export { brokerFieldConfig } from './broker';
export { securityFieldConfig } from './security';
export { portfolioFieldConfig } from './portfolio';
export { clientFieldConfig } from './client';
export { userFieldConfig } from './user';
export { modelPortfolioFieldConfig } from './model-portfolio';
export { complianceLimitFieldConfig } from './compliance-limit';
export { scheduledPlanFieldConfig } from './scheduled-plan';
export { peraAccountFieldConfig } from './pera-account';
export { heldAwayAssetFieldConfig } from './held-away-asset';
export { standingInstructionFieldConfig } from './standing-instruction';

// Import for the map
import { countryFieldConfig } from './country';
import { currencyFieldConfig } from './currency';
import { assetClassFieldConfig } from './asset-class';
import { branchFieldConfig } from './branch';
import { exchangeFieldConfig } from './exchange';
import { trustProductTypeFieldConfig } from './trust-product-type';
import { feeTypeFieldConfig } from './fee-type';
import { taxCodeFieldConfig } from './tax-code';
import { counterpartyFieldConfig } from './counterparty';
import { brokerFieldConfig } from './broker';
import { securityFieldConfig } from './security';
import { portfolioFieldConfig } from './portfolio';
import { clientFieldConfig } from './client';
import { userFieldConfig } from './user';
import { modelPortfolioFieldConfig } from './model-portfolio';
import { complianceLimitFieldConfig } from './compliance-limit';
import { scheduledPlanFieldConfig } from './scheduled-plan';
import { peraAccountFieldConfig } from './pera-account';
import { heldAwayAssetFieldConfig } from './held-away-asset';
import { standingInstructionFieldConfig } from './standing-instruction';

/**
 * Map from entity key (URL path segment) to code-level field defaults.
 * Keys must match the navigation paths and API route segments.
 */
export const entityFieldDefaultsMap: Record<string, EntityFieldDefaults> = {
  countries: countryFieldConfig,
  currencies: currencyFieldConfig,
  'asset-classes': assetClassFieldConfig,
  branches: branchFieldConfig,
  exchanges: exchangeFieldConfig,
  'trust-product-types': trustProductTypeFieldConfig,
  'fee-types': feeTypeFieldConfig,
  'tax-codes': taxCodeFieldConfig,
  counterparties: counterpartyFieldConfig,
  brokers: brokerFieldConfig,
  securities: securityFieldConfig,
  portfolios: portfolioFieldConfig,
  clients: clientFieldConfig,
  users: userFieldConfig,
  'model-portfolios': modelPortfolioFieldConfig,
  'compliance-limits': complianceLimitFieldConfig,
  'scheduled-plans': scheduledPlanFieldConfig,
  'pera-accounts': peraAccountFieldConfig,
  'held-away-assets': heldAwayAssetFieldConfig,
  'standing-instructions': standingInstructionFieldConfig,
};
