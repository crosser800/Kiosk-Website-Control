import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  createAdminOrder,
  type AdminOrderCreateResult,
  type AdminOrderItemCreatePayload,
} from '../../services/adminOrders';
import { loadAgentPriceAccess } from '../../services/agentPriceAccess';
import { loadOrderCatalog, loadOrderPriceClasses, type OrderCatalogPriceClass, type OrderCatalogProduct } from '../../services/orderCatalog';
import {
  normalizeUnitCode,
  qualifyAssortedPromotions,
  type AssortedPromotionResult,
  type OrderCatalogUnitOption,
  type OrderPriceCode,
} from '../../services/orderPricing';
import OrderItemConfigurator from './OrderItemConfigurator';
import SearchableSelect from './SearchableSelect';
import type {
  CreateOrderAgent,
  CreateOrderBranch,
  CreateOrderCartItem,
  CreateOrderClient,
  CreateOrderCustomerType,
  CreateOrderDraft,
  CreateOrderTerm,
  CreateOrderTotals,
} from './createOrderTypes';
import { mapPriceClassToPreference } from './createOrderTypes';
import styles from './CreateOrderWorkspace.module.css';

type Props = {
  onClose: () => void;
  onCreated?: () => void;
};

const emptyTotals: CreateOrderTotals = {
  lineItems: 0,
  paidQuantity: 0,
  freeQuantity: 0,
  subtotal: 0,
  discountTotal: 0,
  surchargeTotal: 0,
  grandTotal: 0,
};

const emptyDraft: CreateOrderDraft = {
  agentId: '',
  pricePreferenceId: '',
  pricePreference: null,
  customerType: 'existing',
  agentClientId: '',
  clientName: '',
  guestFullName: '',
  guestCompany: '',
  guestAddress: '',
  guestTin: '',
  guestMobileNumber: '',
  guestEmail: '',
  guestNotes: '',
  branchId: '',
  branchName: '',
  branchCode: '',
  termId: '',
  notes: '',
  items: [],
  totals: emptyTotals,
};

type AgentAccessState = {
  priceCodes: OrderPriceCode[];
  isLoading: boolean;
  error: string;
};

type AssortedRewardSelection = {
  rewardVariationId: string;
  rewardUnitOptionId: string;
};

type SelectedAssortedReward = {
  result: AssortedPromotionResult;
  rewardVariationId: string;
  rewardVariationName: string;
  rewardUnitOption: OrderCatalogUnitOption;
  carrierLineId: string;
};

const PRICE_CODE_FALLBACK_ORDER: OrderPriceCode[] = ['R1', 'R2', 'W1', 'W2', 'SP', 'CP'];

function formatCurrency(value: number) {
  return value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function createLineId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `order-line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatAgentLabel(agent: CreateOrderAgent) {
  return [agent.fullName || 'Unnamed Agent', agent.agentCode].filter(Boolean).join(' - ');
}

function getClientDisplayName(client: Pick<CreateOrderClient, 'companyName' | 'clientName'>) {
  return client.companyName.trim() || client.clientName.trim() || 'Unnamed Client';
}

export default function CreateOrderWorkspace({ onClose, onCreated }: Props) {
  const [draft, setDraft] = useState<CreateOrderDraft>(emptyDraft);
  const [agents, setAgents] = useState<CreateOrderAgent[]>([]);
  const [branches, setBranches] = useState<CreateOrderBranch[]>([]);
  const [terms, setTerms] = useState<CreateOrderTerm[]>([]);
  const [priceClasses, setPriceClasses] = useState<OrderCatalogPriceClass[]>([]);
  const [agentClients, setAgentClients] = useState<CreateOrderClient[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<OrderCatalogProduct[]>([]);
  const [agentAccessCache, setAgentAccessCache] = useState<Record<string, AgentAccessState>>({});
  const [isLoadingLookups, setIsLoadingLookups] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isConfiguratorOpen, setIsConfiguratorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CreateOrderCartItem | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CreateOrderCartItem | null>(null);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const [assortedRewardSelections, setAssortedRewardSelections] = useState<Record<string, AssortedRewardSelection>>({});
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createResult, setCreateResult] = useState<AdminOrderCreateResult | null>(null);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === draft.branchId) ?? null,
    [branches, draft.branchId],
  );
  const selectedTerm = useMemo(
    () => terms.find((term) => term.id === draft.termId) ?? null,
    [draft.termId, terms],
  );
  const selectedAgentAccess = draft.agentId ? agentAccessCache[draft.agentId] : null;
  const allowedPriceCodes = useMemo(
    () => new Set(selectedAgentAccess?.priceCodes ?? []),
    [selectedAgentAccess],
  );
  const allowedPriceClasses = useMemo(
    () =>
      sortPriceClasses(
        priceClasses.filter((priceClass) => allowedPriceCodes.has(priceClass.priceCode as OrderPriceCode)),
      ),
    [allowedPriceCodes, priceClasses],
  );
  const selectedClient = useMemo(
    () => agentClients.find((client) => client.id === draft.agentClientId) ?? null,
    [agentClients, draft.agentClientId],
  );
  const priceAccessValidation = getPriceAccessValidation(draft, allowedPriceClasses, selectedAgentAccess);
  const canAddProduct = isHeaderComplete(draft) && !priceAccessValidation && !isSubmitting;
  const addProductDisabledMessage = getAddProductDisabledMessage(draft, priceAccessValidation);
  const assortedPromotions = useMemo(
    () =>
      qualifyAssortedPromotions({
        items: draft.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          variationId: item.variationId,
          variationName: item.variationName,
          unitOption: item.unitOption,
          price: item.price,
          priceCode: item.priceCode,
          quantity: item.quantity,
          surcharges: item.surcharges ?? [],
        })),
        branchName: selectedBranch?.branchName ?? draft.branchName,
        priceType: draft.pricePreference?.priceType,
      }),
    [draft.branchName, draft.items, draft.pricePreference?.priceType, selectedBranch?.branchName],
  );
  const selectedAssortedRewards = useMemo(
    () => resolveSelectedAssortedRewards(assortedPromotions, assortedRewardSelections, catalogProducts),
    [assortedPromotions, assortedRewardSelections, catalogProducts],
  );
  const assortedFreeQuantity = selectedAssortedRewards.reduce(
    (sum, reward) => sum + reward.result.rewardQuantity,
    0,
  );
  const displayTotals = useMemo(
    () => ({
      ...draft.totals,
      freeQuantity: draft.totals.freeQuantity + assortedFreeQuantity,
    }),
    [assortedFreeQuantity, draft.totals],
  );
  const assortedSelectionError = getAssortedSelectionError(assortedPromotions, selectedAssortedRewards);
  const canCreate = isDraftComplete(draft) && !priceAccessValidation && !assortedSelectionError && !isSubmitting;
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    void loadLookups();
  }, []);

  useEffect(() => {
    setAssortedRewardSelections((current) => {
      const next: Record<string, AssortedRewardSelection> = {};
      assortedPromotions.forEach((result) => {
        if (!result.qualified || result.rewardQuantity <= 0) {
          return;
        }
        const options = getAssortedRewardOptions(result, catalogProducts);
        if (options.length === 0) {
          return;
        }
        const currentSelection = current[result.groupKey];
        const currentIsValid = Boolean(
          currentSelection &&
            options.some(
              (option) =>
                option.variationId === currentSelection.rewardVariationId &&
                option.unitOption.id === currentSelection.rewardUnitOptionId,
            ),
        );
        const selection = currentIsValid
          ? currentSelection
          : {
              rewardVariationId: options[0].variationId,
              rewardUnitOptionId: options[0].unitOption.id,
            };
        next[result.groupKey] = selection;
      });

      if (JSON.stringify(current) === JSON.stringify(next)) {
        return current;
      }
      return next;
    });
  }, [assortedPromotions, catalogProducts]);

  useEffect(() => {
    if (!draft.agentId) {
      setDraft((current) => ({
        ...current,
        pricePreferenceId: '',
        pricePreference: null,
        agentClientId: '',
        clientName: '',
        items: [],
        totals: emptyTotals,
      }));
      return;
    }

    const cached = agentAccessCache[draft.agentId];
    if (cached) {
      return;
    }

    const agentId = draft.agentId;
    setAgentAccessCache((current) => ({
      ...current,
      [agentId]: { priceCodes: [], isLoading: true, error: '' },
    }));
    loadAgentPriceAccess(agentId)
      .then((access) => {
        setAgentAccessCache((current) => ({
          ...current,
          [agentId]: { priceCodes: access.priceCodes, isLoading: false, error: '' },
        }));
      })
      .catch((error) => {
        setAgentAccessCache((current) => ({
          ...current,
          [agentId]: {
            priceCodes: [],
            isLoading: false,
            error: error instanceof Error ? error.message : "Unable to load this agent's price access.",
          },
        }));
      });
  }, [agentAccessCache, draft.agentId]);

  useEffect(() => {
    if (!draft.agentId || selectedAgentAccess?.isLoading || selectedAgentAccess?.error) {
      return;
    }
    applyAgentAccessToDraft(selectedAgentAccess?.priceCodes ?? []);
  }, [allowedPriceClasses, draft.agentId, selectedAgentAccess]);

  useEffect(() => {
    if (!draft.agentId) {
      setAgentClients([]);
      return;
    }

    let cancelled = false;
    setIsLoadingClients(true);
    const loadAgentClients = async () => {
      try {
        const { data, error } = await supabase
          .from('agent_clients')
          .select('id, client_code, client_name, company_name, contact_person, contact_number, email, address, tin, status, custom_client_code, default_price_code, default_delivery_term_id')
          .eq('agent_id', draft.agentId)
          .eq('status', 'Active')
          .order('company_name', { ascending: true });

        if (cancelled) return;
        if (error) {
          setAgentClients([]);
          setValidationError(error.message);
          return;
        }

        const nextClients = (data ?? []).map((row) => ({
          id: String(row.id),
          clientCode: String(row.client_code ?? ''),
          clientName: String(row.client_name ?? ''),
          companyName: String(row.company_name ?? ''),
          contactPerson: String(row.contact_person ?? ''),
          contactNumber: String(row.contact_number ?? ''),
          email: String(row.email ?? ''),
          address: String(row.address ?? ''),
          tin: String(row.tin ?? ''),
          status: String(row.status ?? ''),
          customClientCode: String(row.custom_client_code ?? ''),
          defaultPriceCode: String(row.default_price_code ?? '').trim().toUpperCase(),
          defaultDeliveryTermId: String(row.default_delivery_term_id ?? ''),
        })).sort((left, right) => getClientDisplayName(left).localeCompare(getClientDisplayName(right)));

        setAgentClients(nextClients);
        setDraft((current) => {
          if (!current.agentClientId || nextClients.some((client) => client.id === current.agentClientId)) {
            return current;
          }
          return { ...current, agentClientId: '', clientName: '' };
        });
      } finally {
        if (!cancelled) setIsLoadingClients(false);
      }
    };

    void loadAgentClients();

    return () => {
      cancelled = true;
    };
  }, [draft.agentId]);

  async function loadLookups() {
    setIsLoadingLookups(true);
    setLoadError('');
    try {
      const [agentsRes, branchesRes, termsRes, catalog, nextPriceClasses] = await Promise.all([
        supabase
          .from('agent_accounts')
          .select('id, full_name, agent_code, company_name, email, status')
          .eq('status', 'Active')
          .order('full_name', { ascending: true }),
        supabase
          .from('branches')
          .select('id, branch_name, branch_code, status')
          .eq('status', 'Active')
          .order('sort_order', { ascending: true }),
        supabase
          .from('delivery_terms')
          .select('id, term_name, term_code, is_default, status')
          .eq('status', 'Active')
          .order('sort_order', { ascending: true }),
        loadOrderCatalog(),
        loadOrderPriceClasses(),
      ]);

      const lookupError = agentsRes.error ?? branchesRes.error ?? termsRes.error;
      if (lookupError) {
        throw new Error(lookupError.message);
      }

      const nextAgents = (agentsRes.data ?? []).map((row) => ({
        id: String(row.id),
        fullName: String(row.full_name ?? ''),
        agentCode: String(row.agent_code ?? ''),
        companyName: String(row.company_name ?? ''),
        email: String(row.email ?? ''),
        status: String(row.status ?? ''),
      }));
      const nextBranches = (branchesRes.data ?? []).map((row) => ({
        id: String(row.id),
        branchName: String(row.branch_name ?? ''),
        branchCode: String(row.branch_code ?? ''),
      }));
      const nextTerms = (termsRes.data ?? []).map((row) => ({
        id: String(row.id),
        termName: String(row.term_name ?? ''),
        termCode: String(row.term_code ?? ''),
        isDefault: Boolean(row.is_default),
      }));
      setAgents(nextAgents);
      setBranches(nextBranches);
      setTerms(nextTerms);
      setPriceClasses(nextPriceClasses);
      setCatalogProducts(catalog);
      setDraft((current) => {
        const initialBranch = nextBranches.find((branch) => branch.id === current.branchId) ?? nextBranches[0] ?? null;
        return {
          ...current,
          agentId: current.agentId || nextAgents[0]?.id || '',
          branchId: current.branchId || initialBranch?.id || '',
          branchName: current.branchName || initialBranch?.branchName || '',
          branchCode: current.branchCode || initialBranch?.branchCode || '',
          termId: current.termId || nextTerms.find((term) => term.isDefault)?.id || nextTerms[0]?.id || '',
        };
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load create order lookups.');
    } finally {
      setIsLoadingLookups(false);
    }
  }

  function updateDraft<Key extends keyof CreateOrderDraft>(key: Key, value: CreateOrderDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleAgentChange(agentId: string) {
    setValidationError('');
    if (draft.items.length > 0 && agentId !== draft.agentId) {
      const shouldClear = window.confirm('Changing the agent will clear current order items because price access and clients may change. Continue?');
      if (!shouldClear) {
        return;
      }
    }
    setDraft((current) => ({
      ...current,
      agentId,
      agentClientId: '',
      clientName: '',
      pricePreferenceId: '',
      pricePreference: null,
      items: [],
      totals: emptyTotals,
    }));
  }

  function handleBranchChange(branchId: string) {
    setValidationError('');
    if (draft.items.length > 0 && branchId !== draft.branchId) {
      const shouldClear = window.confirm('Changing the branch will clear current order items because branch-specific pricing or promotions may change. Continue?');
      if (!shouldClear) {
        return;
      }
    }
    const branch = branches.find((item) => item.id === branchId) ?? null;
    setDraft((current) => ({
      ...current,
      branchId: branch?.id ?? '',
      branchName: branch?.branchName ?? '',
      branchCode: branch?.branchCode ?? '',
      items: branchId === current.branchId ? current.items : [],
      totals: branchId === current.branchId ? current.totals : emptyTotals,
    }));
  }

  function handleClientChange(clientId: string) {
    const client = agentClients.find((item) => item.id === clientId) ?? null;
    setValidationError('');
    const defaultPriceClass =
      client?.defaultPriceCode
        ? allowedPriceClasses.find((priceClass) => priceClass.priceCode === client.defaultPriceCode)
        : null;
    const inaccessibleDefaultPrice = Boolean(client?.defaultPriceCode && !defaultPriceClass);
    const defaultTerm = client?.defaultDeliveryTermId
      ? terms.find((term) => term.id === client.defaultDeliveryTermId)
      : null;

    if (inaccessibleDefaultPrice) {
      setValidationError('The selected client default price level is not available to this Agent. Existing price selection was kept.');
    }

    setDraft((current) => ({
      ...current,
      agentClientId: clientId,
      clientName: client ? getClientDisplayName(client) : '',
      pricePreferenceId: defaultPriceClass && current.items.length === 0 ? defaultPriceClass.id : current.pricePreferenceId,
      pricePreference: defaultPriceClass && current.items.length === 0 ? mapPriceClassToPreference(defaultPriceClass) : current.pricePreference,
      termId: defaultTerm?.id ?? current.termId,
    }));
  }

  function applyAgentAccessToDraft(priceCodes: OrderPriceCode[]) {
    const allowedCodes = new Set(priceCodes);
    const nextAllowedClasses = sortPriceClasses(
      priceClasses.filter((priceClass) => allowedCodes.has(priceClass.priceCode as OrderPriceCode)),
    );
    setDraft((current) => {
      const currentAllowed = Boolean(
        current.pricePreferenceId &&
          nextAllowedClasses.some((priceClass) => priceClass.id === current.pricePreferenceId),
      );
      const nextPreference =
        currentAllowed
          ? current.pricePreference
          : nextAllowedClasses.length === 1
            ? mapPriceClassToPreference(nextAllowedClasses[0])
            : null;
      const nextPreferenceId = nextPreference?.id ?? '';
      const preferenceChanged = current.pricePreferenceId !== nextPreferenceId;

      return {
        ...current,
        pricePreferenceId: nextPreferenceId,
        pricePreference: nextPreference,
        items: preferenceChanged ? [] : current.items,
        totals: preferenceChanged ? emptyTotals : current.totals,
      };
    });
  }

  function handlePricePreferenceChange(priceClassId: string) {
    const selectedClass = priceClasses.find((item) => item.id === priceClassId);
    const nextPreference = selectedClass ? mapPriceClassToPreference(selectedClass) : null;
    if (priceClassId && !allowedPriceClasses.some((priceClass) => priceClass.id === priceClassId)) {
      setValidationError('Selected price preference is not allowed for this agent.');
      return;
    }
    if (draft.items.length > 0 && priceClassId !== draft.pricePreferenceId) {
      const shouldClear = window.confirm('Changing the price preference will clear current cart items. Continue?');
      if (!shouldClear) {
        return;
      }
    }
    setDraft((current) => ({
      ...current,
      pricePreferenceId: priceClassId,
      pricePreference: nextPreference,
      items: priceClassId === current.pricePreferenceId ? current.items : [],
      totals: priceClassId === current.pricePreferenceId ? current.totals : emptyTotals,
    }));
  }

  function retryAgentPriceAccess() {
    if (!draft.agentId) {
      return;
    }
    setAgentAccessCache((current) => {
      const next = { ...current };
      delete next[draft.agentId];
      return next;
    });
  }

  function setItems(items: CreateOrderCartItem[]) {
    setDraft((current) => ({
      ...current,
      items,
      totals: calculateTotals(items),
    }));
  }

  function handleSaveItem(item: CreateOrderCartItem) {
    const exists = draft.items.some((current) => current.id === item.id);
    setItems(exists ? draft.items.map((current) => (current.id === item.id ? item : current)) : [...draft.items, item]);
    if (exists) {
      setEditingItem(null);
      setIsConfiguratorOpen(false);
    }
  }

  function handleDuplicateItem(item: CreateOrderCartItem) {
    setItems([...draft.items, { ...item, id: createLineId() }]);
  }

  function handleCancel() {
    if (isSubmitting) {
      return;
    }
    if (!isDraftDirty(draft)) {
      onClose();
      return;
    }
    setIsDiscardConfirmOpen(true);
  }

  async function handleCreateOrder() {
    if (isSubmitting) {
      return;
    }
    setValidationError('');
    const preflightError = validateDraftForSubmit(draft);
    if (preflightError) {
      setValidationError(preflightError);
      return;
    }
    if (priceAccessValidation) {
      setValidationError(priceAccessValidation);
      return;
    }
    if (assortedSelectionError) {
      setValidationError(assortedSelectionError);
      return;
    }
    if (!selectedBranch || !selectedTerm || !draft.pricePreference) {
      setValidationError('Complete the required order information and add at least one product.');
      return;
    }

    setIsSubmitting(true);
    try {
      const customerType = normalizeCustomerType(draft.customerType);
      const branchName = draft.branchName.trim() || selectedBranch.branchName.trim();
      const branchCode = nullableText(draft.branchCode || selectedBranch.branchCode);
      const result = await createAdminOrder(
        {
          agent_id: draft.agentId.trim(),
          client_id: customerType === 'existing' ? draft.agentClientId.trim() : null,
          delivery_term_id: draft.termId.trim(),
          customer_type: customerType,
          branch_id: draft.branchId.trim(),
          branch_name: branchName,
          branch_code: branchCode,
          preference_type: draft.pricePreference.priceType,
          price_code: nullableText(draft.pricePreference.priceCode),
          client_name:
            customerType === 'existing'
              ? (selectedClient ? getClientDisplayName(selectedClient) : draft.clientName.trim())
              : draft.guestFullName.trim(),
          client_company:
            customerType === 'existing'
              ? nullableText(selectedClient?.companyName)
              : nullableText(draft.guestCompany),
          client_address:
            customerType === 'existing'
              ? nullableText(selectedClient?.address)
              : nullableText(draft.guestAddress),
          client_tin:
            customerType === 'existing'
              ? nullableText(selectedClient?.tin)
              : nullableText(draft.guestTin),
          client_contact_number:
            customerType === 'existing'
              ? nullableText(selectedClient?.contactNumber || selectedClient?.contactPerson)
              : nullableText(draft.guestMobileNumber),
          client_email:
            customerType === 'existing'
              ? nullableText(selectedClient?.email)
              : nullableText(draft.guestEmail),
          guest:
            customerType === 'guest'
              ? {
                  name: draft.guestFullName.trim(),
                  company: nullableText(draft.guestCompany),
                  address: nullableText(draft.guestAddress),
                  tin: nullableText(draft.guestTin),
                  contact_number: nullableText(draft.guestMobileNumber),
                  email: nullableText(draft.guestEmail),
                }
              : null,
          remarks: nullableText(draft.notes),
          subtotal: roundMoney(displayTotals.subtotal),
          discount_total: roundMoney(displayTotals.discountTotal),
          surcharge_total: roundMoney(displayTotals.surchargeTotal),
          grand_total: roundMoney(displayTotals.grandTotal),
          metadata: {
            source: 'admin',
            created_from: 'admin_orders_page',
          },
        },
        buildOrderItemPayloads(draft.items, branchName, selectedAssortedRewards),
      );
      setCreateResult(result);
      onCreated?.();
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'The order could not be created.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenAddProduct() {
    setValidationError('');
    if (priceAccessValidation) {
      setValidationError(priceAccessValidation);
      return;
    }
    if (!isHeaderComplete(draft)) {
      setValidationError(getAddProductDisabledMessage(draft, priceAccessValidation));
      return;
    }
    setIsConfiguratorOpen(true);
  }

  return createPortal(
    <div className={styles.workspace} role="dialog" aria-modal="true" aria-label="Create order workspace">
      <section className={styles.panelShell}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Create Order</h2>
            <p className={styles.subtitle}>Create a direct order for an existing client or guest customer.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={handleCancel} aria-label="Cancel create order" disabled={isSubmitting}>
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </header>

        {loadError ? <p className={styles.alert}>{loadError}</p> : null}

        <main className={styles.content}>
          <section className={styles.mainColumn}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h3>Order Information</h3>
                {isLoadingLookups ? <span>Loading...</span> : null}
              </div>

            <div className={styles.formGrid}>
              <SearchableSelect
                label="Agent *"
                placeholder="Search or select agent"
                value={draft.agentId}
                options={agents}
                noResultsText="No matching agents found."
                getOptionValue={(agent) => agent.id}
                getOptionLabel={(agent) => formatAgentLabel(agent)}
                getSearchText={(agent) =>
                  [agent.fullName, agent.agentCode, agent.companyName, agent.email].filter(Boolean).join(' ')
                }
                renderOption={(agent) => (
                  <>
                    <strong>{agent.fullName || 'Unnamed Agent'}</strong>
                    <span>{agent.agentCode || '-'}</span>
                    {agent.companyName ? <span>{agent.companyName}</span> : null}
                    <span>Active</span>
                  </>
                )}
                onChange={(agentId) => {
                  handleAgentChange(agentId);
                }}
              />

              <label className={styles.field}>
                <span>Price Preference *</span>
                <select
                  value={draft.pricePreferenceId}
                  disabled={!draft.agentId || selectedAgentAccess?.isLoading || Boolean(selectedAgentAccess?.error)}
                  onChange={(event) => handlePricePreferenceChange(event.target.value)}
                >
                  <option value="">Select price preference</option>
                  {allowedPriceClasses.map((priceClass) => (
                    <option key={priceClass.id} value={priceClass.id}>
                      {priceClass.priceCode} - {priceClass.priceLabel || priceClass.preferenceCode || priceClass.priceCode}
                    </option>
                  ))}
                </select>
                {selectedAgentAccess?.isLoading ? <small className={styles.fieldHint}>Loading this agent's price access...</small> : null}
                {selectedAgentAccess?.error ? (
                  <span className={styles.inlineError}>
                    Unable to load this agent's price access.
                    <button type="button" onClick={retryAgentPriceAccess}>Retry</button>
                  </span>
                ) : null}
                {draft.agentId && selectedAgentAccess && !selectedAgentAccess.isLoading && !selectedAgentAccess.error && allowedPriceClasses.length === 0 ? (
                  <small className={styles.inlineError}>This agent has no active price preference access.</small>
                ) : null}
                <small className={styles.fieldHint}>
                  Options are limited by the selected agent's saved price access.
                </small>
              </label>

              <label className={styles.field}>
                <span>Customer Type *</span>
                <select
                  value={draft.customerType}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      customerType: event.target.value as CreateOrderCustomerType,
                      agentClientId: '',
                      clientName: '',
                      guestFullName: '',
                      guestCompany: '',
                      guestAddress: '',
                      guestTin: '',
                      guestMobileNumber: '',
                      guestEmail: '',
                      guestNotes: '',
                    }))
                  }
                >
                  <option value="existing">Existing Client</option>
                  <option value="guest">Guest</option>
                </select>
              </label>

              {draft.customerType === 'existing' ? (
                <div className={styles.wideField}>
                  {draft.agentId ? (
                    <SearchableSelect
                      label="Client *"
                      placeholder={isLoadingClients ? 'Loading active clients...' : 'Search assigned client'}
                      value={draft.agentClientId}
                      options={agentClients}
                      noResultsText="No active clients found for this agent."
                      getOptionValue={(client) => client.id}
                      getOptionLabel={(client) =>
                        [getClientDisplayName(client), client.clientName && client.companyName ? client.clientName : ''].filter(Boolean).join(' - ')
                      }
                      getSearchText={(client) =>
                        [
                          client.companyName,
                          client.clientName,
                          client.clientCode,
                          client.customClientCode,
                          client.contactPerson,
                          client.contactNumber,
                        ]
                          .filter(Boolean)
                          .join(' ')
                      }
                      renderOption={(client) => (
                        <>
                          <strong>{getClientDisplayName(client)}</strong>
                          <span>{client.clientName || client.contactPerson || '-'}</span>
                          <span>{client.customClientCode || client.clientCode || '-'}</span>
                          <span>{client.contactPerson || client.contactNumber || '-'}</span>
                        </>
                      )}
                      onChange={handleClientChange}
                    />
                  ) : (
                    <p className={styles.helperText}>Select an agent before choosing an existing client.</p>
                  )}
                  {selectedClient ? (
                    <p className={styles.fieldHint}>
                      Selected client: {getClientDisplayName(selectedClient)}
                      {selectedClient.clientName && selectedClient.companyName ? ` - ${selectedClient.clientName}` : ''}
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  <label className={styles.field}>
                    <span>Guest Full Name *</span>
                    <input value={draft.guestFullName} onChange={(event) => updateDraft('guestFullName', event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span>Company</span>
                    <input value={draft.guestCompany} onChange={(event) => updateDraft('guestCompany', event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span>Mobile Number</span>
                    <input value={draft.guestMobileNumber} onChange={(event) => updateDraft('guestMobileNumber', event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span>Email</span>
                    <input type="email" value={draft.guestEmail} onChange={(event) => updateDraft('guestEmail', event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span>TIN</span>
                    <input value={draft.guestTin} onChange={(event) => updateDraft('guestTin', event.target.value)} />
                  </label>
                  <label className={`${styles.field} ${styles.wideField}`}>
                    <span>Address</span>
                    <textarea value={draft.guestAddress} onChange={(event) => updateDraft('guestAddress', event.target.value)} />
                  </label>
                  <label className={`${styles.field} ${styles.wideField}`}>
                    <span>Guest Notes</span>
                    <textarea value={draft.guestNotes} onChange={(event) => updateDraft('guestNotes', event.target.value)} />
                  </label>
                </>
              )}

              <label className={styles.field}>
                <span>Branch *</span>
                <select value={draft.branchId} onChange={(event) => handleBranchChange(event.target.value)}>
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.branchName} ({branch.branchCode})</option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Terms *</span>
                <select value={draft.termId} onChange={(event) => updateDraft('termId', event.target.value)}>
                  <option value="">Select terms</option>
                  {terms.map((term) => (
                    <option key={term.id} value={term.id}>{term.termName} ({term.termCode})</option>
                  ))}
                </select>
              </label>

              <label className={`${styles.field} ${styles.wideField}`}>
                <span>Order Notes</span>
                <textarea value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} />
              </label>
            </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h3>Order Items</h3>
                <button
                  type="button"
                  className={styles.outlineButton}
                  disabled={!canAddProduct}
                  onClick={handleOpenAddProduct}
                >
                  Add Product
                </button>
              </div>
              {!canAddProduct ? <p className={styles.helperText}>{addProductDisabledMessage}</p> : null}

            {draft.items.length === 0 ? (
              <div className={styles.emptyState}>
                <strong>No products added yet.</strong>
                <span>Select Add Product to build the order.</span>
              </div>
            ) : (
              <div className={styles.cartTable}>
                <div className={styles.cartHeader}>
                  <span>Product</span><span>Variation</span><span>Unit</span><span>Class</span><span>Qty</span><span>Free</span><span>Unit Price</span><span>Gross</span><span>Discount</span><span>Surcharge</span><span>Total</span><span>Action</span>
                </div>
                {draft.items.map((item) => (
                  <div key={item.id} className={styles.cartRow}>
                    <span>{item.productName}</span>
                    <span>{item.variationName}</span>
                    <span>{item.unitOption.unitLabel}</span>
                    <span>{item.pricePreference.displayLabel}</span>
                    <span>{item.quantity}</span>
                    <span>{item.calculation.freeQuantity || '-'}</span>
                    <span>{formatCurrency(item.calculation.computedUnitPrice)}</span>
                    <span>{formatCurrency(item.calculation.grossSubtotal)}</span>
                    <span>{formatCurrency(item.calculation.discountAmount)}</span>
                    <span>{formatCurrency(item.calculation.surchargeAmount)}</span>
                    <span>{formatCurrency(item.calculation.finalLineTotal)}</span>
                    <span className={styles.rowActions}>
                      <button
                        type="button"
                        onClick={() => { setEditingItem(item); setIsConfiguratorOpen(true); }}
                        aria-label={`Edit ${item.productName}`}
                        disabled={isSubmitting}
                      >
                        <i className="fa-solid fa-pen" aria-hidden="true"></i>
                      </button>
                      <button type="button" onClick={() => handleDuplicateItem(item)} aria-label={`Duplicate ${item.productName}`} disabled={isSubmitting}>
                        <i className="fa-solid fa-copy" aria-hidden="true"></i>
                      </button>
                      <button type="button" onClick={() => setRemoveTarget(item)} aria-label={`Remove ${item.productName}`} disabled={isSubmitting}>
                        <i className="fa-solid fa-trash" aria-hidden="true"></i>
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            </section>
          </section>

          <aside className={styles.summaryColumn}>
            <section className={styles.summaryPanel}>
              <h3>Order Summary</h3>
              <div className={styles.summaryRows}>
                <span>Line items</span><strong>{displayTotals.lineItems}</strong>
                <span>Total paid quantity</span><strong>{displayTotals.paidQuantity}</strong>
                <span>Total free quantity</span><strong>{displayTotals.freeQuantity}</strong>
                <span>Subtotal</span><strong>{formatCurrency(displayTotals.subtotal)}</strong>
                <span>Discount</span><strong>{formatCurrency(displayTotals.discountTotal)}</strong>
                <span>Surcharge</span><strong>{formatCurrency(displayTotals.surchargeTotal)}</strong>
                <span>Grand total</span><strong>{formatCurrency(displayTotals.grandTotal)}</strong>
              </div>
              {assortedPromotions.length > 0 ? (
                <div className={styles.assortedPromoList}>
                  {assortedPromotions.map((promo) => {
                    const options = getAssortedRewardOptions(promo, catalogProducts);
                    const selection = assortedRewardSelections[promo.groupKey];
                    return (
                      <div key={promo.groupKey} className={styles.assortedPromoCard}>
                        <div className={styles.assortedPromoHeader}>
                          <strong>{promo.promoLabel}</strong>
                          <span>{promo.qualified ? 'Qualified' : `${promo.remainingQuantity} ${promo.qualifyingUnitCode.toUpperCase()} remaining`}</span>
                        </div>
                        <div className={styles.assortedPromoLines}>
                          {promo.lineBreakdown.map((line) => (
                            <span key={line.lineId}>
                              {line.variationName}: {line.quantity} {promo.qualifyingUnitCode.toUpperCase()}
                            </span>
                          ))}
                        </div>
                        <div className={styles.assortedPromoProgress}>
                          <span>
                            {promo.qualifyingQuantity} / {promo.thresholdQuantity} {promo.qualifyingUnitCode.toUpperCase()}
                          </span>
                          <strong>Reward: {promo.rewardQuantity} {promo.rewardUnitCode.toUpperCase()}</strong>
                        </div>
                        {promo.qualified && promo.rewardQuantity > 0 && options.length > 0 ? (
                          <label className={styles.assortedRewardField}>
                            <span>Free Variation</span>
                            <select
                              value={`${selection?.rewardVariationId ?? ''}::${selection?.rewardUnitOptionId ?? ''}`}
                              onChange={(event) => {
                                const [rewardVariationId, rewardUnitOptionId] = event.target.value.split('::');
                                setAssortedRewardSelections((current) => ({
                                  ...current,
                                  [promo.groupKey]: { rewardVariationId, rewardUnitOptionId },
                                }));
                              }}
                            >
                              {options.map((option) => (
                                <option
                                  key={`${option.variationId}::${option.unitOption.id}`}
                                  value={`${option.variationId}::${option.unitOption.id}`}
                                >
                                  {option.variationName} - {option.unitOption.unitLabel}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {validationError ? <p className={styles.alert}>{validationError}</p> : null}
              {assortedSelectionError && !validationError ? <p className={styles.alert}>{assortedSelectionError}</p> : null}
              <button type="button" className={styles.primaryButton} disabled={!canCreate} onClick={() => void handleCreateOrder()}>
                {isSubmitting ? 'Creating Order...' : 'Create Order'}
              </button>
              <p className={styles.helperText}>Order and P.O. numbers are generated after successful creation.</p>
            </section>
          </aside>
        </main>
      </section>

      {isConfiguratorOpen ? (
        <OrderItemConfigurator
          products={catalogProducts}
          branchName={selectedBranch?.branchName ?? ''}
          pricePreference={draft.pricePreference}
          cartItems={draft.items}
          cartTotals={displayTotals}
          initialItem={editingItem}
          onClose={() => {
            setIsConfiguratorOpen(false);
            setEditingItem(null);
          }}
          onSave={handleSaveItem}
        />
      ) : null}

      {isDiscardConfirmOpen ? (
        <div className={styles.confirmOverlay} role="presentation">
          <div className={styles.confirmModal} role="dialog" aria-modal="true" aria-label="Discard create order draft">
            <h3>Discard this order draft?</h3>
            <p>Your unsaved order information and cart items will be lost.</p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.outlineButton} onClick={() => setIsDiscardConfirmOpen(false)}>
                Keep Editing
              </button>
              <button type="button" className={styles.dangerButton} onClick={onClose}>
                Discard Draft
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removeTarget ? (
        <div className={styles.confirmOverlay} role="presentation">
          <div className={styles.confirmModal} role="dialog" aria-modal="true" aria-label="Remove order item">
            <h3>Remove item?</h3>
            <p>Remove {removeTarget.productName} from this draft order.</p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.outlineButton} onClick={() => setRemoveTarget(null)}>Cancel</button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => {
                  setItems(draft.items.filter((item) => item.id !== removeTarget.id));
                  setRemoveTarget(null);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createResult ? (
        <div className={styles.confirmOverlay} role="presentation">
          <div className={styles.confirmModal} role="dialog" aria-modal="true" aria-label="Order created">
            <div className={styles.panelHeader}>
              <h3>Order Successfully Created</h3>
            </div>
            <div className={styles.summaryRows}>
              <span>Order Number</span><strong>{createResult.order_number}</strong>
              <span>P.O. Number</span><strong>{createResult.po_number}</strong>
              <span>Client</span><strong>{createResult.client_name}</strong>
              <span>Grand Total</span><strong>{formatCurrency(Number(createResult.grand_total ?? 0))}</strong>
            </div>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => {
                  setDraft(emptyDraft);
                  onClose();
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

function calculateTotals(items: CreateOrderCartItem[]): CreateOrderTotals {
  return items.reduce<CreateOrderTotals>(
    (totals, item) => ({
      lineItems: totals.lineItems + 1,
      paidQuantity: totals.paidQuantity + item.quantity,
      freeQuantity: totals.freeQuantity + item.calculation.freeQuantity,
      subtotal: totals.subtotal + item.calculation.grossSubtotal,
      discountTotal: totals.discountTotal + item.calculation.discountAmount,
      surchargeTotal: totals.surchargeTotal + item.calculation.surchargeAmount,
      grandTotal: totals.grandTotal + item.calculation.finalLineTotal,
    }),
    emptyTotals,
  );
}

function roundMoney(value: number) {
  return Math.round(safeNumber(value) * 100) / 100;
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableUuid(value?: string | null) {
  const trimmed = String(value ?? '').trim();
  return trimmed && isUuid(trimmed) ? trimmed : null;
}

function nullableText(value?: string | null) {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

function normalizeCustomerType(value: CreateOrderCustomerType): 'existing' | 'guest' {
  return value === 'guest' ? 'guest' : 'existing';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function buildOrderItemPayloads(
  items: CreateOrderCartItem[],
  branchName: string,
  assortedRewards: SelectedAssortedReward[] = [],
): AdminOrderItemCreatePayload[] {
  const assortedRewardsByCarrierLineId = assortedRewards.reduce<Record<string, SelectedAssortedReward[]>>(
    (result, reward) => {
      result[reward.carrierLineId] = [...(result[reward.carrierLineId] ?? []), reward];
      return result;
    },
    {},
  );

  return items.map((item, index) => {
    const lineAssortedRewards = assortedRewardsByCarrierLineId[item.id] ?? [];
    const assortedFreeQuantity = lineAssortedRewards.reduce(
      (sum, reward) => sum + reward.result.rewardQuantity,
      0,
    );
    const discountPromotions = item.calculation.appliedPromotions.filter(
      (promotion) => promotion.source === 'discount',
    );
    const promoPromotion = item.calculation.appliedPromotions.find(
      (promotion) => promotion.source === 'surcharge' && promotion.freeQuantity > 0,
    );
    const discountPercent =
      item.calculation.grossSubtotal > 0
        ? roundMoney((item.calculation.discountAmount / item.calculation.grossSubtotal) * 100)
        : null;
    const pricingSnapshot = {
      source: 'admin_create_order',
      price: item.price,
      unit_option: item.unitOption,
      calculation: item.calculation,
      price_preference: item.pricePreference,
      assorted_promotions: lineAssortedRewards.map(toAssortedRewardSnapshot),
    };
    const metadata = {
      source: 'admin_create_order',
      pricing_snapshot: pricingSnapshot,
      applied_promotions: item.calculation.appliedPromotions,
      available_promotions: item.calculation.availablePromotions,
      ineligible_promotions: item.calculation.ineligiblePromotions,
      assorted_promotions: lineAssortedRewards.map(toAssortedRewardSnapshot),
    };
    const productKey = [
      item.productId,
      `variation:${item.price.variationId}`,
      `unit-option:${item.unitOption.id}`,
      `unit-code:${item.unitOption.unitCode}`,
      `branch:${branchName}`,
      `type:${item.price.priceType}`,
      `price:${item.priceCode}`,
      `promo:${promoPromotion?.id ?? 'none'}`,
    ].join('|');

    return {
      product_id: nullableUuid(item.productId),
      variation_id: nullableUuid(item.price.variationId),
      product_key: productKey,
      product_name: item.productName,
      product_code: item.productCode || null,
      variant_label: item.variationName || null,
      branch_name: branchName || item.price.branchName || null,
      preference_type: item.price.priceType || item.pricePreference.priceType,
      price_code: item.priceCode || null,
      image_url: null,
      image_path: '',
      unit_price: roundMoney(item.calculation.computedUnitPrice),
      quantity: safeNumber(item.quantity, 1),
      discount_amount: roundMoney(item.calculation.discountAmount),
      surcharge_amount: roundMoney(item.calculation.surchargeAmount),
      free_quantity: safeNumber(item.calculation.freeQuantity) + assortedFreeQuantity,
      sort_order: index + 1,
      metadata,
      buying_option_id: null,
      unit_code: item.unitOption.unitCode || null,
      unit_label: item.unitOption.unitLabel || null,
      unit_quantity: safeNumber(item.unitOption.quantityInBaseUnit, 1),
      base_unit_label: item.unitOption.baseUnitCode || null,
      base_quantity: safeNumber(item.quantity, 1) * safeNumber(item.unitOption.quantityInBaseUnit, 1),
      discount_id: nullableUuid(discountPromotions.find((promotion) => isUuid(promotion.id))?.id),
      discount_name: discountPromotions.map((promotion) => promotion.name).filter(Boolean).join(' + ') || null,
      discount_type: discountPromotions.map((promotion) => promotion.type).filter(Boolean).join(' + ') || null,
      discount_percent: discountPercent,
      promo_id: nullableUuid(promoPromotion?.id ?? lineAssortedRewards[0]?.result.promoId),
      promo_label: promoPromotion?.name ?? lineAssortedRewards[0]?.result.promoLabel ?? null,
      pricing_snapshot: pricingSnapshot,
      unit_option_id: nullableUuid(item.unitOption.id),
      ordered_quantity: safeNumber(item.quantity, 1),
      is_billable: true,
      admin_notes: null,
      to_follow_reason: null,
    };
  });
}

function resolveSelectedAssortedRewards(
  results: AssortedPromotionResult[],
  selections: Record<string, AssortedRewardSelection>,
  products: OrderCatalogProduct[],
): SelectedAssortedReward[] {
  return results.flatMap((result) => {
    if (!result.qualified || result.rewardQuantity <= 0) {
      return [];
    }
    const options = getAssortedRewardOptions(result, products);
    const selection = selections[result.groupKey];
    const selectedOption = options.find(
      (option) =>
        option.variationId === selection?.rewardVariationId &&
        option.unitOption.id === selection?.rewardUnitOptionId,
    );
    if (!selectedOption) {
      return [];
    }
    const carrierLineId =
      result.lineBreakdown.find((line) => line.variationId === selectedOption.variationId)?.lineId ??
      result.eligibleLineIds[0] ??
      '';
    if (!carrierLineId) {
      return [];
    }
    return [
      {
        result,
        rewardVariationId: selectedOption.variationId,
        rewardVariationName: selectedOption.variationName,
        rewardUnitOption: selectedOption.unitOption,
        carrierLineId,
      },
    ];
  });
}

function getAssortedRewardOptions(result: AssortedPromotionResult, products: OrderCatalogProduct[]) {
  const product = products.find((item) => item.id === (result.rewardProductId || result.productId));
  if (!product) {
    return [];
  }
  const rewardUnitCode = normalizeUnitCode(result.rewardUnitCode || result.qualifyingUnitCode);
  const fixedVariationId =
    result.rewardTargetType === 'different_item' && result.rewardVariationId
      ? result.rewardVariationId
      : '';
  const eligibleVariationIds = new Set(result.eligibleVariationIds);

  return product.variations.flatMap((variation) => {
    const entries = Object.values(variation.prices).flatMap((price) => {
      if (!price) return [];
      const isEligible =
        fixedVariationId
          ? price.variationId === fixedVariationId
          : eligibleVariationIds.has(price.variationId);
      if (!isEligible) {
        return [];
      }
      const unitOption = resolveRewardUnitOption(
        variation.unitOptions,
        price.variationId,
        result.rewardUnitOptionId,
        rewardUnitCode,
      );
      if (!unitOption) {
        return [];
      }
      return [
        {
          variationId: price.variationId,
          variationName: variation.variationName,
          unitOption,
        },
      ];
    });
    return entries;
  });
}

function resolveRewardUnitOption(
  unitOptions: OrderCatalogUnitOption[],
  variationId: string,
  configuredUnitOptionId: string | null,
  unitCode: string,
) {
  const activeOptions = unitOptions.filter(
    (option) => option.isOrderable && option.status.toLowerCase() === 'active',
  );
  return (
    activeOptions.find(
      (option) =>
        configuredUnitOptionId &&
        option.id === configuredUnitOptionId &&
        option.variationId === variationId,
    ) ??
    activeOptions.find(
      (option) =>
        option.variationId === variationId &&
        normalizeUnitCode(option.unitCode) === unitCode,
    ) ??
    activeOptions.find((option) => normalizeUnitCode(option.unitCode) === unitCode) ??
    null
  );
}

function getAssortedSelectionError(
  results: AssortedPromotionResult[],
  selectedRewards: SelectedAssortedReward[],
) {
  const requiredCount = results.filter((result) => result.qualified && result.rewardQuantity > 0).length;
  if (requiredCount === selectedRewards.length) {
    return '';
  }
  return requiredCount > 0 ? 'Select a free variation for each qualified assorted promo.' : '';
}

function toAssortedRewardSnapshot(reward: SelectedAssortedReward) {
  const result = reward.result;
  return {
    qualification_scope: 'assorted_same_product',
    promo_id: result.promoId,
    promo_label: result.promoLabel,
    product_id: result.productId,
    qualifying_unit_code: result.qualifyingUnitCode,
    threshold_quantity: result.thresholdQuantity,
    grouped_qualifying_quantity: result.qualifyingQuantity,
    remaining_quantity: result.remainingQuantity,
    reward_repeat_mode: result.rewardRepeatMode,
    repeat_count: result.repeatCount,
    reward_quantity: result.rewardQuantity,
    reward_unit_code: result.rewardUnitCode,
    qualifying_variation_ids: result.eligibleVariationIds,
    qualifying_line_ids: result.eligibleLineIds,
    selected_reward_variation_id: reward.rewardVariationId,
    selected_reward_variation_name: reward.rewardVariationName,
    selected_reward_unit_option_id: reward.rewardUnitOption.id,
    selected_reward_unit_code: reward.rewardUnitOption.unitCode,
  };
}

function validateDraftForSubmit(draft: CreateOrderDraft) {
  if (!isUuid(draft.agentId.trim())) {
    return 'Please select an agent.';
  }
  if (!draft.pricePreference || !draft.pricePreferenceId.trim()) {
    return 'Please select a price preference.';
  }
  if (!isUuid(draft.branchId.trim()) || !draft.branchName.trim()) {
    return 'Please select a valid branch.';
  }
  if (!isUuid(draft.termId.trim())) {
    return 'Please select terms.';
  }
  if (draft.customerType === 'existing' && !isUuid(draft.agentClientId.trim())) {
    return 'Please select an existing client.';
  }
  if (draft.customerType === 'guest' && !draft.guestFullName.trim()) {
    return 'Guest customer name is required.';
  }
  if (draft.items.length === 0) {
    return 'Add at least one order item.';
  }

  const invalidItem = draft.items.find((item) => {
    const quantity = safeNumber(item.quantity);
    const unitPrice = safeNumber(item.calculation.computedUnitPrice, Number.NaN);
    const subtotal = safeNumber(item.calculation.grossSubtotal, Number.NaN);
    const total = safeNumber(item.calculation.finalLineTotal, Number.NaN);
    return (
      !item.productName.trim() ||
      quantity <= 0 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0 ||
      !Number.isFinite(subtotal) ||
      !Number.isFinite(total)
    );
  });

  if (invalidItem) {
    return `Review ${invalidItem.productName || 'the selected item'} before creating this order.`;
  }

  return '';
}

function isDraftComplete(draft: CreateOrderDraft) {
  return isHeaderComplete(draft) && draft.items.length > 0;
}

function isHeaderComplete(draft: CreateOrderDraft) {
  const hasCustomer =
    draft.customerType === 'existing'
      ? Boolean(draft.agentClientId && draft.clientName.trim())
      : Boolean(draft.guestFullName.trim());
  return Boolean(draft.agentId && draft.pricePreference && draft.pricePreferenceId && hasCustomer && draft.branchId && draft.termId);
}

function getPriceAccessValidation(
  draft: CreateOrderDraft,
  allowedPriceClasses: OrderCatalogPriceClass[],
  accessState: AgentAccessState | null | undefined,
) {
  if (!draft.agentId) {
    return '';
  }
  if (accessState?.isLoading) {
    return "Loading this agent's price access.";
  }
  if (accessState?.error) {
    return "Unable to load this agent's price access.";
  }
  if (accessState && allowedPriceClasses.length === 0) {
    return 'This agent has no active price preference access.';
  }
  if (
    draft.pricePreferenceId &&
    !allowedPriceClasses.some((priceClass) => priceClass.id === draft.pricePreferenceId)
  ) {
    return 'Selected price preference is not allowed for this agent.';
  }
  return '';
}

function getAddProductDisabledMessage(draft: CreateOrderDraft, priceAccessValidation: string) {
  if (priceAccessValidation) {
    return priceAccessValidation;
  }
  if (isHeaderComplete(draft)) {
    return '';
  }
  return 'Select an agent, price preference, customer, branch, and terms before adding products.';
}

function sortPriceClasses(priceClasses: OrderCatalogPriceClass[]) {
  return [...priceClasses].sort((left, right) => {
    const sortDelta = normalizeSortOrder(left.sortOrder) - normalizeSortOrder(right.sortOrder);
    if (sortDelta !== 0) {
      return sortDelta;
    }
    return getPriceCodeFallbackIndex(left.priceCode) - getPriceCodeFallbackIndex(right.priceCode);
  });
}

function normalizeSortOrder(sortOrder: number) {
  return Number.isFinite(sortOrder) && sortOrder > 0 ? sortOrder : Number.MAX_SAFE_INTEGER;
}

function getPriceCodeFallbackIndex(priceCode: string) {
  const index = PRICE_CODE_FALLBACK_ORDER.indexOf(priceCode as OrderPriceCode);
  return index === -1 ? PRICE_CODE_FALLBACK_ORDER.length : index;
}

function isDraftDirty(draft: CreateOrderDraft) {
  return (
    draft.pricePreferenceId ||
    draft.agentClientId ||
    draft.clientName.trim() ||
    draft.guestFullName.trim() ||
    draft.guestCompany.trim() ||
    draft.guestAddress.trim() ||
    draft.guestTin.trim() ||
    draft.guestMobileNumber.trim() ||
    draft.guestEmail.trim() ||
    draft.guestNotes.trim() ||
    draft.notes.trim() ||
    draft.items.length > 0
  );
}
