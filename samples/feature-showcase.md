---
title: Markdown Viewer Feature Showcase
author: Kenneth
version: 1.0.0
tags:
  - markdown
  - test
  - frontmatter
status: draft
reviewers:
  - name: Alex
    role: Engineer
  - name: Sam
    role: Designer
created_at: 2026-02-20
custom:
  nested:
    enabled: true
    count: 3
---

# Markdown Viewer Feature Showcase

This document exercises all key viewer features.

## Quick Navigation

- [Jump to Task List](#task-list)
- [Jump to Table](#table)
- [Jump to Code Blocks](#code-blocks)
- [Jump to Local Link](#local-link)

## Typography

Paragraph with **bold**, *italic*, ***bold italic***, ~~strikethrough~~, and `inline code`.

> Blockquote test: this should render with a distinct quote style.

Autolink test: https://example.com/docs

## Task List

- [x] Render GFM task list items
- [x] Support checked and unchecked states
- [ ] Confirm visual spacing looks good

## Table

| Feature | Expected | Status |
|---|---|---|
| Front matter panel | Distinct block at top | ✅ |
| Outline links | Click to scroll to headings | ✅ |
| Local file links | Open in app | ✅ |
| External links | Open in browser | ✅ |

## Lists

1. Ordered item one
2. Ordered item two
3. Ordered item three

- Unordered item
- Another item
  - Nested item A
  - Nested item B

## Code Blocks

```ts
interface User {
  id: string;
  name: string;
}

const user: User = { id: "u_123", name: "Kenneth" };
console.log(user);
```

```bash
# shell block
bun run dev
bun run build
```

```json
{
  "name": "markdown-viewer",
  "features": ["gfm", "front-matter", "outline"],
  "ok": true
}
```

## Local Link

Open another markdown file in-app: [Local linked file](./linked-target.md)

## External Link

Open in browser: [OpenAI](https://openai.com)

## Image

Remote image test:

![Placeholder](https://picsum.photos/640/220)

## Horizontal Rule

---

## Final Section

If this section appears in the outline and anchor links work, navigation is good.

## Heading Depth Test

# H1 Level Example

Content under H1.

## H2 Level Example

Content under H2.

### H3 Level Example

Content under H3.

#### H4 Level Example

Content under H4.

##### H5 Level Example

Content under H5.

## Mixed Nested Heading Sequence

### Section A

#### Section A.1

##### Section A.1.a

### Section B

#### Section B.1

##### Section B.1.a

## Non-Markdown Local Link

Open local non-markdown file with OS default app:
[Open local .txt in default app](./non-markdown-target.txt)
