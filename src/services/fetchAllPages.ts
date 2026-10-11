// Complete, verifiable pagination for Supabase/PostgREST reads.
//
// PostgREST silently caps every response at the project's "Max Rows" setting,
// so an unpaginated select can return a truncated table with no error. This
// helper pages through a query until it has every row the server says exists:
//   - every page asks for an exact count, and loading stops only once that
//     many rows have arrived, so it does not depend on knowing the Max Rows
//     value (a server cap smaller than PAGE_SIZE just means smaller pages);
//   - the next offset advances by the rows actually returned, never by the
//     requested page size, so a capped page cannot skip rows;
//   - callers must order by a unique tie-breaker (id) so offsets are stable;
//   - if the table changes while loading (count differs between pages, an
//     early empty page, or a repeated id) the whole read is retried, and an
//     error is thrown if it still cannot be read consistently. A partial
//     result is never returned as if it were complete.
//
// No runtime imports, so it also runs under `node --test`.

export type PageResponse<Row> = {
  data: Row[] | null;
  error: { message: string } | null;
  count: number | null;
};

export type FetchPage<Row> = (from: number, to: number) => PromiseLike<PageResponse<Row>>;

export const DEFAULT_PAGE_SIZE = 500;

export class PaginationError extends Error {
  // True when the rows changed while paging (worth retrying); false for a
  // query error, which is surfaced as-is.
  readonly concurrentChange: boolean;

  constructor(message: string, concurrentChange: boolean) {
    super(message);
    this.name = 'PaginationError';
    this.concurrentChange = concurrentChange;
  }
}

async function fetchAllPagesOnce<Row extends { id: unknown }>(
  label: string,
  fetchPage: FetchPage<Row>,
  pageSize: number,
): Promise<Row[]> {
  const rows: Row[] = [];
  const seenIds = new Set<string>();
  let expectedCount: number | null = null;
  let from = 0;

  // Each loop iteration either adds at least one row or ends the loop, so
  // this always terminates; the bound is a second line of defence.
  for (let page = 0; page <= 100_000; page += 1) {
    const { data, error, count } = await fetchPage(from, from + pageSize - 1);
    if (error) {
      throw new PaginationError(`Failed to load ${label} (rows from ${from}): ${error.message}`, false);
    }
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
      throw new PaginationError(`Failed to load ${label}: the server did not return a row count.`, false);
    }
    if (expectedCount === null) {
      expectedCount = count;
    } else if (count !== expectedCount) {
      throw new PaginationError(`${label} changed while loading.`, true);
    }

    const pageRows = data ?? [];
    for (const row of pageRows) {
      const id = String(row.id ?? '');
      if (!id || seenIds.has(id)) {
        throw new PaginationError(`${label} changed while loading (repeated or missing id).`, true);
      }
      seenIds.add(id);
      rows.push(row);
    }

    if (rows.length >= expectedCount) {
      if (rows.length > expectedCount) {
        throw new PaginationError(`${label} changed while loading.`, true);
      }
      return rows;
    }
    if (pageRows.length === 0) {
      throw new PaginationError(`${label} changed while loading (rows missing).`, true);
    }
    from += pageRows.length;
  }

  throw new PaginationError(`Failed to load ${label}: too many pages.`, false);
}

export async function fetchAllPages<Row extends { id: unknown }>(
  label: string,
  fetchPage: FetchPage<Row>,
  options: { pageSize?: number; maxAttempts?: number } = {},
): Promise<Row[]> {
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? DEFAULT_PAGE_SIZE));
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
  let lastError: PaginationError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchAllPagesOnce(label, fetchPage, pageSize);
    } catch (error) {
      if (!(error instanceof PaginationError) || !error.concurrentChange) {
        throw error;
      }
      lastError = error;
    }
  }

  throw new PaginationError(
    `${lastError?.message ?? `${label} changed while loading.`} Please try again.`,
    true,
  );
}
