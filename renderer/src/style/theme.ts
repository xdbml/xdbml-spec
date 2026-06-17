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
}

export const defaultTheme: Theme = {
  fontSans:
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontMono: 'ui-monospace, SFMono-Regular, Menlo, monospace',

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
