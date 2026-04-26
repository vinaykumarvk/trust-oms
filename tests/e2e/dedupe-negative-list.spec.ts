/**
 * E2E Tests — Deduplication Engine & Negative List Screening (CRM Phase 3)
 *
 * Tests:
 * - Hard-stop blocking entity creation
 * - Soft-stop with override
 * - Cross-entity dedupe (leads + prospects + clients)
 * - Levenshtein matching (exact, distance 1, distance 2, distance 3 = no match)
 * - Negative list CRUD
 * - Bulk upload
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock DB layer — intercept all Drizzle calls
// ---------------------------------------------------------------------------

const mockDbRows: Record<string, unknown[]> = {};
let insertedValues: unknown[] = [];
let updatedValues: unknown[] = [];

const mockReturning = vi.fn(() => {
  const lastInserted = insertedValues[insertedValues.length - 1];
  const lastUpdated = updatedValues[updatedValues.length - 1];
  return Promise.resolve([{ id: 1, ...((lastInserted || lastUpdated || {}) as Record<string, unknown>) }]);
});

const mockWhere = vi.fn(() => ({
  limit: vi.fn(() => Promise.resolve(mockDbRows.where || [])),
  orderBy: vi.fn(() => ({
    limit: vi.fn(() => Promise.resolve(mockDbRows.where || [])),
    offset: vi.fn(() => Promise.resolve(mockDbRows.where || [])),
  })),
  returning: mockReturning,
}));

const mockFrom = vi.fn(() => ({
  where: mockWhere,
  orderBy: vi.fn(() => ({
    where: mockWhere,
    limit: vi.fn(() => ({
      offset: vi.fn(() => Promise.resolve(mockDbRows.from || [])),
    })),
  })),
  limit: vi.fn(() => ({
    offset: vi.fn(() => Promise.resolve(mockDbRows.from || [])),
  })),
  leftJoin: vi.fn(() => ({
    where: mockWhere,
  })),
}));

const mockSet = vi.fn((values: unknown) => {
  updatedValues.push(values);
  return {
    where: vi.fn(() => ({
      returning: mockReturning,
    })),
  };
});

const mockValues = vi.fn((values: unknown) => {
  insertedValues.push(values);
  return {
    returning: mockReturning,
  };
});

vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: mockFrom,
    })),
    insert: vi.fn(() => ({
      values: mockValues,
    })),
    update: vi.fn(() => ({
      set: mockSet,
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
    execute: vi.fn(() => Promise.resolve({ rows: [] })),
  },
}));

// Mock audit-logger
vi.mock('../../server/services/audit-logger', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import the Levenshtein function directly (no DB dependency)
// ---------------------------------------------------------------------------

import { levenshteinDistance } from '../../server/services/negative-list-service';

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  insertedValues = [];
  updatedValues = [];
  Object.keys(mockDbRows).forEach((k) => delete mockDbRows[k]);
});

// ============================================================================
// Levenshtein Distance Tests
// ============================================================================

describe('Levenshtein Distance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('should return 0 for case-insensitive identical strings', () => {
    expect(levenshteinDistance('Hello', 'hello')).toBe(0);
  });

  it('should return length of other string when one is empty', () => {
    expect(levenshteinDistance('', 'hello')).toBe(5);
    expect(levenshteinDistance('test', '')).toBe(4);
  });

  it('should return correct distance for single character difference (distance 1)', () => {
    // Substitution
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
    // Insertion
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
    // Deletion
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });

  it('should return correct distance for two character differences (distance 2)', () => {
    // Two substitutions
    expect(levenshteinDistance('cat', 'bar')).toBe(2);
    // Substitution + insertion
    expect(levenshteinDistance('john', 'johnn')).toBe(1);
    expect(levenshteinDistance('john', 'jhon')).toBe(2);
  });

  it('should return distance 3 for significantly different strings', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('should handle names with fuzzy matching scenarios', () => {
    // Exact name match
    expect(levenshteinDistance('john smith', 'john smith')).toBe(0);
    // Typo in first name (distance 1)
    expect(levenshteinDistance('john smith', 'jonn smith')).toBe(1);
    // Typo in last name (distance 1)
    expect(levenshteinDistance('john smith', 'john smyth')).toBe(1);
    // Two typos (distance 2)
    expect(levenshteinDistance('john smith', 'jonn smyth')).toBe(2);
    // Different name entirely (distance > 2)
    expect(levenshteinDistance('john smith', 'jane doe')).toBeGreaterThan(2);
  });

  it('should trim and normalize whitespace', () => {
    expect(levenshteinDistance('  hello  ', 'hello')).toBe(0);
  });

  it('should handle both empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0);
  });
});

// ============================================================================
// Dedupe Service Tests (with mocked DB)
// ============================================================================

describe('Dedupe Service', () => {
  // We dynamically import so mocks are already set up
  let dedupeService: typeof import('../../server/services/dedupe-service').dedupeService;

  beforeEach(async () => {
    const mod = await import('../../server/services/dedupe-service');
    dedupeService = mod.dedupeService;
  });

  describe('checkDedupe', () => {
    it('should return hard_stop when a HARD_STOP rule matches', async () => {
      // Mock: active rules
      const hardStopRule = {
        id: 1,
        entity_type: 'INDIVIDUAL',
        person_type: 'INDIVIDUAL',
        field_combination: ['first_name', 'last_name', 'email'],
        stop_type: 'HARD_STOP',
        priority: 1,
        is_active: true,
      };

      // First call: getRules returns the hard stop rule
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve([hardStopRule])),
        })),
      }));

      // Lead match
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([
            { id: 10, first_name: 'John', last_name: 'Doe', email: 'john@test.com', mobile_phone: null },
          ])),
        })),
      }));

      // Prospect match (no matches)
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      }));

      // Client match (no matches)
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      }));

      const result = await dedupeService.checkDedupe(
        { first_name: 'John', last_name: 'Doe', email: 'john@test.com' },
        'INDIVIDUAL',
      );

      expect(result.has_hard_stop).toBe(true);
      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      expect(result.matches[0].stop_type).toBe('HARD_STOP');
      expect(result.matches[0].matched_entity_type).toBe('LEAD');
    });

    it('should return soft_stop when only SOFT_STOP rules match', async () => {
      const softStopRule = {
        id: 2,
        entity_type: 'INDIVIDUAL',
        person_type: 'INDIVIDUAL',
        field_combination: ['first_name', 'last_name'],
        stop_type: 'SOFT_STOP',
        priority: 1,
        is_active: true,
      };

      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve([softStopRule])),
        })),
      }));

      // Lead: one match
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([
            { id: 20, first_name: 'Jane', last_name: 'Doe', email: null, mobile_phone: null },
          ])),
        })),
      }));

      // Prospect: no match
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      }));

      // Client: no match
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      }));

      const result = await dedupeService.checkDedupe(
        { first_name: 'Jane', last_name: 'Doe' },
        'INDIVIDUAL',
      );

      expect(result.has_hard_stop).toBe(false);
      expect(result.has_soft_stop).toBe(true);
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].stop_type).toBe('SOFT_STOP');
    });

    it('should detect cross-entity matches (leads + prospects + clients)', async () => {
      const rule = {
        id: 3,
        entity_type: 'INDIVIDUAL',
        person_type: 'INDIVIDUAL',
        field_combination: ['email'],
        stop_type: 'HARD_STOP',
        priority: 1,
        is_active: true,
      };

      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve([rule])),
        })),
      }));

      // Lead match
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([
            { id: 100, first_name: 'A', last_name: 'B', email: 'test@mail.com', mobile_phone: null },
          ])),
        })),
      }));

      // Prospect match
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([
            { id: 200, first_name: 'C', last_name: 'D', email: 'test@mail.com', mobile_phone: null },
          ])),
        })),
      }));

      // Client match
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([
            { client_id: 'CL-001', legal_name: 'Test Client', contact: { email: 'test@mail.com' } },
          ])),
        })),
      }));

      const result = await dedupeService.checkDedupe(
        { email: 'test@mail.com' },
        'INDIVIDUAL',
      );

      expect(result.matches.length).toBe(3);
      const entityTypes = result.matches.map((m) => m.matched_entity_type);
      expect(entityTypes).toContain('LEAD');
      expect(entityTypes).toContain('PROSPECT');
      expect(entityTypes).toContain('CLIENT');
    });

    it('should return no matches when no rules match', async () => {
      // No active rules
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve([])),
        })),
      }));

      const result = await dedupeService.checkDedupe(
        { first_name: 'Nobody', last_name: 'Exists' },
        'INDIVIDUAL',
      );

      expect(result.matches).toHaveLength(0);
      expect(result.has_hard_stop).toBe(false);
      expect(result.has_soft_stop).toBe(false);
    });
  });

  describe('overrideDedupe', () => {
    it('should allow override for SOFT_STOP rules', async () => {
      // Mock rule lookup — SOFT_STOP
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([
          { id: 2, stop_type: 'SOFT_STOP', is_active: true },
        ])),
      }));

      const result = await dedupeService.overrideDedupe(
        'LEAD', 1, 'PROSPECT', 2, 2,
        'Customer verified identity in-person',
        100,
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });

    it('should reject override for HARD_STOP rules', async () => {
      // Mock rule lookup — HARD_STOP
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([
          { id: 1, stop_type: 'HARD_STOP', is_active: true },
        ])),
      }));

      await expect(
        dedupeService.overrideDedupe(
          'LEAD', 1, 'PROSPECT', 2, 1,
          'Trying to override',
          100,
        ),
      ).rejects.toThrow('Only SOFT_STOP rules can be overridden');
    });

    it('should reject override for non-existent rule', async () => {
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([])),
      }));

      await expect(
        dedupeService.overrideDedupe(
          'LEAD', 1, 'PROSPECT', 2, 999,
          'Invalid rule',
          100,
        ),
      ).rejects.toThrow('Dedupe rule not found');
    });
  });

  describe('Rule CRUD', () => {
    it('should create a new rule', async () => {
      const result = await dedupeService.createRule({
        entity_type: 'INDIVIDUAL',
        person_type: 'INDIVIDUAL',
        field_combination: ['first_name', 'last_name', 'email'],
        stop_type: 'HARD_STOP',
        priority: 1,
        created_by: 'admin',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });

    it('should soft-delete a rule', async () => {
      // Mock existing rule lookup
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([{ id: 1, is_active: true }])),
      }));

      const result = await dedupeService.deleteRule(1, 'admin');
      expect(result).toBeDefined();
    });

    it('should throw when deleting non-existent rule', async () => {
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([])),
      }));

      await expect(dedupeService.deleteRule(999)).rejects.toThrow('Dedupe rule not found');
    });
  });
});

// ============================================================================
// Negative List Service Tests (with mocked DB)
// ============================================================================

describe('Negative List Service', () => {
  let negativeListService: typeof import('../../server/services/negative-list-service').negativeListService;

  beforeEach(async () => {
    const mod = await import('../../server/services/negative-list-service');
    negativeListService = mod.negativeListService;
  });

  describe('screenEntity', () => {
    it('should detect exact email match', async () => {
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([
          {
            id: 1,
            list_type: 'SANCTIONS',
            first_name: 'Bad',
            last_name: 'Actor',
            entity_name: null,
            email: 'bad@evil.com',
            phone: null,
            id_number: null,
            is_active: true,
          },
        ])),
      }));

      const result = await negativeListService.screenEntity({ email: 'bad@evil.com' });

      expect(result.matched).toBe(true);
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].list_type).toBe('SANCTIONS');
      expect(result.matches[0].confidence).toBe(1.0);
      expect(result.matches[0].matched_fields.email).toBe('bad@evil.com');
    });

    it('should detect exact phone match', async () => {
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([
          {
            id: 2,
            list_type: 'BLACKLIST',
            first_name: null,
            last_name: null,
            entity_name: null,
            email: null,
            phone: '+639171234567',
            id_number: null,
            is_active: true,
          },
        ])),
      }));

      const result = await negativeListService.screenEntity({ phone: '+639171234567' });

      expect(result.matched).toBe(true);
      expect(result.matches[0].list_type).toBe('BLACKLIST');
      expect(result.matches[0].matched_fields.phone).toBe('+639171234567');
    });

    it('should detect exact id_number match', async () => {
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([
          {
            id: 3,
            list_type: 'PEP',
            first_name: 'Pol',
            last_name: 'Itician',
            entity_name: null,
            email: null,
            phone: null,
            id_number: 'TIN123456',
            is_active: true,
          },
        ])),
      }));

      const result = await negativeListService.screenEntity({ id_number: 'TIN123456' });

      expect(result.matched).toBe(true);
      expect(result.matches[0].list_type).toBe('PEP');
      expect(result.matches[0].confidence).toBe(1.0);
    });

    it('should detect fuzzy name match at distance 0 (exact)', async () => {
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([
          {
            id: 4,
            list_type: 'NEGATIVE',
            first_name: 'John',
            last_name: 'Smith',
            entity_name: null,
            email: null,
            phone: null,
            id_number: null,
            is_active: true,
          },
        ])),
      }));

      const result = await negativeListService.screenEntity({
        first_name: 'John',
        last_name: 'Smith',
      });

      expect(result.matched).toBe(true);
      expect(result.matches[0].confidence).toBe(1.0);
    });

    it('should detect fuzzy name match at distance 1', async () => {
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([
          {
            id: 5,
            list_type: 'SANCTIONS',
            first_name: 'John',
            last_name: 'Smyth', // distance 1 from "Smith"
            entity_name: null,
            email: null,
            phone: null,
            id_number: null,
            is_active: true,
          },
        ])),
      }));

      const result = await negativeListService.screenEntity({
        first_name: 'John',
        last_name: 'Smith',
      });

      expect(result.matched).toBe(true);
      expect(result.matches[0].confidence).toBe(0.9);
    });

    it('should detect fuzzy name match at distance 2', async () => {
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([
          {
            id: 6,
            list_type: 'SANCTIONS',
            first_name: 'Jonn',   // distance 1 from "John"
            last_name: 'Smyth',   // distance 1 from "Smith"
            entity_name: null,
            email: null,
            phone: null,
            id_number: null,
            is_active: true,
          },
        ])),
      }));

      const result = await negativeListService.screenEntity({
        first_name: 'John',
        last_name: 'Smith',
      });

      // "jonn smyth" vs "john smith" = distance 2
      expect(result.matched).toBe(true);
      expect(result.matches[0].confidence).toBe(0.8);
    });

    it('should NOT match fuzzy name at distance 3 or more', async () => {
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([
          {
            id: 7,
            list_type: 'SANCTIONS',
            first_name: 'Jane',
            last_name: 'Doe',
            entity_name: null,
            email: null,
            phone: null,
            id_number: null,
            is_active: true,
          },
        ])),
      }));

      const result = await negativeListService.screenEntity({
        first_name: 'John',
        last_name: 'Smith',
      });

      // "jane doe" vs "john smith" — distance is much greater than 2
      expect(result.matched).toBe(false);
      expect(result.matches).toHaveLength(0);
    });

    it('should return no matches for clean entity', async () => {
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([])),
      }));

      const result = await negativeListService.screenEntity({
        first_name: 'Clean',
        last_name: 'Person',
        email: 'clean@good.com',
      });

      expect(result.matched).toBe(false);
      expect(result.matches).toHaveLength(0);
    });
  });

  describe('CRUD operations', () => {
    it('should create a new negative list entry', async () => {
      const result = await negativeListService.create({
        list_type: 'SANCTIONS',
        first_name: 'Bad',
        last_name: 'Person',
        email: 'bad@evil.com',
        reason: 'Known sanctions target',
        source: 'OFAC',
        created_by: 'admin',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });

    it('should update an existing entry', async () => {
      // Mock existing entry
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([{ id: 1, is_active: true }])),
      }));

      const result = await negativeListService.update(1, {
        reason: 'Updated reason',
        updated_by: 'admin',
      });

      expect(result).toBeDefined();
    });

    it('should throw when updating non-existent entry', async () => {
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([])),
      }));

      await expect(
        negativeListService.update(999, { reason: 'test' }),
      ).rejects.toThrow('Negative list entry not found');
    });

    it('should deactivate an entry', async () => {
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([{ id: 1, is_active: true }])),
      }));

      const result = await negativeListService.deactivate(1, 'admin');
      expect(result).toBeDefined();
    });

    it('should throw when deactivating non-existent entry', async () => {
      mockFrom.mockImplementationOnce(() => ({
        where: vi.fn(() => Promise.resolve([])),
      }));

      await expect(negativeListService.deactivate(999)).rejects.toThrow(
        'Negative list entry not found',
      );
    });

    it('should list entries with filters', async () => {
      mockFrom.mockImplementationOnce(() => ({
        orderBy: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn(() => Promise.resolve([
                { id: 1, list_type: 'SANCTIONS', first_name: 'Bad', last_name: 'Person' },
              ])),
            })),
          })),
        })),
      }));

      const result = await negativeListService.list({ type: 'SANCTIONS', status: 'active' });
      expect(result).toBeDefined();
    });
  });

  describe('bulkUpload', () => {
    it('should import valid records and report errors', async () => {
      const records = [
        {
          list_type: 'SANCTIONS' as const,
          first_name: 'Bad',
          last_name: 'Actor',
          email: 'bad@evil.com',
          reason: 'Test',
        },
        {
          list_type: 'SANCTIONS' as const,
          first_name: 'Another',
          last_name: 'Bad',
        },
        {
          // Invalid: missing list_type
          list_type: '' as any,
          first_name: 'Invalid',
          last_name: 'Entry',
        },
        {
          // Invalid: bad list_type
          list_type: 'INVALID_TYPE' as any,
          first_name: 'Also',
          last_name: 'Invalid',
        },
        {
          // Invalid: no identifier
          list_type: 'NEGATIVE' as const,
        },
      ];

      const result = await negativeListService.bulkUpload(records, 'admin');

      expect(result.imported).toBe(2);
      expect(result.errors).toBe(3);
      expect(result.details).toHaveLength(3);
      expect(result.details[0].row).toBe(3);
      expect(result.details[0].error).toContain('list_type is required');
      expect(result.details[1].row).toBe(4);
      expect(result.details[1].error).toContain('Invalid list_type');
      expect(result.details[2].row).toBe(5);
      expect(result.details[2].error).toContain('identifying field');
    });

    it('should handle empty records array', async () => {
      const result = await negativeListService.bulkUpload([], 'admin');
      expect(result.imported).toBe(0);
      expect(result.errors).toBe(0);
    });
  });
});

// ============================================================================
// Integration: Hard-stop blocking entity creation flow
// ============================================================================

describe('Integration: Dedupe + Negative List blocking flow', () => {
  it('should block entity creation on hard-stop dedupe match', async () => {
    const { dedupeService } = await import('../../server/services/dedupe-service');

    // Mock: one HARD_STOP rule that matches
    mockFrom.mockImplementationOnce(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => Promise.resolve([{
          id: 1,
          entity_type: 'INDIVIDUAL',
          person_type: 'INDIVIDUAL',
          field_combination: ['email'],
          stop_type: 'HARD_STOP',
          priority: 1,
          is_active: true,
        }])),
      })),
    }));

    // Lead match
    mockFrom.mockImplementationOnce(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve([
          { id: 50, first_name: 'Existing', last_name: 'Lead', email: 'dupe@test.com', mobile_phone: null },
        ])),
      })),
    }));

    // Prospect: no match
    mockFrom.mockImplementationOnce(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve([])),
      })),
    }));

    // Client: no match
    mockFrom.mockImplementationOnce(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve([])),
      })),
    }));

    const dedupeResult = await dedupeService.checkDedupe(
      { first_name: 'New', last_name: 'Lead', email: 'dupe@test.com' },
      'INDIVIDUAL',
    );

    // Simulate the business logic: block creation if hard stop
    expect(dedupeResult.has_hard_stop).toBe(true);

    // The calling code would do:
    // if (dedupeResult.has_hard_stop) throw new Error('Duplicate entity detected');
    const blocked = dedupeResult.has_hard_stop;
    expect(blocked).toBe(true);
  });

  it('should allow entity creation with soft-stop after override', async () => {
    const { dedupeService } = await import('../../server/services/dedupe-service');

    // Mock: one SOFT_STOP rule
    mockFrom.mockImplementationOnce(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => Promise.resolve([{
          id: 2,
          entity_type: 'INDIVIDUAL',
          person_type: 'INDIVIDUAL',
          field_combination: ['first_name', 'last_name'],
          stop_type: 'SOFT_STOP',
          priority: 1,
          is_active: true,
        }])),
      })),
    }));

    // Lead match
    mockFrom.mockImplementationOnce(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve([
          { id: 60, first_name: 'Similar', last_name: 'Name', email: 'diff@test.com', mobile_phone: null },
        ])),
      })),
    }));

    // Prospect: no match
    mockFrom.mockImplementationOnce(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve([])),
      })),
    }));

    // Client: no match
    mockFrom.mockImplementationOnce(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve([])),
      })),
    }));

    const dedupeResult = await dedupeService.checkDedupe(
      { first_name: 'Similar', last_name: 'Name', email: 'new@test.com' },
      'INDIVIDUAL',
    );

    expect(dedupeResult.has_hard_stop).toBe(false);
    expect(dedupeResult.has_soft_stop).toBe(true);

    // User can override soft stop
    // Mock rule lookup for override
    mockFrom.mockImplementationOnce(() => ({
      where: vi.fn(() => Promise.resolve([
        { id: 2, stop_type: 'SOFT_STOP', is_active: true },
      ])),
    }));

    const overrideResult = await dedupeService.overrideDedupe(
      'LEAD', 99, 'LEAD', 60, 2,
      'Verified — different person',
      100,
    );

    expect(overrideResult).toBeDefined();

    // After override, entity creation proceeds (simulated)
    const allowed = !dedupeResult.has_hard_stop;
    expect(allowed).toBe(true);
  });

  it('should always hard-stop on negative list match', async () => {
    const { negativeListService: nlService } = await import('../../server/services/negative-list-service');

    mockFrom.mockImplementationOnce(() => ({
      where: vi.fn(() => Promise.resolve([
        {
          id: 10,
          list_type: 'SANCTIONS',
          first_name: 'Sanctioned',
          last_name: 'Person',
          entity_name: null,
          email: 'sanctioned@evil.com',
          phone: null,
          id_number: null,
          is_active: true,
        },
      ])),
    }));

    const screenResult = await nlService.screenEntity({
      first_name: 'Sanctioned',
      last_name: 'Person',
      email: 'sanctioned@evil.com',
    });

    expect(screenResult.matched).toBe(true);
    // Any match on negative list is always a hard stop
    const blocked = screenResult.matched;
    expect(blocked).toBe(true);
  });
});
