/**
 * xDBML lexer.
 *
 * Produces a stream of tokens with line/column positions. Keywords are NOT
 * recognized as distinct token kinds at the lexer level. Identifiers carry
 * their source value, and the parser interprets them as keywords by
 * lowercased string comparison (per spec §3.8: keywords are
 * case-insensitive, identifiers are case-sensitive — both end up as
 * IDENTIFIER tokens here, with the parser making the keyword decision).
 *
 * Special multi-character punctuation handled here rather than in the parser:
 *   - `<>` is lexed as MANY_TO_MANY (otherwise the parser would see `<` then `>`)
 *   - `[*]` is lexed as ARRAY_WILDCARD only when followed-by/preceded-by a dot
 *     in a path context; otherwise it's left as `LBRACKET`, `OP(*)`, `RBRACKET`
 *     to avoid ambiguity with array settings. In practice the parser only
 *     uses ARRAY_WILDCARD inside fieldPath, so we lex `[*]` greedily whenever
 *     we see it and let the parser decide based on context.
 *   - `'''...'''` lexes as a single STRING_LITERAL with the multiline flag.
 */

import type { Position } from './ast.ts';

export const TokenKind = {
  Identifier: 'Identifier',
  QuotedIdentifier: 'QuotedIdentifier', // "double-quoted name"
  StringLiteral: 'StringLiteral',
  MultilineString: 'MultilineString',
  NumberLiteral: 'NumberLiteral',
  ExpressionLiteral: 'ExpressionLiteral', // `backtick-quoted`

  LBrace: 'LBrace',
  RBrace: 'RBrace',
  LBracket: 'LBracket',
  RBracket: 'RBracket',
  LParen: 'LParen',
  RParen: 'RParen',

  Comma: 'Comma',
  Colon: 'Colon',
  Dot: 'Dot',
  Tilde: 'Tilde',
  Semicolon: 'Semicolon',

  LAngle: 'LAngle', // <
  RAngle: 'RAngle', // >
  Minus: 'Minus',   // -
  ManyToMany: 'ManyToMany', // <>

  ArrayWildcard: 'ArrayWildcard', // [*]

  EOF: 'EOF',
} as const;

export type TokenKind = typeof TokenKind[keyof typeof TokenKind];

export interface Token {
  kind: TokenKind;
  /** The raw source text of the token */
  text: string;
  /** For StringLiteral / MultilineString / QuotedIdentifier: text with quotes stripped & escapes processed */
  value?: string;
  start: Position;
  end: Position;
}

export class LexError extends Error {
  position: Position;
  constructor (message: string, position: Position) {
    super(`${message} (line ${position.line}, column ${position.column})`);
    this.position = position;
  }
}

export class Lexer {
  private text: string;
  private offset = 0;
  private line = 1;
  private column = 1;

  constructor (text: string) {
    this.text = text;
  }

  private pos (): Position {
    return {
      line: this.line,
      column: this.column,
      offset: this.offset,
    };
  }

  private peek (lookahead = 0): string {
    return this.text[this.offset + lookahead] ?? '';
  }

  private advance (): string {
    const c = this.text[this.offset];
    this.offset += 1;
    if (c === '\n') {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
    return c;
  }

  private matchSeq (seq: string): boolean {
    for (let i = 0; i < seq.length; i += 1) {
      if (this.text[this.offset + i] !== seq[i]) {
        return false;
      }
    }
    return true;
  }

  private isAtEnd (): boolean {
    return this.offset >= this.text.length;
  }

  private skipTrivia (): void {
    while (!this.isAtEnd()) {
      const c = this.peek();
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        this.advance();
        continue;
      }
      if (c === '/' && this.peek(1) === '/') {
        // line comment
        while (!this.isAtEnd() && this.peek() !== '\n') {
          this.advance();
        }
        continue;
      }
      if (c === '/' && this.peek(1) === '*') {
        // block comment
        this.advance();
        this.advance();
        while (!this.isAtEnd() && !(this.peek() === '*' && this.peek(1) === '/')) {
          this.advance();
        }
        if (!this.isAtEnd()) {
          this.advance(); // *
          this.advance(); // /
        }
        continue;
      }
      break;
    }
  }

  private isIdentStart (c: string): boolean {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
  }

  private isIdentCont (c: string): boolean {
    return this.isIdentStart(c) || (c >= '0' && c <= '9');
  }

  private isDigit (c: string): boolean {
    return c >= '0' && c <= '9';
  }

  private lexIdentifier (): Token {
    const start = this.pos();
    while (!this.isAtEnd() && this.isIdentCont(this.peek())) {
      this.advance();
    }
    const end = this.pos();
    const text = this.text.substring(start.offset, end.offset);
    return {
      kind: TokenKind.Identifier,
      text,
      start,
      end,
    };
  }

  private lexNumber (): Token {
    const start = this.pos();
    // optional leading minus is handled at parser level (it's an operator token)
    while (!this.isAtEnd() && this.isDigit(this.peek())) {
      this.advance();
    }
    if (this.peek() === '.' && this.isDigit(this.peek(1))) {
      this.advance(); // .
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        this.advance();
      }
    }
    if (this.peek() === 'e' || this.peek() === 'E') {
      this.advance();
      if (this.peek() === '+' || this.peek() === '-') {
        this.advance();
      }
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        this.advance();
      }
    }
    const end = this.pos();
    return {
      kind: TokenKind.NumberLiteral,
      text: this.text.substring(start.offset, end.offset),
      start,
      end,
    };
  }

  private lexString (): Token {
    const start = this.pos();
    // Detect triple-quoted multi-line first
    if (this.matchSeq("'''")) {
      this.advance();
      this.advance();
      this.advance();
      const bodyStart = this.offset;
      while (!this.isAtEnd() && !this.matchSeq("'''")) {
        if (this.peek() === '\\' && this.peek(1) !== '') {
          this.advance();
          this.advance();
        } else {
          this.advance();
        }
      }
      if (this.isAtEnd()) {
        throw new LexError('Unterminated triple-quoted string', start);
      }
      const bodyEnd = this.offset;
      this.advance();
      this.advance();
      this.advance();
      const end = this.pos();
      const raw = this.text.substring(bodyStart, bodyEnd);
      return {
        kind: TokenKind.MultilineString,
        text: this.text.substring(start.offset, end.offset),
        value: normalizeMultiline(raw),
        start,
        end,
      };
    }
    // single-quoted
    this.advance(); // opening '
    let value = '';
    while (!this.isAtEnd() && this.peek() !== "'") {
      if (this.peek() === '\\' && this.peek(1) !== '') {
        const esc = this.peek(1);
        if (esc === 'n') {
          value += '\n';
        } else if (esc === 't') {
          value += '\t';
        } else if (esc === 'r') {
          value += '\r';
        } else if (esc === '\\') {
          value += '\\';
        } else if (esc === "'") {
          value += "'";
        } else {
          value += esc;
        }
        this.advance();
        this.advance();
      } else if (this.peek() === '\n') {
        throw new LexError('Unterminated string (newline in single-quoted string)', start);
      } else {
        value += this.advance();
      }
    }
    if (this.isAtEnd()) {
      throw new LexError('Unterminated string', start);
    }
    this.advance(); // closing '
    const end = this.pos();
    return {
      kind: TokenKind.StringLiteral,
      text: this.text.substring(start.offset, end.offset),
      value,
      start,
      end,
    };
  }

  private lexQuotedIdent (): Token {
    const start = this.pos();
    this.advance(); // opening "
    let value = '';
    while (!this.isAtEnd() && this.peek() !== '"') {
      if (this.peek() === '\\' && this.peek(1) !== '') {
        value += this.peek(1);
        this.advance();
        this.advance();
      } else if (this.peek() === '\n') {
        throw new LexError('Unterminated quoted identifier', start);
      } else {
        value += this.advance();
      }
    }
    if (this.isAtEnd()) {
      throw new LexError('Unterminated quoted identifier', start);
    }
    this.advance(); // closing "
    const end = this.pos();
    return {
      kind: TokenKind.QuotedIdentifier,
      text: this.text.substring(start.offset, end.offset),
      value,
      start,
      end,
    };
  }

  private lexBacktick (): Token {
    const start = this.pos();
    this.advance(); // `
    const bodyStart = this.offset;
    while (!this.isAtEnd() && this.peek() !== '`') {
      this.advance();
    }
    if (this.isAtEnd()) {
      throw new LexError('Unterminated expression literal', start);
    }
    const bodyEnd = this.offset;
    this.advance(); // closing `
    const end = this.pos();
    return {
      kind: TokenKind.ExpressionLiteral,
      text: this.text.substring(start.offset, end.offset),
      value: this.text.substring(bodyStart, bodyEnd),
      start,
      end,
    };
  }

  /** Read a single token. Returns EOF when out of input. */
  private nextToken (): Token {
    this.skipTrivia();
    if (this.isAtEnd()) {
      const p = this.pos();
      return {
        kind: TokenKind.EOF,
        text: '',
        start: p,
        end: p,
      };
    }
    const start = this.pos();
    const c = this.peek();

    // Punctuation and multi-character operators
    if (c === '{') {
      this.advance();
      return {
        kind: TokenKind.LBrace,
        text: '{',
        start,
        end: this.pos(),
      };
    }
    if (c === '}') {
      this.advance();
      return {
        kind: TokenKind.RBrace,
        text: '}',
        start,
        end: this.pos(),
      };
    }
    if (c === '[') {
      // Greedy [*] match for wildcards in paths
      if (this.peek(1) === '*' && this.peek(2) === ']') {
        this.advance();
        this.advance();
        this.advance();
        return {
          kind: TokenKind.ArrayWildcard,
          text: '[*]',
          start,
          end: this.pos(),
        };
      }
      this.advance();
      return {
        kind: TokenKind.LBracket,
        text: '[',
        start,
        end: this.pos(),
      };
    }
    if (c === ']') {
      this.advance();
      return {
        kind: TokenKind.RBracket,
        text: ']',
        start,
        end: this.pos(),
      };
    }
    if (c === '(') {
      this.advance();
      return {
        kind: TokenKind.LParen,
        text: '(',
        start,
        end: this.pos(),
      };
    }
    if (c === ')') {
      this.advance();
      return {
        kind: TokenKind.RParen,
        text: ')',
        start,
        end: this.pos(),
      };
    }
    if (c === ',') {
      this.advance();
      return {
        kind: TokenKind.Comma,
        text: ',',
        start,
        end: this.pos(),
      };
    }
    if (c === ':') {
      this.advance();
      return {
        kind: TokenKind.Colon,
        text: ':',
        start,
        end: this.pos(),
      };
    }
    if (c === ';') {
      this.advance();
      return {
        kind: TokenKind.Semicolon,
        text: ';',
        start,
        end: this.pos(),
      };
    }
    if (c === '.') {
      this.advance();
      return {
        kind: TokenKind.Dot,
        text: '.',
        start,
        end: this.pos(),
      };
    }
    if (c === '~') {
      this.advance();
      return {
        kind: TokenKind.Tilde,
        text: '~',
        start,
        end: this.pos(),
      };
    }
    if (c === '<') {
      if (this.peek(1) === '>') {
        this.advance();
        this.advance();
        return {
          kind: TokenKind.ManyToMany,
          text: '<>',
          start,
          end: this.pos(),
        };
      }
      this.advance();
      return {
        kind: TokenKind.LAngle,
        text: '<',
        start,
        end: this.pos(),
      };
    }
    if (c === '>') {
      this.advance();
      return {
        kind: TokenKind.RAngle,
        text: '>',
        start,
        end: this.pos(),
      };
    }
    if (c === '-') {
      // Could be a negative number or the one-to-one operator.
      // Disambiguation is positional, so we always emit Minus and let the parser decide.
      this.advance();
      return {
        kind: TokenKind.Minus,
        text: '-',
        start,
        end: this.pos(),
      };
    }
    if (c === "'") {
      return this.lexString();
    }
    if (c === '"') {
      return this.lexQuotedIdent();
    }
    if (c === '`') {
      return this.lexBacktick();
    }
    if (this.isDigit(c)) {
      return this.lexNumber();
    }
    if (this.isIdentStart(c)) {
      return this.lexIdentifier();
    }

    throw new LexError(`Unexpected character: ${JSON.stringify(c)}`, start);
  }

  tokenize (): Token[] {
    const out: Token[] = [];
    while (true) {
      const t = this.nextToken();
      out.push(t);
      if (t.kind === TokenKind.EOF) {
        break;
      }
    }
    return out;
  }
}

/**
 * Normalize triple-quoted multi-line string content per spec §3.3.
 * Strips leading newline if present, then de-indents based on the
 * minimum indent of non-empty lines.
 */
function normalizeMultiline (raw: string): string {
  let s = raw;
  if (s.startsWith('\n')) {
    s = s.slice(1);
  } else if (s.startsWith('\r\n')) {
    s = s.slice(2);
  }
  // strip trailing whitespace-only on last line that prefixed the closing '''
  s = s.replace(/[ \t]*$/, '');
  const lines = s.split('\n');
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const m = line.match(/^[ \t]*/);
    if (m && m[0].length < minIndent) {
      minIndent = m[0].length;
    }
  }
  if (minIndent === Infinity || minIndent === 0) {
    return lines.join('\n');
  }
  return lines.map((l) => l.slice(minIndent)).join('\n');
}

export function tokenize (text: string): Token[] {
  return new Lexer(text).tokenize();
}
