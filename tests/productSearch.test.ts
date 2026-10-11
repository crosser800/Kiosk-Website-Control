import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchText, searchProducts, type SearchableProduct } from '../src/components/products/productSearch.ts';

function product(overrides: Partial<SearchableProduct> & { id: string }): SearchableProduct {
  return {
    name: '',
    skuCode: '',
    description: '',
    categoryTitle: '',
    variationNames: [],
    variationSkus: [],
    ...overrides,
  };
}

const catalog: SearchableProduct[] = [
  product({
    id: 'paint',
    name: 'Boysen Latex Paint',
    skuCode: 'BLP-100',
    categoryTitle: 'Paints',
    variationNames: ['Matte White', 'Gloss Black'],
    variationSkus: ['BLP-100-MW', 'BLP-100-GB'],
  }),
  product({
    id: 'nails',
    name: 'Common Wire Nails',
    skuCode: 'CWN-2IN',
    categoryTitle: 'Hardware',
    variationNames: ['2 inch'],
    variationSkus: ['CWN-2IN'],
    description: 'Bright finish',
  }),
  product({ id: 'loose', name: 'Loose Sand', skuCode: 'SAND-1', categoryTitle: '' }),
];

const ids = (query: string) => searchProducts(catalog, query).map((result) => result.product.id);

describe('searchProducts', () => {
  it('matches product name, SKU, category, variation name and variation SKU', () => {
    assert.deepEqual(ids('latex'), ['paint']);
    assert.deepEqual(ids('cwn-2in'), ['nails']);
    assert.deepEqual(ids('hardware'), ['nails']);
    assert.deepEqual(ids('gloss black'), ['paint']);
    assert.deepEqual(ids('BLP-100-MW'), ['paint']);
    assert.deepEqual(ids('bright'), ['nails']);
  });

  it('is case-insensitive, partial and whitespace tolerant', () => {
    assert.deepEqual(ids('  LaTeX   pai  '), ['paint']);
    assert.deepEqual(ids('mat'), ['paint']);
    assert.deepEqual(ids('n'), ['paint', 'nails', 'loose']);
  });

  it('requires every term somewhere across the fields', () => {
    assert.deepEqual(ids('paints matte'), ['paint']);
    assert.deepEqual(ids('paints 2 inch'), []);
  });

  it('finds products without a category', () => {
    assert.deepEqual(ids('sand'), ['loose']);
  });

  it('returns each product once even when several variations match', () => {
    const results = searchProducts([...catalog, catalog[0]], 'blp-100');
    assert.equal(results.length, 1);
    assert.equal(results[0].product.id, 'paint');
  });

  it('returns nothing for an empty query and keeps input order', () => {
    assert.deepEqual(ids('   '), []);
    assert.deepEqual(ids('e'), ['paint', 'nails', 'loose']);
  });

  it('explains why a product matched', () => {
    const [byVariation] = searchProducts(catalog, 'gloss');
    assert.equal(byVariation.matchedField, 'Variation');
    assert.equal(byVariation.matchedValue, 'Gloss Black');
    const [byVariationSku] = searchProducts(catalog, 'mw');
    assert.equal(byVariationSku.matchedField, 'Variation SKU');
    const [byName] = searchProducts(catalog, 'boysen');
    assert.equal(byName.matchedField, 'Product name');
  });
});

describe('normalizeSearchText', () => {
  it('trims, collapses spaces and lowercases', () => {
    assert.equal(normalizeSearchText('  A   b\tC '), 'a b c');
    assert.equal(normalizeSearchText(null), '');
  });
});
