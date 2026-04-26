# Gap Analysis: Risk Profiling & Proposal Generation
## Date: 2026-04-22

## Summary
- Total BRD requirements: 42 FRs across 7 modules
- Existing (no work needed): 0
- Partial (modification needed): 2 (modelPortfolios table, suitability-service)
- Missing (new implementation): 40
- Conflicts: 0

## Data Model Gaps
| Entity | Status | Existing Location | Gap Details |
|--------|--------|-------------------|-------------|
| Questionnaire | MISSING | — | No table exists |
| Question | MISSING | — | No table exists |
| QuestionOption | MISSING | — | No table exists |
| ScoreNormalizationRange | MISSING | — | No table exists |
| RiskAppetiteMapping | MISSING | — | No table exists |
| RiskCategory | MISSING | — | No table exists |
| AssetAllocationConfig | MISSING | — | No table exists |
| ModelPortfolio | PARTIAL | schema.ts:1623 | Exists for rebalancing, needs risk-profiling fields |
| CustomerRiskAssessment | MISSING | — | No table exists |
| AssessmentAnswer | MISSING | — | No table exists |
| RiskProfileDeviation | MISSING | — | No table exists |
| ProductRiskDeviation | MISSING | — | No table exists |
| InvestmentProposal | MISSING | — | No table exists |
| ProposalLineItem | MISSING | — | No table exists |
| ProposalApproval | MISSING | — | No table exists |
| ComplianceEscalation | MISSING | — | No table exists |
| RiskProfilingAuditLog | MISSING | — | No table exists |

## API Route Gaps
| Endpoint | Status | Existing Location | Gap Details |
|----------|--------|-------------------|-------------|
| /api/back-office/risk-profiling/questionnaires | MISSING | — | No route file |
| /api/back-office/risk-profiling/risk-appetite | MISSING | — | No route file |
| /api/back-office/risk-profiling/asset-allocation | MISSING | — | No route file |
| /api/back-office/risk-profiling/assessments | MISSING | — | No route file |
| /api/back-office/risk-profiling/deviations | MISSING | — | No route file |
| /api/back-office/proposals | MISSING | — | No route file |
| /api/back-office/model-portfolios | PARTIAL | routes/back-office/index.ts:309 | Exists for rebalancing |
| /api/back-office/supervisor/dashboard | MISSING | — | No route file |
| /api/back-office/reports/risk-* | MISSING | — | No route file |

## UI Page Gaps
| Screen | Status | Existing Location | Gap Details |
|--------|--------|-------------------|-------------|
| Questionnaire Maintenance | MISSING | — | No page |
| Risk Appetite Mapping | MISSING | — | No page |
| Asset Allocation Config | MISSING | — | No page |
| Customer Risk Assessment Wizard | MISSING | — | No page |
| Investment Proposal Builder | MISSING | — | No page |
| Model Portfolio Management | MISSING | — | No page |
| Supervisor Dashboard | MISSING | — | No page |
| Risk Reports | MISSING | — | No page |

## Service Gaps
| Service | Status | Existing Location | Gap Details |
|---------|--------|-------------------|-------------|
| risk-profiling-service | MISSING | — | No service file |
| proposal-service | MISSING | — | No service file |
| model-portfolio-service | PARTIAL | services/model-portfolio-service.ts | Has rebalancing, needs risk-profiling |
| compliance-escalation-service | MISSING | — | No service file |

## Reusable Infrastructure
- CRUD factory pattern (createCrudRouter, createNestedCrudRouter)
- Maker-checker workflow system (approvalWorkflowDefinitions)
- Authorization middleware (requireBackOfficeRole)
- Audit logging (auditEvents, auditRecords)
- React Query setup for API calls
- shadcn/ui component library
- Notification system (notificationLog)
- Entity registry for dynamic CRUD
- Data versioning support (version fields)
