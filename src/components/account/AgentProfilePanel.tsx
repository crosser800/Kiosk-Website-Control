import { useEffect, useMemo, useState } from 'react';
import type { AccountSummaryItem } from './AccountsSummary';
import { loadAccountItems } from '../../services/accounts';
import { supabase } from '../../lib/supabase';
import type { OrderPriceCode } from '../../services/orderPricing';
import SearchableSelect from '../orders/SearchableSelect';
import {
  convertImageToWebp,
  getAgentProfilePath,
  getVersionedImageUrl,
  MAX_PROFILE_IMAGE_DIMENSION,
  PROFILE_IMAGE_BUCKET,
  PROFILE_IMAGE_QUALITY,
} from '../../utils/profileImages';
import styles from './AgentProfilePanel.module.css';

type AgentProfilePanelProps = {
  account: AccountSummaryItem;
  onSave: (accounts: Promise<AccountSummaryItem[]> | AccountSummaryItem[]) => void;
  onClose: () => void;
};

type PanelSection = 'info' | 'sales' | 'clients' | 'settings';
type AgentStatus = 'Active' | 'Inactive' | 'Blocked';
type ClientStatus = 'Active' | 'Inactive';
type ClientRemoveMode = 'delete' | 'inactive';

type AgentDraft = {
  id: string;
  authUserId: string;
  profileImageUrl: string;
  updatedAt: string;
  fullName: string;
  agentCode: string;
  companyName: string;
  email: string;
  contactNumber: string;
  address: string;
  notes: string;
  status: AgentStatus;
  mustChangePassword: boolean;
  passwordResetAt: string;
  agentGroupId: string;
};

type ClientDraft = {
  id: string;
  agentId: string;
  clientCode: string;
  clientName: string;
  companyName: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
  address: string;
  tin: string;
  status: ClientStatus;
  notes: string;
  customClientCode: string;
  defaultPriceCode: string;
  defaultDeliveryTermId: string;
  region: string;
  province: string;
  cityMunicipality: string;
  districtArea: string;
  barangay: string;
  regionPsgcCode: string;
  provincePsgcCode: string;
  cityMunicipalityPsgcCode: string;
  barangayPsgcCode: string;
  createdAt: string;
  isTemporary?: boolean;
};

type AgentGroupOption = {
  id: string;
  groupName: string;
  groupCode: string;
};

type PriceClassOption = {
  id: string;
  priceCode: string;
  priceLabel: string;
};

type DeliveryTermOption = {
  id: string;
  termName: string;
  termCode: string;
};

const CLIENT_SELECT_QUERY =
  'id, agent_id, client_code, client_name, company_name, contact_person, contact_number, email, address, tin, status, notes, custom_client_code, default_price_code, default_delivery_term_id, region, province, city_municipality, district_area, barangay, region_psgc_code, province_psgc_code, city_municipality_psgc_code, barangay_psgc_code, created_at';

type PsgcOption = {
  code: string;
  name: string;
  type: string;
};

type AgentRow = {
  id: string;
  auth_user_id: string | null;
  agent_code: string | null;
  full_name: string | null;
  company_name: string | null;
  contact_number: string | null;
  email: string | null;
  address: string | null;
  profile_image_url: string | null;
  status: string | null;
  notes: string | null;
  must_change_password: boolean | null;
  password_reset_at: string | null;
  updated_at: string | null;
  agent_group_id: string | null;
};

type ClientRow = {
  id: string;
  agent_id: string | null;
  client_code: string | null;
  client_name: string | null;
  company_name: string | null;
  contact_person: string | null;
  contact_number: string | null;
  email: string | null;
  address: string | null;
  tin: string | null;
  status: string | null;
  notes: string | null;
  custom_client_code: string | null;
  default_price_code: string | null;
  default_delivery_term_id: string | null;
  region: string | null;
  province: string | null;
  city_municipality: string | null;
  district_area: string | null;
  barangay: string | null;
  region_psgc_code: string | null;
  province_psgc_code: string | null;
  city_municipality_psgc_code: string | null;
  barangay_psgc_code: string | null;
  created_at: string | null;
};

const sections: { id: PanelSection; label: string; icon: string }[] = [
  { id: 'info', label: 'Info', icon: 'fa-id-card' },
  { id: 'sales', label: 'Sales', icon: 'fa-chart-line' },
  { id: 'clients', label: 'Clients', icon: 'fa-users' },
  { id: 'settings', label: 'Settings', icon: 'fa-sliders' },
];

const priceCodes: OrderPriceCode[] = ['R1', 'R2', 'W1', 'W2', 'SP', 'CP'];
type PendingProfileImage = {
  blob: Blob;
  previewUrl: string;
};

function createTempId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `temp-${crypto.randomUUID()}`
    : `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeAgentStatus(status: string | null | undefined): AgentStatus {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized === 'blocked') return 'Blocked';
  if (normalized === 'inactive') return 'Inactive';
  return 'Active';
}

function normalizeClientStatus(status: string | null | undefined): ClientStatus {
  return String(status ?? '').trim().toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? '').trim();
}


function mapAccountToAgentDraft(account: AccountSummaryItem): AgentDraft {
  return {
    id: account.id,
    authUserId: account.authUserId ?? '',
    profileImageUrl: account.profileImage ?? '',
    updatedAt: account.createdAt,
    fullName: account.name,
    agentCode: account.handle,
    companyName: account.branch === '-' ? '' : account.branch,
    email: account.email,
    contactNumber: account.contact,
    address: account.address ?? '',
    notes: account.notes ?? '',
    status: normalizeAgentStatus(account.status),
    mustChangePassword: false,
    passwordResetAt: '',
    agentGroupId: account.agentGroupId ?? '',
  };
}

function mapAgentRow(row: AgentRow): AgentDraft {
  return {
    id: String(row.id),
    authUserId: normalizeText(row.auth_user_id),
    profileImageUrl: normalizeText(row.profile_image_url),
    updatedAt: normalizeText(row.updated_at),
    fullName: normalizeText(row.full_name),
    agentCode: normalizeText(row.agent_code),
    companyName: normalizeText(row.company_name),
    email: normalizeText(row.email),
    contactNumber: normalizeText(row.contact_number),
    address: normalizeText(row.address),
    notes: normalizeText(row.notes),
    status: normalizeAgentStatus(row.status),
    mustChangePassword: Boolean(row.must_change_password),
    passwordResetAt: normalizeText(row.password_reset_at),
    agentGroupId: normalizeText(row.agent_group_id),
  };
}

function mapClientRow(row: ClientRow): ClientDraft {
  return {
    id: String(row.id),
    agentId: normalizeText(row.agent_id),
    clientCode: normalizeText(row.client_code),
    clientName: normalizeText(row.client_name),
    companyName: normalizeText(row.company_name),
    contactPerson: normalizeText(row.contact_person),
    contactNumber: normalizeText(row.contact_number),
    email: normalizeText(row.email),
    address: normalizeText(row.address),
    tin: normalizeText(row.tin),
    status: normalizeClientStatus(row.status),
    notes: normalizeText(row.notes),
    customClientCode: normalizeText(row.custom_client_code),
    defaultPriceCode: normalizeText(row.default_price_code).toUpperCase(),
    defaultDeliveryTermId: normalizeText(row.default_delivery_term_id),
    region: normalizeText(row.region),
    province: normalizeText(row.province),
    cityMunicipality: normalizeText(row.city_municipality),
    districtArea: normalizeText(row.district_area),
    barangay: normalizeText(row.barangay),
    regionPsgcCode: normalizeText(row.region_psgc_code),
    provincePsgcCode: normalizeText(row.province_psgc_code),
    cityMunicipalityPsgcCode: normalizeText(row.city_municipality_psgc_code),
    barangayPsgcCode: normalizeText(row.barangay_psgc_code),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function createEmptyClient(agentId: string): ClientDraft {
  return {
    id: createTempId(),
    agentId,
    clientCode: '',
    clientName: '',
    companyName: '',
    contactPerson: '',
    contactNumber: '',
    email: '',
    address: '',
    tin: '',
    status: 'Active',
    notes: '',
    customClientCode: '',
    defaultPriceCode: '',
    defaultDeliveryTermId: '',
    region: '',
    province: '',
    cityMunicipality: '',
    districtArea: '',
    barangay: '',
    regionPsgcCode: '',
    provincePsgcCode: '',
    cityMunicipalityPsgcCode: '',
    barangayPsgcCode: '',
    createdAt: new Date().toISOString(),
    isTemporary: true,
  };
}

function trimAgentDraft(agent: AgentDraft): AgentDraft {
  return {
    ...agent,
    fullName: agent.fullName.trim(),
    agentCode: agent.agentCode.trim(),
    companyName: agent.companyName.trim(),
    email: agent.email.trim(),
    contactNumber: agent.contactNumber.trim(),
    address: agent.address.trim(),
    notes: agent.notes.trim(),
    agentGroupId: agent.agentGroupId.trim(),
  };
}

function trimClientDraft(client: ClientDraft): ClientDraft {
  return {
    ...client,
    clientCode: client.clientCode.trim(),
    clientName: client.clientName.trim(),
    companyName: client.companyName.trim(),
    contactPerson: client.contactPerson.trim(),
    contactNumber: client.contactNumber.trim(),
    email: client.email.trim(),
    address: client.address.trim(),
    tin: client.tin.trim(),
    notes: client.notes.trim(),
    customClientCode: client.customClientCode.trim(),
    defaultPriceCode: client.defaultPriceCode.trim().toUpperCase(),
    defaultDeliveryTermId: client.defaultDeliveryTermId.trim(),
    region: client.region.trim(),
    province: client.province.trim(),
    cityMunicipality: client.cityMunicipality.trim(),
    districtArea: client.districtArea.trim(),
    barangay: client.barangay.trim(),
    regionPsgcCode: client.regionPsgcCode.trim(),
    provincePsgcCode: client.provincePsgcCode.trim(),
    cityMunicipalityPsgcCode: client.cityMunicipalityPsgcCode.trim(),
    barangayPsgcCode: client.barangayPsgcCode.trim(),
  };
}

function isValidEmail(email: string) {
  return !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function stableAgent(agent: AgentDraft) {
  const trimmed = trimAgentDraft(agent);
  return JSON.stringify({
    fullName: trimmed.fullName,
    agentCode: trimmed.agentCode,
    companyName: trimmed.companyName,
    email: trimmed.email,
    contactNumber: trimmed.contactNumber,
    address: trimmed.address,
    notes: trimmed.notes,
    status: trimmed.status,
    profileImageUrl: trimmed.profileImageUrl,
    agentGroupId: trimmed.agentGroupId,
  });
}

function stableClient(client: ClientDraft) {
  const trimmed = trimClientDraft(client);
  return JSON.stringify({
    id: trimmed.id,
    clientCode: trimmed.clientCode,
    clientName: trimmed.clientName,
    companyName: trimmed.companyName,
    contactPerson: trimmed.contactPerson,
    contactNumber: trimmed.contactNumber,
    email: trimmed.email,
    address: trimmed.address,
    tin: trimmed.tin,
    status: trimmed.status,
    notes: trimmed.notes,
    customClientCode: trimmed.customClientCode,
    defaultPriceCode: trimmed.defaultPriceCode,
    defaultDeliveryTermId: trimmed.defaultDeliveryTermId,
    region: trimmed.region,
    province: trimmed.province,
    cityMunicipality: trimmed.cityMunicipality,
    districtArea: trimmed.districtArea,
    barangay: trimmed.barangay,
    regionPsgcCode: trimmed.regionPsgcCode,
    provincePsgcCode: trimmed.provincePsgcCode,
    cityMunicipalityPsgcCode: trimmed.cityMunicipalityPsgcCode,
    barangayPsgcCode: trimmed.barangayPsgcCode,
  });
}

function stablePriceCodes(codes: OrderPriceCode[]) {
  return JSON.stringify([...codes].sort((left, right) => priceCodes.indexOf(left) - priceCodes.indexOf(right)));
}

function formatDateTime(value: string) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString('en-PH');
}

async function describeResetFunctionError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unable to reset this agent password.';
  const context = error && typeof error === 'object' && 'context' in error ? error.context : null;

  if (context instanceof Response) {
    let responseMessage = '';
    try {
      const body = await context.clone().json();
      responseMessage = typeof body?.error === 'string' ? body.error : '';
    } catch {
      responseMessage = '';
    }

    if (context.status === 401) return responseMessage || 'Your admin session is missing or expired.';
    if (context.status === 403) return responseMessage || 'You are not authorized to reset agent passwords.';
    if (context.status === 404) return 'The reset-agent-password Edge Function or target agent was not found.';
    if (context.status >= 500) return responseMessage || 'The password reset service returned a server error.';
    return responseMessage || `Password reset failed with status ${context.status}.`;
  }

  if (/failed to send a request/i.test(message) || /fetch/i.test(message)) {
    return [
      'Unable to reach the reset-agent-password Edge Function.',
      'Confirm it is deployed to the same Supabase project as VITE_SUPABASE_URL and that CORS/preflight is allowed.',
    ].join(' ');
  }

  return message;
}

function StatusBadge({ status }: { status: AgentStatus }) {
  return <span className={`${styles.statusBadge} ${styles[`status${status}`]}`}>{status}</span>;
}

function normalizeDisplayText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function removeDuplicateClientSuffix(companyName: string, duplicateName: string) {
  const company = normalizeDisplayText(companyName);
  const duplicate = normalizeDisplayText(duplicateName);
  if (!company || !duplicate) return company;

  const normalizedCompany = company.toLowerCase();
  const normalizedDuplicate = duplicate.toLowerCase();
  if (!normalizedCompany.endsWith(normalizedDuplicate)) return company;

  return company.slice(0, company.length - duplicate.length).replace(/[\s,/&-]+$/, '').trim();
}

function getClientDisplayName(client: Pick<ClientDraft, 'companyName' | 'clientName' | 'contactPerson'>) {
  const contactName = client.contactPerson.trim() || client.clientName.trim();
  const companyName = removeDuplicateClientSuffix(client.companyName, contactName);
  return companyName || client.clientName.trim() || 'Unnamed Client';
}

function normalizePsgcStatus(row: Record<string, unknown>) {
  if ('status' in row) return String(row.status ?? '').toLowerCase() !== 'inactive';
  if ('is_active' in row) return row.is_active !== false;
  return true;
}

function normalizePsgcOption(row: Record<string, unknown>, nameKeys: string[], typeKeys: string[] = []): PsgcOption | null {
  const code = String(row.psgc_code ?? row.code ?? row.id ?? '').trim();
  const name = nameKeys.map((key) => String(row[key] ?? '').trim()).find(Boolean) ?? '';
  const type = typeKeys.map((key) => String(row[key] ?? '').trim()).find(Boolean) ?? '';
  if (!code || !name || !normalizePsgcStatus(row)) return null;
  return { code, name, type };
}

function sortByName<T extends { name: string }>(items: T[]) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

function getFriendlySaveError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();

  if (
    normalized.includes('custom_client_code') ||
    normalized.includes('client reference') ||
    normalized.includes('duplicate key') && normalized.includes('agent_clients')
  ) {
    return 'This Client Reference Code is already used by another active client under this Agent.';
  }

  if (
    normalized.includes('default_price_code') ||
    normalized.includes('agent_price_access') ||
    normalized.includes('price level')
  ) {
    return 'The selected price level is not available to this Agent.';
  }

  return message;
}

export default function AgentProfilePanel({ account, onSave, onClose }: AgentProfilePanelProps) {
  const [activeSection, setActiveSection] = useState<PanelSection>('info');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(() => mapAccountToAgentDraft(account));
  const [originalAgent, setOriginalAgent] = useState<AgentDraft>(() => mapAccountToAgentDraft(account));
  const [clientDrafts, setClientDrafts] = useState<ClientDraft[]>([]);
  const [originalClients, setOriginalClients] = useState<ClientDraft[]>([]);
  const [priceDraft, setPriceDraft] = useState<OrderPriceCode[]>([]);
  const [originalPriceAccess, setOriginalPriceAccess] = useState<OrderPriceCode[]>([]);
  const [agentGroups, setAgentGroups] = useState<AgentGroupOption[]>([]);
  const [priceClassOptions, setPriceClassOptions] = useState<PriceClassOption[]>([]);
  const [deliveryTermOptions, setDeliveryTermOptions] = useState<DeliveryTermOption[]>([]);
  const [pendingProfileImage, setPendingProfileImage] = useState<PendingProfileImage | null>(null);
  const [isProfileImageRemoved, setIsProfileImageRemoved] = useState(false);
  const [profileImageError, setProfileImageError] = useState('');
  const [isProcessingProfileImage, setIsProcessingProfileImage] = useState(false);
  const [removedClients, setRemovedClients] = useState<Record<string, ClientRemoveMode>>({});
  const [clientSearch, setClientSearch] = useState('');
  const [editingClient, setEditingClient] = useState<ClientDraft | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ClientDraft | null>(null);
  const [removeMode, setRemoveMode] = useState<ClientRemoveMode>('inactive');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [validationError, setValidationError] = useState('');
  const [settingsNotice] = useState('');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    void loadProfileDraft();
  }, [account.id]);

  useEffect(
    () => () => {
      if (pendingProfileImage) {
        URL.revokeObjectURL(pendingProfileImage.previewUrl);
      }
    },
    [pendingProfileImage],
  );

  const originalClientMap = useMemo(
    () => new Map(originalClients.map((client) => [client.id, client] as const)),
    [originalClients],
  );

  const allowedClientPriceOptions = useMemo(() => {
    const allowedCodes = new Set(priceDraft);
    return priceClassOptions.filter((priceClass) => allowedCodes.has(priceClass.priceCode as OrderPriceCode));
  }, [priceClassOptions, priceDraft]);

  const isDirty = useMemo(() => {
    if (stableAgent(agentDraft) !== stableAgent(originalAgent)) return true;
    if (pendingProfileImage || isProfileImageRemoved) return true;
    if (stablePriceCodes(priceDraft) !== stablePriceCodes(originalPriceAccess)) return true;
    if (Object.keys(removedClients).length > 0) return true;
    if (clientDrafts.some((client) => client.isTemporary)) return true;
    return clientDrafts.some((client) => {
      const original = originalClientMap.get(client.id);
      return original ? stableClient(client) !== stableClient(original) : true;
    });
  }, [agentDraft, clientDrafts, isProfileImageRemoved, originalAgent, originalClientMap, originalPriceAccess, pendingProfileImage, priceDraft, removedClients]);

  const visibleClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    return clientDrafts.filter((client) => {
      if (removedClients[client.id]) return false;
      if (!query) return true;
      return [
        client.clientCode,
        client.customClientCode,
        client.clientName,
        client.companyName,
        client.contactPerson,
        client.contactNumber,
        client.email,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [clientDrafts, clientSearch, removedClients]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  async function loadProfileDraft() {
    setIsLoading(true);
    setLoadError('');
    setSaveError('');
    setSuccessMessage('');

    try {
      const [agentRes, clientsRes, priceRes, groupsRes, priceClassesRes, deliveryTermsRes] = await Promise.all([
        supabase
          .from('agent_accounts')
          .select('id, auth_user_id, agent_code, agent_group_id, full_name, company_name, contact_number, email, address, profile_image_url, status, notes, must_change_password, password_reset_at, updated_at')
          .eq('id', account.id)
          .maybeSingle(),
        supabase
          .from('agent_clients')
          .select(CLIENT_SELECT_QUERY)
          .eq('agent_id', account.id)
          .order('company_name', { ascending: true }),
        supabase
          .from('agent_price_access')
          .select('agent_id, price_class')
          .eq('agent_id', account.id),
        supabase
          .from('agent_groups')
          .select('id, group_name, group_code, status, sort_order')
          .eq('status', 'Active')
          .order('sort_order', { ascending: true }),
        supabase
          .from('price_classes')
          .select('id, price_code, price_label, status, sort_order')
          .eq('status', 'Active')
          .order('sort_order', { ascending: true }),
        supabase
          .from('delivery_terms')
          .select('id, term_name, term_code, status, sort_order')
          .eq('status', 'Active')
          .order('sort_order', { ascending: true }),
      ]);

      const error = agentRes.error ?? clientsRes.error ?? priceRes.error ?? groupsRes.error ?? priceClassesRes.error ?? deliveryTermsRes.error;
      if (error) throw new Error(error.message);
      if (!agentRes.data) {
        throw new Error('Agent profile was not found. Check the selected agent and agent account access policies.');
      }

      const nextAgent = mapAgentRow(agentRes.data as AgentRow);
      const nextClients = ((clientsRes.data ?? []) as ClientRow[])
        .map(mapClientRow)
        .sort((left, right) => getClientDisplayName(left).localeCompare(getClientDisplayName(right)));
      const nextPriceAccess = Array.from(
        new Set(
          ((priceRes.data ?? []) as { price_class: string | null }[])
            .map((row) => String(row.price_class ?? '').trim().toUpperCase())
            .filter((code): code is OrderPriceCode => priceCodes.includes(code as OrderPriceCode)),
        ),
      );

      setAgentDraft(nextAgent);
      setOriginalAgent(nextAgent);
      setClientDrafts(nextClients);
      setOriginalClients(nextClients);
      setPriceDraft(nextPriceAccess);
      setOriginalPriceAccess(nextPriceAccess);
      setAgentGroups(
        (groupsRes.data ?? []).map((row) => ({
          id: String(row.id),
          groupName: String(row.group_name ?? ''),
          groupCode: String(row.group_code ?? ''),
        })),
      );
      setPriceClassOptions(
        (priceClassesRes.data ?? []).map((row) => ({
          id: String(row.id),
          priceCode: String(row.price_code ?? '').trim().toUpperCase(),
          priceLabel: String(row.price_label ?? '').trim(),
        })),
      );
      setDeliveryTermOptions(
        (deliveryTermsRes.data ?? []).map((row) => ({
          id: String(row.id),
          termName: String(row.term_name ?? ''),
          termCode: String(row.term_code ?? ''),
        })),
      );
      setRemovedClients({});
      setPendingProfileImage((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl);
        return null;
      });
      setIsProfileImageRemoved(false);
      setProfileImageError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load agent profile.');
    } finally {
      setIsLoading(false);
    }
  }

  function updateAgentField<Field extends keyof AgentDraft>(field: Field, value: AgentDraft[Field]) {
    setValidationError('');
    setSaveError('');
    setSuccessMessage('');
    setAgentDraft((current) => ({ ...current, [field]: value }));
  }

  function togglePriceAccess(priceCode: OrderPriceCode) {
    setSaveError('');
    setSuccessMessage('');
    setPriceDraft((current) =>
      current.includes(priceCode)
        ? current.filter((code) => code !== priceCode)
        : [...current, priceCode],
    );
  }

  async function handleProfileImageChange(file: File | undefined) {
    setProfileImageError('');
    setSaveError('');
    setSuccessMessage('');

    if (!file) return;

    setIsProcessingProfileImage(true);
    try {
      const blob = await convertImageToWebp(file, {
        maxWidth: MAX_PROFILE_IMAGE_DIMENSION,
        maxHeight: MAX_PROFILE_IMAGE_DIMENSION,
        quality: PROFILE_IMAGE_QUALITY,
      });
      const previewUrl = URL.createObjectURL(blob);

      setPendingProfileImage((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl);
        return { blob, previewUrl };
      });
      setIsProfileImageRemoved(false);
    } catch (error) {
      setProfileImageError(error instanceof Error ? error.message : 'Unable to prepare this profile image.');
    } finally {
      setIsProcessingProfileImage(false);
    }
  }

  function handleRemoveProfileImage() {
    setProfileImageError('');
    setSaveError('');
    setSuccessMessage('');
    setPendingProfileImage((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    setIsProfileImageRemoved(true);
  }

  function validateDraft() {
    const trimmedAgent = trimAgentDraft(agentDraft);
    if (!trimmedAgent.fullName) {
      setValidationError('Full Name is required.');
      setActiveSection('info');
      return false;
    }
    if (!isValidEmail(trimmedAgent.email)) {
      setValidationError('Enter a valid agent email address.');
      setActiveSection('info');
      return false;
    }

    const activeClientDrafts = clientDrafts.filter((client) => !removedClients[client.id]);
    for (const client of activeClientDrafts) {
      const trimmedClient = trimClientDraft(client);
      if (trimmedClient.isTemporary && !trimmedClient.companyName) {
        setValidationError('Company Name is required for new clients.');
        setActiveSection('clients');
        return false;
      }
      if (!isValidEmail(trimmedClient.email)) {
        setValidationError(`Enter a valid email for ${getClientDisplayName(trimmedClient)}.`);
        setActiveSection('clients');
        return false;
      }
      if (
        trimmedClient.defaultPriceCode &&
        !allowedClientPriceOptions.some((priceClass) => priceClass.priceCode === trimmedClient.defaultPriceCode)
      ) {
        setValidationError(`The selected price level for ${getClientDisplayName(trimmedClient)} is not available to this Agent.`);
        setActiveSection('clients');
        return false;
      }
    }

    setValidationError('');
    return true;
  }

  async function handleSaveChanges() {
    if (!isDirty || isSaving || !validateDraft()) return;

    setIsSaving(true);
    setSaveError('');
    setSuccessMessage('');

    try {
      const trimmedAgent = trimAgentDraft(agentDraft);
      const writes: PromiseLike<unknown>[] = [];
      let nextProfileImageUrl = trimmedAgent.profileImageUrl;

      if (pendingProfileImage) {
        const imagePath = getAgentProfilePath(trimmedAgent.id);
        const { error: uploadError } = await supabase.storage
          .from(PROFILE_IMAGE_BUCKET)
          .upload(imagePath, pendingProfileImage.blob, {
            contentType: 'image/webp',
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Profile image upload failed: ${uploadError.message}`);
        }

        const { data } = supabase.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(imagePath);
        if (!data.publicUrl) {
          throw new Error('Profile image uploaded, but the public image URL could not be resolved.');
        }
        nextProfileImageUrl = data.publicUrl;
      } else if (isProfileImageRemoved && trimmedAgent.profileImageUrl) {
        const { error: removeError } = await supabase.storage
          .from(PROFILE_IMAGE_BUCKET)
          .remove([getAgentProfilePath(trimmedAgent.id)]);

        if (removeError) {
          throw new Error(`Profile image deletion failed: ${removeError.message}`);
        }

        nextProfileImageUrl = '';
      }

      const profileImageChanged = pendingProfileImage || isProfileImageRemoved;

      if (stableAgent(trimmedAgent) !== stableAgent(originalAgent) || profileImageChanged) {
        writes.push(
          supabase
            .from('agent_accounts')
            .update({
              agent_code: trimmedAgent.agentCode || null,
              agent_group_id: trimmedAgent.agentGroupId || null,
              full_name: trimmedAgent.fullName,
              company_name: trimmedAgent.companyName || null,
              contact_number: trimmedAgent.contactNumber || null,
              email: trimmedAgent.email || null,
              address: trimmedAgent.address || null,
              profile_image_url: nextProfileImageUrl || null,
              notes: trimmedAgent.notes || null,
              status: trimmedAgent.status,
            })
            .eq('id', trimmedAgent.id)
            .select(
              'id, auth_user_id, agent_code, agent_group_id, full_name, company_name, contact_number, email, address, profile_image_url, status, notes, must_change_password, password_reset_at, updated_at',
            )
            .maybeSingle()
            .then(({ data, error }) => {
              if (error) throw new Error(error.message);
              if (!data) {
                throw new Error(
                  'Agent profile update returned no row. Check the agent ID and agent_accounts UPDATE/SELECT policies.',
                );
              }

              const persistedProfileImageUrl = String(data.profile_image_url ?? '');
              if (profileImageChanged && persistedProfileImageUrl !== nextProfileImageUrl) {
                throw new Error('Profile image URL was not persisted on the agent account.');
              }
            }),
        );
      }

      Object.entries(removedClients).forEach(([clientId, mode]) => {
        if (mode === 'delete') {
          writes.push(
            supabase
              .from('agent_clients')
              .delete()
              .eq('id', clientId)
              .then(({ error }) => {
                if (error) throw new Error(error.message);
              }),
          );
          return;
        }

        writes.push(
          supabase
            .from('agent_clients')
            .update({ status: 'Inactive' })
            .eq('id', clientId)
            .then(({ error }) => {
              if (error) throw new Error(error.message);
            }),
        );
      });

      const activeClients = clientDrafts.filter((client) => !removedClients[client.id]).map(trimClientDraft);
      const newClients = activeClients.filter((client) => client.isTemporary);
      const changedClients = activeClients.filter((client) => {
        if (client.isTemporary) return false;
        const original = originalClientMap.get(client.id);
        return original ? stableClient(client) !== stableClient(original) : false;
      });

      if (newClients.length > 0) {
        writes.push(
          supabase
            .from('agent_clients')
            .insert(
              newClients.map((client) => ({
                agent_id: trimmedAgent.id,
                client_name: client.clientName,
                company_name: client.companyName || null,
                custom_client_code: client.customClientCode || null,
                default_price_code: client.defaultPriceCode || null,
                default_delivery_term_id: client.defaultDeliveryTermId || null,
                contact_person: client.contactPerson || null,
                contact_number: client.contactNumber || null,
                email: client.email || null,
                address: client.address || null,
                tin: client.tin || null,
                region: client.region || null,
                province: client.province || null,
                city_municipality: client.cityMunicipality || null,
                district_area: client.districtArea || null,
                barangay: client.barangay || null,
                region_psgc_code: client.regionPsgcCode || null,
                province_psgc_code: client.provincePsgcCode || null,
                city_municipality_psgc_code: client.cityMunicipalityPsgcCode || null,
                barangay_psgc_code: client.barangayPsgcCode || null,
                status: client.status,
                notes: client.notes || null,
              })),
            )
            .select(CLIENT_SELECT_QUERY)
            .then(({ data, error }) => {
              if (error) throw new Error(error.message);
              const insertedClients = ((data ?? []) as ClientRow[]).map(mapClientRow);
              setClientDrafts((current) => {
                const withoutTemporaryClients = current.filter((client) => !client.isTemporary);
                return [...withoutTemporaryClients, ...insertedClients];
              });
            }),
        );
      }

      changedClients.forEach((client) => {
        writes.push(
          supabase
            .from('agent_clients')
            .update({
              client_name: client.clientName,
              company_name: client.companyName || null,
              custom_client_code: client.customClientCode || null,
              default_price_code: client.defaultPriceCode || null,
              default_delivery_term_id: client.defaultDeliveryTermId || null,
              contact_person: client.contactPerson || null,
              contact_number: client.contactNumber || null,
              email: client.email || null,
              address: client.address || null,
              tin: client.tin || null,
              region: client.region || null,
              province: client.province || null,
              city_municipality: client.cityMunicipality || null,
              district_area: client.districtArea || null,
              barangay: client.barangay || null,
              region_psgc_code: client.regionPsgcCode || null,
              province_psgc_code: client.provincePsgcCode || null,
              city_municipality_psgc_code: client.cityMunicipalityPsgcCode || null,
              barangay_psgc_code: client.barangayPsgcCode || null,
              status: client.status,
              notes: client.notes || null,
            })
            .eq('id', client.id)
            .select(CLIENT_SELECT_QUERY)
            .maybeSingle()
            .then(({ data, error }) => {
              if (error) throw new Error(error.message);
              if (!data) {
                throw new Error(`Client update returned no row for ${getClientDisplayName(client)}.`);
              }

              const persistedClient = mapClientRow(data as ClientRow);
              if (persistedClient.defaultDeliveryTermId !== client.defaultDeliveryTermId) {
                throw new Error(
                  `Default payment terms did not persist for ${getClientDisplayName(client)}.`,
                );
              }
            }),
        );
      });

      const originalPriceSet = new Set(originalPriceAccess);
      const draftPriceSet = new Set(priceDraft);
      const addedPrices = priceDraft.filter((code) => !originalPriceSet.has(code));
      const removedPrices = originalPriceAccess.filter((code) => !draftPriceSet.has(code));

      if (addedPrices.length > 0) {
        writes.push(
          supabase
            .from('agent_price_access')
            .insert(addedPrices.map((priceClass) => ({ agent_id: trimmedAgent.id, price_class: priceClass })))
            .then(({ error }) => {
              if (error) throw new Error(error.message);
            }),
        );
      }

      if (removedPrices.length > 0) {
        writes.push(
          supabase
            .from('agent_price_access')
            .delete()
            .eq('agent_id', trimmedAgent.id)
            .in('price_class', removedPrices)
            .then(({ error }) => {
              if (error) throw new Error(error.message);
            }),
        );
      }

      await Promise.all(writes);
      await loadProfileDraft();
      onSave(loadAccountItems());
      setSuccessMessage('Agent profile changes saved.');
    } catch (error) {
      const friendlyError = getFriendlySaveError(error);
      setSaveError(
        friendlyError
          ? `Save failed: ${friendlyError}. Some earlier requests may already have been written because no shared transaction RPC is configured.`
          : 'Save failed. Your draft changes are still preserved locally.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  function requestClose() {
    if (!isDirty) {
      onClose();
      return;
    }
    setShowDiscardConfirm(true);
  }

  function addClientDraft() {
    setEditingClient(createEmptyClient(agentDraft.id));
  }

  function saveClientDraft(client: ClientDraft) {
    const trimmedClient = trimClientDraft(client);
    if (trimmedClient.isTemporary && !trimmedClient.companyName) {
      setValidationError('Company Name is required for new clients.');
      return;
    }
    if (!isValidEmail(trimmedClient.email)) {
      setValidationError('Enter a valid client email address.');
      return;
    }
    if (
      trimmedClient.defaultPriceCode &&
      !allowedClientPriceOptions.some((priceClass) => priceClass.priceCode === trimmedClient.defaultPriceCode)
    ) {
      setValidationError('The selected price level is not available to this Agent.');
      return;
    }

    setValidationError('');
    setSaveError('');
    setSuccessMessage('');
    setClientDrafts((current) => {
      const exists = current.some((item) => item.id === trimmedClient.id);
      return exists
        ? current.map((item) => (item.id === trimmedClient.id ? trimmedClient : item))
        : [...current, trimmedClient];
    });
    setEditingClient(null);
  }

  function confirmRemoveClient() {
    if (!removeTarget) return;

    if (removeTarget.isTemporary) {
      setClientDrafts((current) => current.filter((client) => client.id !== removeTarget.id));
    } else {
      setRemovedClients((current) => ({ ...current, [removeTarget.id]: removeMode }));
      if (removeMode === 'inactive') {
        setClientDrafts((current) =>
          current.map((client) =>
            client.id === removeTarget.id ? { ...client, status: 'Inactive' } : client,
          ),
        );
      }
    }
    setRemoveTarget(null);
  }

  async function handleResetPassword() {
    if (!agentDraft.authUserId || isResettingPassword) return;

    setIsResettingPassword(true);
    setResetError('');
    setResetMessage('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        throw new Error('Your admin session is missing or expired. Sign in again before resetting passwords.');
      }

      const { error } = await supabase.functions.invoke('reset-agent-password', {
        body: { agent_id: agentDraft.id },
      });

      if (error) {
        throw new Error(error.message);
      }

      await loadProfileDraft();
      setResetMessage(
        'Password reset successfully. The agent must sign in using the temporary password and create a new password.',
      );
      setIsResetConfirmOpen(false);
    } catch (error) {
      setResetError(await describeResetFunctionError(error));
    } finally {
      setIsResettingPassword(false);
    }
  }

  const selectedPriceLabel =
    priceDraft.length === 0
      ? 'No price access enabled'
      : `${priceDraft.length} price ${priceDraft.length === 1 ? 'class' : 'classes'} enabled`;
  const currentProfileImageUrl =
    pendingProfileImage?.previewUrl ||
    (!isProfileImageRemoved && agentDraft.profileImageUrl
      ? getVersionedImageUrl(agentDraft.profileImageUrl, agentDraft.updatedAt)
      : '');
  const canRemoveProfileImage = Boolean(pendingProfileImage || (!isProfileImageRemoved && agentDraft.profileImageUrl));

  return (
    <div className={styles.overlay} role="presentation">
      <section className={styles.panel} role="dialog" aria-modal="true" aria-label="Agent profile management">
        <header className={styles.header}>
          <div className={styles.identity}>
            <div className={styles.avatar} aria-hidden="true">
              {currentProfileImageUrl ? (
                <img src={currentProfileImageUrl} alt="" className={styles.avatarImage} />
              ) : (
                <i className="fa-solid fa-user"></i>
              )}
            </div>
            <div className={styles.identityText}>
              <p className={styles.eyebrow}>Agent Profile Management</p>
              <h2 className={styles.agentName}>{agentDraft.fullName || 'Unnamed Agent'}</h2>
              <div className={styles.metaLine}>
                <span>{agentDraft.agentCode || 'No agent code'}</span>
                <span>{agentDraft.companyName || 'No company'}</span>
                <span>{agentGroups.find((group) => group.id === agentDraft.agentGroupId)?.groupName || 'Ungrouped'}</span>
                <StatusBadge status={agentDraft.status} />
                {agentDraft.authUserId ? <span className={styles.authPill}>Auth connected</span> : <span className={styles.authPill}>No auth link</span>}
                {isDirty ? <span className={styles.dirtyPill}>Unsaved changes</span> : null}
              </div>
            </div>
          </div>
          <button type="button" className={styles.closeButton} onClick={requestClose} aria-label="Close agent profile">
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </header>

        <div className={`${styles.body} ${isSidebarCollapsed ? styles.bodySidebarCollapsed : ''}`}>
          <nav className={styles.sidebar} aria-label="Agent profile sections">
            <button
              type="button"
              className={styles.sidebarToggle}
              onClick={() => setIsSidebarCollapsed((isCollapsed) => !isCollapsed)}
              aria-expanded={!isSidebarCollapsed}
              aria-label={isSidebarCollapsed ? 'Expand profile navigation' : 'Collapse profile navigation'}
              title={isSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              <i className={`fa-solid ${isSidebarCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`} aria-hidden="true"></i>
              <span>Collapse</span>
            </button>
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`${styles.navButton} ${activeSection === section.id ? styles.navButtonActive : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                <i className={`fa-solid ${section.icon}`} aria-hidden="true"></i>
                <span className={styles.navLabel}>{section.label}</span>
              </button>
            ))}
          </nav>

          <main className={styles.content}>
            {isLoading ? (
              <div className={styles.loadingState}>
                <span></span>
                <span></span>
                <span></span>
              </div>
            ) : loadError ? (
              <div className={styles.emptyState}>
                <i className="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                <p>{loadError}</p>
              </div>
            ) : (
              <>
                {activeSection === 'info' ? (
                  <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                      <div>
                        <h3 className={styles.sectionTitle}>Info</h3>
                        <p className={styles.sectionSubtitle}>Actual editable fields from `agent_accounts`.</p>
                      </div>
                    </div>

                    <div className={styles.groupedForm}>
                      <div className={styles.formGroup}>
                        <h4>Profile Photo</h4>
                        <div className={styles.profileCard}>
                          <div className={styles.profilePreview} aria-hidden="true">
                            {currentProfileImageUrl ? (
                              <img src={currentProfileImageUrl} alt="" className={styles.avatarImage} />
                            ) : (
                              <i className="fa-solid fa-user"></i>
                            )}
                          </div>
                          <div className={styles.profileActions}>
                            <label className={styles.secondaryButton}>
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className={styles.fileInput}
                                onChange={(event) => {
                                  void handleProfileImageChange(event.target.files?.[0]);
                                  event.currentTarget.value = '';
                                }}
                              />
                              <i className="fa-solid fa-camera" aria-hidden="true"></i>
                              <span>{agentDraft.profileImageUrl || pendingProfileImage ? 'Change Photo' : 'Upload Photo'}</span>
                            </label>
                            {canRemoveProfileImage ? (
                              <button type="button" className={styles.secondaryButton} onClick={handleRemoveProfileImage}>
                                <i className="fa-solid fa-trash" aria-hidden="true"></i>
                                <span>Remove Photo</span>
                              </button>
                            ) : null}
                          </div>
                          <p className={styles.profileImageNotice}>
                            JPG, PNG, or WEBP. The image will be optimized and converted to WEBP.
                          </p>
                          {isProcessingProfileImage ? <p className={styles.inlineNotice}>Optimizing image...</p> : null}
                          {profileImageError ? <p className={styles.validationError}>{profileImageError}</p> : null}
                        </div>
                      </div>

                      <div className={styles.formGroup}>
                        <h4>Personal Information</h4>
                        <div className={styles.formGrid}>
                          <label className={styles.field}>
                            <span>Full Name *</span>
                            <input value={agentDraft.fullName} onChange={(event) => updateAgentField('fullName', event.target.value)} />
                          </label>
                          <label className={styles.field}>
                            <span>Email Address</span>
                            <input type="email" value={agentDraft.email} onChange={(event) => updateAgentField('email', event.target.value)} />
                          </label>
                          <label className={styles.field}>
                            <span>Contact Number</span>
                            <input value={agentDraft.contactNumber} onChange={(event) => updateAgentField('contactNumber', event.target.value)} />
                          </label>
                          <label className={`${styles.field} ${styles.wideField}`}>
                            <span>Address</span>
                            <textarea value={agentDraft.address} onChange={(event) => updateAgentField('address', event.target.value)} />
                          </label>
                        </div>
                      </div>

                      <div className={styles.formGroup}>
                        <h4>Agent Information</h4>
                        <div className={styles.formGrid}>
                          <label className={styles.field}>
                            <span>Agent Code</span>
                            <input value={agentDraft.agentCode} onChange={(event) => updateAgentField('agentCode', event.target.value)} />
                          </label>
                          <label className={styles.field}>
                            <span>Company Name</span>
                            <input value={agentDraft.companyName} onChange={(event) => updateAgentField('companyName', event.target.value)} />
                          </label>
                          <label className={styles.field}>
                            <span>Agent Group</span>
                            <select value={agentDraft.agentGroupId} onChange={(event) => updateAgentField('agentGroupId', event.target.value)}>
                              <option value="">No group</option>
                              {agentGroups.map((group) => (
                                <option key={group.id} value={group.id}>
                                  {group.groupName}{group.groupCode ? ` (${group.groupCode})` : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className={`${styles.field} ${styles.wideField}`}>
                            <span>Notes</span>
                            <textarea value={agentDraft.notes} onChange={(event) => updateAgentField('notes', event.target.value)} />
                          </label>
                          <div className={styles.summaryField}>
                            <span>Current Status</span>
                            <StatusBadge status={agentDraft.status} />
                          </div>
                          <div className={styles.summaryField}>
                            <span>Authentication</span>
                            <strong>{agentDraft.authUserId ? 'Connected' : 'Not connected'}</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}

                {activeSection === 'sales' ? (
                  <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                      <div>
                        <h3 className={styles.sectionTitle}>Sales</h3>
                        <p className={styles.sectionSubtitle}>Read-only until a verified agent sales query is added.</p>
                      </div>
                      <button type="button" className={styles.disabledAction} disabled>Date Filter</button>
                    </div>
                    <div className={styles.summaryGrid}>
                      <article className={styles.metricCard}><span>Total Sales</span><strong>P0.00</strong></article>
                      <article className={styles.metricCard}><span>Total Orders</span><strong>0</strong></article>
                      <article className={styles.metricCard}><span>Average Order Value</span><strong>P0.00</strong></article>
                    </div>
                    <div className={styles.tableShell}>
                      <div className={styles.tableHeader}><span>Order</span><span>Date</span><span>Client</span><span>Total</span><span>Action</span></div>
                      <div className={styles.emptyState}>
                        <i className="fa-solid fa-chart-simple" aria-hidden="true"></i>
                        <p>No recorded sales are available for this agent yet.</p>
                      </div>
                    </div>
                  </section>
                ) : null}

                {activeSection === 'clients' ? (
                  <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                      <div>
                        <h3 className={styles.sectionTitle}>Clients</h3>
                        <p className={styles.sectionSubtitle}>Loaded from `agent_clients.agent_id` for this agent.</p>
                      </div>
                      <button type="button" className={styles.secondaryButton} onClick={addClientDraft}>
                        <i className="fa-solid fa-plus" aria-hidden="true"></i>
                        <span>Add Client</span>
                      </button>
                    </div>
                    <div className={styles.clientToolbar}>
                      <label className={styles.searchField}>
                        <i className="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                        <input value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Search company, client, or code" />
                      </label>
                      <span className={styles.countPill}>{visibleClients.length.toLocaleString()} clients</span>
                    </div>
                    <div className={styles.tableShell}>
                      <div className={styles.clientTableHeader}>
                        <span>System Code</span><span>Client Reference</span><span>Company</span><span>Client / Contact</span><span>Contact</span><span>Email</span><span>Status</span><span>Actions</span>
                      </div>
                      {visibleClients.length === 0 ? (
                        <div className={styles.emptyState}>
                          <i className="fa-solid fa-address-book" aria-hidden="true"></i>
                          <p>No clients are available for this agent yet.</p>
                        </div>
                      ) : (
                        visibleClients.map((client) => {
                          const displayName = getClientDisplayName(client);
                          return (
                            <div key={client.id} className={styles.clientRow}>
                              <span>{client.clientCode || '-'}</span>
                              <span>{client.customClientCode || '-'}</span>
                              <strong>{displayName}</strong>
                              <span>{client.contactPerson || client.clientName || '-'}</span>
                              <span>{client.contactNumber || '-'}</span>
                              <span>{client.email || '-'}</span>
                              <span className={`${styles.clientStatus} ${client.status === 'Active' ? styles.statusActive : styles.statusInactive}`}>{client.status}</span>
                              <span className={styles.rowActions}>
                                <button type="button" onClick={() => setEditingClient(client)} aria-label={`Edit ${displayName}`}>
                                  <i className="fa-solid fa-pen" aria-hidden="true"></i>
                                </button>
                                <button type="button" onClick={() => setRemoveTarget(client)} aria-label={`Remove ${displayName}`}>
                                  <i className="fa-solid fa-trash" aria-hidden="true"></i>
                                </button>
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </section>
                ) : null}

                {activeSection === 'settings' ? (
                  <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                      <div>
                        <h3 className={styles.sectionTitle}>Settings</h3>
                        <p className={styles.sectionSubtitle}>Changes here are staged locally until Save Changes.</p>
                      </div>
                    </div>
                    <div className={styles.settingsGrid}>
                      <article className={styles.settingsCard}>
                        <h4>Account Status</h4>
                        <p>{agentDraft.status === 'Active' ? 'Agent can be used normally.' : agentDraft.status === 'Inactive' ? 'Agent is temporarily unavailable.' : 'Agent is restricted from account access or operational use.'}</p>
                        <div className={styles.segmented}>
                          {(['Active', 'Inactive', 'Blocked'] as AgentStatus[]).map((status) => (
                            <button
                              key={status}
                              type="button"
                              className={agentDraft.status === status ? styles.segmentActive : ''}
                              onClick={() => updateAgentField('status', status)}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </article>
                      <article className={styles.settingsCard}>
                        <h4>Price Access</h4>
                        <p>{selectedPriceLabel}</p>
                        <div className={styles.pricePills}>
                          {priceCodes.map((priceCode) => (
                            <button
                              key={priceCode}
                              type="button"
                              className={`${styles.pricePillButton} ${priceDraft.includes(priceCode) ? styles.pricePillActive : ''}`}
                              onClick={() => togglePriceAccess(priceCode)}
                              aria-pressed={priceDraft.includes(priceCode)}
                              aria-label={`Toggle ${priceCode} price access`}
                            >
                              {priceDraft.includes(priceCode) ? <i className="fa-solid fa-check" aria-hidden="true"></i> : null}
                              {priceCode}
                            </button>
                          ))}
                        </div>
                        {priceDraft.length === 0 ? (
                          <p className={styles.inlineNotice}>This agent will not be available for priced Create Order selection.</p>
                        ) : null}
                      </article>
                      <article className={styles.settingsCard}>
                        <h4>Security</h4>
                        <p>Resetting the password signs the agent out and requires a new password on the next login.</p>
                        {agentDraft.mustChangePassword ? (
                          <span className={styles.dirtyPill}>Password change required</span>
                        ) : null}
                        {agentDraft.passwordResetAt ? (
                          <p>Last reset: {formatDateTime(agentDraft.passwordResetAt)}</p>
                        ) : null}
                        {!agentDraft.authUserId ? (
                          <p className={styles.inlineNotice}>This agent is not connected to an authentication account.</p>
                        ) : null}
                        {resetMessage ? <p className={styles.successMessage}>{resetMessage}</p> : null}
                        {resetError ? <p className={styles.validationError}>{resetError}</p> : null}
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          disabled={!agentDraft.authUserId || isResettingPassword}
                          onClick={() => setIsResetConfirmOpen(true)}
                        >
                          {isResettingPassword ? 'Resetting Password...' : 'Reset Password'}
                        </button>
                      </article>
                      <article className={`${styles.settingsCard} ${styles.dangerCard}`}>
                        <h4>Danger Zone</h4>
                        <p>Use Account Status to deactivate or block this agent. Changes save only through the global button.</p>
                      </article>
                    </div>
                    {settingsNotice ? <p className={styles.inlineNotice}>{settingsNotice}</p> : null}
                  </section>
                ) : null}
              </>
            )}
          </main>
        </div>

        <footer className={styles.footer}>
          <div>
            {validationError ? <p className={styles.validationError}>{validationError}</p> : null}
            {saveError ? <p className={styles.validationError}>{saveError}</p> : null}
            {successMessage ? <p className={styles.successMessage}>{successMessage}</p> : null}
          </div>
          <button type="button" className={styles.primaryButton} disabled={!isDirty || isSaving || isLoading} onClick={() => void handleSaveChanges()}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </footer>
      </section>

      {editingClient ? (
        <ClientEditor
          client={editingClient}
          priceOptions={allowedClientPriceOptions}
          deliveryTermOptions={deliveryTermOptions}
          onSave={saveClientDraft}
          onClose={() => setEditingClient(null)}
        />
      ) : null}

      {removeTarget ? (
        <div className={styles.confirmOverlay} role="presentation">
          <div className={styles.confirmModal} role="dialog" aria-modal="true" aria-label="Remove client">
            <h3>Remove Client</h3>
            <p>
              Choose how to remove {removeTarget.clientName || 'this client'}. Existing clients are changed only after Save Changes.
            </p>
            {!removeTarget.isTemporary ? (
              <div className={styles.removeChoices}>
                <label>
                  <input type="radio" checked={removeMode === 'inactive'} onChange={() => setRemoveMode('inactive')} />
                  <span>Set Inactive</span>
                </label>
                <label>
                  <input type="radio" checked={removeMode === 'delete'} onChange={() => setRemoveMode('delete')} />
                  <span>Remove from Agent</span>
                </label>
              </div>
            ) : null}
            <div className={styles.confirmActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setRemoveTarget(null)}>Cancel</button>
              <button type="button" className={styles.dangerButton} onClick={confirmRemoveClient}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isResetConfirmOpen ? (
        <div className={styles.confirmOverlay} role="presentation">
          <div className={styles.confirmModal} role="dialog" aria-modal="true" aria-label="Reset agent password">
            <h3>Reset Agent Password</h3>
            <p>
              This will reset the agent's password to the temporary password "password", sign out the agent's active sessions, and require the agent to create a new password on the next login.
            </p>
            {resetError ? <p className={styles.validationError}>{resetError}</p> : null}
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setIsResetConfirmOpen(false)}
                disabled={isResettingPassword}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => void handleResetPassword()}
                disabled={isResettingPassword}
              >
                {isResettingPassword ? 'Resetting Password...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDiscardConfirm ? (
        <div className={styles.confirmOverlay} role="presentation">
          <div className={styles.confirmModal} role="dialog" aria-modal="true" aria-label="Unsaved changes">
            <h3>Unsaved Changes</h3>
            <p>You have unsaved changes in this agent profile. Leaving now will discard them.</p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setShowDiscardConfirm(false)}>
                Continue Editing
              </button>
              <button type="button" className={styles.dangerButton} onClick={onClose}>
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ClientEditor({
  client,
  priceOptions,
  deliveryTermOptions,
  onSave,
  onClose,
}: {
  client: ClientDraft;
  priceOptions: PriceClassOption[];
  deliveryTermOptions: DeliveryTermOption[];
  onSave: (client: ClientDraft) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ClientDraft>(client);
  const [regions, setRegions] = useState<PsgcOption[]>([]);
  const [provinces, setProvinces] = useState<PsgcOption[]>([]);
  const [cities, setCities] = useState<PsgcOption[]>([]);
  const [barangays, setBarangays] = useState<PsgcOption[]>([]);
  const [locationError, setLocationError] = useState('');
  const [isLoadingRegions, setIsLoadingRegions] = useState(false);
  const [isLoadingProvinces, setIsLoadingProvinces] = useState(false);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [isLoadingBarangays, setIsLoadingBarangays] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setIsLoadingRegions(true);
        const { data, error } = await supabase.from('psgc_regions').select('*');
        if (cancelled) return;
        if (error) {
          setLocationError(error.message);
          setRegions([]);
          return;
        }
        setRegions(
          sortByName(
            ((data ?? []) as Record<string, unknown>[])
              .map((row) => normalizePsgcOption(row, ['region_name', 'name', 'description']))
              .filter((item): item is PsgcOption => Boolean(item)),
          ),
        );
      } finally {
        if (!cancelled) setIsLoadingRegions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!draft.regionPsgcCode) return undefined;

    void (async () => {
      try {
        setProvinces([]);
        setIsLoadingProvinces(true);
        const { data, error } = await supabase
          .from('psgc_provinces')
          .select('*')
          .eq('region_psgc_code', draft.regionPsgcCode);
        if (cancelled) return;
        if (error) {
          setLocationError(error.message);
          setProvinces([]);
          return;
        }
        setProvinces(
          sortByName(
            ((data ?? []) as Record<string, unknown>[])
              .map((row) => normalizePsgcOption(row, ['province_name', 'name', 'description']))
              .filter((item): item is PsgcOption => Boolean(item)),
          ),
        );
      } finally {
        if (!cancelled) setIsLoadingProvinces(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.regionPsgcCode]);

  useEffect(() => {
    let cancelled = false;
    if (!draft.regionPsgcCode) return undefined;

    let query = supabase
      .from('psgc_cities_municipalities')
      .select('*')
      .eq('region_psgc_code', draft.regionPsgcCode);

    if (draft.provincePsgcCode) {
      query = query.eq('province_psgc_code', draft.provincePsgcCode);
    }

    void (async () => {
      try {
        setCities([]);
        setIsLoadingCities(true);
        const { data, error } = await query;
        if (cancelled) return;
        if (error) {
          setLocationError(error.message);
          setCities([]);
          return;
        }
        setCities(
          sortByName(
            ((data ?? []) as Record<string, unknown>[])
              .map((row) =>
                normalizePsgcOption(row, ['city_municipality_name', 'city_name', 'municipality_name', 'name', 'description'], [
                  'geographic_type',
                  'type',
                  'classification',
                ]),
              )
              .filter((item): item is PsgcOption => Boolean(item)),
          ),
        );
      } finally {
        if (!cancelled) setIsLoadingCities(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.regionPsgcCode, draft.provincePsgcCode]);

  useEffect(() => {
    let cancelled = false;
    if (!draft.cityMunicipalityPsgcCode) return undefined;

    void (async () => {
      try {
        setBarangays([]);
        setIsLoadingBarangays(true);
        const { data, error } = await supabase
          .from('psgc_barangays')
          .select('*')
          .eq('city_municipality_psgc_code', draft.cityMunicipalityPsgcCode);
        if (cancelled) return;
        if (error) {
          setLocationError(error.message);
          setBarangays([]);
          return;
        }
        setBarangays(
          sortByName(
            ((data ?? []) as Record<string, unknown>[])
              .map((row) => normalizePsgcOption(row, ['barangay_name', 'name', 'description']))
              .filter((item): item is PsgcOption => Boolean(item)),
          ),
        );
      } finally {
        if (!cancelled) setIsLoadingBarangays(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.cityMunicipalityPsgcCode]);

  function updateField<Field extends keyof ClientDraft>(field: Field, value: ClientDraft[Field]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handleRegionChange(code: string) {
    const region = regions.find((item) => item.code === code) ?? null;
    setProvinces([]);
    setCities([]);
    setBarangays([]);
    setDraft((current) => ({
      ...current,
      regionPsgcCode: region?.code ?? '',
      region: region?.name ?? '',
      provincePsgcCode: '',
      province: '',
      cityMunicipalityPsgcCode: '',
      cityMunicipality: '',
      barangayPsgcCode: '',
      barangay: '',
    }));
  }

  function handleProvinceChange(code: string) {
    const province = provinces.find((item) => item.code === code) ?? null;
    setCities([]);
    setBarangays([]);
    setDraft((current) => ({
      ...current,
      provincePsgcCode: province?.code ?? '',
      province: province?.name ?? '',
      cityMunicipalityPsgcCode: '',
      cityMunicipality: '',
      barangayPsgcCode: '',
      barangay: '',
    }));
  }

  function handleCityChange(code: string) {
    const city = cities.find((item) => item.code === code) ?? null;
    setBarangays([]);
    setDraft((current) => ({
      ...current,
      cityMunicipalityPsgcCode: city?.code ?? '',
      cityMunicipality: city?.name ?? '',
      barangayPsgcCode: '',
      barangay: '',
    }));
  }

  function handleBarangayChange(code: string) {
    const barangay = barangays.find((item) => item.code === code) ?? null;
    setDraft((current) => ({
      ...current,
      barangayPsgcCode: barangay?.code ?? '',
      barangay: barangay?.name ?? '',
    }));
  }

  return (
    <div className={styles.confirmOverlay} role="presentation">
      <section className={styles.clientEditor} role="dialog" aria-modal="true" aria-label="Client editor">
        <header className={styles.sectionHeader}>
          <div>
            <h3 className={styles.sectionTitle}>{client.isTemporary ? 'Add Client' : 'Edit Client'}</h3>
            <p className={styles.sectionSubtitle}>Changes stay local until the main Save Changes button is clicked.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close client editor">
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </header>
        <div className={styles.groupedForm}>
          <div className={styles.formGroup}>
            <h4>Business Information</h4>
            <div className={styles.formGrid}>
              <label className={styles.field}><span>Company Name{client.isTemporary ? ' *' : ''}</span><input value={draft.companyName} onChange={(event) => updateField('companyName', event.target.value)} /></label>
              <label className={styles.field}><span>Client / Contact Name</span><input value={draft.clientName} onChange={(event) => updateField('clientName', event.target.value)} /></label>
              <label className={styles.field}><span>Client Reference Code</span><input value={draft.customClientCode} onChange={(event) => updateField('customClientCode', event.target.value)} /></label>
              <div className={styles.systemField}>
                <span>System Client Code</span>
                <strong>{draft.clientCode || 'System generated'}</strong>
                <p>Database generated and read-only.</p>
              </div>
              <label className={styles.field}><span>TIN</span><input value={draft.tin} onChange={(event) => updateField('tin', event.target.value)} /></label>
              <label className={styles.field}>
                <span>Status</span>
                <select value={draft.status} onChange={(event) => updateField('status', event.target.value as ClientStatus)}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>
            </div>
          </div>

          <div className={styles.formGroup}>
            <h4>Contact Information</h4>
            <div className={styles.formGrid}>
              <label className={styles.field}><span>Contact Person</span><input value={draft.contactPerson} onChange={(event) => updateField('contactPerson', event.target.value)} /></label>
              <label className={styles.field}><span>Contact Number</span><input value={draft.contactNumber} onChange={(event) => updateField('contactNumber', event.target.value)} /></label>
              <label className={styles.field}><span>Email</span><input type="email" value={draft.email} onChange={(event) => updateField('email', event.target.value)} /></label>
            </div>
          </div>

          <div className={styles.formGroup}>
            <h4>Pricing & Terms</h4>
            <div className={styles.formGrid}>
              <SearchableSelect
                label="Default Price Level"
                placeholder="No default price level"
                value={draft.defaultPriceCode}
                options={priceOptions}
                noResultsText="No allowed active price levels found."
                getOptionValue={(priceClass) => priceClass.priceCode}
                getOptionLabel={(priceClass) => `${priceClass.priceCode} - ${priceClass.priceLabel || priceClass.priceCode}`}
                getSearchText={(priceClass) => `${priceClass.priceCode} ${priceClass.priceLabel}`}
                renderOption={(priceClass) => (
                  <>
                    <strong>{priceClass.priceCode}</strong>
                    <span>{priceClass.priceLabel || '-'}</span>
                  </>
                )}
                onChange={(value) => updateField('defaultPriceCode', value)}
              />
              <SearchableSelect
                label="Default Payment Terms"
                placeholder="No default payment terms"
                value={draft.defaultDeliveryTermId}
                options={deliveryTermOptions}
                noResultsText="No active payment terms found."
                getOptionValue={(term) => term.id}
                getOptionLabel={(term) => `${term.termName}${term.termCode ? ` (${term.termCode})` : ''}`}
                getSearchText={(term) => `${term.termName} ${term.termCode}`}
                renderOption={(term) => (
                  <>
                    <strong>{term.termName}</strong>
                    <span>{term.termCode || '-'}</span>
                  </>
                )}
                onChange={(value) => updateField('defaultDeliveryTermId', value)}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <h4>Location</h4>
            <div className={styles.formGrid}>
              <SearchableSelect
                label="Region"
                placeholder={isLoadingRegions ? 'Loading regions...' : 'Select region'}
                value={draft.regionPsgcCode}
                options={regions}
                noResultsText="No regions found."
                getOptionValue={(option) => option.code}
                getOptionLabel={(option) => option.name}
                getSearchText={(option) => option.name}
                renderOption={(option) => (
                  <>
                    <strong>{option.name}</strong>
                    <span>{option.code}</span>
                  </>
                )}
                onChange={handleRegionChange}
              />
              <SearchableSelect
                label="Province"
                placeholder={isLoadingProvinces ? 'Loading provinces...' : 'No province / not applicable'}
                value={draft.provincePsgcCode}
                options={provinces}
                noResultsText="No province for this region."
                getOptionValue={(option) => option.code}
                getOptionLabel={(option) => option.name}
                getSearchText={(option) => option.name}
                renderOption={(option) => (
                  <>
                    <strong>{option.name}</strong>
                    <span>{option.code}</span>
                  </>
                )}
                onChange={handleProvinceChange}
              />
              <SearchableSelect
                label="City / Municipality"
                placeholder={isLoadingCities ? 'Loading cities...' : 'Select city or municipality'}
                value={draft.cityMunicipalityPsgcCode}
                options={cities}
                noResultsText="No cities or municipalities found."
                getOptionValue={(option) => option.code}
                getOptionLabel={(option) => `${option.name}${option.type ? ` - ${option.type}` : ''}`}
                getSearchText={(option) => `${option.name} ${option.type}`}
                renderOption={(option) => (
                  <>
                    <strong>{option.name}</strong>
                    <span>{option.type || option.code}</span>
                  </>
                )}
                onChange={handleCityChange}
              />
              <SearchableSelect
                label="Barangay"
                placeholder={draft.cityMunicipalityPsgcCode ? (isLoadingBarangays ? 'Loading barangays...' : 'Select barangay') : 'Select city first'}
                value={draft.barangayPsgcCode}
                options={barangays}
                noResultsText="No barangays found."
                getOptionValue={(option) => option.code}
                getOptionLabel={(option) => option.name}
                getSearchText={(option) => option.name}
                renderOption={(option) => (
                  <>
                    <strong>{option.name}</strong>
                    <span>{option.code}</span>
                  </>
                )}
                onChange={handleBarangayChange}
              />
              <label className={styles.field}><span>District / Area</span><input value={draft.districtArea} onChange={(event) => updateField('districtArea', event.target.value)} /></label>
              <label className={`${styles.field} ${styles.wideField}`}><span>Street / Full Address</span><textarea value={draft.address} onChange={(event) => updateField('address', event.target.value)} /></label>
            </div>
            {locationError ? <p className={styles.validationError}>{locationError}</p> : null}
          </div>

          <div className={styles.formGroup}>
            <h4>Notes</h4>
            <label className={`${styles.field} ${styles.wideField}`}><span>Notes</span><textarea value={draft.notes} onChange={(event) => updateField('notes', event.target.value)} /></label>
          </div>
        </div>
        <div className={styles.confirmActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.primaryButton} onClick={() => onSave(draft)}>Apply to Draft</button>
        </div>
      </section>
    </div>
  );
}
