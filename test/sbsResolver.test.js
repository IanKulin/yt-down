import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import {
  isSbsUrl,
  extractMpxId,
  login,
  getStream,
  resolveHlsUrl,
  getSbsMetadata,
} from '../lib/sbsResolver.js';

const SAMPLE_SBS_URL =
  'https://www.sbs.com.au/ondemand/watch/normal-people/2225048643868';
const SAMPLE_TV_SERIES_URL =
  'https://www.sbs.com.au/ondemand/tv-series/birds-eye-view/season-1/birds-eye-view-s1-ep1/2435020867559';
const SAMPLE_MPX_ID = '2225048643868';
const SAMPLE_ACCESS_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.sample.token';
const SAMPLE_HLS_URL =
  'https://sbs-vod-prod-01.akamaized.net/content/2225048643868/hls/index.m3u8';

let originalFetch;

function makeFetchMock(responses) {
  let callIndex = 0;
  return mock.fn(async (_url) => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      headers: {
        get: (name) => response.headers?.[name] ?? null,
      },
      json: async () => response.body,
      text: async () => JSON.stringify(response.body ?? {}),
    };
  });
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.reset();
});

describe('isSbsUrl', () => {
  it('returns true for an SBS watch URL', () => {
    assert.strictEqual(isSbsUrl(SAMPLE_SBS_URL), true);
  });

  it('returns true for a tv-series URL', () => {
    assert.strictEqual(isSbsUrl(SAMPLE_TV_SERIES_URL), true);
  });

  it('returns true for a movie URL (ID directly after /watch/)', () => {
    assert.strictEqual(
      isSbsUrl('https://www.sbs.com.au/ondemand/watch/2284433987918'),
      true
    );
  });

  it('returns true for minimal SBS watch path', () => {
    assert.strictEqual(
      isSbsUrl('https://www.sbs.com.au/ondemand/watch/foo/12345'),
      true
    );
  });

  it('returns false for a non-SBS URL', () => {
    assert.strictEqual(isSbsUrl('https://www.youtube.com/watch?v=abc'), false);
  });

  it('returns false for an SBS URL without a numeric ID', () => {
    assert.strictEqual(
      isSbsUrl('https://www.sbs.com.au/ondemand/browse'),
      false
    );
  });

  it('returns false for a non-string', () => {
    assert.strictEqual(isSbsUrl(null), false);
    assert.strictEqual(isSbsUrl(undefined), false);
    assert.strictEqual(isSbsUrl(42), false);
  });
});

describe('extractMpxId', () => {
  it('extracts numeric ID from a watch URL', () => {
    assert.strictEqual(extractMpxId(SAMPLE_SBS_URL), SAMPLE_MPX_ID);
  });

  it('returns the input unchanged when already a numeric ID', () => {
    assert.strictEqual(extractMpxId(SAMPLE_MPX_ID), SAMPLE_MPX_ID);
  });

  it('extracts ID from URL with different slug', () => {
    assert.strictEqual(
      extractMpxId('https://www.sbs.com.au/ondemand/watch/some-show/9876543'),
      '9876543'
    );
  });

  it('extracts ID from a tv-series URL', () => {
    assert.strictEqual(extractMpxId(SAMPLE_TV_SERIES_URL), '2435020867559');
  });

  it('extracts ID from a movie URL (no slug, ID directly after /watch/)', () => {
    assert.strictEqual(
      extractMpxId('https://www.sbs.com.au/ondemand/watch/2284433987918'),
      '2284433987918'
    );
  });

  it('throws for a non-numeric non-watch-URL string', () => {
    assert.throws(
      () => extractMpxId('https://www.sbs.com.au/ondemand/browse'),
      /Could not extract MPX media ID/
    );
  });
});

describe('login', () => {
  it('returns accessToken on success', async () => {
    globalThis.fetch = makeFetchMock([
      { body: { accessToken: SAMPLE_ACCESS_TOKEN, idToken: 'id.token' } },
    ]);

    const token = await login('user@example.com', 'password123');
    assert.strictEqual(token, SAMPLE_ACCESS_TOKEN);
  });

  it('throws on non-OK response', async () => {
    globalThis.fetch = makeFetchMock([
      { ok: false, status: 401, body: { message: 'Invalid credentials' } },
    ]);

    await assert.rejects(
      () => login('bad@user.com', 'wrong'),
      /SBS login failed \(401\)/
    );
  });

  it('sends the correct headers and body', async () => {
    let capturedRequest;
    globalThis.fetch = mock.fn(async (url, options) => {
      capturedRequest = { url, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({ accessToken: 'tok', idToken: 'id' }),
      };
    });

    await login('user@example.com', 'pass');

    assert.ok(capturedRequest.url.includes('/login'));
    assert.strictEqual(
      capturedRequest.options.headers['x-api-key'],
      '49a46461-b9eb-4904-b519-176c59c386ef'
    );
    const body = JSON.parse(capturedRequest.options.body);
    assert.strictEqual(body.email, 'user@example.com');
    assert.strictEqual(body.password, 'pass');
    assert.ok(body.deviceName);
  });
});

describe('getStream', () => {
  const streamResponse = {
    streamProviders: [
      { type: 'HLS', url: SAMPLE_HLS_URL },
      { type: 'GoogleDAI', contentSourceID: 'x' },
    ],
  };

  it('returns the stream response on success', async () => {
    globalThis.fetch = makeFetchMock([{ body: streamResponse }]);

    const result = await getStream(SAMPLE_MPX_ID, SAMPLE_ACCESS_TOKEN);
    assert.deepStrictEqual(result, streamResponse);
  });

  it('throws an unauthorised error on 401', async () => {
    globalThis.fetch = makeFetchMock([{ ok: false, status: 401 }]);

    await assert.rejects(
      () => getStream(SAMPLE_MPX_ID, 'bad-token'),
      /SBS: unauthorised/
    );
  });

  it('throws a geo-block error on 403 with geo-blocked header', async () => {
    globalThis.fetch = makeFetchMock([
      {
        ok: false,
        status: 403,
        headers: { 'x-error-reason': 'geo-blocked' },
      },
    ]);

    await assert.rejects(
      () => getStream(SAMPLE_MPX_ID, SAMPLE_ACCESS_TOKEN),
      /geo-restricted to Australia/
    );
  });

  it('throws a not-found error on 404', async () => {
    globalThis.fetch = makeFetchMock([{ ok: false, status: 404 }]);

    await assert.rejects(
      () => getStream('99999', SAMPLE_ACCESS_TOKEN),
      /content not found for MPX ID 99999/
    );
  });
});

describe('resolveHlsUrl', () => {
  it('returns the HLS URL on success', async () => {
    globalThis.fetch = makeFetchMock([
      { body: { accessToken: SAMPLE_ACCESS_TOKEN } },
      {
        body: {
          streamProviders: [{ type: 'HLS', url: SAMPLE_HLS_URL }],
        },
      },
    ]);

    const url = await resolveHlsUrl(
      SAMPLE_SBS_URL,
      'user@example.com',
      'password'
    );
    assert.strictEqual(url, SAMPLE_HLS_URL);
  });

  it('throws when credentials are missing', async () => {
    await assert.rejects(
      () => resolveHlsUrl(SAMPLE_SBS_URL, '', ''),
      /SBS credentials not configured/
    );
  });

  it('throws when no HLS provider is in the response', async () => {
    globalThis.fetch = makeFetchMock([
      { body: { accessToken: SAMPLE_ACCESS_TOKEN } },
      { body: { streamProviders: [{ type: 'GoogleDAI' }] } },
    ]);

    await assert.rejects(
      () => resolveHlsUrl(SAMPLE_SBS_URL, 'user@example.com', 'password'),
      /no HLS stream URL found/
    );
  });
});

describe('getSbsMetadata', () => {
  const catalogueResponse = {
    title: 'Episode 8',
    seriesTitle: 'Normal People',
    seasonNumber: 1,
    episodeNumber: 8,
    duration: 'PT42M20S',
    description: 'A coming-of-age story.',
    genres: ['Drama'],
  };

  it('returns the expected metadata fields', async () => {
    globalThis.fetch = makeFetchMock([{ body: catalogueResponse }]);

    const meta = await getSbsMetadata(SAMPLE_MPX_ID);

    assert.strictEqual(meta.title, 'Episode 8');
    assert.strictEqual(meta.seriesTitle, 'Normal People');
    assert.strictEqual(meta.seasonNumber, 1);
    assert.strictEqual(meta.episodeNumber, 8);
    assert.strictEqual(meta.duration, 'PT42M20S');
    assert.strictEqual(meta.description, 'A coming-of-age story.');
  });

  it('does not include fields outside the defined set', async () => {
    globalThis.fetch = makeFetchMock([{ body: catalogueResponse }]);

    const meta = await getSbsMetadata(SAMPLE_MPX_ID);
    assert.strictEqual(meta.genres, undefined);
  });

  it('throws on non-OK response', async () => {
    globalThis.fetch = makeFetchMock([{ ok: false, status: 404 }]);

    await assert.rejects(
      () => getSbsMetadata('99999'),
      /SBS catalogue API error \(404\)/
    );
  });
});
