import { supabase } from '../lib/supabase';
import type { OrderPriceCode } from './orderPricing';

const PRICE_CODE_ORDER: OrderPriceCode[] = ['R1', 'R2', 'W1', 'W2', 'SP', 'CP'];
const PRICE_CODE_SET = new Set<string>(PRICE_CODE_ORDER);

type AgentPriceAccessRow = {
  agent_id: string | null;
  price_class: string | null;
};

export type AgentPriceAccess = {
  agentId: string;
  priceCodes: OrderPriceCode[];
};

export async function loadAgentPriceAccess(agentId: string): Promise<AgentPriceAccess> {
  const { data, error } = await supabase
    .from('agent_price_access')
    .select('agent_id, price_class')
    .eq('agent_id', agentId);

  if (error) {
    throw new Error(error.message);
  }

  const priceCodes = Array.from(
    new Set(
      ((data ?? []) as AgentPriceAccessRow[])
        .map((row) => String(row.price_class ?? '').trim().toUpperCase())
        .filter((priceCode): priceCode is OrderPriceCode => PRICE_CODE_SET.has(priceCode)),
    ),
  ).sort((left, right) => PRICE_CODE_ORDER.indexOf(left) - PRICE_CODE_ORDER.indexOf(right));

  return { agentId, priceCodes };
}
