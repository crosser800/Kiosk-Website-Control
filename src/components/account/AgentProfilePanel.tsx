import { useEffect, useMemo, useState } from 'react';
import type { AccountSummaryItem } from './AccountsSummary';
import { loadAccountItems } from '../../services/accounts';
import { supabase } from '../../lib/supabase';
import type { OrderPriceCode } from '../../services/orderPricing';
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
  createdAt: string;
  isTemporary?: boolean;
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
  created_at: string | null;
};

const sections: { id: PanelSection; label: string; icon: string }[] = [
  { id: 'info', label: 'Info', icon: 'fa-id-card' },
  { id: 'sales', label: 'Sales', icon: 'fa-chart-line' },
  { id: 'clients', label: 'Clients', icon: 'fa-users' },
  { id: 'settings', label: 'Settings', icon: 'fa-sliders' },
];

const priceCodes: OrderPriceCode[] = ['R1', 'R2', 'W1', 'W2', 'SP', 'CP'];
const PROFILE_IMAGE_BUCKET = 'agent-profiles';
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PROFILE_IMAGE_DIMENSION = 720;
const PROFILE_IMAGE_QUALITY = 0.82;
const ACCEPTED_PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type PendingProfileImage = {
  blob: Blob;
  previewUrl: string;
};

type ConvertImageOptions = {
  maxWidth: number;
  maxHeight: number;
  quality: number;
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

function getAgentProfilePath(agentId: string) {
  return `agents/${agentId}/profile.webp`;
}

function getVersionedImageUrl(url: string, version: string) {
  if (!url) return '';
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(version || String(Date.now()))}`;
}

async function convertImageToWebp(file: File, options: ConvertImageOptions) {
  if (!ACCEPTED_PROFILE_IMAGE_TYPES.has(file.type)) {
    throw new Error('Upload a JPG, PNG, or WEBP image.');
  }

  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error('Profile image must be 5 MB or smaller.');
  }

  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Unable to decode this image.'));
      element.src = sourceUrl;
    });

    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;

    if (!sourceWidth || !sourceHeight) {
      throw new Error('Unable to read this image size.');
    }

    const scale = Math.min(options.maxWidth / sourceWidth, options.maxHeight / sourceHeight, 1);
    const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
    const outputHeight = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to prepare image conversion.');
    }

    context.drawImage(image, 0, 0, outputWidth, outputHeight);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (nextBlob) => {
          if (!nextBlob) {
            reject(new Error('WEBP conversion failed.'));
            return;
          }
          resolve(nextBlob);
        },
        'image/webp',
        options.quality,
      );
    });

    return blob;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
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

export default function AgentProfilePanel({ account, onSave, onClose }: AgentProfilePanelProps) {
  const [activeSection, setActiveSection] = useState<PanelSection>('info');
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(() => mapAccountToAgentDraft(account));
  const [originalAgent, setOriginalAgent] = useState<AgentDraft>(() => mapAccountToAgentDraft(account));
  const [clientDrafts, setClientDrafts] = useState<ClientDraft[]>([]);
  const [originalClients, setOriginalClients] = useState<ClientDraft[]>([]);
  const [priceDraft, setPriceDraft] = useState<OrderPriceCode[]>([]);
  const [originalPriceAccess, setOriginalPriceAccess] = useState<OrderPriceCode[]>([]);
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
      const [agentRes, clientsRes, priceRes] = await Promise.all([
        supabase
          .from('agent_accounts')
          .select('id, auth_user_id, agent_code, full_name, company_name, contact_number, email, address, profile_image_url, status, notes, must_change_password, password_reset_at, updated_at')
          .eq('id', account.id)
          .single(),
        supabase
          .from('agent_clients')
          .select('id, agent_id, client_code, client_name, company_name, contact_person, contact_number, email, address, tin, status, notes, created_at')
          .eq('agent_id', account.id)
          .order('client_name', { ascending: true }),
        supabase
          .from('agent_price_access')
          .select('agent_id, price_class')
          .eq('agent_id', account.id),
      ]);

      const error = agentRes.error ?? clientsRes.error ?? priceRes.error;
      if (error) throw new Error(error.message);

      const nextAgent = mapAgentRow(agentRes.data as AgentRow);
      const nextClients = ((clientsRes.data ?? []) as ClientRow[]).map(mapClientRow);
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
      if (!trimmedClient.clientName) {
        setValidationError('Client Name is required for every client.');
        setActiveSection('clients');
        return false;
      }
      if (!isValidEmail(trimmedClient.email)) {
        setValidationError(`Enter a valid email for ${trimmedClient.clientName}.`);
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
            .select('id, profile_image_url')
            .single()
            .then(({ data, error }) => {
              if (error) throw new Error(error.message);
              const persistedProfileImageUrl = String(data?.profile_image_url ?? '');
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
                contact_person: client.contactPerson || null,
                contact_number: client.contactNumber || null,
                email: client.email || null,
                address: client.address || null,
                tin: client.tin || null,
                status: client.status,
                notes: client.notes || null,
              })),
            )
            .select('id, agent_id, client_code, client_name, company_name, contact_person, contact_number, email, address, tin, status, notes, created_at')
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
              contact_person: client.contactPerson || null,
              contact_number: client.contactNumber || null,
              email: client.email || null,
              address: client.address || null,
              tin: client.tin || null,
              status: client.status,
              notes: client.notes || null,
            })
            .eq('id', client.id)
            .then(({ error }) => {
              if (error) throw new Error(error.message);
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
      setSaveError(
        error instanceof Error
          ? `Save failed: ${error.message}. Some earlier requests may already have been written because no shared transaction RPC is configured.`
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
    if (!trimmedClient.clientName) {
      setValidationError('Client Name is required.');
      return;
    }
    if (!isValidEmail(trimmedClient.email)) {
      setValidationError('Enter a valid client email address.');
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

        <div className={styles.body}>
          <nav className={styles.sidebar} aria-label="Agent profile sections">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`${styles.navButton} ${activeSection === section.id ? styles.navButtonActive : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                <i className={`fa-solid ${section.icon}`} aria-hidden="true"></i>
                <span>{section.label}</span>
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
                        <input value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Search clients" />
                      </label>
                      <span className={styles.countPill}>{visibleClients.length.toLocaleString()} clients</span>
                    </div>
                    <div className={styles.tableShell}>
                      <div className={styles.clientTableHeader}>
                        <span>Client Code</span><span>Client Name</span><span>Company</span><span>Contact Person</span><span>Contact</span><span>Email</span><span>Status</span><span>Actions</span>
                      </div>
                      {visibleClients.length === 0 ? (
                        <div className={styles.emptyState}>
                          <i className="fa-solid fa-address-book" aria-hidden="true"></i>
                          <p>No clients are available for this agent yet.</p>
                        </div>
                      ) : (
                        visibleClients.map((client) => (
                          <div key={client.id} className={styles.clientRow}>
                            <span>{client.clientCode || '—'}</span>
                            <strong>{client.clientName || '-'}</strong>
                            <span>{client.companyName || '-'}</span>
                            <span>{client.contactPerson || '-'}</span>
                            <span>{client.contactNumber || '-'}</span>
                            <span>{client.email || '-'}</span>
                            <span className={`${styles.clientStatus} ${client.status === 'Active' ? styles.statusActive : styles.statusInactive}`}>{client.status}</span>
                            <span className={styles.rowActions}>
                              <button type="button" onClick={() => setEditingClient(client)} aria-label={`Edit ${client.clientName}`}>
                                <i className="fa-solid fa-pen" aria-hidden="true"></i>
                              </button>
                              <button type="button" onClick={() => setRemoveTarget(client)} aria-label={`Remove ${client.clientName}`}>
                                <i className="fa-solid fa-trash" aria-hidden="true"></i>
                              </button>
                            </span>
                          </div>
                        ))
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
  onSave,
  onClose,
}: {
  client: ClientDraft;
  onSave: (client: ClientDraft) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ClientDraft>(client);

  function updateField<Field extends keyof ClientDraft>(field: Field, value: ClientDraft[Field]) {
    setDraft((current) => ({ ...current, [field]: value }));
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
        <div className={styles.formGrid}>
          <label className={styles.field}><span>Client Name *</span><input value={draft.clientName} onChange={(event) => updateField('clientName', event.target.value)} /></label>
          {!client.isTemporary ? (
            <div className={styles.systemField}>
              <span>Client Code</span>
              <strong>{draft.clientCode || 'System generated'}</strong>
              <p>Generated by the database and cannot be edited.</p>
            </div>
          ) : null}
          <label className={styles.field}><span>Company Name</span><input value={draft.companyName} onChange={(event) => updateField('companyName', event.target.value)} /></label>
          <label className={styles.field}><span>Contact Person</span><input value={draft.contactPerson} onChange={(event) => updateField('contactPerson', event.target.value)} /></label>
          <label className={styles.field}><span>Contact Number</span><input value={draft.contactNumber} onChange={(event) => updateField('contactNumber', event.target.value)} /></label>
          <label className={styles.field}><span>Email</span><input type="email" value={draft.email} onChange={(event) => updateField('email', event.target.value)} /></label>
          <label className={styles.field}><span>TIN</span><input value={draft.tin} onChange={(event) => updateField('tin', event.target.value)} /></label>
          <label className={styles.field}>
            <span>Status</span>
            <select value={draft.status} onChange={(event) => updateField('status', event.target.value as ClientStatus)}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>
          <label className={`${styles.field} ${styles.wideField}`}><span>Address</span><textarea value={draft.address} onChange={(event) => updateField('address', event.target.value)} /></label>
          <label className={`${styles.field} ${styles.wideField}`}><span>Notes</span><textarea value={draft.notes} onChange={(event) => updateField('notes', event.target.value)} /></label>
        </div>
        <div className={styles.confirmActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.primaryButton} onClick={() => onSave(draft)}>Apply to Draft</button>
        </div>
      </section>
    </div>
  );
}
