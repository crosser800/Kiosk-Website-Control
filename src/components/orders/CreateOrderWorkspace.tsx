import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { loadAgentPriceAccess } from '../../services/agentPriceAccess';
import { loadOrderCatalog, loadOrderPriceClasses, type OrderCatalogPriceClass, type OrderCatalogProduct } from '../../services/orderCatalog';
import type { OrderPriceCode } from '../../services/orderPricing';
import OrderItemConfigurator from './OrderItemConfigurator';
import SearchableSelect from './SearchableSelect';
import type {
  CreateOrderAgent,
  CreateOrderBranch,
  CreateOrderCartItem,
  CreateOrderCustomerType,
  CreateOrderDraft,
  CreateOrderTerm,
  CreateOrderTotals,
} from './createOrderTypes';
import { mapPriceClassToPreference } from './createOrderTypes';
import styles from './CreateOrderWorkspace.module.css';

type Props = {
  onClose: () => void;
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
  clientName: '',
  guestFullName: '',
  guestMobileNumber: '',
  guestNotes: '',
  branchId: '',
  termId: '',
  poNumber: '',
  notes: '',
  items: [],
  totals: emptyTotals,
};

type AgentAccessState = {
  priceCodes: OrderPriceCode[];
  isLoading: boolean;
  error: string;
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

export default function CreateOrderWorkspace({ onClose }: Props) {
  const [draft, setDraft] = useState<CreateOrderDraft>(emptyDraft);
  const [agents, setAgents] = useState<CreateOrderAgent[]>([]);
  const [branches, setBranches] = useState<CreateOrderBranch[]>([]);
  const [terms, setTerms] = useState<CreateOrderTerm[]>([]);
  const [priceClasses, setPriceClasses] = useState<OrderCatalogPriceClass[]>([]);
  const [clientNames, setClientNames] = useState<string[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<OrderCatalogProduct[]>([]);
  const [agentAccessCache, setAgentAccessCache] = useState<Record<string, AgentAccessState>>({});
  const [isLoadingLookups, setIsLoadingLookups] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [isConfiguratorOpen, setIsConfiguratorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CreateOrderCartItem | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CreateOrderCartItem | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const [validationError, setValidationError] = useState('');

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === draft.branchId) ?? null,
    [branches, draft.branchId],
  );
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === draft.agentId) ?? null,
    [agents, draft.agentId],
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
  const filteredClientNames = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    return clientNames.filter((name) => name.toLowerCase().includes(query)).slice(0, 8);
  }, [clientNames, clientSearch]);
  const priceAccessValidation = getPriceAccessValidation(draft, allowedPriceClasses, selectedAgentAccess);
  const canCreate = isDraftComplete(draft) && !priceAccessValidation;
  const canAddProduct = isHeaderComplete(draft) && !priceAccessValidation;
  const addProductDisabledMessage = getAddProductDisabledMessage(draft, priceAccessValidation);
  const payloadPreview = useMemo(
    () => ({
      agent: selectedAgent,
      pricePreference: draft.pricePreference,
      customerType: draft.customerType,
      clientName: draft.customerType === 'existing' ? draft.clientName : null,
      guest:
        draft.customerType === 'guest'
          ? {
              fullName: draft.guestFullName,
              mobileNumber: draft.guestMobileNumber || null,
              notes: draft.guestNotes || null,
            }
          : null,
      branch: selectedBranch,
      deliveryTerm: selectedTerm,
      poNumber: draft.poNumber || null,
      notes: draft.notes || null,
      items: draft.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        variationId: item.variationId,
        variationName: item.variationName,
        unitOptionId: item.unitOption.id,
        unitLabel: item.unitOption.unitLabel,
        priceCode: item.priceCode,
        pricePreference: item.pricePreference,
        quantity: item.quantity,
        calculation: item.calculation,
      })),
      totals: draft.totals,
    }),
    [draft, selectedAgent, selectedBranch, selectedTerm],
  );

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
    if (!draft.agentId) {
      setDraft((current) => ({
        ...current,
        pricePreferenceId: '',
        pricePreference: null,
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

  async function loadLookups() {
    setIsLoadingLookups(true);
    setLoadError('');
    try {
      const [agentsRes, branchesRes, termsRes, clientsRes, catalog, nextPriceClasses] = await Promise.all([
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
        supabase
          .from('orders')
          .select('client_name')
          .not('client_name', 'is', null)
          .order('client_name', { ascending: true }),
        loadOrderCatalog(),
        loadOrderPriceClasses(),
      ]);

      const lookupError = agentsRes.error ?? branchesRes.error ?? termsRes.error ?? clientsRes.error;
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
      const nextClientNames = Array.from(
        new Set(
          (clientsRes.data ?? [])
            .map((row) => String(row.client_name ?? '').trim())
            .filter(Boolean),
        ),
      );

      setAgents(nextAgents);
      setBranches(nextBranches);
      setTerms(nextTerms);
      setPriceClasses(nextPriceClasses);
      setClientNames(nextClientNames);
      setCatalogProducts(catalog);
      setDraft((current) => ({
        ...current,
        agentId: current.agentId || nextAgents[0]?.id || '',
        branchId: current.branchId || nextBranches[0]?.id || '',
        termId: current.termId || nextTerms.find((term) => term.isDefault)?.id || nextTerms[0]?.id || '',
      }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load create order lookups.');
    } finally {
      setIsLoadingLookups(false);
    }
  }

  function updateDraft<Key extends keyof CreateOrderDraft>(key: Key, value: CreateOrderDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
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
    if (!isDraftDirty(draft)) {
      onClose();
      return;
    }
    setIsDiscardConfirmOpen(true);
  }

  function handlePreview() {
    setValidationError('');
    if (!isDraftComplete(draft)) {
      setValidationError('Complete the required order information and add at least one product.');
      return;
    }
    if (priceAccessValidation) {
      setValidationError(priceAccessValidation);
      return;
    }
    setIsPreviewOpen(true);
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
          <button type="button" className={styles.closeButton} onClick={handleCancel} aria-label="Cancel create order">
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
                  setValidationError('');
                  updateDraft('agentId', agentId);
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
                  onChange={(event) => updateDraft('customerType', event.target.value as CreateOrderCustomerType)}
                >
                  <option value="existing">Existing Client</option>
                  <option value="guest">Guest</option>
                </select>
              </label>

              {draft.customerType === 'existing' ? (
                <label className={`${styles.field} ${styles.wideField}`}>
                  <span>Client Name *</span>
                  <input
                    value={draft.clientName}
                    onChange={(event) => {
                      updateDraft('clientName', event.target.value);
                      setClientSearch(event.target.value);
                    }}
                    placeholder="Search or enter client name"
                    list="create-order-client-names"
                  />
                  <datalist id="create-order-client-names">
                    {filteredClientNames.map((name) => <option key={name} value={name} />)}
                  </datalist>
                </label>
              ) : (
                <>
                  <label className={styles.field}>
                    <span>Guest Full Name *</span>
                    <input value={draft.guestFullName} onChange={(event) => updateDraft('guestFullName', event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span>Mobile Number</span>
                    <input value={draft.guestMobileNumber} onChange={(event) => updateDraft('guestMobileNumber', event.target.value)} />
                  </label>
                  <label className={`${styles.field} ${styles.wideField}`}>
                    <span>Address or Notes</span>
                    <textarea value={draft.guestNotes} onChange={(event) => updateDraft('guestNotes', event.target.value)} />
                  </label>
                </>
              )}

              <label className={styles.field}>
                <span>Branch *</span>
                <select value={draft.branchId} onChange={(event) => updateDraft('branchId', event.target.value)}>
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

              <label className={styles.field}>
                <span>P.O. Number</span>
                <input value={draft.poNumber} onChange={(event) => updateDraft('poNumber', event.target.value)} />
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
                      <button type="button" onClick={() => { setEditingItem(item); setIsConfiguratorOpen(true); }} aria-label={`Edit ${item.productName}`}>
                        <i className="fa-solid fa-pen" aria-hidden="true"></i>
                      </button>
                      <button type="button" onClick={() => handleDuplicateItem(item)} aria-label={`Duplicate ${item.productName}`}>
                        <i className="fa-solid fa-copy" aria-hidden="true"></i>
                      </button>
                      <button type="button" onClick={() => setRemoveTarget(item)} aria-label={`Remove ${item.productName}`}>
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
                <span>Line items</span><strong>{draft.totals.lineItems}</strong>
                <span>Total paid quantity</span><strong>{draft.totals.paidQuantity}</strong>
                <span>Total free quantity</span><strong>{draft.totals.freeQuantity}</strong>
                <span>Subtotal</span><strong>{formatCurrency(draft.totals.subtotal)}</strong>
                <span>Discount</span><strong>{formatCurrency(draft.totals.discountTotal)}</strong>
                <span>Surcharge</span><strong>{formatCurrency(draft.totals.surchargeTotal)}</strong>
                <span>Grand total</span><strong>{formatCurrency(draft.totals.grandTotal)}</strong>
              </div>
              {validationError ? <p className={styles.alert}>{validationError}</p> : null}
              <button type="button" className={styles.primaryButton} disabled={!canCreate} onClick={handlePreview}>
                Create Order
              </button>
              <p className={styles.helperText}>Phase 2 review only. This does not create a real order.</p>
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
          cartTotals={draft.totals}
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

      {isPreviewOpen ? (
        <div className={styles.confirmOverlay} role="presentation">
          <div className={styles.previewModal} role="dialog" aria-modal="true" aria-label="Phase 2 order payload preview">
            <div className={styles.panelHeader}>
              <h3>Phase 2 Review Payload</h3>
              <button type="button" className={styles.closeButton} onClick={() => setIsPreviewOpen(false)} aria-label="Close payload preview">
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
            <pre className={styles.payloadPreview}>{JSON.stringify(payloadPreview, null, 2)}</pre>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.primaryButton} onClick={() => setIsPreviewOpen(false)}>
                Close Review
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

function isDraftComplete(draft: CreateOrderDraft) {
  return isHeaderComplete(draft) && draft.items.length > 0;
}

function isHeaderComplete(draft: CreateOrderDraft) {
  const hasCustomer =
    draft.customerType === 'existing'
      ? Boolean(draft.clientName.trim())
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
    draft.clientName.trim() ||
    draft.guestFullName.trim() ||
    draft.guestMobileNumber.trim() ||
    draft.guestNotes.trim() ||
    draft.poNumber.trim() ||
    draft.notes.trim() ||
    draft.items.length > 0
  );
}
