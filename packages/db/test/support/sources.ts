// Offline readers for the committed schema and migration, shared by the tests.
// They parse only the subset of Prisma / SQL syntax this repository writes.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SCHEMA_PATH = path.join(PACKAGE_ROOT, 'prisma/schema.prisma');
export const MIGRATIONS_DIR = path.join(PACKAGE_ROOT, 'prisma/migrations');
export const INIT_MIGRATION = '20261008120000_init';

export const readText = (file: string): string =>
  readFileSync(path.isAbsolute(file) ? file : path.join(PACKAGE_ROOT, file), 'utf8');

export const schemaText = (): string => readText(SCHEMA_PATH);

export const migrationNames = (): string[] =>
  readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

export const migrationSql = (name = INIT_MIGRATION): string =>
  readText(path.join(MIGRATIONS_DIR, name, 'migration.sql'));

// ------------------------------------------------------------------------------------------
// Prisma schema
// ------------------------------------------------------------------------------------------

export interface PrismaField {
  readonly name: string;
  readonly type: string;
  readonly optional: boolean;
  readonly list: boolean;
  readonly attributes: string;
}

export interface PrismaModel {
  readonly name: string;
  readonly fields: readonly PrismaField[];
  /** Block attributes such as `@@unique([...], map: "...")`. */
  readonly blockAttributes: readonly string[];
}

export interface PrismaRelation {
  readonly model: string;
  readonly field: string;
  readonly target: string;
  readonly fields: readonly string[];
  readonly references: readonly string[];
  readonly onDelete: string | undefined;
  readonly onUpdate: string | undefined;
  readonly map: string | undefined;
}

export function parseModels(schema = schemaText()): PrismaModel[] {
  const models: PrismaModel[] = [];
  for (const match of schema.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)) {
    const fields: PrismaField[] = [];
    const blockAttributes: string[] = [];
    for (const raw of (match[2] ?? '').split('\n')) {
      const line = raw.trim();
      if (line.length === 0 || line.startsWith('//')) continue;
      if (line.startsWith('@@')) {
        blockAttributes.push(line);
        continue;
      }
      const field = /^(\w+)\s+(\w+)(\[\]|\?)?\s*(.*)$/.exec(line);
      if (!field) continue;
      fields.push({
        name: field[1] ?? '',
        type: field[2] ?? '',
        optional: field[3] === '?',
        list: field[3] === '[]',
        attributes: field[4] ?? '',
      });
    }
    models.push({ name: match[1] ?? '', fields, blockAttributes });
  }
  return models;
}

export function parseEnums(schema = schemaText()): Map<string, string[]> {
  const enums = new Map<string, string[]>();
  for (const match of schema.matchAll(/^enum (\w+) \{\n([\s\S]*?)^\}/gm)) {
    const values = (match[2] ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('//'));
    enums.set(match[1] ?? '', values);
  }
  return enums;
}

const list = (text: string | undefined): string[] =>
  (text ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

export function parseRelations(models = parseModels()): PrismaRelation[] {
  const relations: PrismaRelation[] = [];
  for (const model of models) {
    for (const field of model.fields) {
      const relation = /@relation\((.*)\)/.exec(field.attributes)?.[1];
      if (relation === undefined || !relation.includes('fields:')) continue;
      relations.push({
        model: model.name,
        field: field.name,
        target: field.type,
        fields: list(/fields: \[([^\]]*)\]/.exec(relation)?.[1]),
        references: list(/references: \[([^\]]*)\]/.exec(relation)?.[1]),
        onDelete: /onDelete: (\w+)/.exec(relation)?.[1],
        onUpdate: /onUpdate: (\w+)/.exec(relation)?.[1],
        map: /map: "([^"]+)"/.exec(relation)?.[1],
      });
    }
  }
  return relations;
}

/** Every `map: "..."` name in the schema (constraints and indexes). */
export const mappedNames = (schema = schemaText()): string[] =>
  [...schema.matchAll(/map: "([^"]+)"/g)].map((m) => m[1] ?? '');

// ------------------------------------------------------------------------------------------
// Migration SQL
// ------------------------------------------------------------------------------------------

export interface SqlColumn {
  readonly name: string;
  readonly type: string;
  readonly notNull: boolean;
  readonly hasDefault: boolean;
}

/** Columns of every `CREATE TABLE` in a migration. */
export function parseTables(sql = migrationSql()): Map<string, SqlColumn[]> {
  const tables = new Map<string, SqlColumn[]>();
  for (const match of sql.matchAll(/CREATE TABLE "(\w+)" \(\n([\s\S]*?)\n\);/g)) {
    const columns: SqlColumn[] = [];
    for (const raw of (match[2] ?? '').split('\n')) {
      const column = /^\s+"(\w+)" ("?[\w]+"?(?:\(\d+(?:,\d+)?\))?(?:\[\])?)(.*?),?$/.exec(raw);
      if (!column) continue;
      const rest = column[3] ?? '';
      columns.push({
        name: column[1] ?? '',
        type: (column[2] ?? '').replaceAll('"', ''),
        notNull: rest.includes('NOT NULL'),
        hasDefault: rest.includes('DEFAULT'),
      });
    }
    tables.set(match[1] ?? '', columns);
  }
  return tables;
}
