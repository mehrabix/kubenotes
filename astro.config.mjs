// @ts-check

import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
	site: 'https://mehrabix.github.io',
	base: '/kubenotes',
	integrations: [sitemap()],
});
