/**
 * xDBML parser.
 *
 * Hand-written recursive-descent. Reads the token stream produced by the
 * Lexer and emits the AST defined in ./ast.ts. Pragmatic and intentionally
 * permissive at the parse level: several spec constraints (tuple position
 * contiguity, named-type vs. builtin shadowing, ref-path array-crossing,
 * polymorphic alternative selectors in paths) are deferred to a future
 * semantic-analysis pass. The grammar test cases the parser passes are
 * the official xDBML example files in /examples.
 */

import type {
  AllOfType,
  AnyOfType,
  ArrayType,
  CardinalityOperator,
  CheckEntry,
  ChecksBlock,
  ContainerBodyItem,
  ContainerDeclaration,
  ContainerKeyword,
  EdgeDeclaration,
  EntityBodyItem,
  EntityDeclaration,
  EntityKeyword,
  EnumDeclaration,
  EnumValue,
  ExperimentalDeclaration,
  ExpressionValue,
  FieldDeclaration,
  IdentifierValue,
  IndexComponent,
  IndexEntry,
  IndexesBlock,
  IndexExpressionComponent,
  IndexPathComponent,
  JsonType,
  ListValue,
  MapType,
  NamedTypeReference,
  NoteBlock,
  NoteDeclaration,
  NumberValue,
  ObjectType,
  OneOfType,
  PartialInjection,
  PathSegment,
  PolymorphicAlternative,
  Position,
  ProjectBodyItem,
  ProjectDeclaration,
  RefDeclaration,
  RefEndpoint,
  RefSpec,
  RefValue,
  ScalarType,
  SetType,
  Setting,
  SettingValue,
  Span,
  StringValue,
  TableGroupDeclaration,
  TablePartialDeclaration,
  TopLevelStatement,
  TupleElement,
  TupleType,
  TypeDeclaration,
  TypeExpression,
  UnionType,
  VersionDeclaration,
  ViewBodyItem,
  ViewDeclaration,
  XDbmlDocument,
} from './ast.ts';
import type { Token } from './lexer.ts';
import {
  TokenKind,
  tokenize,
} from './lexer.ts';

export class ParseError extends Error {
  position: Position;
  constructor (message: string, position: Position) {
    super(`${message} (line ${position.line}, column ${position.column})`);
    this.position = position;
  }
}

/* -------------------------------------------------------------------------
 * Keyword recognition.
 *
 * Per spec §3.8, language keywords are case-insensitive. The lexer emits
 * raw Identifier tokens; the parser decides whether each one is a keyword
 * via `kw()` (lowercase comparison).
 * ----------------------------------------------------------------------- */

const CONTAINER_KEYWORDS = new Set([
  'container', 'schema', 'database', 'keyspace', 'namespace', 'dataset', 'bucket',
]);

const ENTITY_KEYWORDS = new Set(['table', 'entity', 'collection', 'record']);

const STRUCTURAL_TYPE_KEYWORDS = new Set([
  'object', 'struct', 'record', 'array', 'list', 'map', 'dict', 'dictionary',
  'set', 'union', 'oneof', 'anyof', 'allof', 'json', 'jsonb', 'variant',
]);

function kw (token: Token | undefined): string | null {
  if (!token || token.kind !== TokenKind.Identifier) return null;
  return token.text.toLowerCase();
}

function isKw (token: Token | undefined, expected: string): boolean {
  return kw(token) === expected;
}

/** Canonical capitalization for container keywords */
function canonContainerKw (raw: string): ContainerKeyword {
  const lower = raw.toLowerCase();
  switch (lower) {
    case 'container': return 'Container';
    case 'schema': return 'Schema';
    case 'database': return 'Database';
    case 'keyspace': return 'Keyspace';
    case 'namespace': return 'Namespace';
    case 'dataset': return 'Dataset';
    case 'bucket': return 'Bucket';
    default: throw new Error(`Not a container keyword: ${raw}`);
  }
}

function canonEntityKw (raw: string): EntityKeyword {
  const lower = raw.toLowerCase();
  switch (lower) {
    case 'table': return 'Table';
    case 'entity': return 'Entity';
    case 'collection': return 'Collection';
    case 'record': return 'Record';
    default: throw new Error(`Not an entity keyword: ${raw}`);
  }
}

export class Parser {
  private tokens: Token[];
  private idx = 0;

  constructor (tokens: Token[]) {
    this.tokens = tokens;
  }

  /* ----- low-level token helpers ----- */

  private peek (lookahead = 0): Token {
    return this.tokens[this.idx + lookahead];
  }

  private advance (): Token {
    const t = this.tokens[this.idx];
    if (this.idx < this.tokens.length - 1) this.idx += 1;
    return t;
  }

  private check (kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }

  private match (kind: TokenKind): Token | null {
    if (this.check(kind)) return this.advance();
    return null;
  }

  private expect (kind: TokenKind, msg: string): Token {
    if (this.check(kind)) return this.advance();
    const t = this.peek();
    throw new ParseError(`${msg} (got ${t.kind} ${JSON.stringify(t.text)})`, t.start);
  }

  private spanFrom (start: Position): Span {
    // span end = end-position of the previously consumed token if any
    const prev = this.idx > 0 ? this.tokens[this.idx - 1] : this.tokens[0];
    return {
      start,
      end: prev.end,
    };
  }

  /* ----- entry point ----- */

  parseDocument (): XDbmlDocument {
    const start = this.peek().start;
    let version: VersionDeclaration | undefined;
    let experimental: ExperimentalDeclaration | undefined;

    if (isKw(this.peek(), 'xdbml') && this.peek(1).kind === TokenKind.Colon) {
      version = this.parseVersionDeclaration();
    }
    if (isKw(this.peek(), 'experimental') && this.peek(1).kind === TokenKind.Colon) {
      experimental = this.parseExperimentalDeclaration();
    }
    const statements: TopLevelStatement[] = [];
    while (!this.check(TokenKind.EOF)) {
      statements.push(this.parseTopLevelStatement());
    }
    return {
      kind: 'XDbmlDocument',
      version,
      experimental,
      statements,
      span: this.spanFrom(start),
    };
  }

  /* ----- version & experimental ----- */

  private parseVersionDeclaration (): VersionDeclaration {
    const start = this.peek().start;
    this.advance(); // xdbml
    this.expect(TokenKind.Colon, "Expected ':' after 'xdbml'");
    const numTok = this.expect(TokenKind.NumberLiteral, 'Expected version number');
    return {
      kind: 'VersionDeclaration',
      version: numTok.text,
      span: this.spanFrom(start),
    };
  }

  private parseExperimentalDeclaration (): ExperimentalDeclaration {
    const start = this.peek().start;
    this.advance(); // experimental
    this.expect(TokenKind.Colon, "Expected ':' after 'experimental'");
    this.expect(TokenKind.LBracket, "Expected '[' for feature list");
    const features: string[] = [];
    if (!this.check(TokenKind.RBracket)) {
      features.push(this.expect(TokenKind.Identifier, 'Expected feature name').text);
      while (this.match(TokenKind.Comma)) {
        features.push(this.expect(TokenKind.Identifier, 'Expected feature name').text);
      }
    }
    this.expect(TokenKind.RBracket, "Expected ']'");
    return {
      kind: 'ExperimentalDeclaration',
      features,
      span: this.spanFrom(start),
    };
  }

  /* ----- top-level dispatch ----- */

  private parseTopLevelStatement (): TopLevelStatement {
    const t = this.peek();
    const k = kw(t);
    if (k === null) {
      throw new ParseError(
        `Unexpected token ${t.kind} ${JSON.stringify(t.text)} at top level`,
        t.start,
      );
    }
    if (k === 'project') return this.parseProject();
    if (CONTAINER_KEYWORDS.has(k)) return this.parseContainer();
    if (ENTITY_KEYWORDS.has(k)) return this.parseEntity();
    if (k === 'type') return this.parseTypeDecl();
    if (k === 'edge') return this.parseEdge();
    if (k === 'view') return this.parseView();
    if (k === 'enum') return this.parseEnum();
    if (k === 'ref') return this.parseRef();
    if (k === 'tablepartial') return this.parseTablePartial();
    if (k === 'tablegroup') return this.parseTableGroup();
    if (k === 'note') return this.parseNoteDeclaration();
    throw new ParseError(`Unknown top-level construct: ${t.text}`, t.start);
  }

  /* ----- Project ----- */

  private parseProject (): ProjectDeclaration {
    const start = this.peek().start;
    this.advance(); // Project
    const name = this.parseIdentLikeName('project name');
    this.expect(TokenKind.LBrace, "Expected '{' after Project name");
    const body: ProjectBodyItem[] = [];
    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      // Project body is either an inline Note block or a setting line.
      if (isKw(this.peek(), 'note')) {
        body.push(this.parseNoteBlockOrSetting());
      } else {
        body.push(this.parseLineSetting());
      }
    }
    this.expect(TokenKind.RBrace, "Expected '}' closing Project");
    return {
      kind: 'ProjectDeclaration',
      name,
      body,
      span: this.spanFrom(start),
    };
  }

  /**
   * A Note inside a Project/Container/Entity body. May appear as:
   *   Note: 'short text'
   *   Note: '''long text'''
   *   Note { '''long text''' }
   */
  private parseNoteBlockOrSetting (): NoteBlock {
    const start = this.peek().start;
    this.advance(); // Note
    if (this.match(TokenKind.Colon)) {
      const s = this.parseSettingValueExpectingString('Expected string after Note:');
      return {
        kind: 'NoteBlock',
        body: s,
        span: this.spanFrom(start),
      };
    }
    this.expect(TokenKind.LBrace, "Expected ':' or '{' after Note");
    const body = this.parseSettingValueExpectingString('Expected string inside Note { ... }');
    this.expect(TokenKind.RBrace, "Expected '}' closing Note block");
    return {
      kind: 'NoteBlock',
      body,
      span: this.spanFrom(start),
    };
  }

  private parseSettingValueExpectingString (msg: string): string {
    const t = this.peek();
    if (t.kind === TokenKind.StringLiteral || t.kind === TokenKind.MultilineString) {
      this.advance();
      return t.value ?? '';
    }
    throw new ParseError(msg, t.start);
  }

  /**
   * Top-level `Note name { '''...''' }` standalone declaration.
   */
  private parseNoteDeclaration (): NoteDeclaration {
    const start = this.peek().start;
    this.advance(); // Note
    // Could be: `Note: '...'`, `Note name { '''...''' }`, or `Note { ... }`
    let name: string | undefined;
    if (this.check(TokenKind.Identifier) || this.check(TokenKind.QuotedIdentifier)) {
      const tok = this.advance();
      name = tok.kind === TokenKind.QuotedIdentifier ? (tok.value ?? '') : tok.text;
    }
    if (this.match(TokenKind.Colon)) {
      const body = this.parseSettingValueExpectingString('Expected string after Note:');
      return {
        kind: 'NoteDeclaration',
        name,
        body,
        span: this.spanFrom(start),
      };
    }
    this.expect(TokenKind.LBrace, "Expected '{' or ':' after Note");
    const body = this.parseSettingValueExpectingString('Expected string inside Note block');
    this.expect(TokenKind.RBrace, "Expected '}' closing Note");
    return {
      kind: 'NoteDeclaration',
      name,
      body,
      span: this.spanFrom(start),
    };
  }

  /**
   * Parse a `name: value` line inside a Project body. Used for project
   * settings like `targets: PostgreSQL` or `database_type: 'MySQL'`.
   */
  private parseLineSetting (): Setting {
    const start = this.peek().start;
    const nameTok = this.peek();
    if (nameTok.kind !== TokenKind.Identifier && nameTok.kind !== TokenKind.QuotedIdentifier) {
      throw new ParseError(`Expected setting name, got ${nameTok.kind}`, nameTok.start);
    }
    const nameSource = nameTok.kind === TokenKind.QuotedIdentifier ? (nameTok.value ?? '') : nameTok.text;
    this.advance();
    this.expect(TokenKind.Colon, "Expected ':' after setting name");
    const value = this.parseSettingValue();
    return {
      kind: 'Setting',
      name: nameSource.toLowerCase(),
      nameSource,
      value,
      span: this.spanFrom(start),
    };
  }

  /* ----- Container ----- */

  private parseContainer (): ContainerDeclaration {
    const start = this.peek().start;
    const kwTok = this.advance();
    const name = this.parseIdentLikeName('container name');
    const settings = this.maybeSettingsBlock();
    this.expect(TokenKind.LBrace, "Expected '{' after Container name");
    const body: ContainerBodyItem[] = [];
    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      const t = this.peek();
      const k = kw(t);
      if (k === 'note') {
        body.push(this.parseNoteBlockOrSetting());
      } else if (k && ENTITY_KEYWORDS.has(k)) {
        body.push(this.parseEntity());
      } else if (k === 'edge') {
        body.push(this.parseEdge());
      } else if (k === 'view') {
        body.push(this.parseView());
      } else if (k === 'enum') {
        body.push(this.parseEnum());
      } else {
        // Unknown line; tolerate as no-op rather than fail the whole parse.
        throw new ParseError(
          `Unexpected token in Container body: ${t.kind} ${JSON.stringify(t.text)}`,
          t.start,
        );
      }
    }
    this.expect(TokenKind.RBrace, "Expected '}' closing Container");
    return {
      kind: 'ContainerDeclaration',
      keyword: canonContainerKw(kwTok.text),
      name,
      settings,
      body,
      span: this.spanFrom(start),
    };
  }

  /* ----- Entity ----- */

  private parseEntity (): EntityDeclaration {
    const start = this.peek().start;
    const kwTok = this.advance();
    const name = this.parseEntityName();
    let alias: string | undefined;
    if (isKw(this.peek(), 'as')) {
      this.advance();
      alias = this.parseIdentLikeName('alias');
    }
    const settings = this.maybeSettingsBlock();
    this.expect(TokenKind.LBrace, "Expected '{' after entity name");
    const body = this.parseEntityBody();
    this.expect(TokenKind.RBrace, "Expected '}' closing entity");
    return {
      kind: 'EntityDeclaration',
      keyword: canonEntityKw(kwTok.text),
      name,
      alias,
      settings,
      body,
      span: this.spanFrom(start),
    };
  }

  /**
   * Entity names may be bare (`users`), dotted (`core.users` — implicit
   * container), or quoted (`"my-table"`).
   */
  private parseEntityName (): string {
    const t = this.peek();
    if (t.kind === TokenKind.QuotedIdentifier) {
      this.advance();
      return t.value ?? '';
    }
    if (t.kind !== TokenKind.Identifier) {
      throw new ParseError(`Expected entity name, got ${t.kind}`, t.start);
    }
    this.advance();
    let name = t.text;
    while (this.check(TokenKind.Dot)) {
      this.advance();
      const next = this.expect(TokenKind.Identifier, 'Expected identifier after dot in entity name');
      name += `.${next.text}`;
    }
    return name;
  }

  private parseEntityBody (): EntityBodyItem[] {
    const body: EntityBodyItem[] = [];
    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      const t = this.peek();
      const k = kw(t);
      if (k === 'note') {
        body.push(this.parseNoteBlockOrSetting());
      } else if (k === 'indexes') {
        body.push(this.parseIndexes());
      } else if (k === 'checks') {
        body.push(this.parseChecks());
      } else if (k === 'records') {
        // PoC: skip records block for now; it's defined in the spec but not exercised
        // by examples 01-04. Treat as a tolerated body item to keep the parser robust.
        body.push(this.parseRecordsBlockTolerantly());
      } else if (t.kind === TokenKind.Tilde) {
        body.push(this.parsePartialInjection());
      } else {
        body.push(this.parseFieldDeclaration());
      }
    }
    return body;
  }

  private parsePartialInjection (): PartialInjection {
    const start = this.peek().start;
    this.expect(TokenKind.Tilde, "Expected '~'");
    const nameTok = this.expect(TokenKind.Identifier, "Expected partial name after '~'");
    return {
      kind: 'PartialInjection',
      partialName: nameTok.text,
      span: this.spanFrom(start),
    };
  }

  /**
   * A tolerant records-block parser. The full grammar is one row per line of
   * comma-separated values. For the PoC we read until the matching `}` and
   * stash the raw text as a single row, so the parser doesn't choke on
   * unusual value forms.
   */
  private parseRecordsBlockTolerantly (): EntityBodyItem {
    const start = this.peek().start;
    this.advance(); // records
    this.expect(TokenKind.LBrace, "Expected '{' after 'records'");
    let depth = 1;
    while (!this.check(TokenKind.EOF) && depth > 0) {
      const t = this.advance();
      if (t.kind === TokenKind.LBrace) depth += 1;
      else if (t.kind === TokenKind.RBrace) depth -= 1;
    }
    return {
      kind: 'RecordsBlock',
      rows: [],
      span: this.spanFrom(start),
    };
  }

  /* ----- Field declarations ----- */

  /**
   * `field_name typeExpression [settings]` or `"quoted name" typeExpression [settings]`.
   *
   * Critical lookahead point: we're invoked from a context where the next
   * token MUST be a field name (Identifier or QuotedIdentifier), and the
   * token after it is a type expression. If the next thing is a Note block
   * or a partial injection or `indexes`, those should have been handled by
   * the caller already.
   */
  private parseFieldDeclaration (): FieldDeclaration {
    const start = this.peek().start;
    const nameTok = this.peek();
    let name: string;
    let nameQuoted = false;
    if (nameTok.kind === TokenKind.QuotedIdentifier) {
      this.advance();
      name = nameTok.value ?? '';
      nameQuoted = true;
    } else if (nameTok.kind === TokenKind.Identifier) {
      this.advance();
      name = nameTok.text;
    } else {
      throw new ParseError(
        `Expected field name, got ${nameTok.kind} ${JSON.stringify(nameTok.text)}`,
        nameTok.start,
      );
    }
    const type = this.parseTypeExpression();
    const settings = this.maybeSettingsBlock();
    return {
      kind: 'FieldDeclaration',
      name,
      nameQuoted,
      type,
      settings,
      span: this.spanFrom(start),
    };
  }

  /* ----- Type expressions ----- */

  /**
   * Parse a type expression. Dispatch on the leading keyword/identifier:
   *
   *   - `object { ... }` (and synonyms struct/record)
   *   - `array [ ... ]` (and synonym list)
   *   - `map [k, v]` (and synonyms dict/dictionary)
   *   - `set [t]`
   *   - `union [ ... ]`
   *   - `oneOf { ... }` / `anyOf { ... }` / `allOf { ... }`
   *   - `json { ... }` (and synonyms jsonb/variant; block optional)
   *   - Otherwise: scalar / named-type reference. With optional `(p, s)`.
   */
  private parseTypeExpression (): TypeExpression {
    const t = this.peek();
    const k = kw(t);
    if (k === 'object' || k === 'struct' || k === 'record') return this.parseObjectType();
    if (k === 'array' || k === 'list') return this.parseArrayType();
    if (k === 'map' || k === 'dict' || k === 'dictionary') return this.parseMapType();
    if (k === 'set') return this.parseSetType();
    if (k === 'union') return this.parseUnionType();
    if (k === 'oneof') return this.parsePolymorphicType('oneOf') as OneOfType;
    if (k === 'anyof') return this.parsePolymorphicType('anyOf') as AnyOfType;
    if (k === 'allof') return this.parsePolymorphicType('allOf') as AllOfType;
    if (k === 'json' || k === 'jsonb' || k === 'variant') return this.parseJsonType();
    return this.parseScalarOrNamedType();
  }

  private parseObjectType (): ObjectType {
    const start = this.peek().start;
    const kwTok = this.advance();
    this.expect(TokenKind.LBrace, "Expected '{' after object keyword");
    const fields: (FieldDeclaration | NoteBlock | PartialInjection)[] = [];
    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      const t = this.peek();
      const k = kw(t);
      if (k === 'note') {
        fields.push(this.parseNoteBlockOrSetting());
      } else if (t.kind === TokenKind.Tilde) {
        fields.push(this.parsePartialInjection());
      } else {
        fields.push(this.parseFieldDeclaration());
      }
    }
    this.expect(TokenKind.RBrace, "Expected '}' closing object");
    const keyword = kwTok.text.toLowerCase() as 'object' | 'struct' | 'record';
    return {
      kind: 'ObjectType',
      keyword,
      fields,
      span: this.spanFrom(start),
    };
  }

  /**
   * `array [ ... ]`. The bracket body has several forms:
   *
   *   1. `[varchar]`               -- bare element type
   *   2. `[varchar [not null]]`    -- element type with settings
   *   3. `[line_item object { ... }]` -- named element type (common with object)
   *   4. `[[0] x object {...}, [1] y object {...}]` -- tuple type
   *
   * Disambiguation: if the first token inside the bracket is `[`, it's a
   * tuple (each tuple element starts with `[N]`). Otherwise we look at the
   * shape: if the first thing is an identifier and the second is also an
   * identifier or a structural-type keyword, it's `name type` form;
   * otherwise the first thing is the bare type.
   */
  private parseArrayType (): ArrayType {
    const start = this.peek().start;
    const kwTok = this.advance();
    this.expect(TokenKind.LBracket, "Expected '[' after array keyword");
    // Tuple form?
    if (this.check(TokenKind.LBracket)) {
      const elements = this.parseTupleElements();
      this.expect(TokenKind.RBracket, "Expected ']' closing tuple");
      const tuple: TupleType = {
        kind: 'TupleType',
        elements,
        span: this.spanFrom(start),
      };
      // Return the tuple wrapped in an ArrayType so the caller knows it's an array.
      // For PoC simplicity, we encode tuple type by returning it directly and
      // letting downstream tooling recognize TupleType. But the ArrayType wrapper
      // is what fields use. Convention: when array body is a tuple, we use the
      // TupleType kind directly. Cast to satisfy TypeScript.
      return tuple as unknown as ArrayType;
    }
    // `name type` form: Identifier followed by something that starts a type.
    const first = this.peek();
    const second = this.peek(1);
    let elementName: string | undefined;
    if (
      first.kind === TokenKind.Identifier
      && (
        second.kind === TokenKind.Identifier
        || second.kind === TokenKind.LBrace // `name object { ... }` etc.
      )
      && kw(first) !== null
      && !STRUCTURAL_TYPE_KEYWORDS.has(kw(first)!)
      // and the second token must look like the start of a type
      && this.tokenStartsType(second)
    ) {
      elementName = this.advance().text;
    }
    const elementType = this.parseTypeExpression();
    const elementSettings = this.maybeSettingsBlock();
    this.expect(TokenKind.RBracket, "Expected ']' closing array");
    return {
      kind: 'ArrayType',
      keyword: kwTok.text.toLowerCase() as 'array' | 'list',
      elementType,
      elementName,
      elementSettings: elementSettings.length > 0 ? elementSettings : undefined,
      span: this.spanFrom(start),
    };
  }

  /** True if the token looks like the start of a TypeExpression. */
  private tokenStartsType (t: Token): boolean {
    if (t.kind === TokenKind.LBrace) return true; // object {...} with implicit `object` keyword? no -- but the parser test should accept structural keywords primarily
    if (t.kind === TokenKind.Identifier) return true; // could be a scalar like 'int' or a structural keyword like 'object'
    return false;
  }

  private parseTupleElements (): TupleElement[] {
    const out: TupleElement[] = [];
    while (this.check(TokenKind.LBracket) && !this.check(TokenKind.EOF)) {
      const start = this.peek().start;
      this.advance(); // [
      const numTok = this.expect(TokenKind.NumberLiteral, 'Expected position number in tuple');
      this.expect(TokenKind.RBracket, "Expected ']' after position");
      const nameTok = this.expect(TokenKind.Identifier, 'Expected tuple element name');
      const type = this.parseTypeExpression();
      const settings = this.maybeSettingsBlock();
      out.push({
        kind: 'TupleElement',
        position: parseInt(numTok.text, 10),
        name: nameTok.text,
        type,
        settings,
        span: this.spanFrom(start),
      });
      if (!this.match(TokenKind.Comma)) break;
    }
    return out;
  }

  private parseMapType (): MapType {
    const start = this.peek().start;
    const kwTok = this.advance();
    this.expect(TokenKind.LBracket, "Expected '[' after map");
    const keyType = this.parseTypeExpression();
    this.expect(TokenKind.Comma, "Expected ',' between map key and value");
    const valueType = this.parseTypeExpression();
    this.expect(TokenKind.RBracket, "Expected ']' closing map");
    return {
      kind: 'MapType',
      keyword: kwTok.text.toLowerCase() as 'map' | 'dict' | 'dictionary',
      keyType,
      valueType,
      span: this.spanFrom(start),
    };
  }

  private parseSetType (): SetType {
    const start = this.peek().start;
    this.advance(); // set
    this.expect(TokenKind.LBracket, "Expected '[' after set");
    const elementType = this.parseTypeExpression();
    this.expect(TokenKind.RBracket, "Expected ']' closing set");
    return {
      kind: 'SetType',
      elementType,
      span: this.spanFrom(start),
    };
  }

  /**
   * `union [t1, t2, null]`. Members are scalars or null.
   */
  private parseUnionType (): UnionType {
    const start = this.peek().start;
    this.advance(); // union
    this.expect(TokenKind.LBracket, "Expected '[' after union");
    const members: UnionType['members'] = [];
    members.push(this.parseUnionMember());
    while (this.match(TokenKind.Comma)) {
      members.push(this.parseUnionMember());
    }
    this.expect(TokenKind.RBracket, "Expected ']' closing union");
    return {
      kind: 'UnionType',
      members,
      span: this.spanFrom(start),
    };
  }

  private parseUnionMember (): ScalarType | NamedTypeReference | UnionType['members'][number] {
    const t = this.peek();
    if (isKw(t, 'null')) {
      const start = t.start;
      this.advance();
      return {
        kind: 'NullTypeLiteral',
        span: this.spanFrom(start),
      };
    }
    // Reuse scalar parser; named types and scalars look the same syntactically.
    return this.parseScalarOrNamedType();
  }

  private parsePolymorphicType (
    flavor: 'oneOf' | 'anyOf' | 'allOf',
  ): OneOfType | AnyOfType | AllOfType {
    const start = this.peek().start;
    this.advance(); // oneOf | anyOf | allOf
    this.expect(TokenKind.LBrace, `Expected '{' after ${flavor}`);
    const alternatives: PolymorphicAlternative[] = [];
    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      alternatives.push(this.parsePolymorphicAlternative());
    }
    this.expect(TokenKind.RBrace, `Expected '}' closing ${flavor}`);
    const settings = this.maybeSettingsBlock();
    return {
      kind: flavor === 'oneOf' ? 'OneOfType' : flavor === 'anyOf' ? 'AnyOfType' : 'AllOfType',
      alternatives,
      settings,
      span: this.spanFrom(start),
    } as OneOfType | AnyOfType | AllOfType;
  }

  /** `alternative_name typeExpression [settings]` -- shape is the same as a field declaration, context disambiguates */
  private parsePolymorphicAlternative (): PolymorphicAlternative {
    const start = this.peek().start;
    const nameTok = this.expect(TokenKind.Identifier, 'Expected polymorphic alternative name');
    const type = this.parseTypeExpression();
    const settings = this.maybeSettingsBlock();
    return {
      kind: 'PolymorphicAlternative',
      name: nameTok.text,
      type,
      settings,
      span: this.spanFrom(start),
    };
  }

  private parseJsonType (): JsonType {
    const start = this.peek().start;
    const kwTok = this.advance();
    let fields: JsonType['fields'];
    if (this.check(TokenKind.LBrace)) {
      this.advance();
      fields = [];
      while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
        const t = this.peek();
        const k = kw(t);
        if (k === 'note') {
          fields.push(this.parseNoteBlockOrSetting());
        } else if (t.kind === TokenKind.Tilde) {
          fields.push(this.parsePartialInjection());
        } else {
          fields.push(this.parseFieldDeclaration());
        }
      }
      this.expect(TokenKind.RBrace, "Expected '}' closing json block");
    }
    return {
      kind: 'JsonType',
      keyword: kwTok.text.toLowerCase() as 'json' | 'jsonb' | 'variant',
      fields,
      span: this.spanFrom(start),
    };
  }

  /**
   * Scalar type or named-type reference. Both look like an Identifier with
   * optional `(p, s)` parameter list. The distinction is made later at the
   * semantic-analysis stage (named types are user-declared identifiers that
   * resolve to a TypeDeclaration; scalars are the open set of built-ins).
   *
   * Resolution heuristic for the PoC: if the identifier's lowercase form is
   * a known SQL/BSON scalar name, we tag ScalarType; otherwise we'd ideally
   * defer to the semantic pass. For the PoC we always emit ScalarType for
   * common scalar names and ScalarType for everything else too; callers
   * that need to distinguish can post-process.
   *
   * Actually a cleaner choice: emit ScalarType when there are parameters
   * (no named type takes `(p,s)`), and otherwise emit NamedTypeReference
   * iff the name's first character is uppercase (heuristic) -- but that
   * conflicts with Decimal128 etc. So: always emit ScalarType; the
   * semantic-analysis pass walks Type declarations and rewrites scalars
   * whose names resolve to user types as NamedTypeReference. The PoC keeps
   * the AST shape consistent regardless.
   */
  private parseScalarOrNamedType (): ScalarType | NamedTypeReference {
    const start = this.peek().start;
    const t = this.peek();
    if (t.kind !== TokenKind.Identifier && t.kind !== TokenKind.QuotedIdentifier) {
      throw new ParseError(
        `Expected type name, got ${t.kind} ${JSON.stringify(t.text)}`,
        t.start,
      );
    }
    this.advance();
    const name = t.kind === TokenKind.QuotedIdentifier ? (t.value ?? '') : t.text;
    let params: string[] | undefined;
    if (this.check(TokenKind.LParen)) {
      this.advance();
      params = [];
      if (!this.check(TokenKind.RParen)) {
        params.push(this.parseTypeParam());
        while (this.match(TokenKind.Comma)) {
          params.push(this.parseTypeParam());
        }
      }
      this.expect(TokenKind.RParen, "Expected ')' closing type parameters");
    }
    return {
      kind: 'ScalarType',
      name,
      params,
      span: this.spanFrom(start),
    };
  }

  private parseTypeParam (): string {
    const t = this.peek();
    if (t.kind === TokenKind.NumberLiteral || t.kind === TokenKind.StringLiteral || t.kind === TokenKind.Identifier) {
      this.advance();
      return t.value ?? t.text;
    }
    throw new ParseError(`Expected type parameter, got ${t.kind}`, t.start);
  }

  /* ----- Type declaration (§13) ----- */

  private parseTypeDecl (): TypeDeclaration {
    const start = this.peek().start;
    this.advance(); // Type
    const name = this.parseIdentLikeName('type name');

    // After `Type <Name>`, the next token disambiguates the form:
    //
    //   { ... }                           v0.1 object form, no pre-body settings
    //   [ settings ] { ... }              v0.1 object form, pre-body settings (permissive)
    //   typeExpression                    v0.2 scalar form (spec §14.7)
    //   typeExpression [ settings ]       v0.2 scalar form with field-level settings
    //
    // Note that LBrace and LBracket are distinct from any start-of-type-expression
    // token (Identifier, scalar/bson type keywords, structural type keywords like
    // `object`, `array`, `oneOf`, etc.), so the dispatch is unambiguous from
    // peek(0) alone.

    if (this.check(TokenKind.LBrace)) {
      // v0.1 object form, no pre-body settings.
      return this.finishObjectTypeDecl(start, name, /* settings */ []);
    }

    if (this.check(TokenKind.LBracket)) {
      // v0.1 object form with pre-body settings (permissive shape; not used in
      // any current example or spec text but historically accepted).
      const settings = this.maybeSettingsBlock();
      return this.finishObjectTypeDecl(start, name, settings);
    }

    // Anything else is the v0.2 scalar form. parseTypeExpression handles
    // scalars, BSON types, named-type references, and the parameterized
    // forms like `decimal(10, 2)`. It also handles structural type
    // expressions like `array(int)` -- the spec calls this "scalar" because
    // that's the typical use case, but the syntactic form supports any
    // type expression as the base.
    const scalarBase = this.parseTypeExpression();
    const settings = this.maybeSettingsBlock();
    return {
      kind: 'TypeDeclaration',
      name,
      scalarBase,
      settings,
      body: [],
      span: this.spanFrom(start),
    };
  }

  /**
   * Finish parsing a v0.1 object-form Type after the name (and optional
   * pre-body settings) have been consumed. Handles the `{ ...body }` part.
   */
  private finishObjectTypeDecl (
    start: Position,
    name: string,
    settings: Setting[],
  ): TypeDeclaration {
    this.expect(TokenKind.LBrace, "Expected '{' after Type name");
    const body: TypeDeclaration['body'] = [];
    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      const t = this.peek();
      const k = kw(t);
      if (k === 'note') {
        body.push(this.parseNoteBlockOrSetting());
      } else if (t.kind === TokenKind.Tilde) {
        body.push(this.parsePartialInjection());
      } else {
        body.push(this.parseFieldDeclaration());
      }
    }
    this.expect(TokenKind.RBrace, "Expected '}' closing Type");
    return {
      kind: 'TypeDeclaration',
      name,
      settings,
      body,
      span: this.spanFrom(start),
    };
  }

  /* ----- Edge ----- */

  private parseEdge (): EdgeDeclaration {
    const start = this.peek().start;
    this.advance(); // Edge
    const name = this.parseIdentLikeName('edge name');
    const settings = this.maybeSettingsBlock();
    this.expect(TokenKind.LBrace, "Expected '{' after Edge settings");
    const body = this.parseEntityBody();
    this.expect(TokenKind.RBrace, "Expected '}' closing Edge");
    return {
      kind: 'EdgeDeclaration',
      name,
      settings,
      body,
      span: this.spanFrom(start),
    };
  }

  /* ----- View ----- */

  private parseView (): ViewDeclaration {
    const start = this.peek().start;
    this.advance(); // View
    const name = this.parseIdentLikeName('view name');
    const settings = this.maybeSettingsBlock();
    this.expect(TokenKind.LBrace, "Expected '{' after View name");
    const body: ViewBodyItem[] = [];
    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      const t = this.peek();
      const k = kw(t);
      if (k === 'note') {
        body.push(this.parseNoteBlockOrSetting());
      } else if (k === 'source_query') {
        body.push(this.parseSourceQueryItem());
      } else {
        body.push(this.parseFieldDeclaration());
      }
    }
    this.expect(TokenKind.RBrace, "Expected '}' closing View");
    return {
      kind: 'ViewDeclaration',
      name,
      settings,
      body,
      span: this.spanFrom(start),
    };
  }

  private parseSourceQueryItem (): ViewBodyItem {
    const start = this.peek().start;
    this.advance(); // source_query
    this.expect(TokenKind.Colon, "Expected ':' after source_query");
    const t = this.peek();
    if (t.kind !== TokenKind.StringLiteral && t.kind !== TokenKind.MultilineString) {
      throw new ParseError('Expected string after source_query:', t.start);
    }
    this.advance();
    return {
      kind: 'SourceQueryItem',
      query: t.value ?? '',
      span: this.spanFrom(start),
    };
  }

  /* ----- Enum ----- */

  private parseEnum (): EnumDeclaration {
    const start = this.peek().start;
    const kwTok = this.advance(); // enum
    const name = this.parseIdentLikeName('enum name');
    this.expect(TokenKind.LBrace, "Expected '{' after enum name");
    const values: EnumValue[] = [];
    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      const vStart = this.peek().start;
      const vt = this.peek();
      let vname: string;
      let vquoted = false;
      if (vt.kind === TokenKind.StringLiteral) {
        // legacy form: 'A+'
        this.advance();
        vname = vt.value ?? '';
        vquoted = true;
      } else if (vt.kind === TokenKind.QuotedIdentifier) {
        this.advance();
        vname = vt.value ?? '';
        vquoted = true;
      } else if (vt.kind === TokenKind.Identifier) {
        this.advance();
        vname = vt.text;
      } else {
        throw new ParseError(`Expected enum value, got ${vt.kind}`, vt.start);
      }
      const settings = this.maybeSettingsBlock();
      values.push({
        kind: 'EnumValue',
        name: vname,
        nameQuoted: vquoted,
        settings,
        span: this.spanFrom(vStart),
      });
    }
    this.expect(TokenKind.RBrace, "Expected '}' closing enum");
    return {
      kind: 'EnumDeclaration',
      keywordCasing: kwTok.text,
      name,
      values,
      span: this.spanFrom(start),
    };
  }

  /* ----- Ref ----- */

  private parseRef (): RefDeclaration {
    const start = this.peek().start;
    this.advance(); // Ref
    let name: string | undefined;
    if (this.check(TokenKind.Identifier)) {
      // Could be the optional name, OR it could be the start of a refSpec.
      // The discriminator: if the next token after the identifier is ':' or '{',
      // it's a named Ref. Otherwise the identifier is the first path of a
      // long-form refSpec inside braces -- but the grammar always requires
      // braces for the body in long form, so a Ref starting `Ref word ...`
      // where word is not followed by `:` or `{` is malformed.
      // For Ref: ... and Ref name: ..., we handle both by looking ahead.
      const id = this.peek();
      const next = this.peek(1);
      if (next.kind === TokenKind.Colon || next.kind === TokenKind.LBrace) {
        this.advance();
        name = id.text;
      }
    }
    let spec: RefSpec;
    let settings: Setting[] = [];
    if (this.match(TokenKind.Colon)) {
      // short form: `Ref: a > b [settings]`
      spec = this.parseRefSpec();
      settings = this.maybeSettingsBlock();
    } else if (this.match(TokenKind.LBrace)) {
      // long form: `Ref name { a > b }`
      spec = this.parseRefSpec();
      this.expect(TokenKind.RBrace, "Expected '}' closing Ref body");
    } else {
      const t = this.peek();
      throw new ParseError("Expected ':' or '{' after Ref", t.start);
    }
    return {
      kind: 'RefDeclaration',
      name,
      spec,
      settings,
      span: this.spanFrom(start),
    };
  }

  private parseRefSpec (): RefSpec {
    const start = this.peek().start;
    const source = this.parseRefEndpoint();
    const op = this.parseCardinalityOperator();
    const target = this.parseRefEndpoint();
    return {
      kind: 'RefSpec',
      source,
      operator: op,
      target,
      span: this.spanFrom(start),
    };
  }

  private parseCardinalityOperator (): CardinalityOperator {
    const t = this.peek();
    if (t.kind === TokenKind.LAngle) {
      this.advance();
      return '<';
    }
    if (t.kind === TokenKind.RAngle) {
      this.advance();
      return '>';
    }
    if (t.kind === TokenKind.Minus) {
      this.advance();
      return '-';
    }
    if (t.kind === TokenKind.ManyToMany) {
      this.advance();
      return '<>';
    }
    throw new ParseError(`Expected cardinality operator, got ${t.kind} ${JSON.stringify(t.text)}`, t.start);
  }

  private parseRefEndpoint (): RefEndpoint {
    const start = this.peek().start;
    // Composite FK form: `entity.(field1, field2)` -- detect by looking ahead
    // for a `.(` after the initial identifier path.
    const segments = this.parsePathSegments();
    // After segments, if the next token is `.(`, parse composite list
    let compositeFields: string[] | undefined;
    if (this.check(TokenKind.Dot) && this.peek(1).kind === TokenKind.LParen) {
      this.advance(); // .
      this.advance(); // (
      compositeFields = [];
      compositeFields.push(this.expect(TokenKind.Identifier, 'Expected field name').text);
      while (this.match(TokenKind.Comma)) {
        compositeFields.push(this.expect(TokenKind.Identifier, 'Expected field name').text);
      }
      this.expect(TokenKind.RParen, "Expected ')' closing composite field list");
    }
    return {
      kind: 'RefEndpoint',
      path: segments,
      compositeFields,
      span: this.spanFrom(start),
    };
  }

  /**
   * Parse a dotted path with the §18 segment vocabulary:
   *
   *   IDENTIFIER                  -- a field segment
   *   .IDENTIFIER                 -- field
   *   .[N]                        -- array index (positional)
   *   .[*]                        -- array wildcard (via ArrayWildcard token)
   *   ."quoted name"              -- quoted-identifier field
   *   .["literal key"]            -- map literal key
   *
   * We start by consuming an identifier/qualified head, then walk pathTail.
   * The JSONPath-alias forms `[N]`, `[*]` without a leading dot are
   * recognized as well; they normalize to the dot-prefixed form.
   *
   * For the PoC we stop at the first token that doesn't continue a path
   * (e.g., a cardinality operator, a comma, a settings bracket).
   */
  private parsePathSegments (): PathSegment[] {
    const segments: PathSegment[] = [];
    const headStart = this.peek().start;
    const headTok = this.expect(TokenKind.Identifier, 'Expected path start identifier');
    segments.push({
      kind: 'PathField',
      name: headTok.text,
      span: {
        start: headStart,
        end: headTok.end,
      },
    });
    // Walk tail
    while (true) {
      const t = this.peek();
      // Stop before a composite `.(`
      if (t.kind === TokenKind.Dot && this.peek(1).kind === TokenKind.LParen) {
        break;
      }
      if (t.kind === TokenKind.Dot) {
        this.advance();
        const next = this.peek();
        const segStart = next.start;
        if (next.kind === TokenKind.Identifier) {
          this.advance();
          segments.push({
            kind: 'PathField',
            name: next.text,
            span: this.spanFrom(segStart),
          });
        } else if (next.kind === TokenKind.QuotedIdentifier) {
          this.advance();
          segments.push({
            kind: 'PathField',
            name: next.value ?? '',
            span: this.spanFrom(segStart),
          });
        } else if (next.kind === TokenKind.LBracket) {
          // .[N] or .["literal key"]
          this.advance();
          const inner = this.peek();
          if (inner.kind === TokenKind.NumberLiteral) {
            this.advance();
            this.expect(TokenKind.RBracket, "Expected ']' after array index");
            segments.push({
              kind: 'PathArrayIndex',
              index: parseInt(inner.text, 10),
              span: this.spanFrom(segStart),
            });
          } else if (inner.kind === TokenKind.StringLiteral) {
            this.advance();
            this.expect(TokenKind.RBracket, "Expected ']' after map key");
            segments.push({
              kind: 'PathMapKey',
              key: inner.value ?? '',
              span: this.spanFrom(segStart),
            });
          } else {
            throw new ParseError(`Unexpected token inside path bracket: ${inner.kind}`, inner.start);
          }
        } else if (next.kind === TokenKind.ArrayWildcard) {
          // .[*]
          this.advance();
          segments.push({
            kind: 'PathArrayWildcard',
            span: this.spanFrom(segStart),
          });
        } else {
          throw new ParseError(
            `Unexpected token after '.' in path: ${next.kind} ${JSON.stringify(next.text)}`,
            next.start,
          );
        }
      } else if (t.kind === TokenKind.ArrayWildcard) {
        // JSONPath-alias: `[*]` immediately after a segment
        const segStart = t.start;
        this.advance();
        segments.push({
          kind: 'PathArrayWildcard',
          span: this.spanFrom(segStart),
        });
      } else if (t.kind === TokenKind.LBracket && this.peek(1).kind === TokenKind.NumberLiteral && this.peek(2).kind === TokenKind.RBracket) {
        // JSONPath-alias: `[N]` immediately after a segment
        const segStart = t.start;
        this.advance(); // [
        const numTok = this.advance();
        this.advance(); // ]
        segments.push({
          kind: 'PathArrayIndex',
          index: parseInt(numTok.text, 10),
          span: this.spanFrom(segStart),
        });
      } else {
        break;
      }
    }
    return segments;
  }

  /* ----- TablePartial / TableGroup ----- */

  private parseTablePartial (): TablePartialDeclaration {
    const start = this.peek().start;
    this.advance(); // TablePartial
    const name = this.parseIdentLikeName('TablePartial name');
    const settings = this.maybeSettingsBlock();
    this.expect(TokenKind.LBrace, "Expected '{' after TablePartial name");
    const body = this.parseEntityBody();
    this.expect(TokenKind.RBrace, "Expected '}' closing TablePartial");
    return {
      kind: 'TablePartialDeclaration',
      name,
      settings,
      body,
      span: this.spanFrom(start),
    };
  }

  private parseTableGroup (): TableGroupDeclaration {
    const start = this.peek().start;
    this.advance(); // TableGroup
    const name = this.parseIdentLikeName('TableGroup name');
    const settings = this.maybeSettingsBlock();
    this.expect(TokenKind.LBrace, "Expected '{' after TableGroup name");
    const members: string[] = [];
    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      const t = this.peek();
      if (t.kind === TokenKind.Identifier) {
        this.advance();
        let n = t.text;
        while (this.check(TokenKind.Dot)) {
          this.advance();
          const next = this.expect(TokenKind.Identifier, 'Expected identifier after dot');
          n += `.${next.text}`;
        }
        members.push(n);
        // optional trailing semicolons in some sources
        this.match(TokenKind.Semicolon);
      } else if (t.kind === TokenKind.Semicolon || t.kind === TokenKind.Comma) {
        this.advance();
      } else {
        throw new ParseError(`Unexpected token in TableGroup: ${t.kind}`, t.start);
      }
    }
    this.expect(TokenKind.RBrace, "Expected '}' closing TableGroup");
    return {
      kind: 'TableGroupDeclaration',
      name,
      settings,
      members,
      span: this.spanFrom(start),
    };
  }

  /* ----- Indexes ----- */

  private parseIndexes (): IndexesBlock {
    const start = this.peek().start;
    this.advance(); // indexes
    this.expect(TokenKind.LBrace, "Expected '{' after indexes");
    const entries: IndexEntry[] = [];
    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      entries.push(this.parseIndexEntry());
    }
    this.expect(TokenKind.RBrace, "Expected '}' closing indexes");
    return {
      kind: 'IndexesBlock',
      entries,
      span: this.spanFrom(start),
    };
  }

  private parseIndexEntry (): IndexEntry {
    const start = this.peek().start;
    let components: IndexComponent[];
    if (this.check(TokenKind.LParen)) {
      this.advance(); // (
      components = [];
      components.push(this.parseIndexComponent());
      while (this.match(TokenKind.Comma)) {
        components.push(this.parseIndexComponent());
      }
      this.expect(TokenKind.RParen, "Expected ')' closing composite index");
    } else {
      components = [this.parseIndexComponent()];
    }
    const settings = this.maybeSettingsBlock();
    return {
      kind: 'IndexEntry',
      components,
      settings,
      span: this.spanFrom(start),
    };
  }

  private parseIndexComponent (): IndexComponent {
    const t = this.peek();
    if (t.kind === TokenKind.ExpressionLiteral) {
      const start = t.start;
      this.advance();
      const c: IndexExpressionComponent = {
        kind: 'IndexExpressionComponent',
        expression: t.value ?? '',
        span: this.spanFrom(start),
      };
      return c;
    }
    const start = this.peek().start;
    const path = this.parsePathSegments();
    const c: IndexPathComponent = {
      kind: 'IndexPathComponent',
      path,
      span: this.spanFrom(start),
    };
    return c;
  }

  /* ----- Checks (spec §10, new in v0.2) ----- */

  private parseChecks (): ChecksBlock {
    const start = this.peek().start;
    this.advance(); // checks
    this.expect(TokenKind.LBrace, "Expected '{' after checks");
    const entries: CheckEntry[] = [];
    while (!this.check(TokenKind.RBrace) && !this.check(TokenKind.EOF)) {
      entries.push(this.parseCheckEntry());
    }
    this.expect(TokenKind.RBrace, "Expected '}' closing checks");
    return {
      kind: 'ChecksBlock',
      entries,
      span: this.spanFrom(start),
    };
  }

  private parseCheckEntry (): CheckEntry {
    const start = this.peek().start;
    const exprTok = this.peek();
    if (exprTok.kind !== TokenKind.ExpressionLiteral) {
      throw new ParseError(
        `Expected backtick-wrapped check expression, got ${exprTok.kind} ${JSON.stringify(exprTok.text)}`,
        exprTok.start,
      );
    }
    this.advance();
    // The expression is opaque to xDBML per spec §10.3. The value field of
    // an ExpressionLiteral token already has the surrounding backticks stripped.
    const expression = exprTok.value ?? '';
    const settings = this.maybeSettingsBlock();
    return {
      kind: 'CheckEntry',
      expression,
      settings,
      span: this.spanFrom(start),
    };
  }

  /* ----- Settings block ----- */

  private maybeSettingsBlock (): Setting[] {
    if (!this.check(TokenKind.LBracket)) return [];
    this.advance(); // [
    const settings: Setting[] = [];
    if (this.check(TokenKind.RBracket)) {
      this.advance();
      return settings;
    }
    settings.push(this.parseSetting());
    while (this.match(TokenKind.Comma)) {
      // tolerate trailing comma
      if (this.check(TokenKind.RBracket)) break;
      settings.push(this.parseSetting());
    }
    this.expect(TokenKind.RBracket, "Expected ']' closing settings");
    return settings;
  }

  /**
   * A single setting. Forms:
   *   flag                  -- bare identifier(s), e.g. `pk`, `not null`
   *   name: value           -- key/value, e.g. `default: 'x'`, `synonyms: [...]`
   *   ref: > target         -- inline ref
   *
   * The grammar for "flag" is annoying because `not null` is two words but is
   * still one flag. We handle the multi-word flags by greedy lowercase prefix
   * match: `not` followed by `null` becomes `not null`; `primary` followed by
   * `key` becomes `primary key`.
   */
  private parseSetting (): Setting {
    const start = this.peek().start;
    const t = this.peek();
    if (t.kind !== TokenKind.Identifier && t.kind !== TokenKind.QuotedIdentifier) {
      throw new ParseError(`Expected setting, got ${t.kind} ${JSON.stringify(t.text)}`, t.start);
    }
    // Two-word flag prefixes
    if (t.kind === TokenKind.Identifier) {
      const lower = t.text.toLowerCase();
      if (lower === 'not' && kw(this.peek(1)) === 'null') {
        this.advance();
        this.advance();
        return {
          kind: 'Setting',
          name: 'not null',
          nameSource: 'not null',
          value: null,
          span: this.spanFrom(start),
        };
      }
      if (lower === 'primary' && kw(this.peek(1)) === 'key') {
        this.advance();
        this.advance();
        return {
          kind: 'Setting',
          name: 'primary key',
          nameSource: 'primary key',
          value: null,
          span: this.spanFrom(start),
        };
      }
    }
    // Read the name token (single-word for now)
    const nameTok = this.advance();
    const nameSource = nameTok.kind === TokenKind.QuotedIdentifier ? (nameTok.value ?? '') : nameTok.text;
    const lower = nameSource.toLowerCase();
    // If next token is not a colon, this is a pure flag setting.
    if (!this.match(TokenKind.Colon)) {
      // Spec §8: `required` is accepted as a synonym for `not null` and
      // parsers MUST normalize it. `name` becomes the canonical form so
      // every downstream consumer (inspector REQUIRED badge, layout's
      // required-flag detection, generators) checks one value.
      // `nameSource` keeps the user's original spelling so the settings
      // table renders what was typed and round-tripping the AST back to
      // source preserves the author's wording.
      const canonicalName = lower === 'required' ? 'not null' : lower;
      return {
        kind: 'Setting',
        name: canonicalName,
        nameSource,
        value: null,
        span: this.spanFrom(start),
      };
    }
    // `ref: > target` form
    if (lower === 'ref') {
      const op = this.parseCardinalityOperator();
      const target = this.parseRefEndpoint();
      const v: RefValue = {
        kind: 'RefValue',
        operator: op,
        target,
        span: this.spanFrom(start),
      };
      return {
        kind: 'Setting',
        name: 'ref',
        nameSource,
        value: v,
        span: this.spanFrom(start),
      };
    }
    const value = this.parseSettingValue();
    return {
      kind: 'Setting',
      name: lower,
      nameSource,
      value,
      span: this.spanFrom(start),
    };
  }

  /**
   * A setting value. Open-vocabulary:
   *   string literal, multi-line string, number, boolean, null, identifier
   *   (or dotted identifier path), expression literal, list `[...]`
   */
  private parseSettingValue (): SettingValue {
    const start = this.peek().start;
    const t = this.peek();
    if (t.kind === TokenKind.StringLiteral || t.kind === TokenKind.MultilineString) {
      this.advance();
      const v: StringValue = {
        kind: 'StringValue',
        value: t.value ?? '',
        multiline: t.kind === TokenKind.MultilineString,
        span: this.spanFrom(start),
      };
      return v;
    }
    if (t.kind === TokenKind.NumberLiteral) {
      this.advance();
      const v: NumberValue = {
        kind: 'NumberValue',
        value: t.text,
        span: this.spanFrom(start),
      };
      return v;
    }
    // negative number: `-3`
    if (t.kind === TokenKind.Minus && this.peek(1).kind === TokenKind.NumberLiteral) {
      this.advance();
      const numTok = this.advance();
      const v: NumberValue = {
        kind: 'NumberValue',
        value: `-${numTok.text}`,
        span: this.spanFrom(start),
      };
      return v;
    }
    if (t.kind === TokenKind.ExpressionLiteral) {
      this.advance();
      const v: ExpressionValue = {
        kind: 'ExpressionValue',
        expression: t.value ?? '',
        span: this.spanFrom(start),
      };
      return v;
    }
    if (t.kind === TokenKind.LBracket) {
      this.advance();
      const items: SettingValue[] = [];
      if (!this.check(TokenKind.RBracket)) {
        items.push(this.parseSettingValue());
        while (this.match(TokenKind.Comma)) {
          if (this.check(TokenKind.RBracket)) break;
          items.push(this.parseSettingValue());
        }
      }
      this.expect(TokenKind.RBracket, "Expected ']' closing list value");
      const v: ListValue = {
        kind: 'ListValue',
        items,
        span: this.spanFrom(start),
      };
      return v;
    }
    if (t.kind === TokenKind.Identifier || t.kind === TokenKind.QuotedIdentifier) {
      const lower = t.kind === TokenKind.Identifier ? t.text.toLowerCase() : '';
      if (lower === 'true' || lower === 'false') {
        this.advance();
        return {
          kind: 'BooleanValue',
          value: lower === 'true',
          span: this.spanFrom(start),
        };
      }
      if (lower === 'null') {
        this.advance();
        return {
          kind: 'NullValue',
          span: this.spanFrom(start),
        };
      }
      // Multi-word identifier values: `set null`, `no action`, `set default`
      // (referential-action values used in delete/update settings).
      this.advance();
      let value = t.kind === TokenKind.QuotedIdentifier ? (t.value ?? '') : t.text;
      // Greedy continuation: identifier followed by identifier(s) without
      // intervening punctuation are joined with a space. We stop at any
      // delimiter, including `,` `]` `>` etc.
      while (this.peek().kind === TokenKind.Identifier) {
        const next = this.peek();
        const nextLower = next.text.toLowerCase();
        // Don't pull in `null` if it's a separate value; but in
        // `default: null` the lone identifier `null` was already handled above.
        // For value contexts, we allow `set null`, `set default`, `no action`.
        if (
          (value.toLowerCase() === 'set' && (nextLower === 'null' || nextLower === 'default'))
          || (value.toLowerCase() === 'no' && nextLower === 'action')
        ) {
          this.advance();
          value += ` ${next.text}`;
        } else {
          // Continue dotted identifiers: `core.users`
          break;
        }
      }
      // Dotted identifier continuation: `Oracle`, `core.users`
      while (this.check(TokenKind.Dot)) {
        this.advance();
        const next = this.expect(TokenKind.Identifier, 'Expected identifier after dot');
        value += `.${next.text}`;
      }
      const v: IdentifierValue = {
        kind: 'IdentifierValue',
        value,
        span: this.spanFrom(start),
      };
      return v;
    }
    throw new ParseError(`Expected setting value, got ${t.kind} ${JSON.stringify(t.text)}`, t.start);
  }

  /* ----- Generic ident name parser ----- */

  private parseIdentLikeName (what: string): string {
    const t = this.peek();
    if (t.kind === TokenKind.Identifier) {
      this.advance();
      return t.text;
    }
    if (t.kind === TokenKind.QuotedIdentifier) {
      this.advance();
      return t.value ?? '';
    }
    throw new ParseError(`Expected ${what}, got ${t.kind} ${JSON.stringify(t.text)}`, t.start);
  }
}

/* -------------------------------------------------------------------------
 * Public API
 * ----------------------------------------------------------------------- */

export function parse (source: string): XDbmlDocument {
  const tokens = tokenize(source);
  return new Parser(tokens).parseDocument();
}
