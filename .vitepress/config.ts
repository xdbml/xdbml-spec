import { defineConfig } from 'vitepress'

// xDBML.org site configuration
// https://vitepress.dev/reference/site-config

// Base path for the site.
//
// When deployed to a GitHub Pages project site (https://xdbml.github.io/xdbml-spec/),
// asset URLs need to be prefixed with the repo name. When deployed to the custom
// domain (https://xdbml.org/), assets should resolve from the root.
//
// The deploy.yml workflow sets the SITE_BASE environment variable to control which
// mode we build in. Defaults to '/' for local development (`npm run docs:dev`).
const base = process.env.SITE_BASE || '/'

export default defineConfig({
  // Site metadata
  title: 'xDBML',
  titleTemplate: ':title -- xDBML',
  description: 'eXtended Database Markup Language -- one schema, many storage technologies, human and AI-readable.',
  lang: 'en-US',
  base,

  // srcDir defaults to the directory containing .vitepress/ -- the repo root.
  // Markdown files at the repo root (SPEC.md, GOVERNANCE.md, etc.) become
  // website pages via the rewrite rules below.

  // Where the build output goes
  outDir: '.vitepress/dist',

  // Files at the root that should NOT become website pages.
  // README.md is excluded because the website's landing page (index.md)
  // is hero-styled and supersedes the README for site visitors.
  // The README remains visible on GitHub for repo browsers.
  //
  // /playground/ and /parser/ are standalone Vite/TypeScript projects;
  // their READMEs and source files would otherwise be picked up by
  // VitePress as docs pages. The playground is published at /playground/
  // as a built static asset (see scripts/prepare-playground.mjs),
  // bypassing VitePress entirely.
  srcExclude: [
    'README.md',
    'LICENSE',
    'NOTICE',
    'CODE_OF_CONDUCT.md',
    'MAINTAINERS.md',
    'SECURITY.md',
    'node_modules/**',
    '.github/**',
    'playground/**',
    'parser/**',
  ],

  // Routing: map markdown source files to clean URLs.
  rewrites: {
    'GOVERNANCE.md':                'governance.md',
    'CONTRIBUTING.md':              'contributing.md',
    'xDBML_in_5_minutes.md':        'learn/index.md',
    'examples/README.md':           'examples/index.md',
    'grammar/test-cases.md':        'grammar/test-cases.md',
  },

  // Don't error on dead links during development; report them but build anyway.
  // Switch to false before a stable release if you want strict link checking.
  ignoreDeadLinks: true,

  // Clean URLs (no .html suffix in the browser)
  cleanUrls: true,

  // Use git timestamps for "last updated" display
  lastUpdated: true,

  // Theme configuration
  // https://vitepress.dev/reference/default-theme-config
  themeConfig: {
    logo: {
      light: '/logo/xdbml-mark.svg',
      dark:  '/logo/xdbml-mark.svg',
      alt:   'xDBML',
    },

    siteTitle: 'xDBML',

    // Top navigation
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Learn',
        items: [
          { text: '5-minute introduction',  link: '/learn/' },
          { text: 'Examples',                link: '/examples/' },
          { text: 'FAQ',                     link: '/faq' },
        ]
      },
      { text: 'Specification',
        items: [
          { text: 'All versions',   link: '/spec/' },
          { text: 'v0.1 (draft)',   link: '/spec/v0.1' },
          { text: 'Grammar',         link: '/grammar/' },
        ]
      },
      // Playground is a standalone Vue app published at /playground/, NOT
      // a VitePress page. The nav link is marked target='_blank' for two
      // reasons:
      //   1. It opens in a new tab, so the docs page the user came from
      //      stays open behind them.
      //   2. It bypasses VitePress's client-side SPA router. Without this,
      //      VitePress would try to resolve /playground/ as a Vue route
      //      and render the 404 page, since no .md source exists at that
      //      path. The static playground/index.html only gets served on a
      //      full page load.
      // `rel: 'noopener'` is the safer default for new-tab links.
      { text: 'Playground', link: '/playground/', target: '_blank', rel: 'noopener' },
      { text: 'Project',
        items: [
          { text: 'Governance',     link: '/governance' },
          { text: 'Contributing',   link: '/contributing' },
          { text: 'Ecosystem',      link: '/ecosystem' },
        ]
      },
    ],

    // Sidebars per top-level section
    sidebar: {
      '/spec/': [
        {
          text: 'Specification',
          items: [
            { text: 'All versions',           link: '/spec/' },
            { text: 'v0.1 (current draft)',   link: '/spec/v0.1' },
          ]
        },
        {
          text: 'Reference',
          items: [
            { text: 'Grammar (ANTLR4)',     link: '/grammar/' },
            { text: 'Grammar test cases',   link: '/grammar/test-cases' },
          ]
        }
      ],

      '/learn/': [
        {
          text: 'Learn xDBML',
          items: [
            { text: '5-minute introduction', link: '/learn/' },
            { text: 'Examples',               link: '/examples/' },
            { text: 'FAQ',                    link: '/faq' },
          ]
        }
      ],

      '/faq': [
        {
          text: 'Learn xDBML',
          items: [
            { text: '5-minute introduction', link: '/learn/' },
            { text: 'Examples',               link: '/examples/' },
            { text: 'FAQ',                    link: '/faq' },
          ]
        }
      ],

      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview',                  link: '/examples/' },
            { text: 'Blog (relational)',         link: '/examples/01-blog' },
            { text: 'E-commerce (polyglot)',     link: '/examples/02-ecommerce' },
            { text: 'IoT telemetry',             link: '/examples/03-iot-telemetry' },
            { text: 'Social graph (LPG)',        link: '/examples/04-social-graph' },
            { text: 'Healthcare (FHIR-style)',   link: '/examples/05-healthcare-fhir' },
            { text: 'Financial services',        link: '/examples/06-financial-services' },
          ]
        }
      ],

      '/governance': [
        {
          text: 'Project',
          items: [
            { text: 'Governance',     link: '/governance' },
            { text: 'Contributing',   link: '/contributing' },
            { text: 'Ecosystem',      link: '/ecosystem' },
          ]
        }
      ],

      '/contributing': [
        {
          text: 'Project',
          items: [
            { text: 'Governance',     link: '/governance' },
            { text: 'Contributing',   link: '/contributing' },
            { text: 'Ecosystem',      link: '/ecosystem' },
          ]
        }
      ],

      '/ecosystem': [
        {
          text: 'Project',
          items: [
            { text: 'Governance',     link: '/governance' },
            { text: 'Contributing',   link: '/contributing' },
            { text: 'Ecosystem',      link: '/ecosystem' },
          ]
        }
      ],

      '/grammar/': [
        {
          text: 'Specification',
          items: [
            { text: 'All versions',           link: '/spec/' },
            { text: 'v0.1 (current draft)',   link: '/spec/v0.1' },
          ]
        },
        {
          text: 'Reference',
          items: [
            { text: 'Grammar (ANTLR4)',     link: '/grammar/' },
            { text: 'Grammar test cases',   link: '/grammar/test-cases' },
          ]
        }
      ],
    },

    // Social and external links shown in the top right
    socialLinks: [
      { icon: 'github', link: 'https://github.com/xdbml/xdbml-spec' },
    ],

    // Footer
    footer: {
      message: 'Spec under Apache License 2.0 · Examples under CC0 1.0',
      copyright: '© 2026 IntegrIT SA/NV dba Hackolade and the xDBML contributors',
    },

    // Search (local, MiniSearch-powered)
    search: {
      provider: 'local',
      options: {
        detailedView: true,
        miniSearch: {
          searchOptions: {
            fuzzy: 0.2,
            prefix: true,
            boost: { title: 4, text: 2, titles: 1 }
          }
        }
      }
    },

    // Edit-on-GitHub link at the bottom of every page
    editLink: {
      pattern: 'https://github.com/xdbml/xdbml-spec/edit/main/:path',
      text: 'Suggest an edit on GitHub',
    },

    // Last-updated text
    lastUpdated: {
      text: 'Last updated',
      formatOptions: {
        dateStyle: 'medium',
        timeStyle: undefined,
      }
    },

    // Outline (right-rail TOC) configuration
    outline: {
      level: [2, 3],
      label: 'On this page'
    },

    docFooter: {
      prev: 'Previous',
      next: 'Next',
    },
  },

  // <head> additions -- site-wide defaults.
  // Per-page overrides for og:title, og:description, etc. are generated by
  // the transformPageData hook below, based on each page's frontmatter.
  head: [
    ['link',  { rel: 'icon', type: 'image/svg+xml', href: `${base}logo/xdbml-favicon.svg` }],

    // Browser-level cache control. HTML pages should always be re-validated
    // against the server so users see updates after each deploy without
    // needing a manual hard-refresh (Ctrl+F5). Hashed assets (CSS/JS/images
    // built by Vite) are immutable, so their cacheability is unaffected.
    //
    // `no-cache` is gentler than `no-store`: it allows the browser to keep
    // a copy in cache, but forces a conditional request (If-Modified-Since
    // / If-None-Match) before reuse. The server returns 304 Not Modified if
    // nothing changed, so the perceived latency cost is minimal while
    // freshness is guaranteed.
    //
    // Note: meta-tag cache-control is advisory; the GitHub Pages CDN may
    // still serve cached HTML for up to 10 minutes at the edge. This
    // fixes the browser-side caching only.
    ['meta',  { 'http-equiv': 'Cache-Control', content: 'no-cache, must-revalidate' }],
    ['meta',  { 'http-equiv': 'Pragma',        content: 'no-cache' }],
    ['meta',  { 'http-equiv': 'Expires',       content: '0' }],

    // Standard SEO meta
    ['meta',  { name: 'author',      content: 'IntegrIT SA/NV dba Hackolade and the xDBML contributors' }],
    ['meta',  { name: 'robots',      content: 'index, follow' }],
    ['meta',  { name: 'theme-color', content: '#1a4d7a' }],

    // Open Graph (site-wide defaults; transformPageData overrides per page)
    ['meta',  { property: 'og:type',        content: 'website' }],
    ['meta',  { property: 'og:site_name',   content: 'xDBML' }],
    ['meta',  { property: 'og:locale',      content: 'en_US' }],
    ['meta',  { property: 'og:image',       content: 'https://xdbml.org/logo/xdbml-social-card.svg' }],
    ['meta',  { property: 'og:image:width', content: '1200' }],
    ['meta',  { property: 'og:image:height', content: '630' }],
    ['meta',  { property: 'og:image:alt',   content: 'xDBML -- eXtended Database Markup Language' }],

    // Twitter Card
    ['meta',  { name: 'twitter:card',  content: 'summary_large_image' }],
    ['meta',  { name: 'twitter:image', content: 'https://xdbml.org/logo/xdbml-social-card.svg' }],

    // Structured data: describe xDBML as a creative work (a technical standard)
    // Helps search engines understand the project semantically.
    ['script', { type: 'application/ld+json' },
      JSON.stringify({
        '@context':    'https://schema.org',
        '@type':       'TechArticle',
        'name':        'xDBML -- eXtended Database Markup Language',
        'headline':    'xDBML -- eXtended Database Markup Language',
        'description': 'An open markup language for describing structured data and declarative metadata across heterogeneous storage technologies. Human-authorable, AI-readable, designed for the polyglot data stack.',
        'url':         'https://xdbml.org/',
        'image':       'https://xdbml.org/logo/xdbml-social-card.svg',
        'inLanguage':  'en-US',
        'license':     'https://www.apache.org/licenses/LICENSE-2.0',
        'isAccessibleForFree': true,
        'author': {
          '@type': 'Organization',
          'name':  'IntegrIT SA/NV dba Hackolade',
          'url':   'https://hackolade.com',
        },
        'publisher': {
          '@type': 'Organization',
          'name':  'xDBML project',
          'url':   'https://xdbml.org',
          'logo': {
            '@type': 'ImageObject',
            'url':   'https://xdbml.org/logo/xdbml-mark.svg',
          },
        },
        'keywords': 'dbml, data modeling, schema language, database schema, polyglot persistence, JSON Schema, Avro, MongoDB, AI-readable schema, open standard',
        'about': {
          '@type': 'Thing',
          'name':  'Data modeling',
        },
      })
    ],
  ],

  // Per-page SEO: derive title/description/canonical from each page's
  // frontmatter and inject them as og:* and twitter:* meta tags.
  // Frontmatter conventions:
  //   title:       page title (already used by VitePress)
  //   description: meta description and og:description
  // When frontmatter doesn't set these, we fall back to sensible site defaults.
  transformPageData(pageData) {
    const siteTitle = 'xDBML -- eXtended Database Markup Language';
    const siteDescription = 'eXtended Database Markup Language -- one schema, many storage technologies, human and AI-readable.';

    // Build absolute URL for this page (used by canonical and og:url).
    // pageData.relativePath is the source markdown path, e.g. 'spec/v0.1.md'.
    // pageData.filePath gives the same path. Strip the trailing .md and 'index'.
    const path = (pageData.relativePath || '')
      .replace(/\.md$/, '')
      .replace(/(^|\/)index$/, '$1');
    const canonical = `https://xdbml.org/${path}`;

    // Compose page-specific title and description.
    const fm = pageData.frontmatter || {};
    // If the page's own title already includes "xDBML", use it as-is; otherwise
    // append " -- xDBML" so the page is identifiable in shared/saved links.
    const pageTitle = !fm.title
      ? siteTitle
      : /xdbml/i.test(fm.title)
        ? fm.title
        : `${fm.title} -- xDBML`;
    const pageDescription = fm.description || siteDescription;

    // Push per-page meta tags. These appear AFTER the head[] entries above,
    // so they override the site-wide defaults for og:title, og:description,
    // og:url, twitter:title, twitter:description.
    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.push(
      ['link',  { rel: 'canonical',          href: canonical }],
      ['meta',  { name: 'description',       content: pageDescription }],
      ['meta',  { property: 'og:url',        content: canonical }],
      ['meta',  { property: 'og:title',      content: pageTitle }],
      ['meta',  { property: 'og:description', content: pageDescription }],
      ['meta',  { name: 'twitter:title',     content: pageTitle }],
      ['meta',  { name: 'twitter:description', content: pageDescription }],
    );
  },

  // Markdown rendering options
  markdown: {
    // Syntax highlighting theme
    theme: { light: 'github-light', dark: 'github-dark' },

    // Map xdbml and dbml language tags to sql for approximate highlighting
    // until a proper Shiki grammar is registered.
    languageAlias: {
      'xdbml': 'sql',
      'dbml':  'sql',
    },

    // Show line numbers in code blocks
    lineNumbers: false,

    // External links open in new tab and get rel=noopener noreferrer
    externalLinkIcon: true,
  },

  // Build hooks
  sitemap: {
    hostname: 'https://xdbml.org',
  },
})
