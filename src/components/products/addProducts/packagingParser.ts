import type { ProductUnitAliasDefinition, ProductUnitDefinition, VariationUnitOptionItem } from './types';

export type ParsedPackagingUnit = {
  unitCode: string;
  unitLabel: string;
  quantityInBaseUnit: number;
  packagingText: string;
};

export type PackagingParseResult = {
  units: ParsedPackagingUnit[];
  errors: string[];
  warnings: string[];
};

export type PackagingSummaryResult = {
  summary: string;
  warnings: string[];
};

type ParsedToken = {
  quantity: number;
  unitCode: string;
  originalUnit: string;
};

type Relationship = {
  parentUnit: string;
  childUnit: string;
  quantity: number;
};

const FALLBACK_UNIT_ALIASES: Record<string, string> = {
  pcs: 'pc',
  piece: 'pc',
  pieces: 'pc',
  ctns: 'ctn',
  carton: 'ctn',
  cartons: 'ctn',
  boxes: 'box',
  pairs: 'pair',
  prs: 'pair',
  rolls: 'roll',
  tubes: 'tube',
  kgs: 'kg',
  pk: 'pack',
  packs: 'pack',
  units: 'unit',
};

function normalizeRawUnit(value: string) {
  return value.trim().toLowerCase();
}

function formatUnitForMessage(unit: string) {
  return unit.trim().toUpperCase();
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function formatCompactUnit(unit: string, quantity: number) {
  const normalizedUnit = normalizeRawUnit(unit);
  if (Math.abs(quantity - 1) < Number.EPSILON) {
    return normalizedUnit;
  }
  if (normalizedUnit === 'pc') return 'pcs';
  if (normalizedUnit === 'set') return 'sets';
  if (normalizedUnit === 'pack') return 'packs';
  if (normalizedUnit === 'pair') return 'pairs';
  if (normalizedUnit === 'roll') return 'rolls';
  if (normalizedUnit === 'tube') return 'tubes';
  return normalizedUnit;
}

function buildUnitLookup(
  unitDefinitions: ProductUnitDefinition[],
  unitAliases: ProductUnitAliasDefinition[],
) {
  const activeUnitCodes = new Set(
    unitDefinitions
      .filter((unit) => String(unit.status ?? 'Active').toLowerCase() !== 'inactive')
      .map((unit) => normalizeRawUnit(unit.code))
      .filter(Boolean),
  );
  const lookup = new Map<string, string>();

  unitAliases.forEach((alias) => {
    const aliasCode = normalizeRawUnit(alias.alias);
    const unitCode = normalizeRawUnit(alias.unitCode);
    if (aliasCode && unitCode && activeUnitCodes.has(unitCode)) {
      lookup.set(aliasCode, unitCode);
    }
  });

  unitDefinitions.forEach((unit) => {
    if (String(unit.status ?? 'Active').toLowerCase() === 'inactive') return;
    const code = normalizeRawUnit(unit.code);
    const label = normalizeRawUnit(unit.label);
    if (code) {
      lookup.set(code, code);
    }
    if (label) {
      lookup.set(label, code);
    }
  });

  Object.entries(FALLBACK_UNIT_ALIASES).forEach(([alias, unitCode]) => {
    const normalizedUnitCode = normalizeRawUnit(unitCode);
    if (!lookup.has(alias) && activeUnitCodes.has(normalizedUnitCode)) {
      lookup.set(alias, normalizedUnitCode);
    }
  });

  return lookup;
}

export function normalizePackagingUnitCode(
  rawValue: string,
  unitDefinitions: ProductUnitDefinition[],
  unitAliases: ProductUnitAliasDefinition[],
) {
  const normalized = normalizeRawUnit(rawValue);
  if (!normalized) return '';
  return buildUnitLookup(unitDefinitions, unitAliases).get(normalized) ?? '';
}

function parseUnitToken(
  rawToken: string,
  unitDefinitions: ProductUnitDefinition[],
  unitAliases: ProductUnitAliasDefinition[],
  errors: string[],
): ParsedToken | null {
  const token = rawToken.trim();
  const match = token.match(/^(?:(\d+(?:\.\d+)?)\s*)?([a-zA-Z]+)$/);
  if (!match) {
    errors.push(`Could not parse packaging segment "${token}".`);
    return null;
  }

  const quantity = match[1] ? Number(match[1]) : 1;
  const originalUnit = match[2];
  const unitCode = normalizePackagingUnitCode(originalUnit, unitDefinitions, unitAliases);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    errors.push(`Quantity for "${token}" must be greater than zero.`);
    return null;
  }

  if (!unitCode) {
    errors.push(
      `Unknown unit "${formatUnitForMessage(originalUnit)}". Add it to Unit Master or configure an alias before generating packaging.`,
    );
    return null;
  }

  return { quantity, unitCode, originalUnit };
}

function addRelationship(
  relationships: Map<string, Relationship>,
  relationship: Relationship,
  errors: string[],
  warnings: string[],
) {
  const existing = relationships.get(relationship.parentUnit);
  if (!existing) {
    relationships.set(relationship.parentUnit, relationship);
    return;
  }

  if (
    existing.childUnit === relationship.childUnit &&
    Math.abs(existing.quantity - relationship.quantity) < Number.EPSILON
  ) {
    warnings.push(`Duplicate ${formatUnitForMessage(relationship.parentUnit)} relationship was ignored.`);
    return;
  }

  errors.push(
    `Conflicting definition for ${formatUnitForMessage(relationship.parentUnit)}. Review duplicate packaging rules.`,
  );
}

function parseSlashSegment(
  segment: string,
  unitDefinitions: ProductUnitDefinition[],
  unitAliases: ProductUnitAliasDefinition[],
  errors: string[],
): Relationship | null {
  const match = segment.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s*\/\s*([a-zA-Z]+)$/);
  if (!match) return null;

  const child = parseUnitToken(`${match[1]} ${match[2]}`, unitDefinitions, unitAliases, errors);
  const parent = parseUnitToken(match[3], unitDefinitions, unitAliases, errors);
  if (!child || !parent) return null;

  return {
    parentUnit: parent.unitCode,
    childUnit: child.unitCode,
    quantity: child.quantity,
  };
}

function parseChainSegment(
  segment: string,
  unitDefinitions: ProductUnitDefinition[],
  unitAliases: ProductUnitAliasDefinition[],
  errors: string[],
): Relationship[] {
  const delimiter = segment.includes('=') ? '=' : segment.match(/\s+x\s+/i) ? 'x' : '';
  if (!delimiter) {
    errors.push(`Could not parse packaging segment "${segment}".`);
    return [];
  }

  const rawTokens =
    delimiter === '='
      ? segment.split('=')
      : segment.split(/\s+x\s+/i);
  const tokens = rawTokens
    .map((token) => parseUnitToken(token, unitDefinitions, unitAliases, errors))
    .filter(Boolean) as ParsedToken[];

  if (tokens.length !== rawTokens.length) {
    return [];
  }
  if (tokens.length < 2) {
    errors.push(`Could not parse packaging segment "${segment}".`);
    return [];
  }
  if (tokens[0].quantity !== 1) {
    errors.push(`Use "1 ${formatUnitForMessage(tokens[0].unitCode)}" or omit the first quantity in packaging chains.`);
    return [];
  }

  const relationships: Relationship[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    relationships.push({
      parentUnit: tokens[index].unitCode,
      childUnit: tokens[index + 1].unitCode,
      quantity: tokens[index + 1].quantity,
    });
  }
  return relationships;
}

function resolveQuantityInBase(
  unitCode: string,
  baseUnitCode: string,
  relationships: Map<string, Relationship>,
  resolving: Set<string>,
  resolved: Map<string, number>,
  errors: string[],
): number | null {
  const existing = resolved.get(unitCode);
  if (existing !== undefined) return existing;

  if (unitCode === baseUnitCode) {
    resolved.set(unitCode, 1);
    return 1;
  }

  if (resolving.has(unitCode)) {
    errors.push('Packaging hierarchy contains a circular relationship.');
    return null;
  }

  const relationship = relationships.get(unitCode);
  if (!relationship) {
    errors.push(
      `Cannot resolve ${formatUnitForMessage(unitCode)} to base unit ${formatUnitForMessage(baseUnitCode)}.`,
    );
    return null;
  }

  resolving.add(unitCode);
  const childQuantity: number | null = resolveQuantityInBase(
    relationship.childUnit,
    baseUnitCode,
    relationships,
    resolving,
    resolved,
    errors,
  );
  resolving.delete(unitCode);

  if (childQuantity === null) return null;

  const quantity: number = relationship.quantity * childQuantity;
  resolved.set(unitCode, quantity);
  return quantity;
}

export function parsePackagingText(
  rawValue: string,
  baseUnitCode: string,
  unitDefinitions: ProductUnitDefinition[],
  unitAliases: ProductUnitAliasDefinition[],
): PackagingParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalizedBaseUnit = normalizePackagingUnitCode(baseUnitCode, unitDefinitions, unitAliases);
  if (!normalizedBaseUnit) {
    return {
      units: [],
      errors: [`Unknown base unit "${formatUnitForMessage(baseUnitCode)}".`],
      warnings: [],
    };
  }

  const relationships = new Map<string, Relationship>();
  const segments = rawValue
    .split(/[:;\n]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return { units: [], errors: ['No packaging text was provided.'], warnings: [] };
  }

  segments.forEach((segment) => {
    const slashRelationship = parseSlashSegment(segment, unitDefinitions, unitAliases, errors);
    if (slashRelationship) {
      addRelationship(relationships, slashRelationship, errors, warnings);
      return;
    }

    parseChainSegment(segment, unitDefinitions, unitAliases, errors).forEach((relationship) =>
      addRelationship(relationships, relationship, errors, warnings),
    );
  });

  if (errors.length > 0) {
    return { units: [], errors: Array.from(new Set(errors)), warnings };
  }

  const unitsToResolve = new Set<string>([normalizedBaseUnit]);
  relationships.forEach((relationship) => {
    unitsToResolve.add(relationship.parentUnit);
    unitsToResolve.add(relationship.childUnit);
  });

  const resolved = new Map<string, number>([[normalizedBaseUnit, 1]]);
  unitsToResolve.forEach((unitCode) => {
    resolveQuantityInBase(unitCode, normalizedBaseUnit, relationships, new Set(), resolved, errors);
  });

  if (errors.length > 0) {
    return { units: [], errors: Array.from(new Set(errors)), warnings };
  }

  const units = Array.from(resolved.entries())
    .filter(([unitCode]) => unitCode !== normalizedBaseUnit)
    .map(([unitCode, quantityInBaseUnit]) => {
      const relationship = relationships.get(unitCode);
      return {
        unitCode,
        unitLabel: unitCode,
        quantityInBaseUnit,
        packagingText: relationship
          ? `1 ${unitCode} = ${relationship.quantity} ${relationship.childUnit}`
          : `1 ${unitCode} = ${quantityInBaseUnit} ${normalizedBaseUnit}`,
      };
    })
    .sort((left, right) => left.quantityInBaseUnit - right.quantityInBaseUnit || left.unitCode.localeCompare(right.unitCode));

  return {
    units,
    errors: [],
    warnings,
  };
}

export function generatePackagingSummary(
  unitOptions: VariationUnitOptionItem[],
  baseUnitCode: string,
): PackagingSummaryResult {
  const normalizedBaseUnitCode = normalizeRawUnit(baseUnitCode || 'pc') || 'pc';
  const warnings: string[] = [];
  const seenUnitCodes = new Set<string>();
  const duplicateUnitCodes = new Set<string>();
  const validRows = unitOptions
    .map((option) => {
      const unitCode = normalizeRawUnit(option.unitCode);
      const quantityInBaseUnit = Number(String(option.quantityInBaseUnit ?? '').replace(/,/g, ''));
      return {
        unitCode,
        quantityInBaseUnit,
      };
    })
    .filter((option) => {
      if (!option.unitCode || !Number.isFinite(option.quantityInBaseUnit) || option.quantityInBaseUnit <= 0) {
        return false;
      }
      if (seenUnitCodes.has(option.unitCode)) {
        duplicateUnitCodes.add(option.unitCode);
        return false;
      }
      seenUnitCodes.add(option.unitCode);
      return true;
    })
    .sort((left, right) => left.quantityInBaseUnit - right.quantityInBaseUnit || left.unitCode.localeCompare(right.unitCode));

  if (duplicateUnitCodes.size > 0) {
    warnings.push(
      `Duplicate unit rows found for ${Array.from(duplicateUnitCodes)
        .map(formatUnitForMessage)
        .join(', ')}. The summary uses the first matching row.`,
    );
  }

  const rowsByCode = new Map(validRows.map((row) => [row.unitCode, row] as const));
  if (!rowsByCode.has(normalizedBaseUnitCode)) {
    validRows.unshift({
      unitCode: normalizedBaseUnitCode,
      quantityInBaseUnit: 1,
    });
  }

  const summaryParts = validRows
    .filter((row) => row.unitCode !== normalizedBaseUnitCode && row.quantityInBaseUnit !== 1)
    .map(
      (row) =>
        `${formatQuantity(row.quantityInBaseUnit)}${formatCompactUnit(
          normalizedBaseUnitCode,
          row.quantityInBaseUnit,
        )}/${row.unitCode}`,
    );

  return {
    summary: summaryParts.join(':'),
    warnings,
  };
}
