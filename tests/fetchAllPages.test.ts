import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllPages, PaginationError, type PageResponse } from '../src/services/fetchAllPages.ts';

type Row = { id: string; n: number };

function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({ id: `r${String(index).padStart(5, '0')}`, n: index }));
}

// A server over `rows` with a Max Rows cap; records every requested range.
function server(rows: Row[], maxRows = Number.POSITIVE_INFINITY) {
  const requests: Array<[number, number]> = [];
  const fetchPage = (from: number, to: number): Promise<PageResponse<Row>> => {
    requests.push([from, to]);
    const limit = Math.min(to - from + 1, maxRows);
    return Promise.resolve({ data: rows.slice(from, from + limit), error: null, count: rows.length });
  };
  return { fetchPage, requests };
}

describe('fetchAllPages', () => {
  it('reads a table smaller than one page in a single request', async () => {
    const { fetchPage, requests } = server(makeRows(7));
    const rows = await fetchAllPages('t', fetchPage, { pageSize: 10 });
    assert.equal(rows.length, 7);
    assert.deepEqual(requests, [[0, 9]]);
  });

  it('stops after exactly one full page without an extra request', async () => {
    const { fetchPage, requests } = server(makeRows(10));
    const rows = await fetchAllPages('t', fetchPage, { pageSize: 10 });
    assert.equal(rows.length, 10);
    assert.deepEqual(requests, [[0, 9]]);
  });

  it('reads every page in order when the table spans several pages', async () => {
    const all = makeRows(25);
    const { fetchPage, requests } = server(all);
    const rows = await fetchAllPages('t', fetchPage, { pageSize: 10 });
    assert.deepEqual(rows, all);
    assert.deepEqual(requests, [
      [0, 9],
      [10, 19],
      [20, 29],
    ]);
  });

  it('stays complete when the server cap is smaller than the page size', async () => {
    const all = makeRows(23);
    const { fetchPage, requests } = server(all, 4);
    const rows = await fetchAllPages('t', fetchPage, { pageSize: 500 });
    assert.deepEqual(rows, all);
    // Offsets advance by what the server actually returned.
    assert.deepEqual(
      requests.map(([from]) => from),
      [0, 4, 8, 12, 16, 20],
    );
  });

  it('returns an empty list for an empty table', async () => {
    const { fetchPage, requests } = server([]);
    assert.deepEqual(await fetchAllPages('t', fetchPage), []);
    assert.equal(requests.length, 1);
  });

  it('surfaces a page error instead of returning partial rows', async () => {
    let call = 0;
    const all = makeRows(30);
    await assert.rejects(
      fetchAllPages(
        'product variations',
        (from, to) => {
          call += 1;
          if (call === 2) return Promise.resolve({ data: null, error: { message: 'boom' }, count: null });
          return Promise.resolve({ data: all.slice(from, to + 1), error: null, count: all.length });
        },
        { pageSize: 10 },
      ),
      (error: unknown) =>
        error instanceof PaginationError && !error.concurrentChange && /product variations.*rows from 10.*boom/.test(error.message),
    );
    assert.equal(call, 2, 'query errors are not retried');
  });

  it('requires an exact count from the server', async () => {
    await assert.rejects(
      fetchAllPages('t', () => Promise.resolve({ data: makeRows(3), error: null, count: null })),
      /did not return a row count/,
    );
  });

  it('retries when a row is inserted mid-read (duplicate across pages) and returns a clean set', async () => {
    let rows = makeRows(20);
    let call = 0;
    const result = await fetchAllPages(
      't',
      (from, to) => {
        call += 1;
        if (call === 2) {
          // A new row sorts first, shifting everything right by one.
          rows = [{ id: 'a-new', n: -1 }, ...rows];
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null, count: rows.length - 1 });
        }
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null, count: rows.length });
      },
      { pageSize: 10 },
    );
    assert.equal(result.length, 21);
    assert.equal(new Set(result.map((row) => row.id)).size, 21);
    assert.ok(call > 3, 'the read was restarted');
  });

  it('retries when the count changes between pages and fails if it never settles', async () => {
    let total = 30;
    await assert.rejects(
      fetchAllPages(
        't',
        (from, to) => {
          total += 1;
          return Promise.resolve({ data: makeRows(total).slice(from, to + 1), error: null, count: total });
        },
        { pageSize: 10, maxAttempts: 3 },
      ),
      (error: unknown) => error instanceof PaginationError && error.concurrentChange && /try again/.test(error.message),
    );
  });

  it('treats an early empty page as missing rows (deleted mid-read) and never loops forever', async () => {
    let calls = 0;
    await assert.rejects(
      fetchAllPages(
        't',
        (from) => {
          calls += 1;
          return Promise.resolve({ data: from === 0 ? makeRows(10) : [], error: null, count: 25 });
        },
        { pageSize: 10, maxAttempts: 2 },
      ),
      /rows missing/,
    );
    assert.equal(calls, 4, 'two attempts of two requests each');
  });

  it('rejects a repeated id even on a single page', async () => {
    await assert.rejects(
      fetchAllPages(
        't',
        () =>
          Promise.resolve({
            data: [
              { id: 'x', n: 1 },
              { id: 'x', n: 2 },
            ],
            error: null,
            count: 2,
          }),
        { maxAttempts: 1 },
      ),
      /repeated or missing id/,
    );
  });
});
