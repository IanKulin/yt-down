const API_KEY = 'ec4f1fb57daf7d4e57aafcd8b8bdc9d2';
const APP_ID = 845;
const LOCALE_ID = 542;
const STREAMS_URL = 'https://api.maz.tv/v1/streams/anonymous';
const ITEM_FEED_URL = 'https://api.maz.tv/v1/item_feeds/list';

export function isBrollieUrl(url) {
  return typeof url === 'string' && url.includes('watch.brollie.com.au');
}

export async function parseBrollieUrl(url) {
  // Hash-based URL: extract cid and pcid from the hash fragment
  // e.g. #3226659-3327197/a2f4fbcf...-3452057-3554078/bfbb39aa...-3293945-3394881
  const hashMatch = url.match(/#([^/]+)\/([^/]+)/);
  if (hashMatch) {
    const cid = hashMatch[1];
    const pcid = hashMatch[2];
    return { cid, pcid };
  }

  // Slug-based URL: slug is the full path after /apps/<app_id>/
  // e.g. /apps/845/home/drama/kids → slug is "home/drama/kids"
  const pathOnly = url.split('?')[0].split('#')[0];
  const slugMatch = pathOnly.match(/\/apps\/\d+\/(.+)/);
  const slug = slugMatch ? slugMatch[1].replace(/\/$/, '') : pathOnly;
  return resolveSlug(slug);
}

export async function resolveSlug(slug) {
  const query = `device=tv&app_id=${APP_ID}&locale_id=${LOCALE_ID}&language=en&key=${API_KEY}&slug=${encodeURIComponent(slug)}&page=1&per_page=1`;

  const response = await fetch(`${ITEM_FEED_URL}?${query}`);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Brollie item_feeds API error (${response.status}): ${body}`
    );
  }

  const data = await response.json();
  const parent = data.parent;

  if (!parent) {
    throw new Error(
      `Brollie: no parent object in item_feeds response for slug "${slug}"`
    );
  }

  const cid = parent.cid;
  if (!cid) {
    throw new Error(`Brollie: no cid in item_feeds parent for slug "${slug}"`);
  }

  // pcid is the first segment of the lineage string
  // e.g. "3226659-3327197/abc-3452057-3554078/def-3293945-3394881" → "3226659-3327197"
  const lineage = typeof parent.lineage === 'string' ? parent.lineage : '';
  const pcid = lineage ? lineage.split('/')[0] : null;

  return { cid, pcid, title: parent.title ?? null };
}

export async function resolveStreamUrl(url) {
  const { cid, pcid } = await parseBrollieUrl(url);

  const body = {
    cid,
    progress: 0,
    platform: 'web',
    first_play: true,
    key: API_KEY,
    app_id: APP_ID,
    language: 'en',
    locale_id: LOCALE_ID,
  };

  if (pcid != null) {
    body.pcid = pcid;
  }

  const response = await fetch(STREAMS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Brollie streams API error (${response.status}): ${text}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Brollie: stream error — ${data.error}`);
  }

  const streamUrl = data.url || data.files?.m3u8;
  if (!streamUrl) {
    throw new Error('Brollie: no stream URL in API response');
  }

  const title = data.analytics3Config?.title ?? null;

  return { url: streamUrl, title };
}

export async function getBrollieMetadata(url) {
  // Hash-based URLs have no slug — cannot fetch metadata
  if (url.includes('#')) {
    return null;
  }

  const pathOnly = url.split('?')[0].split('#')[0];
  const slugMatch = pathOnly.match(/\/apps\/\d+\/(.+)/);
  const slug = slugMatch ? slugMatch[1].replace(/\/$/, '') : pathOnly;

  const { title } = await resolveSlug(slug);
  return { title };
}
