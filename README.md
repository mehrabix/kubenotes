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

The `title`, `description`, and `pubDate` fields are required. `updatedDate` is optional. Markdown headings, links, lists, quotes, and fenced code blocks are supported. Images can be stored in `public/` and referenced by their site path, such as `![Diagram](/kubenotes/images/diagram.png)`.

## Commands

| Command | Action |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Build the static site into `dist/` |
| `npm run preview` | Preview the production build locally |

The site opens in light mode. Use the sun/moon button in the header to switch themes; your choice is saved in this browser.

## Deploy to GitHub Pages

The site is configured for the project URL `https://mehrabix.github.io/kubenotes/`. Pushing to `master` runs the GitHub Actions workflow in `.github/workflows/deploy.yml` and publishes the static build. GitHub Pages must use **GitHub Actions** as its deployment source.

If you move the site to a custom domain or another host, update `site` and `base` in `astro.config.mjs` to match that URL.

## Project structure

```text
src/
  content/
    blog/       Markdown articles
  pages/        Home, notes, article, and RSS routes
  layouts/      Article layout
  styles/       Global styles
```
