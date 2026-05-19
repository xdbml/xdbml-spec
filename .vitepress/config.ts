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
  titleTemplate: ':title — xDBML',
  description: 'eXtended Database Markup Language — one schema, many storage technologies, human and AI-readable.',
  lang: 'en-US',
  base,

  // srcDir defaults to the directory containing .vitepress/ — the repo root.
  // Markdown files at the repo root (SPEC.md, GOVERNANCE.md, etc.) become
  // website pages via the rewrite rules below.

  // Where the build output goes
  outDir: '.vitepress/dist',

  // Files at the root that should NOT become website pages.
  // README.md is excluded because the website's landing page (index.md)
  // is hero-styled and supersedes the README for site visitors.
  // The README remains visible on GitHub for repo browsers.
  srcExclude: [
    'README.md',
    'LICENSE',
    'NOTICE',
    'CODE_OF_CONDUCT.md',
    'MAINTAINERS.md',
    'SECURITY.md',
    'node_modules/**',
    '.github/**',
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
        ]
      },
      { text: 'Specification',
        items: [
          { text: 'All versions',   link: '/spec/' },
          { text: 'v0.1 (draft)',   link: '/spec/v0.1' },
          { text: 'Grammar',         link: '/grammar/' },
        ]
      },
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

  // <head> additions for SEO and social card
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo/xdbml-favicon.svg` }],

    // Open Graph
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://xdbml.org/' }],
    ['meta', { property: 'og:title', content: 'xDBML — eXtended Database Markup Language' }],
    ['meta', { property: 'og:description', content: 'One schema. Many storage technologies. Human and AI-readable.' }],
    ['meta', { property: 'og:image', content: 'https://xdbml.org/logo/xdbml-social-card.svg' }],

    // Twitter Card
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'xDBML — eXtended Database Markup Language' }],
    ['meta', { name: 'twitter:description', content: 'One schema. Many storage technologies. Human and AI-readable.' }],
    ['meta', { name: 'twitter:image', content: 'https://xdbml.org/logo/xdbml-social-card.svg' }],

    // Theme color (Hackolade-adjacent navy)
    ['meta', { name: 'theme-color', content: '#1a4d7a' }],
  ],

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
