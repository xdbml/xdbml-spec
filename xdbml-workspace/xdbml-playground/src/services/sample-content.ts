/**
 * Sample xDBML documents shown in the playground.
 *
 * The default at startup is a small blog schema that exercises:
 *   - Containers (so the diagram has a group rectangle)
 *   - Three entities with foreign-key Refs (so the diagram has lines)
 *   - Notes, indexes, validation constraints (so users see the full
 *     setting vocabulary at a glance)
 *
 * Larger samples (polyglot e-commerce, social graph) ship in
 * SAMPLE_CATEGORIES for an Examples menu the header can wire up later.
 */

export const DEFAULT_SAMPLE_CONTENT = `xdbml: 0.1

Project blog {
  targets: PostgreSQL
}

Container blog_app [type: schema] {
  Note: 'Default application schema.'

  Entity users {
    id            int       [pk, increment]
    email         varchar   [unique, not null, maxLength: 255]
    display_name  varchar   [not null, maxLength: 80]
    created_at    timestamp [not null, default: \`CURRENT_TIMESTAMP\`]
  }

  Entity posts {
    id           int       [pk, increment]
    author_id    int       [not null]
    title        varchar   [not null, maxLength: 200]
    body         varchar   [not null]
    published_at timestamp
    created_at   timestamp [not null, default: \`CURRENT_TIMESTAMP\`]
  }

  Entity comments {
    id         int       [pk, increment]
    post_id    int       [not null]
    author_id  int       [not null]
    body       varchar   [not null, maxLength: 5000]
    created_at timestamp [not null, default: \`CURRENT_TIMESTAMP\`]
  }
}

Ref: blog_app.posts.author_id    > blog_app.users.id    [source: '0..*', target: '1..1']
Ref: blog_app.comments.post_id   > blog_app.posts.id    [source: '0..*', target: '1..1']
Ref: blog_app.comments.author_id > blog_app.users.id    [source: '0..*', target: '1..1']
`;

export interface SampleCategory {
  readonly name: string;
  readonly description: string;
  readonly content: string;
}

export const SAMPLE_CATEGORIES: readonly SampleCategory[] = [
  {
    name: 'Minimal blog',
    description: 'A relational blog schema. The simplest first-look example.',
    content: DEFAULT_SAMPLE_CONTENT,
  },
] as const;
