# kubenotes

A Markdown-first blog for practical notes on Kubernetes and cloud native systems. Built with Astro and rendered as a fast static site.

## Run locally

```sh
npm install
npm run dev
```

## Write a note

Create a `.md` file in `src/content/blog/`. The filename becomes the post URL.

```markdown
---
title: "A useful Kubernetes note"
description: "A short summary shown in the notes list and search previews."
pubDate: "2026-11-19"
---

Write the article here using standard Markdown.
```

The `title`, `description`, and `pubDate` fields are required. `updatedDate` is optional. Markdown headings, links, lists, quotes, and fenced code blocks are supported. Images can be stored in `public/` and referenced by their site path, such as `![Diagram](/images/diagram.png)`.

## Commands

| Command | Action |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Build the static site into `dist/` |
| `npm run preview` | Preview the production build locally |

Set `SITE_URL` to the canonical deployment URL when building for production. The default is `https://kubenotes.dev`.

## Project structure

```text
src/
  content/
    blog/       Markdown articles
  pages/        Home, notes, article, and RSS routes
  layouts/      Article layout
  styles/       Global styles
```
