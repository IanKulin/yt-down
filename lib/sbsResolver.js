const AUTH_HOST = 'https://auth.sbs.com.au';
const PLAYBACK_HOST = 'https://playback.pr.sbsod.com';
const CATALOGUE_HOST = 'https://catalogue.pr.sbsod.com';
const AUTH_API_KEY = '49a46461-b9eb-4904-b519-176c59c386ef';

export function isSbsUrl(url) {
  return (
    typeof url === 'string' &&
    /sbs\.com\.au\/ondemand\//i.test(url) &&
    /\/\d+\/?$/.test(url)
  );
}

export function extractMpxId(url) {
  if (/^\d+$/.test(url)) return url;
  const match = url.match(/\/(\d+)\/?$/);
  if (match) return match[1];
  throw new Error(`Could not extract MPX media ID from: ${url}`);
}

export async function login(email, password) {
  const response = await fetch(`${AUTH_HOST}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': AUTH_API_KEY,
    },
    body: JSON.stringify({
      email,
      password,
      deviceName: 'Chrome - Mac OS X',
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`SBS login failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.accessToken;
}

export async function getStream(mpxId, accessToken) {
  const response = await fetch(`${PLAYBACK_HOST}/stream/${mpxId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept-Language': 'en',
    },
    body: JSON.stringify({
      deviceClass: 'web',
      advertising: {
        headerBidding: true,
        telariaID: '',
        ozTamSessionID: crypto.randomUUID(),
        subtitle: '',
        resume: false,
        liverampIDs: [],
      },
      streamOptions: { audio: 'demuxed' },
      streamProviders: ['HLS'],
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('SBS: unauthorised — check your credentials.');
    }
    if (response.status === 403) {
      const geoHeader = response.headers.get('x-error-reason');
      if (geoHeader === 'geo-blocked') {
        throw new Error('SBS: content is geo-restricted to Australia.');
      }
      throw new Error('SBS: forbidden (403).');
    }
    if (response.status === 404) {
      throw new Error(`SBS: content not found for MPX ID ${mpxId}.`);
    }
    const body = await response.text().catch(() => '');
    throw new Error(`SBS playback API error (${response.status}): ${body}`);
  }

  return response.json();
}

export async function resolveHlsUrl(url, email, password) {
  if (!email || !password) {
    throw new Error('SBS credentials not configured — add them in Settings.');
  }

  const mpxId = extractMpxId(url);
  const accessToken = await login(email, password);
  const streamData = await getStream(mpxId, accessToken);

  for (const provider of streamData.streamProviders ?? []) {
    if (provider.type === 'HLS' && provider.url) {
      return provider.url;
    }
  }

  throw new Error('SBS: no HLS stream URL found in playback response.');
}

export async function getSbsMetadata(mpxId) {
  const response = await fetch(`${CATALOGUE_HOST}/mpx-media/${mpxId}`);

  if (!response.ok) {
    throw new Error(
      `SBS catalogue API error (${response.status}) for MPX ID ${mpxId}`
    );
  }

  const data = await response.json();
  return {
    title: data.title,
    seriesTitle: data.seriesTitle,
    seasonNumber: data.seasonNumber,
    episodeNumber: data.episodeNumber,
    duration: data.duration,
    description: data.description,
  };
}
