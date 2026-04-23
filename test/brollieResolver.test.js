import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import {
  isBrollieUrl,
  parseBrollieUrl,
  resolveSlug,
  resolveStreamUrl,
  getBrollieMetadata,
} from '../lib/brollieResolver.js';

const SLUG_URL = 'https://watch.brollie.com.au/apps/845/home/drama/kids';
const HASH_URL =
  'https://watch.brollie.com.au/apps/845/3226659-3327197?mode=details#3226659-3327197/a2f4fbcf33028dc3d07a3f641dc360cb-3452057-3554078/bfbb39aad2a7d295f126c4b3efd26ab8-3293945-3394881';
const SAMPLE_HLS_URL = 'https://cdn.brollie.com.au/content/kids/hls/index.m3u8';

let originalFetch;

function makeFetchMock(responses) {
  let callIndex = 0;
  return mock.fn(async (_url, _options) => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
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

describe('isBrollieUrl', () => {
  it('returns true for a slug-based URL', () => {
    assert.strictEqual(isBrollieUrl(SLUG_URL), true);
  });

  it('returns true for a hash-based URL', () => {
    assert.strictEqual(isBrollieUrl(HASH_URL), true);
  });

  it('returns false for a YouTube URL', () => {
    assert.strictEqual(
      isBrollieUrl('https://www.youtube.com/watch?v=abc'),
      false
    );
  });

  it('returns false for null', () => {
    assert.strictEqual(isBrollieUrl(null), false);
  });

  it('returns false for a non-string', () => {
    assert.strictEqual(isBrollieUrl(42), false);
    assert.strictEqual(isBrollieUrl(undefined), false);
  });
});

describe('parseBrollieUrl — hash path', () => {
  it('extracts cid and pcid from hash without an API call', async () => {
    const { cid, pcid } = await parseBrollieUrl(HASH_URL);
    assert.strictEqual(cid, '3226659-3327197');
    assert.strictEqual(
      pcid,
      'a2f4fbcf33028dc3d07a3f641dc360cb-3452057-3554078'
    );
  });

  it('does not call fetch for hash URLs', async () => {
    const fetchMock = mock.fn();
    globalThis.fetch = fetchMock;
    await parseBrollieUrl(HASH_URL);
    assert.strictEqual(fetchMock.mock.calls.length, 0);
  });
});

describe('parseBrollieUrl — slug path', () => {
  it('calls resolveSlug and returns cid and pcid', async () => {
    globalThis.fetch = makeFetchMock([
      {
        body: {
          parent: {
            cid: 'slug-cid-123',
            title: 'Kids Drama',
            lineage: 'parent-pcid-456/child-identifier',
          },
        },
      },
    ]);

    const { cid, pcid } = await parseBrollieUrl(SLUG_URL);
    assert.strictEqual(cid, 'slug-cid-123');
    assert.strictEqual(pcid, 'parent-pcid-456');
  });
});

describe('resolveSlug', () => {
  it('returns cid, pcid and title on success', async () => {
    globalThis.fetch = makeFetchMock([
      {
        body: {
          parent: {
            cid: 'cid-abc',
            title: 'Kids',
            lineage: 'pcid-xyz/child-id',
          },
        },
      },
    ]);

    const result = await resolveSlug('home/kids');
    assert.strictEqual(result.cid, 'cid-abc');
    assert.strictEqual(result.pcid, 'pcid-xyz');
    assert.strictEqual(result.title, 'Kids');
  });

  it('returns null pcid when lineage is absent', async () => {
    globalThis.fetch = makeFetchMock([
      {
        body: {
          parent: { cid: 'cid-abc', title: 'Kids' },
        },
      },
    ]);

    const result = await resolveSlug('home/kids');
    assert.strictEqual(result.pcid, null);
  });

  it('throws when parent is missing', async () => {
    globalThis.fetch = makeFetchMock([{ body: {} }]);

    await assert.rejects(() => resolveSlug('home/kids'), /no parent object/);
  });

  it('throws when cid is missing', async () => {
    globalThis.fetch = makeFetchMock([
      { body: { parent: { title: 'Kids' } } },
    ]);

    await assert.rejects(() => resolveSlug('home/kids'), /no cid/);
  });

  it('throws on non-OK response', async () => {
    globalThis.fetch = makeFetchMock([{ ok: false, status: 500 }]);

    await assert.rejects(
      () => resolveSlug('home/kids'),
      /Brollie item_feeds API error \(500\)/
    );
  });
});

describe('resolveStreamUrl', () => {
  it('returns the HLS URL and title from the url field', async () => {
    // hash URL so no slug fetch needed
    globalThis.fetch = makeFetchMock([
      {
        body: {
          url: SAMPLE_HLS_URL,
          analytics3Config: { title: 'Girl Asleep' },
        },
      },
    ]);

    const result = await resolveStreamUrl(HASH_URL);
    assert.strictEqual(result.url, SAMPLE_HLS_URL);
    assert.strictEqual(result.title, 'Girl Asleep');
  });

  it('returns the HLS URL from files.m3u8 when url is absent', async () => {
    globalThis.fetch = makeFetchMock([
      { body: { files: { m3u8: SAMPLE_HLS_URL } } },
    ]);

    const result = await resolveStreamUrl(HASH_URL);
    assert.strictEqual(result.url, SAMPLE_HLS_URL);
    assert.strictEqual(result.title, null);
  });

  it('throws when the response contains an error field', async () => {
    globalThis.fetch = makeFetchMock([
      { body: { error: 'content unavailable' } },
    ]);

    await assert.rejects(
      () => resolveStreamUrl(HASH_URL),
      /Brollie: stream error — content unavailable/
    );
  });

  it('throws when no stream URL is present', async () => {
    globalThis.fetch = makeFetchMock([{ body: {} }]);

    await assert.rejects(
      () => resolveStreamUrl(HASH_URL),
      /Brollie: no stream URL in API response/
    );
  });

  it('throws on non-OK streams response', async () => {
    globalThis.fetch = makeFetchMock([{ ok: false, status: 403 }]);

    await assert.rejects(
      () => resolveStreamUrl(HASH_URL),
      /Brollie streams API error \(403\)/
    );
  });
});

describe('getBrollieMetadata', () => {
  it('returns title for a slug-based URL', async () => {
    globalThis.fetch = makeFetchMock([
      {
        body: {
          parent: {
            cid: 'cid-abc',
            title: 'Kids Drama',
            lineage: 'parent-pcid/child-id',
          },
        },
      },
    ]);

    const meta = await getBrollieMetadata(SLUG_URL);
    assert.strictEqual(meta.title, 'Kids Drama');
  });

  it('returns null for a hash-based URL', async () => {
    const result = await getBrollieMetadata(HASH_URL);
    assert.strictEqual(result, null);
  });
});
