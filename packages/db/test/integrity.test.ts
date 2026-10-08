// I-01..I-26 map (ARCHITECTURE.md §6.4): every rule has database objects in the registry, every
// registry object belongs to a rule, and prisma/constraints.md documents all of them.
import { describe, expect, it } from 'vitest';
import { INTEGRITY_RULES, REGISTRY } from '../prisma/constraints.registry.js';
import { readText } from './support/sources.js';

const RULE_IDS = Array.from({ length: 26 }, (_, i) => `I-${String(i + 1).padStart(2, '0')}`);

describe('integrity rule map (§6.4)', () => {
  it('lists I-01..I-26 exactly once, in order', () => {
    expect(INTEGRITY_RULES.map((rule) => rule.id)).toEqual(RULE_IDS);
  });

  it('enforces every rule with at least one database object', () => {
    for (const rule of INTEGRITY_RULES) {
      expect(rule.database.length, rule.id).toBeGreaterThan(0);
    }
  });

  it('only names registry objects', () => {
    const names = new Set(REGISTRY.map((entry) => entry.name));
    for (const rule of INTEGRITY_RULES) {
      for (const name of rule.database) expect(names, rule.id).toContain(name);
    }
  });

  it('assigns every registry object to an §6.4 rule or to §6.2', () => {
    const mapped = new Set(INTEGRITY_RULES.flatMap((rule) => rule.database));
    for (const entry of REGISTRY) {
      if (entry.source === '§6.2') continue;
      expect(mapped, entry.name).toContain(entry.name);
    }
  });

  it('has unique registry names', () => {
    const names = REGISTRY.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('covers I-21 with 21 composite targets and 36 composite foreign keys', () => {
    expect(REGISTRY.filter((e) => e.kind === 'unique_target')).toHaveLength(21);
    expect(REGISTRY.filter((e) => e.kind === 'composite_fk')).toHaveLength(36);
  });
});

describe('prisma/constraints.md', () => {
  const doc = readText('prisma/constraints.md');

  it('documents every rule and every registry object', () => {
    for (const id of RULE_IDS) expect(doc, id).toContain(`| ${id} `);
    for (const entry of REGISTRY) expect(doc, entry.name).toContain(entry.name);
  });
});
