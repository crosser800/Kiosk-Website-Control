// Minimal in-memory imitation of the PostgREST query builder used by
// loadOrderCatalog: select(columns, { count }), eq, order (ASC, NULLS LAST like
// Postgres), range, and a server-side Max Rows cap that silently truncates
// every response, exactly like a real Supabase project.

export type Row = Record<string, unknown>;

export type RecordedQuery = {
  table: string;
  columns: string;
  count: string | undefined;
  filters: Array<[string, unknown]>;
  // Filters other than eq, as written (e.g. "variation_id is null").
  extraFilters: string[];
  orders: string[];
  range: [number, number] | null;
  limit: number | null;
};

export type FakePostgrestOptions = {
  tables: Record<string, Row[]>;
  maxRows: number;
  // Return an error for this request instead of data (0-based per table).
  failOn?: { table: string; requestIndex: number; message: string };
  // Called before each request is answered; may mutate `tables`.
  beforeResponse?: (query: RecordedQuery, requestIndex: number) => void;
};

function compareValues(left: unknown, right: unknown) {
  const leftNull = left === null || left === undefined;
  const rightNull = right === null || right === undefined;
  if (leftNull || rightNull) return leftNull === rightNull ? 0 : leftNull ? 1 : -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function createFakePostgrest(options: FakePostgrestOptions) {
  const queries: RecordedQuery[] = [];
  const requestCountByTable = new Map<string, number>();
  // Rows actually sent back per table (a proxy for transferred payload).
  const rowsReturned = new Map<string, number>();

  function from(table: string) {
    const query: RecordedQuery = { table, columns: '', count: undefined, filters: [], extraFilters: [], orders: [], range: null, limit: null };
    const predicates: Array<(row: Row) => boolean> = [];
    const descending = new Set<string>();
    const builder = {
      select(columns: string, selectOptions?: { count?: string }) {
        query.columns = columns;
        query.count = selectOptions?.count;
        return builder;
      },
      eq(column: string, value: unknown) {
        query.filters.push([column, value]);
        return builder;
      },
      is(column: string, value: null) {
        query.extraFilters.push(`${column} is ${String(value)}`);
        predicates.push((row) => row[column] === null || row[column] === undefined);
        return builder;
      },
      in(column: string, values: unknown[]) {
        query.extraFilters.push(`${column} in (${values.join(',')})`);
        predicates.push((row) => values.includes(row[column]));
        return builder;
      },
      // Supports "a.eq.X,b.is.null" style OR lists.
      or(expression: string) {
        query.extraFilters.push(`or(${expression})`);
        const parts = expression.split(',').map((part) => {
          const [column, operator, ...rest] = part.split('.');
          const value = rest.join('.');
          if (operator === 'eq') return (row: Row) => String(row[column]) === value && row[column] !== null && row[column] !== undefined;
          if (operator === 'is' && value === 'null') return (row: Row) => row[column] === null || row[column] === undefined;
          throw new Error(`fake or() does not support ${part}`);
        });
        predicates.push((row) => parts.some((matches) => matches(row)));
        return builder;
      },
      order(column: string, orderOptions?: { ascending?: boolean }) {
        if (orderOptions?.ascending === false) descending.add(column);
        query.orders.push(orderOptions?.ascending === false ? `${column} desc` : column);
        return builder;
      },
      limit(count: number) {
        query.limit = count;
        return builder;
      },
      range(start: number, end: number) {
        query.range = [start, end];
        return builder;
      },
      // First matching row or null, like PostgREST's maybeSingle().
      maybeSingle() {
        return Promise.resolve().then(() => {
          const result = respond();
          return { data: result.data?.[0] ?? null, error: result.error, count: result.count };
        });
      },
      then<Result1, Result2 = never>(
        onFulfilled?: (value: { data: Row[] | null; error: { message: string } | null; count: number | null }) => Result1 | PromiseLike<Result1>,
        onRejected?: (reason: unknown) => Result2 | PromiseLike<Result2>,
      ) {
        return Promise.resolve().then(() => respond()).then(onFulfilled, onRejected);
      },
    };

    function respond() {
      const requestIndex = requestCountByTable.get(table) ?? 0;
      requestCountByTable.set(table, requestIndex + 1);
      queries.push({ ...query, filters: [...query.filters], extraFilters: [...query.extraFilters], orders: [...query.orders] });
      options.beforeResponse?.(query, requestIndex);
      if (options.failOn && options.failOn.table === table && options.failOn.requestIndex === requestIndex) {
        return { data: null, error: { message: options.failOn.message }, count: null };
      }
      const filtered = (options.tables[table] ?? []).filter(
        (row) =>
          query.filters.every(([column, value]) => row[column] === value) &&
          predicates.every((matches) => matches(row)),
      );
      const sorted = filtered.slice().sort((left, right) => {
        for (const entry of query.orders) {
          const column = entry.replace(/ desc$/, '');
          // Postgres DESC puts NULLs first, i.e. the exact reverse of ASC.
          const result = compareValues(left[column], right[column]) * (descending.has(column) ? -1 : 1);
          if (result !== 0) return result;
        }
        return 0;
      });
      const [start, end] = query.range ?? [0, (query.limit ?? sorted.length) - 1];
      const limit = Math.min(end - start + 1, options.maxRows);
      const data = sorted.slice(start, start + limit).map((row) => ({ ...row }));
      rowsReturned.set(table, (rowsReturned.get(table) ?? 0) + data.length);
      return {
        data,
        error: null,
        count: query.count === 'exact' ? filtered.length : null,
      };
    }

    return builder;
  }

  return { from, queries, rowsReturned };
}
