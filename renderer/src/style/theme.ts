/**
 * Renderer theme tokens.
 *
 * The playground expresses its visual style through Tailwind utility
 * classes and per-element SVG attributes. None of that survives outside
 * the playground iframe, so the serializer carries its own explicit token
 * set and inlines it into the SVG. The defaults reproduce the playground's
 * current look value-for-value; a consumer (the future API service, an MCP
 * server, an embedding host) can pass a partial override to re-theme.
 */

export interface Theme {
  /** Font stacks. The mono stack is used for field type labels. */
  fontSans: string;
  fontMono: string;

  /** Color of the standalone-SVG "Open in playground" footer link. */
  footerLink: string;

  /** Drop shadow under entity cards. */
  shadow: {
    dx: number;
    dy: number;
    stdDeviation: number;
    floodColor: string;
    floodOpacity: number;
  };

  container: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    dashArray: string;
    /** Header tint when the model provides no accent color. */
    headerFallback: string;
  };

  entity: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    /** Dash pattern for View cards. */
    viewDashArray: string;
    /** Header band fill when no explicit/group color applies. */
    headerDefault: string;
    /** Header band fill for MongoDB-style Collection/Record keywords. */
    headerCollectionRecord: string;
  };

  row: {
    pkFill: string;
    syntheticFill: string;
    zebraFill: string;
    indentGuide: string;
    caret: string;
    nameDefault: string;
    namePk: string;
    nameSynthetic: string;
    typeLabel: string;
    /** Selected-field row: tint fill and left accent strip. Theme-aware
     *  so the (light) row text stays legible on the dark palette. */
    selectFill: string;
    selectStrip: string;
  };

  badges: {
    pk: string;
    fk: string;
    unique: string;
    notNull: string;
  };

  ref: {
    line: string;
    label: string;
  };

  edge: {
    line: string;
    label: string;
  };

  banner: {
    fill: string;
    stroke: string;
    text: string;
  };

  /**
   * Backdrop behind the diagram. The static serializer leaves the SVG
   * background transparent (the consumer paints behind it), so these
   * tokens are consumed by the interactive mount, which paints the
   * scrolling viewport and its dot/line grid. They live on the theme so
   * the dark palette travels as one unit: a caller that switches to the
   * dark theme gets a matching dark canvas without coordinating a
   * separate option.
   */
  canvas: {
    background: string;
    grid: string;
  };
}

export const defaultTheme: Theme = {
  fontSans:
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontMono: 'ui-monospace, SFMono-Regular, Menlo, monospace',

  footerLink: '#2563eb',

  shadow: {
    dx: 0,
    dy: 1,
    stdDeviation: 1.5,
    floodColor: '#0f172a',
    floodOpacity: 0.12,
  },

  container: {
    fill: 'white',
    stroke: '#cbd5e1',
    strokeWidth: 1.5,
    dashArray: '4 3',
    headerFallback: '#475569',
  },

  entity: {
    fill: 'white',
    stroke: '#94a3b8',
    strokeWidth: 1,
    viewDashArray: '6 3',
    headerDefault: '#334155',
    headerCollectionRecord: '#1e3a8a',
  },

  row: {
    pkFill: '#fef9c3',
    syntheticFill: '#f1f5f9',
    zebraFill: '#f8fafc',
    indentGuide: '#e2e8f0',
    caret: '#475569',
    nameDefault: '#0f172a',
    namePk: '#854d0e',
    nameSynthetic: '#64748b',
    typeLabel: '#64748b',
    selectFill: '#dbeafe',
    selectStrip: '#2563eb',
  },

  badges: {
    pk: '#ca8a04',
    fk: '#0891b2',
    unique: '#7c3aed',
    notNull: '#dc2626',
  },

  ref: {
    line: '#64748b',
    label: '#94a3b8',
  },

  edge: {
    line: '#7c3aed',
    label: '#8b5cf6',
  },

  banner: {
    fill: '#fef3c7',
    stroke: '#f59e0b',
    text: '#92400e',
  },

  canvas: {
    background: '#f8fafc',
    grid: '#eef2f7',
  },
};

/**
 * Dark palette. A full theme (not a partial) so it can be passed directly
 * as a `theme` override and so the rendering API and MCP server share one
 * dark look with the playground. Tuned against a slate-900 canvas:
 *
 *   - Cards sit a step above the backdrop (slate-800) so they read as
 *     raised surfaces; the header band is another step lighter.
 *   - Field-name text is light (slate-200) -- the core legibility fix.
 *     PK rows tint with a deep amber and a bright amber name; synthetic
 *     and type labels use a muted slate that stays readable but recedes.
 *   - Ref and edge lines are lightened so they remain visible on the
 *     dark backdrop. `readableInk` already flips header text to light,
 *     so header inks need no per-theme handling here.
 */
export const darkTheme: Theme = {
  fontSans: defaultTheme.fontSans,
  fontMono: defaultTheme.fontMono,

  footerLink: '#60a5fa',

  shadow: {
    dx: 0,
    dy: 1,
    stdDeviation: 2,
    floodColor: '#000000',
    floodOpacity: 0.45,
  },

  container: {
    fill: '#0f172a',
    stroke: '#334155',
    strokeWidth: 1.5,
    dashArray: '4 3',
    headerFallback: '#64748b',
  },

  entity: {
    fill: '#1e293b',
    stroke: '#475569',
    strokeWidth: 1,
    viewDashArray: '6 3',
    headerDefault: '#475569',
    headerCollectionRecord: '#1e3a8a',
  },

  row: {
    pkFill: '#422006',
    syntheticFill: '#172033',
    zebraFill: '#243042',
    indentGuide: '#334155',
    caret: '#94a3b8',
    nameDefault: '#e2e8f0',
    namePk: '#fcd34d',
    nameSynthetic: '#94a3b8',
    typeLabel: '#94a3b8',
    selectFill: '#1e3a5f',
    selectStrip: '#3b82f6',
  },

  badges: {
    pk: '#ca8a04',
    fk: '#0891b2',
    unique: '#7c3aed',
    notNull: '#dc2626',
  },

  ref: {
    line: '#94a3b8',
    label: '#cbd5e1',
  },

  edge: {
    line: '#a78bfa',
    label: '#c4b5fd',
  },

  banner: {
    fill: '#422006',
    stroke: '#f59e0b',
    text: '#fcd34d',
  },

  canvas: {
    background: '#0f172a',
    grid: '#1e293b',
  },
};

/** Merge a partial override over the default theme (one level deep). */
export function resolveTheme (override?: DeepPartial<Theme>): Theme {
  if (!override) return defaultTheme;
  const out = { ...defaultTheme } as Theme;
  for (const key of Object.keys(override) as (keyof Theme)[]) {
    const base = defaultTheme[key];
    const ov = override[key];
    if (base && typeof base === 'object' && ov && typeof ov === 'object') {
      // @ts-expect-error -- structural merge of matching nested groups
      out[key] = { ...base, ...ov };
    } else if (ov !== undefined) {
      // @ts-expect-error -- scalar override
      out[key] = ov;
    }
  }
  return out;
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? Partial<T[P]> : T[P];
};
