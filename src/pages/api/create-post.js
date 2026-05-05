import { writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

export async function POST({ request }) {
	try {
		const formData = await request.formData();
		const title = formData.get('title');
		const summary = formData.get('summary');
		const body = formData.get('body');
		const selectedTags = formData.get('tags').split(',').map(tag => tag.trim().replace(/^['"]|['"]$/g, ''));
		const imageUrl = formData.get('imageUrl');
		const videoUrl = formData.get('videoUrl');
		const gifUrl = formData.get('gifUrl');
		const musicUrl = formData.get('musicUrl');
		const docUrl = formData.get('docUrl');

		const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

		// Find next post number
		const blogpostsDir = join(process.cwd(), 'src', 'blogposts');
		const files = readdirSync(blogpostsDir).filter(file => file.startsWith('post') && file.endsWith('.md'));
		const postNumbers = files.map(file => {
			const match = file.match(/post(\d+)\.md$/);
			return match ? parseInt(match[1]) : 0;
		});
		const nextPostNumber = Math.max(...postNumbers, 0) + 1;
		const filename = `post${nextPostNumber.toString().padStart(5, '0')}.md`;

		let frontmatter = `---
title: "${title}"
date_posted: "${date}"
tags: [${selectedTags.map(tag => `"${tag}"`).join(', ')}]
summary: "${summary}"
---

`;

		let fullBody = body;

		// Add embeds
		if (imageUrl) fullBody += `\n\n![Image](${imageUrl})`;
		if (videoUrl) fullBody += `\n\n<video controls><source src="${videoUrl}" type="video/mp4"></video>`;
		if (gifUrl) fullBody += `\n\n![GIF](${gifUrl})`;
		if (musicUrl) fullBody += `\n\n<audio controls><source src="${musicUrl}" type="audio/mpeg"></audio>`;
		if (docUrl) fullBody += `\n\n[Document](${docUrl})`;

		const content = frontmatter + fullBody;
		const filePath = join(blogpostsDir, filename);

		writeFileSync(filePath, content, 'utf8');

		return new Response(JSON.stringify({
			success: true,
			message: 'Post created successfully!',
			filename: filename
		}), {
			status: 200,
			headers: {
				'Content-Type': 'application/json'
			}
		});

	} catch (error) {
		console.error('Error creating post:', error);
		return new Response(JSON.stringify({
			success: false,
			message: 'Failed to create post: ' + error.message
		}), {
			status: 500,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}
}