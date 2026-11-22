import type { Request } from 'express';
import type Database from 'better-sqlite3';
import { getCrewMetaForOg } from './crew';
import { escapeHtml } from './security';

export function resolveAppBaseUrl(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured) && !configured.includes('MY_APP_URL')) {
    return configured.replace(/\/+$/, '');
  }
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto =
    typeof protoHeader === 'string' && protoHeader.length > 0
      ? protoHeader.split(',')[0].trim()
      : req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${proto}://${Array.isArray(host) ? host[0] : host}`.replace(/\/+$/, '');
}

function replaceMetaTag(html: string, pattern: RegExp, replacement: string): string {
  if (pattern.test(html)) {
    return html.replace(pattern, replacement);
  }
  return html.replace('</head>', `  ${replacement}\n  </head>`);
}

export function injectOgMetaTags(
  htmlTemplate: string,
  req: Request,
  db: Database.Database,
  crewCode?: string
): string {
  const baseUrl = resolveAppBaseUrl(req);

  let title = 'BRAINPRINT — Same questions. Different minds.';
  let description =
    'Solo: Think Rare. Crew: Think Alike. Play the 7-question retro 16-bit personality & social sync arcade game.';
  let imagePath = '/og/default.png';
  let canonicalUrl = `${baseUrl}/`;

  if (crewCode) {
    const meta = getCrewMetaForOg(db, crewCode);
    if (meta) {
      const packLabel =
        meta.mode === 'mixed'
          ? 'Mixed Pack'
          : meta.packId === 'neon_coast'
            ? 'Neon Coast'
            : meta.packId === 'campus_chaos'
              ? 'Campus Chaos'
              : 'The Mix';
      title = `Join ${meta.name} on BRAINPRINT`;
      description = `Code ${meta.code} · ${packLabel} · ${meta.memberCount} joined. Answer 7 blind questions and see how synced your crew really is!`;
      imagePath =
        meta.mode === 'mixed' || !meta.packId ? '/og/the_mix.png' : `/og/${meta.packId}.png`;
      canonicalUrl = `${baseUrl}/crew/${encodeURIComponent(meta.code)}`;
    }
  }

  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeImg = escapeHtml(`${baseUrl}${imagePath}`);
  const safeUrl = escapeHtml(canonicalUrl);

  let html = htmlTemplate;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  html = replaceMetaTag(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${safeDesc}" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${safeTitle}" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${safeDesc}" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image" content="${safeImg}" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${safeUrl}" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+name="twitter:card"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:card" content="summary_large_image" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${safeTitle}" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${safeDesc}" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${safeImg}" />`
  );

  return html;
}
