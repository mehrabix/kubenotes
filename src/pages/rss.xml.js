import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE_BASE, SITE_DESCRIPTION, SITE_TITLE } from '../consts';

export async function GET(context) {
	const posts = await getCollection('blog');
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site ? new URL(SITE_BASE, context.site).toString() : context.site,
		items: posts.map((post) => ({
			...post.data,
			link: `${SITE_BASE}blog/${post.id}/`,
		})),
	});
}
