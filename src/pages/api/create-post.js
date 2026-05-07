import { writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

function sanitizeFileName(name) {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function inferMediaKind(value) {
	const normalized = String(value).toLowerCase();
	if (normalized.trim().startsWith('<')) return 'embed';
	if (/\.(png|jpe?g|webp|avif|gif)(\?.*)?$/.test(normalized)) return 'image';
	if (/\.(mp4|webm|ogg)(\?.*)?$/.test(normalized)) return 'video';
	if (/\.(mp3|wav|m4a|ogg)(\?.*)?$/.test(normalized)) return 'audio';
	if (/\.(pdf)(\?.*)?$/.test(normalized)) return 'pdf';
	if (/\.(docx?|xlsx?|pptx?)(\?.*)?$/.test(normalized)) return 'document';
	if (/^(https?:\/\/|www\.)/.test(normalized)) return 'link';
	return 'embed';
}

function getMimeType(value) {
	const normalized = String(value).toLowerCase();
	if (/\.(mp4)(\?.*)?$/.test(normalized)) return 'video/mp4';
	if (/\.(webm)(\?.*)?$/.test(normalized)) return 'video/webm';
	if (/\.(ogg)(\?.*)?$/.test(normalized)) return 'video/ogg';
	if (/\.(mp3)(\?.*)?$/.test(normalized)) return 'audio/mpeg';
	if (/\.(wav)(\?.*)?$/.test(normalized)) return 'audio/wav';
	return 'application/octet-stream';
}

function formatShortDate(date) {
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	const yy = String(date.getFullYear()).slice(-2);
	return `${mm}/${dd}/${yy}`;
}

function formatPostTimestamp(date) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/Los_Angeles',
		hour12: false,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(date);

	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}

function renderMediaItem(media) {
	if (!media || !media.value) return '';
	const kind = media.kind || inferMediaKind(media.value);
	const value = media.value;
	const name = media.name || 'File';

	if (kind === 'image') {
		return `![Image](${value})`;
	}
	if (kind === 'video') {
		return `<video controls><source src="${value}" type="${getMimeType(value)}"></video>`;
	}
	if (kind === 'audio') {
		return `<audio controls><source src="${value}" type="${getMimeType(value)}"></audio>`;
	}
	if (kind === 'pdf' || kind === 'document') {
		return `[${name}](${value})`;
	}
	if (kind === 'embed') {
		return value;
	}
	return `[${name}](${value})`;
}

export async function POST({ request }) {
	try {
		const formData = await request.formData();
		const title = String(formData.get('title') || '');
		const summary = String(formData.get('summary') || '');
		const body = String(formData.get('body') || '');
		const selectedTagsRaw = String(formData.get('tags') || '');
		const selectedTags = selectedTagsRaw
			.split(',')
			.map(tag => tag.trim().replace(/^['"]|['"]$/g, ''))
			.filter(Boolean);
		const mediaItems = JSON.parse(String(formData.get('mediaItems') || '[]'));
		const mediaFiles = formData.getAll('mediaFiles');

		const date = formatPostTimestamp(new Date());

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

		const combinedMedia = [];
		if (Array.isArray(mediaItems)) {
			for (const item of mediaItems) {
				if (!item) continue;
				if (typeof item === 'string') {
					combinedMedia.push({ value: item, kind: inferMediaKind(item) });
				} else if (item.value) {
					combinedMedia.push({ value: item.value, kind: item.kind || inferMediaKind(item.value) });
				}
			}
		}

		const uploadsDir = join(process.cwd(), 'public', 'uploads');
		if (!existsSync(uploadsDir)) {
			mkdirSync(uploadsDir, { recursive: true });
		}

		const savedFileItems = [];
		for (const file of mediaFiles) {
			if (file instanceof File && file.name && file.size > 0) {
				const savedName = `${Date.now()}-${sanitizeFileName(file.name)}`;
				const filePath = join(uploadsDir, savedName);
				const buffer = Buffer.from(await file.arrayBuffer());
				writeFileSync(filePath, buffer);
				savedFileItems.push({ value: `/uploads/${savedName}`, kind: inferMediaKind(file.name), name: file.name });
			}
		}

		combinedMedia.push(...savedFileItems);

		let fullBody = body;
		for (const mediaItem of combinedMedia) {
			const mediaMarkdown = renderMediaItem(mediaItem);
			if (mediaMarkdown) {
				fullBody += `\n\n${mediaMarkdown}`;
			}
		}

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