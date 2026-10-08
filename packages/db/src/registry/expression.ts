// Structural canonical form of the boolean SQL expressions used by CHECK constraints and partial
// index predicates (Codex review of 683606122, finding P1).
//
// The expression is parsed with PostgreSQL's operator precedence into a tree, so grouping is
// preserved: `a + b - c - d` and `a + (b - (c - d))` produce different canonical strings.
// Only presentation differences that PostgreSQL's deparser introduces are removed:
// - redundant parentheses and identifier quoting / case;
// - casts (`'COMPANY'::"FeeBearer"`, `(0)::numeric`, `ARRAY[…]::text[]`);
// - `x NOT IN (…)` ⇔ `x <> ALL (ARRAY[…])`, `x IN (…)` ⇔ `x = ANY (ARRAY[…])`;
// - `x BETWEEN a AND b` ⇔ `x >= a AND x <= b`;
// - associativity of AND / OR chains (flattened, operand order kept).
// Anything outside this subset (function calls, LIKE, CASE, trailing NOT VALID, …) throws
// UnsupportedExpressionError, and the registry comparison treats that as a mismatch.

export class UnsupportedExpressionError extends Error {
  override readonly name = 'UnsupportedExpressionError';
}

type Token =
  | { readonly kind: 'ident'; readonly value: string }
  | { readonly kind: 'keyword'; readonly value: string }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: string }
  | { readonly kind: 'op'; readonly value: string };

const KEYWORDS = new Set([
  'AND',
  'OR',
  'NOT',
  'IS',
  'NULL',
  'IN',
  'BETWEEN',
  'ALL',
  'ANY',
  'ARRAY',
  'TRUE',
  'FALSE',
]);

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    const space = /^\s+/.exec(rest);
    if (space) {
      i += space[0].length;
      continue;
    }
    const quoted = /^"((?:[^"]|"")*)"/.exec(rest);
    if (quoted) {
      tokens.push({ kind: 'ident', value: (quoted[1] ?? '').replaceAll('""', '"').toLowerCase() });
      i += quoted[0].length;
      continue;
    }
    const string = /^'((?:[^']|'')*)'/.exec(rest);
    if (string) {
      tokens.push({ kind: 'string', value: (string[1] ?? '').replaceAll("''", "'") });
      i += string[0].length;
      continue;
    }
    const number = /^\d+(?:\.\d+)?/.exec(rest);
    if (number) {
      tokens.push({ kind: 'number', value: number[0] });
      i += number[0].length;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (word) {
      const upper = word[0].toUpperCase();
      tokens.push(
        KEYWORDS.has(upper)
          ? { kind: 'keyword', value: upper }
          : { kind: 'ident', value: word[0].toLowerCase() },
      );
      i += word[0].length;
      continue;
    }
    const op = /^(::|<>|!=|<=|>=|[=<>+\-*/(),[\]])/.exec(rest);
    if (op) {
      tokens.push({ kind: 'op', value: op[0] === '!=' ? '<>' : op[0] });
      i += op[0].length;
      continue;
    }
    throw new UnsupportedExpressionError(`unsupported character ${JSON.stringify(rest[0])}`);
  }
  return tokens;
}

const COMPARISON = new Set(['=', '<>', '<', '>', '<=', '>=']);

/** Expression tree: a leaf (identifier, literal) or an operator applied to operands. */
type Node = string | { readonly op: string; readonly args: readonly Node[] };

const node = (op: string, ...args: Node[]): Node => ({ op, args });

function serialize(tree: Node): string {
  return typeof tree === 'string' ? tree : `(${tree.op} ${tree.args.map(serialize).join(' ')})`;
}

class Parser {
  private position = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  parse(): Node {
    const result = this.or();
    if (this.position !== this.tokens.length) {
      throw new UnsupportedExpressionError(`unexpected ${this.describe(this.peek())}`);
    }
    return result;
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.position + offset];
  }

  private describe(token: Token | undefined): string {
    return token === undefined ? 'end of expression' : `${token.kind} ${token.value}`;
  }

  private isOp(value: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token?.kind === 'op' && token.value === value;
  }

  private isKeyword(value: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token?.kind === 'keyword' && token.value === value;
  }

  private expectOp(value: string): void {
    if (!this.isOp(value)) {
      throw new UnsupportedExpressionError(`expected ${value}, got ${this.describe(this.peek())}`);
    }
    this.position += 1;
  }

  private expectKeyword(value: string): void {
    if (!this.isKeyword(value)) {
      throw new UnsupportedExpressionError(`expected ${value}, got ${this.describe(this.peek())}`);
    }
    this.position += 1;
  }

  /** n-ary AND / OR, flattened through redundant parentheses (both are associative). */
  private chain(keyword: 'AND' | 'OR', next: () => Node): Node {
    const op = keyword.toLowerCase();
    const operands = [next()];
    while (this.isKeyword(keyword)) {
      this.position += 1;
      operands.push(next());
    }
    if (operands.length === 1) return operands[0] ?? '';
    return node(
      op,
      ...operands.flatMap((operand) =>
        typeof operand !== 'string' && operand.op === op ? operand.args : [operand],
      ),
    );
  }

  private or(): Node {
    return this.chain('OR', () => this.and());
  }

  private and(): Node {
    return this.chain('AND', () => this.not());
  }

  private not(): Node {
    if (this.isKeyword('NOT')) {
      this.position += 1;
      return node('not', this.not());
    }
    return this.is();
  }

  /** IS [NOT] NULL binds looser than comparisons in PostgreSQL. */
  private is(): Node {
    let left = this.comparison();
    while (this.isKeyword('IS')) {
      this.position += 1;
      const negated = this.isKeyword('NOT');
      if (negated) this.position += 1;
      this.expectKeyword('NULL');
      left = node(negated ? 'is-not-null' : 'is-null', left);
    }
    return left;
  }

  private comparison(): Node {
    const left = this.membership();
    const token = this.peek();
    if (token?.kind !== 'op' || !COMPARISON.has(token.value)) return left;
    this.position += 1;
    if (this.isKeyword('ALL') || this.isKeyword('ANY')) {
      const quantifier = this.peek()?.value;
      this.position += 1;
      const list = this.arrayArgument();
      if (token.value === '<>' && quantifier === 'ALL') return node('not-in', left, list);
      if (token.value === '=' && quantifier === 'ANY') return node('in', left, list);
      return node(`${token.value}-${(quantifier ?? '').toLowerCase()}`, left, list);
    }
    return node(token.value, left, this.membership());
  }

  /** `( ARRAY [ a, b ] )` with optional casts, as deparsed by PostgreSQL. */
  private arrayArgument(): Node {
    this.expectOp('(');
    let depth = 0;
    while (this.isOp('(')) {
      this.position += 1;
      depth += 1;
    }
    this.expectKeyword('ARRAY');
    this.expectOp('[');
    const items = [this.additive()];
    while (this.isOp(',')) {
      this.position += 1;
      items.push(this.additive());
    }
    this.expectOp(']');
    this.casts();
    for (; depth > 0; depth -= 1) {
      this.expectOp(')');
      this.casts();
    }
    this.expectOp(')');
    return node('list', ...items);
  }

  /** [NOT] IN (list) and [NOT] BETWEEN a AND b. */
  private membership(): Node {
    const left = this.additive();
    const negated =
      this.isKeyword('NOT') && (this.isKeyword('IN', 1) || this.isKeyword('BETWEEN', 1));
    if (negated) this.position += 1;
    if (this.isKeyword('IN')) {
      this.position += 1;
      this.expectOp('(');
      const items = [this.additive()];
      while (this.isOp(',')) {
        this.position += 1;
        items.push(this.additive());
      }
      this.expectOp(')');
      return node(negated ? 'not-in' : 'in', left, node('list', ...items));
    }
    if (this.isKeyword('BETWEEN')) {
      this.position += 1;
      const low = this.additive();
      this.expectKeyword('AND');
      const high = this.additive();
      const between = node('and', node('>=', left, low), node('<=', left, high));
      return negated ? node('not', between) : between;
    }
    if (negated) throw new UnsupportedExpressionError('NOT without IN / BETWEEN');
    return left;
  }

  private additive(): Node {
    let left = this.multiplicative();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.peek()?.value ?? '';
      this.position += 1;
      left = node(op, left, this.multiplicative());
    }
    return left;
  }

  private multiplicative(): Node {
    let left = this.unary();
    while (this.isOp('*') || this.isOp('/')) {
      const op = this.peek()?.value ?? '';
      this.position += 1;
      left = node(op, left, this.unary());
    }
    return left;
  }

  private unary(): Node {
    if (this.isOp('-')) {
      this.position += 1;
      return node('neg', this.unary());
    }
    const primary = this.primary();
    this.casts();
    return primary;
  }

  /** Drops `::type` and `::type[]` casts. */
  private casts(): void {
    while (this.isOp('::')) {
      this.position += 1;
      const type = this.peek();
      if (type?.kind !== 'ident') {
        throw new UnsupportedExpressionError(`unsupported cast target ${this.describe(type)}`);
      }
      this.position += 1;
      if (this.isOp('[') && this.isOp(']', 1)) this.position += 2;
    }
  }

  private primary(): Node {
    const token = this.peek();
    if (token === undefined) throw new UnsupportedExpressionError('unexpected end of expression');
    if (token.kind === 'op' && token.value === '(') {
      this.position += 1;
      const inner = this.or();
      this.expectOp(')');
      return inner;
    }
    this.position += 1;
    switch (token.kind) {
      case 'ident':
        if (this.isOp('(')) {
          throw new UnsupportedExpressionError(`unsupported function call ${token.value}`);
        }
        return `id:${token.value}`;
      case 'string':
        return `str:${JSON.stringify(token.value)}`;
      case 'number':
        return `num:${token.value}`;
      case 'keyword':
        if (token.value === 'NULL' || token.value === 'TRUE' || token.value === 'FALSE') {
          return token.value.toLowerCase();
        }
        break;
      case 'op':
        break;
    }
    throw new UnsupportedExpressionError(`unexpected ${this.describe(token)}`);
  }
}

/**
 * Canonical tree of a CHECK body or index predicate. A leading `CHECK` keyword is ignored.
 * @throws UnsupportedExpressionError for anything outside the supported subset
 */
export function canonicalExpression(sql: string): string {
  const text = sql.replace(/^\s*CHECK\b/i, '');
  return serialize(new Parser(tokenize(text)).parse());
}
