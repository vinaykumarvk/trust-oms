/**
 * Integration Hub Service (Phase 6A)
 *
 * Connector registry and routing engine for all BRD 7.1 external systems.
 * Manages health monitoring, connection testing, order routing rules,
 * activity logging, and dry-run simulation for Philippine trust OMS integrations.
 *
 * All connector data is held in-memory (config stubs, not persisted to DB).
 */

// =============================================================================
// Types
// =============================================================================

export type ConnectorType =
  | 'MARKET_DATA'
  | 'EXCHANGE'
  | 'MESSAGING'
  | 'PAYMENT'
  | 'REGULATORY'
  | 'SANCTIONS'
  | 'CORE_BANKING';

export type ConnectorStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'DISABLED';

export type ConnectorProtocol = 'FIX' | 'REST' | 'SFTP' | 'MQ' | 'SWIFT';

export interface Connector {
  id: string;
  name: string;
  type: ConnectorType;
  status: ConnectorStatus;
  endpoint: string;
  last_checked: string;
  success_rate: number;
  avg_latency_ms: number;
  protocol: ConnectorProtocol;
  description: string;
  credentials_configured: boolean;
  enabled: boolean;
}

export interface RoutingRule {
  id: string;
  security_type: string;
  side: string;
  connector_id: string;
  fallback_connector_id: string | null;
  priority: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  connector_id: string;
  connector_name: string;
  event_type: string;
  status: 'SUCCESS' | 'FAILURE' | 'TIMEOUT' | 'DEGRADED';
  latency_ms: number;
  details: string;
}

export interface ConnectorMetrics {
  connector_id: string;
  period: string;
  success_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  total_requests: number;
  failed_requests: number;
  uptime_pct: number;
  last_downtime: string | null;
}

// =============================================================================
// In-Memory Connector Registry (11 connectors per BRD 7.1)
// =============================================================================

const connectors: Connector[] = [
  {
    id: 'finacle',
    name: 'Finacle Core Banking',
    type: 'CORE_BANKING',
    status: 'HEALTHY',
    endpoint: 'https://finacle.internal.bankph.local/api/v2',
    last_checked: new Date().toISOString(),
    success_rate: 99.7,
    avg_latency_ms: 120,
    protocol: 'REST',
    description: 'Infosys Finacle core banking system — account balances, GL postings, CA/SA sweeps',
    credentials_configured: true,
    enabled: true,
  },
  {
    id: 'bloomberg',
    name: 'Bloomberg Market Data',
    type: 'MARKET_DATA',
    status: 'HEALTHY',
    endpoint: 'https://bpipe.bloomberg.net/api/v3',
    last_checked: new Date().toISOString(),
    success_rate: 99.9,
    avg_latency_ms: 45,
    protocol: 'REST',
    description: 'Bloomberg B-PIPE — real-time equity, fixed income, FX pricing and analytics',
    credentials_configured: true,
    enabled: true,
  },
  {
    id: 'refinitiv',
    name: 'Refinitiv (LSEG) Market Data',
    type: 'MARKET_DATA',
    status: 'HEALTHY',
    endpoint: 'https://streaming.refinitiv.com/api/v1',
    last_checked: new Date().toISOString(),
    success_rate: 99.5,
    avg_latency_ms: 55,
    protocol: 'REST',
    description: 'Refinitiv Elektron — backup market data feed, bond analytics, economic data',
    credentials_configured: true,
    enabled: true,
  },
  {
    id: 'pdex',
    name: 'PDEx (Philippine Dealing & Exchange)',
    type: 'EXCHANGE',
    status: 'HEALTHY',
    endpoint: 'fix://pdex-gateway.pdex.com.ph:9876',
    last_checked: new Date().toISOString(),
    success_rate: 99.2,
    avg_latency_ms: 85,
    protocol: 'FIX',
    description: 'Philippine Dealing & Exchange Corp — government securities and fixed income trading',
    credentials_configured: true,
    enabled: true,
  },
  {
    id: 'pse-edge',
    name: 'PSE EDGE (Philippine Stock Exchange)',
    type: 'EXCHANGE',
    status: 'HEALTHY',
    endpoint: 'fix://edge-gateway.pse.com.ph:9877',
    last_checked: new Date().toISOString(),
    success_rate: 99.4,
    avg_latency_ms: 72,
    protocol: 'FIX',
    description: 'PSE Electronic Disclosure Generation Technology — equities order routing and market data',
    credentials_configured: true,
    enabled: true,
  },
  {
    id: 'swift',
    name: 'SWIFT Alliance Messaging',
    type: 'MESSAGING',
    status: 'HEALTHY',
    endpoint: 'mqtls://swift-alliance.bankph.local:61617',
    last_checked: new Date().toISOString(),
    success_rate: 99.8,
    avg_latency_ms: 200,
    protocol: 'SWIFT',
    description: 'SWIFT Alliance Lite2 — MT103/202/535/950 messaging for cross-border settlements',
    credentials_configured: true,
    enabled: true,
  },
  {
    id: 'philpass',
    name: 'PhilPaSS (Philippine Payment & Settlement System)',
    type: 'PAYMENT',
    status: 'HEALTHY',
    endpoint: 'https://philpass-gateway.bsp.gov.ph/rtgs/v1',
    last_checked: new Date().toISOString(),
    success_rate: 99.6,
    avg_latency_ms: 150,
    protocol: 'MQ',
    description: 'BSP PhilPaSS RTGS — real-time gross settlement for PHP large-value payments',
    credentials_configured: true,
    enabled: true,
  },
  {
    id: 'bsp-efrs',
    name: 'BSP eFRS (Electronic Financial Reporting System)',
    type: 'REGULATORY',
    status: 'HEALTHY',
    endpoint: 'sftp://efrs-upload.bsp.gov.ph:22',
    last_checked: new Date().toISOString(),
    success_rate: 98.5,
    avg_latency_ms: 3500,
    protocol: 'SFTP',
    description: 'Bangko Sentral ng Pilipinas eFRS — regulatory report submission (FRP, prudential)',
    credentials_configured: true,
    enabled: true,
  },
  {
    id: 'amlc-goaml',
    name: 'AMLC goAML Reporting',
    type: 'REGULATORY',
    status: 'HEALTHY',
    endpoint: 'https://goaml.amlc.gov.ph/api/v2',
    last_checked: new Date().toISOString(),
    success_rate: 97.8,
    avg_latency_ms: 2800,
    protocol: 'REST',
    description: 'Anti-Money Laundering Council goAML — STR/CTR filing and suspicious transaction reporting',
    credentials_configured: true,
    enabled: true,
  },
  {
    id: 'bir-ides',
    name: 'BIR IDES (International Data Exchange Service)',
    type: 'REGULATORY',
    status: 'HEALTHY',
    endpoint: 'sftp://ides.bir.gov.ph:22',
    last_checked: new Date().toISOString(),
    success_rate: 98.0,
    avg_latency_ms: 4200,
    protocol: 'SFTP',
    description: 'Bureau of Internal Revenue IDES — FATCA/CRS reporting and withholding tax compliance',
    credentials_configured: true,
    enabled: true,
  },
  {
    id: 'sanctions-vendor',
    name: 'Sanctions Screening Vendor',
    type: 'SANCTIONS',
    status: 'HEALTHY',
    endpoint: 'https://api.worldcheck.refinitiv.com/v2',
    last_checked: new Date().toISOString(),
    success_rate: 99.3,
    avg_latency_ms: 350,
    protocol: 'REST',
    description: 'World-Check One — PEP, sanctions, and adverse media screening for KYC/AML',
    credentials_configured: true,
    enabled: true,
  },
];

// =============================================================================
// In-Memory Routing Rules
// =============================================================================

let routingRuleIdSeq = 100;

const routingRules: RoutingRule[] = [
  {
    id: 'RR-001',
    security_type: 'GOVERNMENT_BOND',
    side: 'BUY',
    connector_id: 'pdex',
    fallback_connector_id: 'swift',
    priority: 1,
    enabled: true,
    created_at: '2025-01-15T08:00:00Z',
    updated_at: '2025-01-15T08:00:00Z',
  },
  {
    id: 'RR-002',
    security_type: 'GOVERNMENT_BOND',
    side: 'SELL',
    connector_id: 'pdex',
    fallback_connector_id: 'swift',
    priority: 1,
    enabled: true,
    created_at: '2025-01-15T08:00:00Z',
    updated_at: '2025-01-15T08:00:00Z',
  },
  {
    id: 'RR-003',
    security_type: 'CORPORATE_BOND',
    side: 'BUY',
    connector_id: 'pdex',
    fallback_connector_id: 'bloomberg',
    priority: 1,
    enabled: true,
    created_at: '2025-01-15T08:00:00Z',
    updated_at: '2025-01-15T08:00:00Z',
  },
  {
    id: 'RR-004',
    security_type: 'CORPORATE_BOND',
    side: 'SELL',
    connector_id: 'pdex',
    fallback_connector_id: 'bloomberg',
    priority: 1,
    enabled: true,
    created_at: '2025-01-15T08:00:00Z',
    updated_at: '2025-01-15T08:00:00Z',
  },
  {
    id: 'RR-005',
    security_type: 'EQUITY',
    side: 'BUY',
    connector_id: 'pse-edge',
    fallback_connector_id: 'bloomberg',
    priority: 1,
    enabled: true,
    created_at: '2025-01-15T08:00:00Z',
    updated_at: '2025-01-15T08:00:00Z',
  },
  {
    id: 'RR-006',
    security_type: 'EQUITY',
    side: 'SELL',
    connector_id: 'pse-edge',
    fallback_connector_id: 'bloomberg',
    priority: 1,
    enabled: true,
    created_at: '2025-01-15T08:00:00Z',
    updated_at: '2025-01-15T08:00:00Z',
  },
  {
    id: 'RR-007',
    security_type: 'UITF',
    side: 'BUY',
    connector_id: 'finacle',
    fallback_connector_id: null,
    priority: 1,
    enabled: true,
    created_at: '2025-01-15T08:00:00Z',
    updated_at: '2025-01-15T08:00:00Z',
  },
  {
    id: 'RR-008',
    security_type: 'UITF',
    side: 'SELL',
    connector_id: 'finacle',
    fallback_connector_id: null,
    priority: 1,
    enabled: true,
    created_at: '2025-01-15T08:00:00Z',
    updated_at: '2025-01-15T08:00:00Z',
  },
  {
    id: 'RR-009',
    security_type: 'FX_FORWARD',
    side: 'BUY',
    connector_id: 'bloomberg',
    fallback_connector_id: 'refinitiv',
    priority: 1,
    enabled: true,
    created_at: '2025-01-15T08:00:00Z',
    updated_at: '2025-01-15T08:00:00Z',
  },
  {
    id: 'RR-010',
    security_type: 'FX_FORWARD',
    side: 'SELL',
    connector_id: 'bloomberg',
    fallback_connector_id: 'refinitiv',
    priority: 1,
    enabled: true,
    created_at: '2025-01-15T08:00:00Z',
    updated_at: '2025-01-15T08:00:00Z',
  },
];

// =============================================================================
// In-Memory Activity Log
// =============================================================================

const activityLog: ActivityLogEntry[] = [
  {
    id: 'AL-001',
    timestamp: '2026-04-18T01:15:22Z',
    connector_id: 'pdex',
    connector_name: 'PDEx (Philippine Dealing & Exchange)',
    event_type: 'ORDER_SUBMIT',
    status: 'SUCCESS',
    latency_ms: 78,
    details: 'GovBond order PDEX-20260418-001 submitted via FIX 4.4',
  },
  {
    id: 'AL-002',
    timestamp: '2026-04-18T01:15:23Z',
    connector_id: 'pdex',
    connector_name: 'PDEx (Philippine Dealing & Exchange)',
    event_type: 'ORDER_ACK',
    status: 'SUCCESS',
    latency_ms: 12,
    details: 'Execution report received: PDEX-20260418-001 acknowledged',
  },
  {
    id: 'AL-003',
    timestamp: '2026-04-18T02:30:10Z',
    connector_id: 'bloomberg',
    connector_name: 'Bloomberg Market Data',
    event_type: 'PRICE_UPDATE',
    status: 'SUCCESS',
    latency_ms: 38,
    details: 'Batch pricing update received: 245 instruments',
  },
  {
    id: 'AL-004',
    timestamp: '2026-04-18T03:00:00Z',
    connector_id: 'finacle',
    connector_name: 'Finacle Core Banking',
    event_type: 'BALANCE_INQUIRY',
    status: 'SUCCESS',
    latency_ms: 115,
    details: 'CA balance inquiry for 34 trust accounts completed',
  },
  {
    id: 'AL-005',
    timestamp: '2026-04-18T03:45:00Z',
    connector_id: 'philpass',
    connector_name: 'PhilPaSS (Philippine Payment & Settlement System)',
    event_type: 'PAYMENT_SUBMIT',
    status: 'SUCCESS',
    latency_ms: 145,
    details: 'RTGS payment PHP 12,500,000.00 submitted for settlement',
  },
  {
    id: 'AL-006',
    timestamp: '2026-04-18T04:10:30Z',
    connector_id: 'swift',
    connector_name: 'SWIFT Alliance Messaging',
    event_type: 'MESSAGE_SEND',
    status: 'SUCCESS',
    latency_ms: 195,
    details: 'MT202 sent for USD cross-border settlement',
  },
  {
    id: 'AL-007',
    timestamp: '2026-04-18T05:00:00Z',
    connector_id: 'bsp-efrs',
    connector_name: 'BSP eFRS (Electronic Financial Reporting System)',
    event_type: 'REPORT_UPLOAD',
    status: 'TIMEOUT',
    latency_ms: 30000,
    details: 'Weekly FRP report upload timed out — retry queued',
  },
  {
    id: 'AL-008',
    timestamp: '2026-04-18T05:05:00Z',
    connector_id: 'bsp-efrs',
    connector_name: 'BSP eFRS (Electronic Financial Reporting System)',
    event_type: 'REPORT_UPLOAD',
    status: 'SUCCESS',
    latency_ms: 3800,
    details: 'Weekly FRP report upload completed on retry',
  },
  {
    id: 'AL-009',
    timestamp: '2026-04-18T06:00:00Z',
    connector_id: 'sanctions-vendor',
    connector_name: 'Sanctions Screening Vendor',
    event_type: 'BATCH_SCREEN',
    status: 'SUCCESS',
    latency_ms: 2800,
    details: 'Overnight batch screening: 1,245 entities, 0 hits',
  },
  {
    id: 'AL-010',
    timestamp: '2026-04-18T06:30:00Z',
    connector_id: 'pse-edge',
    connector_name: 'PSE EDGE (Philippine Stock Exchange)',
    event_type: 'SESSION_LOGON',
    status: 'SUCCESS',
    latency_ms: 62,
    details: 'FIX session logon for trading day 2026-04-18',
  },
];

let activityLogIdSeq = 11;

// =============================================================================
// Helper Utilities
// =============================================================================

function generateId(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function findConnector(id: string): Connector | undefined {
  return connectors.find((c: Connector) => c.id === id);
}

function findConnectorIndex(id: string): number {
  return connectors.findIndex((c: Connector) => c.id === id);
}

// =============================================================================
// Service Implementation
// =============================================================================

export const integrationService = {
  // ---------------------------------------------------------------------------
  // Connector CRUD
  // ---------------------------------------------------------------------------

  /** List all connectors with current health status */
  async getConnectors(): Promise<Connector[]> {
    return connectors.map((c: any) => ({ ...c }));
  },

  /** Get a single connector by ID */
  async getConnector(id: string): Promise<Connector> {
    const connector = findConnector(id);
    if (!connector) {
      throw new Error(`Connector not found: ${id}`);
    }
    return { ...connector };
  },

  /** Simulate a connection test against a connector (returns realistic latencies) */
  async testConnection(id: string): Promise<{
    connector_id: string;
    success: boolean;
    latency_ms: number;
    message: string;
    tested_at: string;
  }> {
    const connector = findConnector(id);
    if (!connector) {
      throw new Error(`Connector not found: ${id}`);
    }

    if (!connector.enabled) {
      return {
        connector_id: id,
        success: false,
        latency_ms: 0,
        message: 'Connector is disabled',
        tested_at: new Date().toISOString(),
      };
    }

    // Simulate latency based on connector type
    const latencyRanges: Record<string, [number, number]> = {
      finacle: [80, 250],
      bloomberg: [20, 100],
      refinitiv: [25, 120],
      pdex: [50, 200],
      'pse-edge': [40, 180],
      swift: [100, 400],
      philpass: [80, 350],
      'bsp-efrs': [1500, 8000],
      'amlc-goaml': [1200, 6000],
      'bir-ides': [2000, 10000],
      'sanctions-vendor': [150, 800],
    };

    const range = latencyRanges[id] || [50, 500];
    const latency = randomBetween(range[0], range[1]);

    // ~90% success rate for simulation
    const success = Math.random() > 0.1;

    const message = success
      ? `Connection to ${connector.name} established successfully`
      : `Connection to ${connector.name} failed: ${
          ['Connection timeout', 'Authentication failed', 'Service unavailable'][randomBetween(0, 2)]
        }`;

    // Update connector status based on test
    const idx = findConnectorIndex(id);
    if (idx !== -1) {
      connectors[idx].last_checked = new Date().toISOString();
      if (success) {
        connectors[idx].status = latency > range[1] * 0.8 ? 'DEGRADED' : 'HEALTHY';
      } else {
        connectors[idx].status = 'DOWN';
      }
    }

    // Log the test activity
    const logEntry: ActivityLogEntry = {
      id: generateId('AL', activityLogIdSeq++),
      timestamp: new Date().toISOString(),
      connector_id: id,
      connector_name: connector.name,
      event_type: 'CONNECTION_TEST',
      status: success ? 'SUCCESS' : 'FAILURE',
      latency_ms: latency,
      details: message,
    };
    activityLog.unshift(logEntry);

    return {
      connector_id: id,
      success,
      latency_ms: latency,
      message,
      tested_at: new Date().toISOString(),
    };
  },

  /** Update a connector's configuration (endpoint, status, enabled) */
  async updateConnector(
    id: string,
    config: Partial<Pick<Connector, 'endpoint' | 'status' | 'enabled' | 'credentials_configured'>>,
  ): Promise<Connector> {
    const idx = findConnectorIndex(id);
    if (idx === -1) {
      throw new Error(`Connector not found: ${id}`);
    }

    if (config.endpoint !== undefined) {
      connectors[idx].endpoint = config.endpoint;
    }
    if (config.status !== undefined) {
      connectors[idx].status = config.status;
    }
    if (config.enabled !== undefined) {
      connectors[idx].enabled = config.enabled;
    }
    if (config.credentials_configured !== undefined) {
      connectors[idx].credentials_configured = config.credentials_configured;
    }

    return { ...connectors[idx] };
  },

  // ---------------------------------------------------------------------------
  // Routing Rules
  // ---------------------------------------------------------------------------

  /** List all order routing rules */
  async getRoutingRules(): Promise<RoutingRule[]> {
    return routingRules
      .filter((r: any) => r.enabled)
      .sort((a: any, b: any) => a.priority - b.priority)
      .map((r: any) => ({ ...r }));
  },

  /** Create a new routing rule */
  async createRoutingRule(data: {
    security_type: string;
    side: string;
    connector_id: string;
    fallback_connector_id?: string;
    priority?: number;
  }): Promise<RoutingRule> {
    // Validate connector exists
    if (!findConnector(data.connector_id)) {
      throw new Error(`Primary connector not found: ${data.connector_id}`);
    }
    if (data.fallback_connector_id && !findConnector(data.fallback_connector_id)) {
      throw new Error(`Fallback connector not found: ${data.fallback_connector_id}`);
    }

    const now = new Date().toISOString();
    const rule: RoutingRule = {
      id: generateId('RR', routingRuleIdSeq++),
      security_type: data.security_type,
      side: data.side,
      connector_id: data.connector_id,
      fallback_connector_id: data.fallback_connector_id ?? null,
      priority: data.priority ?? 1,
      enabled: true,
      created_at: now,
      updated_at: now,
    };

    routingRules.push(rule);
    return { ...rule };
  },

  /** Update an existing routing rule */
  async updateRoutingRule(
    id: string,
    data: Partial<Pick<RoutingRule, 'security_type' | 'side' | 'connector_id' | 'fallback_connector_id' | 'priority' | 'enabled'>>,
  ): Promise<RoutingRule> {
    const idx = routingRules.findIndex((r: any) => r.id === id);
    if (idx === -1) {
      throw new Error(`Routing rule not found: ${id}`);
    }

    if (data.connector_id !== undefined && !findConnector(data.connector_id)) {
      throw new Error(`Primary connector not found: ${data.connector_id}`);
    }
    if (data.fallback_connector_id !== undefined && data.fallback_connector_id !== null && !findConnector(data.fallback_connector_id)) {
      throw new Error(`Fallback connector not found: ${data.fallback_connector_id}`);
    }

    if (data.security_type !== undefined) routingRules[idx].security_type = data.security_type;
    if (data.side !== undefined) routingRules[idx].side = data.side;
    if (data.connector_id !== undefined) routingRules[idx].connector_id = data.connector_id;
    if (data.fallback_connector_id !== undefined) routingRules[idx].fallback_connector_id = data.fallback_connector_id;
    if (data.priority !== undefined) routingRules[idx].priority = data.priority;
    if (data.enabled !== undefined) routingRules[idx].enabled = data.enabled;

    routingRules[idx].updated_at = new Date().toISOString();

    return { ...routingRules[idx] };
  },

  /** Delete (disable) a routing rule */
  async deleteRoutingRule(id: string): Promise<{ deleted: boolean; id: string }> {
    const idx = routingRules.findIndex((r: any) => r.id === id);
    if (idx === -1) {
      throw new Error(`Routing rule not found: ${id}`);
    }

    routingRules.splice(idx, 1);
    return { deleted: true, id };
  },

  // ---------------------------------------------------------------------------
  // Activity Log
  // ---------------------------------------------------------------------------

  /** Get integration activity log with optional filters */
  async getActivityLog(filters: {
    connector?: string;
    eventType?: string;
    status?: string;
    limit?: number;
  }): Promise<{ data: ActivityLogEntry[]; total: number }> {
    let filtered = activityLog.slice();

    if (filters.connector) {
      filtered = filtered.filter((e: any) => e.connector_id === filters.connector);
    }
    if (filters.eventType) {
      filtered = filtered.filter((e: any) => e.event_type === filters.eventType);
    }
    if (filters.status) {
      filtered = filtered.filter((e: any) => e.status === filters.status);
    }

    const total = filtered.length;
    const limit = Math.min(filters.limit ?? 50, 200);

    return {
      data: filtered.slice(0, limit).map((e: any) => ({ ...e })),
      total,
    };
  },

  // ---------------------------------------------------------------------------
  // Order Routing Simulation
  // ---------------------------------------------------------------------------

  /** Dry-run: show which connector would handle an order, expected latency, fallback path */
  async simulateOrderRouting(
    securityType: string,
    side: string,
    quantity: number,
  ): Promise<{
    security_type: string;
    side: string;
    quantity: number;
    primary_connector: { id: string; name: string; protocol: string; expected_latency_ms: number } | null;
    fallback_connector: { id: string; name: string; protocol: string; expected_latency_ms: number } | null;
    routing_rule_id: string | null;
    estimated_fill_time_ms: number;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    // Find matching routing rule
    const rule = routingRules.find(
      (r: any) =>
        r.security_type === securityType &&
        (r.side === side || r.side === 'ANY') &&
        r.enabled,
    );

    if (!rule) {
      return {
        security_type: securityType,
        side,
        quantity,
        primary_connector: null,
        fallback_connector: null,
        routing_rule_id: null,
        estimated_fill_time_ms: 0,
        warnings: [`No routing rule found for ${securityType} / ${side}`],
      };
    }

    const primary = findConnector(rule.connector_id);
    const fallback = rule.fallback_connector_id
      ? findConnector(rule.fallback_connector_id)
      : null;

    if (primary && primary.status === 'DOWN') {
      warnings.push(`Primary connector ${primary.name} is DOWN — would route to fallback`);
    }
    if (primary && primary.status === 'DEGRADED') {
      warnings.push(`Primary connector ${primary.name} is DEGRADED — latency may be elevated`);
    }
    if (primary && !primary.enabled) {
      warnings.push(`Primary connector ${primary.name} is DISABLED`);
    }
    if (!fallback) {
      warnings.push('No fallback connector configured for this routing rule');
    }

    // Estimate fill time based on quantity and connector latency
    const baseFillMs = primary ? primary.avg_latency_ms : 0;
    const quantityFactor = quantity > 1000000 ? 2.5 : quantity > 100000 ? 1.8 : quantity > 10000 ? 1.3 : 1.0;
    const estimatedFillTime = Math.round(baseFillMs * quantityFactor);

    return {
      security_type: securityType,
      side,
      quantity,
      primary_connector: primary
        ? {
            id: primary.id,
            name: primary.name,
            protocol: primary.protocol,
            expected_latency_ms: primary.avg_latency_ms,
          }
        : null,
      fallback_connector: fallback
        ? {
            id: fallback.id,
            name: fallback.name,
            protocol: fallback.protocol,
            expected_latency_ms: fallback.avg_latency_ms,
          }
        : null,
      routing_rule_id: rule.id,
      estimated_fill_time_ms: estimatedFillTime,
      warnings,
    };
  },

  // ---------------------------------------------------------------------------
  // Connector Metrics
  // ---------------------------------------------------------------------------

  /** Get connector health metrics over a given period */
  async getConnectorMetrics(
    id: string,
    period: string = '24h',
  ): Promise<ConnectorMetrics> {
    const connector = findConnector(id);
    if (!connector) {
      throw new Error(`Connector not found: ${id}`);
    }

    // Generate realistic metrics based on connector type and period
    const baseLatency = connector.avg_latency_ms;
    const successRate = connector.success_rate;

    // Scale total requests by period
    const periodMultipliers: Record<string, number> = {
      '1h': 1,
      '6h': 6,
      '24h': 24,
      '7d': 168,
      '30d': 720,
    };
    const multiplier = periodMultipliers[period] || 24;

    // Request volume varies by connector type
    const baseRequestsPerHour: Record<string, number> = {
      finacle: 120,
      bloomberg: 500,
      refinitiv: 200,
      pdex: 85,
      'pse-edge': 150,
      swift: 30,
      philpass: 25,
      'bsp-efrs': 2,
      'amlc-goaml': 3,
      'bir-ides': 1,
      'sanctions-vendor': 45,
    };

    const reqsPerHour = baseRequestsPerHour[id] || 50;
    const totalRequests = Math.round(reqsPerHour * multiplier * (0.8 + Math.random() * 0.4));
    const failedRequests = Math.round(totalRequests * ((100 - successRate) / 100));

    return {
      connector_id: id,
      period,
      success_rate: Number((successRate + (Math.random() * 0.4 - 0.2)).toFixed(2)),
      avg_latency_ms: Math.round(baseLatency * (0.9 + Math.random() * 0.2)),
      p95_latency_ms: Math.round(baseLatency * (1.8 + Math.random() * 0.5)),
      p99_latency_ms: Math.round(baseLatency * (3.0 + Math.random() * 1.0)),
      total_requests: totalRequests,
      failed_requests: failedRequests,
      uptime_pct: Number((99.0 + Math.random() * 0.95).toFixed(2)),
      last_downtime: connector.status === 'DOWN'
        ? new Date().toISOString()
        : Math.random() > 0.7
          ? new Date(Date.now() - randomBetween(3600000, 86400000)).toISOString()
          : null,
    };
  },
};
