import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-warehouse-key, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const FETCH_PAGE_SIZE = 1000;
const DEFAULT_PRODUCTS_PAGE = 1;
const DEFAULT_PRODUCTS_LIMIT = 100;
const MAX_PRODUCTS_LIMIT = 500;
const PRICE_CODE_ORDER = ["R1", "R2", "W1", "W2", "SP", "CP"];
const EXCLUDED_VARIATION_AVAILABILITY = new Set([
  "unavailable",
  "inactive",
  "archived",
  "deleted",
]);

type SupabaseClient = ReturnType<typeof createClient>;

type CategoryRow = {
  id: string;
  category_title: string | null;
  category_image_url: string | null;
  category_slug: string | null;
  status: string | null;
};

type ProductRow = {
  id: string;
  product_name: string | null;
  sku_code: string | null;
  category_id: string | null;
  status: string | null;
  description?: string | null;
  created_at?: string | null;
};

type ProductMediaRow = {
  id: string;
  product_id: string | null;
  media_url: string | null;
  media_type: string | null;
  is_primary: boolean | null;
  sort_order: number | null;
  variation_id: string | null;
  status: string | null;
};

type VariationRow = {
  id: string;
  product_id: string | null;
  variation_name: string | null;
  class_name: string | null;
  branch_name: string | null;
  price_type: string | null;
  price_code: string | null;
  price: number | string | null;
  sku_code: string | null;
  variation_group_id: string | null;
  stock_quantity: number | string | null;
  availability: string | null;
  sort_order: number | null;
};

type LogicalVariation = {
  id: string;
  product_id: string;
  variation_group_id: string | null;
  variation_name: string;
  display_label: string;
  class_name: string;
  sku_code: string;
  stock_quantity: number;
  availability: string;
  pricing: Array<{
    id: string;
    variation_id: string;
    price_code: string;
    price: number;
    branch_name: string;
    price_type: string;
    availability: string;
  }>;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function toPositiveInt(value: string | null, fallback: number, max?: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  const safe = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return max ? Math.min(safe, max) : safe;
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeKey(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function isAvailableVariation(row: VariationRow) {
  return !EXCLUDED_VARIATION_AVAILABILITY.has(normalizeKey(row.availability));
}

function buildVariationFallbackKey(row: VariationRow) {
  const productId = normalizeKey(row.product_id);
  const variationName = normalizeKey(row.variation_name || row.class_name);
  const skuCode = normalizeKey(row.sku_code);
  return `fallback:${productId}:${variationName}:${skuCode}`;
}

function getVariationGroupKey(row: VariationRow) {
  const groupId = normalizeText(row.variation_group_id);
  return groupId ? `group:${groupId}` : buildVariationFallbackKey(row);
}

function buildVariationId(row: VariationRow) {
  return normalizeText(row.variation_group_id) || getVariationGroupKey(row);
}

function comparePriceRows(left: { price_code: string }, right: { price_code: string }) {
  const leftIndex = PRICE_CODE_ORDER.indexOf(left.price_code);
  const rightIndex = PRICE_CODE_ORDER.indexOf(right.price_code);
  const safeLeft = leftIndex === -1 ? PRICE_CODE_ORDER.length : leftIndex;
  const safeRight = rightIndex === -1 ? PRICE_CODE_ORDER.length : rightIndex;
  if (safeLeft !== safeRight) return safeLeft - safeRight;
  return left.price_code.localeCompare(right.price_code);
}

async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  configure?: (query: any) => any,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + FETCH_PAGE_SIZE - 1;
    let query = supabase.from(table).select(select).range(from, to);
    if (configure) {
      query = configure(query);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < FETCH_PAGE_SIZE) {
      return rows;
    }

    from += FETCH_PAGE_SIZE;
  }
}

async function loadCategories(supabase: SupabaseClient) {
  return fetchAllRows<CategoryRow>(
    supabase,
    "product_categories",
    "id, category_title, category_image_url, category_slug, status",
    (query) => query.order("category_title", { ascending: true }),
  );
}

async function loadActiveProducts(supabase: SupabaseClient) {
  return fetchAllRows<ProductRow>(
    supabase,
    "products",
    "id, product_name, sku_code, category_id, status, description, created_at",
    (query) =>
      query.eq("status", "Active").order("product_name", { ascending: true }),
  );
}

async function loadProductMedia(supabase: SupabaseClient) {
  return fetchAllRows<ProductMediaRow>(
    supabase,
    "product_media",
    "id, product_id, media_url, media_type, is_primary, sort_order, variation_id, status",
    (query) => query.order("sort_order", { ascending: true }),
  );
}

async function loadProductVariations(supabase: SupabaseClient) {
  return fetchAllRows<VariationRow>(
    supabase,
    "product_variations",
    "id, product_id, variation_name, class_name, branch_name, price_type, price_code, price, sku_code, variation_group_id, stock_quantity, availability, sort_order",
    (query) => query.order("sort_order", { ascending: true }),
  );
}

function mapCategories(categories: CategoryRow[]) {
  return categories.map((row) => ({
    id: row.id,
    category_title: row.category_title,
    category_image_url: row.category_image_url,
    category_slug: row.category_slug,
    status: row.status,
  }));
}

function getProductImageUrls(mediaRows: ProductMediaRow[]) {
  const mediaByProductId = new Map<string, ProductMediaRow[]>();

  for (const row of mediaRows) {
    const productId = normalizeText(row.product_id);
    if (!productId || row.variation_id) continue;
    if (normalizeText(row.status || "Active") !== "Active") continue;

    mediaByProductId.set(productId, [
      ...(mediaByProductId.get(productId) ?? []),
      row,
    ]);
  }

  const imageByProductId = new Map<string, string>();
  for (const [productId, rows] of mediaByProductId.entries()) {
    const image =
      rows.find((row) => row.is_primary && row.media_type === "image") ??
      rows.find((row) => row.media_type === "image") ??
      rows[0];
    if (image?.media_url) {
      imageByProductId.set(productId, image.media_url);
    }
  }

  return imageByProductId;
}

function mapProduct(row: ProductRow, productImageUrl = "") {
  return {
    id: row.id,
    product_name: row.product_name,
    sku_code: row.sku_code,
    category_id: row.category_id,
    product_image_url: productImageUrl || null,
    unit_label: null,
    availability: row.status,
    status: row.status,
    description: row.description ?? null,
    created_at: row.created_at ?? null,
  };
}

function groupLogicalVariations(rows: VariationRow[]) {
  const groups = new Map<string, VariationRow[]>();

  for (const row of rows) {
    if (!row.product_id || !isAvailableVariation(row)) continue;
    const key = getVariationGroupKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return Array.from(groups.values()).map((groupRows) => {
    const first = groupRows[0];
    const stockQuantity = Math.max(
      ...groupRows.map((row) => toNumber(row.stock_quantity)),
      0,
    );
    const pricing = groupRows
      .map((row) => ({
        id: row.id,
        variation_id: row.id,
        price_code: normalizeText(row.price_code).toUpperCase(),
        price: toNumber(row.price),
        branch_name: normalizeText(row.branch_name),
        price_type: normalizeText(row.price_type),
        availability: normalizeText(row.availability),
      }))
      .filter((price) => price.price_code)
      .sort(comparePriceRows);
    const variationName = normalizeText(first.variation_name || first.class_name);

    return {
      id: buildVariationId(first),
      product_id: normalizeText(first.product_id),
      variation_group_id: normalizeText(first.variation_group_id) || null,
      variation_name: variationName,
      display_label: variationName,
      class_name: normalizeText(first.class_name),
      sku_code: normalizeText(first.sku_code),
      stock_quantity: stockQuantity,
      availability: groupRows.some(
        (row) => normalizeKey(row.availability) === "available",
      )
        ? "Available"
        : normalizeText(first.availability),
      pricing,
    } satisfies LogicalVariation;
  });
}

function groupVariationsByProduct(
  variations: VariationRow[],
  activeProductIds: Set<string>,
) {
  const rowsByProductId = new Map<string, VariationRow[]>();

  for (const row of variations) {
    const productId = normalizeText(row.product_id);
    if (!productId || !activeProductIds.has(productId)) continue;
    rowsByProductId.set(productId, [...(rowsByProductId.get(productId) ?? []), row]);
  }

  const result = new Map<string, LogicalVariation[]>();
  for (const [productId, rows] of rowsByProductId.entries()) {
    result.set(productId, groupLogicalVariations(rows));
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Dedicated Warehouse API key
  const warehouseKey = Deno.env.get("WAREHOUSE_API_KEY");
  const suppliedKey = req.headers.get("x-warehouse-key");

  if (!warehouseKey || suppliedKey !== warehouseKey) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);

  const apiIndex = parts.indexOf("warehouse-api");
  const routeParts =
    apiIndex >= 0 ? parts.slice(apiIndex + 1) : [];

  try {
    // =========================================================
    // GET /
    // =========================================================
    if (routeParts.length === 0) {
      return json({
        name: "2B Warehouse API",
        status: "ok",
        read_only: true,
        endpoints: [
          "GET /categories",
          "GET /products",
          "GET /products/{productId}/variations",
          "GET /stocks",
          "GET /catalog",
        ],
      });
    }

    // =========================================================
    // GET /categories
    // =========================================================
    if (routeParts[0] === "categories") {
      const categories = await loadCategories(supabase);

      return json({
        meta: {
          total_categories: categories.length,
        },
        data: mapCategories(categories),
      });
    }

    // =========================================================
    // GET /products
    // Optional:
    // ?category_id=UUID
    // ?search=text
    // ?page=1
    // ?limit=100
    // =========================================================
    if (
      routeParts[0] === "products" &&
      routeParts.length === 1
    ) {
      const categoryId = url.searchParams.get("category_id");
      const search = url.searchParams
        .get("search")
        ?.toLowerCase();
      const page = toPositiveInt(
        url.searchParams.get("page"),
        DEFAULT_PRODUCTS_PAGE,
      );
      const pageSize = toPositiveInt(
        url.searchParams.get("limit"),
        DEFAULT_PRODUCTS_LIMIT,
        MAX_PRODUCTS_LIMIT,
      );

      const [products, mediaRows] = await Promise.all([
        loadActiveProducts(supabase),
        loadProductMedia(supabase),
      ]);
      const productImageUrls = getProductImageUrls(mediaRows);

      const filteredProducts = products.filter((row) => {
        if (categoryId && row.category_id !== categoryId) return false;
        if (
          search &&
          !normalizeText(row.product_name).toLowerCase().includes(search) &&
          !normalizeText(row.sku_code).toLowerCase().includes(search)
        ) {
          return false;
        }
        return true;
      });

      const startIndex = (page - 1) * pageSize;
      const pagedProducts = filteredProducts.slice(
        startIndex,
        startIndex + pageSize,
      );

      return json({
        page,
        page_size: pageSize,
        total: filteredProducts.length,
        has_more: startIndex + pageSize < filteredProducts.length,
        data: pagedProducts.map((row) =>
          mapProduct(row, productImageUrls.get(row.id)),
        ),
      });
    }

    // =========================================================
    // GET /products/{productId}/variations
    // =========================================================
    if (
      routeParts[0] === "products" &&
      routeParts.length === 3 &&
      routeParts[2] === "variations"
    ) {
      const productId = routeParts[1];
      const rows = (await loadProductVariations(supabase)).filter(
        (row) => row.product_id === productId,
      );
      const variations = groupLogicalVariations(rows);

      return json({
        product_id: productId,
        meta: {
          total_variations: variations.length,
          raw_price_rows: rows.length,
        },
        data: variations,
      });
    }

    // =========================================================
    // GET /stocks
    // Optional:
    // ?product_id=UUID
    // ?variation_id=variation_group_id_or_fallback_id
    // ?branch_id=UUID - accepted for compatibility, not used by the
    // Admin stock_quantity source.
    // =========================================================
    if (routeParts[0] === "stocks") {
      const productId =
        url.searchParams.get("product_id");

      const variationId =
        url.searchParams.get("variation_id");

      const [products, variationRows] = await Promise.all([
        loadActiveProducts(supabase),
        loadProductVariations(supabase),
      ]);
      const activeProductIds = new Set(products.map((product) => product.id));
      const variationsByProductId = groupVariationsByProduct(
        variationRows,
        activeProductIds,
      );

      const stocks = Array.from(variationsByProductId.values())
        .flat()
        .filter((variation) => {
          if (productId && variation.product_id !== productId) return false;
          if (
            variationId &&
            variation.id !== variationId &&
            variation.variation_group_id !== variationId
          ) {
            return false;
          }
          return true;
        })
        .map((variation) => ({
          variation_id: variation.id,
          variation_group_id: variation.variation_group_id,
          product_id: variation.product_id,
          sku_code: variation.sku_code,
          display_name: variation.variation_name,
          stock_quantity: variation.stock_quantity,
          on_hand_base_quantity: null,
          reserved_base_quantity: null,
          available_base_quantity: null,
          updated_at: null,
        }));

      return json({
        meta: {
          total_stocks: stocks.length,
        },
        data: stocks,
      });
    }

    // =========================================================
    // GET /catalog
    // Categories + Products + Logical Variations + Pricing
    // =========================================================
    if (routeParts[0] === "catalog") {
      const [categories, products, mediaRows, variationRows] =
        await Promise.all([
          loadCategories(supabase),
          loadActiveProducts(supabase),
          loadProductMedia(supabase),
          loadProductVariations(supabase),
        ]);
      const activeProductIds = new Set(products.map((product) => product.id));
      const productImageUrls = getProductImageUrls(mediaRows);
      const variationsByProductId = groupVariationsByProduct(
        variationRows,
        activeProductIds,
      );
      const mappedProducts = products.map((product) => ({
        ...mapProduct(product, productImageUrls.get(product.id)),
        variations: variationsByProductId.get(product.id) ?? [],
      }));
      const totalVariations = mappedProducts.reduce(
        (total, product) => total + product.variations.length,
        0,
      );

      return json({
        meta: {
          total_categories: categories.length,
          total_products: mappedProducts.length,
          total_variations: totalVariations,
          raw_price_rows: variationRows.filter((row) =>
            activeProductIds.has(normalizeText(row.product_id)),
          ).length,
        },
        categories: mapCategories(categories),
        products: mappedProducts,
      });
    }

    return json(
      {
        error: "Route not found",
      },
      404,
    );
  } catch (error) {
    console.error(error);

    return json(
      {
        error: "Internal server error",
        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500,
    );
  }
});
