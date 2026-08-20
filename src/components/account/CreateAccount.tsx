import { useEffect, useMemo, useState } from 'react';
import type { AccountSummaryItem, AccountView } from './AccountsSummary';
import {
  addAccountItem,
  groupPermissionsByModule,
  INTERNAL_TEMPORARY_PASSWORD_MIN_LENGTH,
  loadInternalAdminFormOptions,
  type InternalAdminFormOptions,
} from '../../services/accounts';
import type { OrderPriceCode } from '../../services/orderPricing';
import styles from './AccountModal.module.css';

type CreateAccountProps = {
  accountType: AccountView;
  onCreate: (accounts: Promise<AccountSummaryItem[]> | AccountSummaryItem[], message?: string) => void;
  onClose: () => void;
};

type AccountForm = {
  name: string;
  email: string;
  contact: string;
  branch: string;
  address: string;
  notes: string;
  status: 'Active' | 'Inactive' | 'Blocked' | 'Locked';
  username: string;
  roleId: string;
  departmentId: string;
  parentAdminAccountId: string;
  permissionIds: string[];
  temporaryPassword: string;
  priceAccess: OrderPriceCode[];
  profileImageFile: File | null;
  profileImagePreviewUrl: string;
  birthdate: string;
  gender: string;
  addressLine: string;
  city: string;
  province: string;
  postalCode: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactNumber: string;
};

const priceOptions: OrderPriceCode[] = ['R1', 'R2', 'W1', 'W2', 'SP', 'CP'];

function getInitialForm(): AccountForm {
  return {
    name: '',
    email: '',
    contact: '',
    branch: '',
    address: '',
    notes: '',
    status: 'Active',
    username: '',
    roleId: '',
    departmentId: '',
    parentAdminAccountId: '',
    permissionIds: [],
    temporaryPassword: '',
    priceAccess: [],
    profileImageFile: null,
    profileImagePreviewUrl: '',
    birthdate: '',
    gender: '',
    addressLine: '',
    city: '',
    province: '',
    postalCode: '',
    emergencyContactName: '',
    emergencyContactRelationship: '',
    emergencyContactNumber: '',
  };
}

function isValidEmail(email: string) {
  return !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidBirthdate(value: string) {
  if (!value) return true;
  const parsed = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return !Number.isNaN(parsed.getTime()) && parsed <= today;
}

function formatContactInput(value: string) {
  const digitsOnly = value.replace(/\D/g, '').slice(0, 11);
  return [digitsOnly.slice(0, 4), digitsOnly.slice(4, 7), digitsOnly.slice(7, 11)]
    .filter(Boolean)
    .join('-');
}

export default function CreateAccount({ accountType, onCreate, onClose }: CreateAccountProps) {
  const [form, setForm] = useState<AccountForm>(getInitialForm);
  const [options, setOptions] = useState<InternalAdminFormOptions>({
    roles: [],
    departments: [],
    gateways: [],
    permissions: [],
  });
  const [isLoadingOptions, setIsLoadingOptions] = useState(accountType === 'admins');
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const groupedPermissions = useMemo(() => {
    return groupPermissionsByModule(options.permissions);
  }, [options]);

  useEffect(() => {
    if (accountType !== 'admins') return;

    loadInternalAdminFormOptions()
      .then((nextOptions) => {
        setOptions(nextOptions);
        setForm((current) => ({
          ...current,
          roleId: current.roleId || nextOptions.roles[0]?.id || '',
          departmentId: current.departmentId || nextOptions.departments[0]?.id || '',
          parentAdminAccountId:
            current.parentAdminAccountId ||
            nextOptions.gateways.find((gateway) => gateway.label.toLowerCase().includes('operations'))?.id ||
            nextOptions.gateways[0]?.id ||
            '',
        }));
      })
      .catch((error) => {
        setValidationError(error instanceof Error ? error.message : 'Unable to load internal admin options.');
      })
      .finally(() => setIsLoadingOptions(false));
  }, [accountType]);

  useEffect(
    () => () => {
      if (form.profileImagePreviewUrl) {
        URL.revokeObjectURL(form.profileImagePreviewUrl);
      }
    },
    [form.profileImagePreviewUrl],
  );

  function updateField<Field extends keyof AccountForm>(field: Field, value: AccountForm[Field]) {
    setValidationError('');
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleProfileImageChange(file: File | undefined) {
    setValidationError('');
    setForm((current) => {
      if (current.profileImagePreviewUrl) {
        URL.revokeObjectURL(current.profileImagePreviewUrl);
      }

      return {
        ...current,
        profileImageFile: file ?? null,
        profileImagePreviewUrl: file ? URL.createObjectURL(file) : '',
      };
    });
  }

  function togglePermission(permissionId: string) {
    setValidationError('');
    setForm((current) => ({
      ...current,
      permissionIds: current.permissionIds.includes(permissionId)
        ? current.permissionIds.filter((id) => id !== permissionId)
        : [...current.permissionIds, permissionId],
    }));
  }

  function togglePriceAccess(priceCode: OrderPriceCode) {
    setValidationError('');
    setForm((current) => ({
      ...current,
      priceAccess: current.priceAccess.includes(priceCode)
        ? current.priceAccess.filter((code) => code !== priceCode)
        : [...current.priceAccess, priceCode],
    }));
  }

  function validateForm() {
    if (!form.name.trim()) {
      setValidationError('Full Name is required.');
      return false;
    }

    if (accountType === 'agents') {
      if (!form.email.trim()) {
        setValidationError('Email address is required for agent accounts.');
        return false;
      }
      if (!isValidEmail(form.email)) {
        setValidationError('Enter a valid email address.');
        return false;
      }
      return true;
    }

    if (!form.username.trim()) {
      setValidationError('Username is required.');
      return false;
    }
    if (!isValidEmail(form.email)) {
      setValidationError('Enter a valid email address.');
      return false;
    }
    if (!isValidBirthdate(form.birthdate)) {
      setValidationError('Birthdate cannot be in the future.');
      return false;
    }
    if (!form.parentAdminAccountId) {
      setValidationError('Select a parent gateway account.');
      return false;
    }
    if (!form.temporaryPassword.trim()) {
      setValidationError('Temporary password is required.');
      return false;
    }
    if (form.temporaryPassword.length < INTERNAL_TEMPORARY_PASSWORD_MIN_LENGTH) {
      setValidationError('Temporary password must be at least 8 characters.');
      return false;
    }

    return true;
  }

  async function handleCreate() {
    if (isSubmitting || !validateForm()) return;

    setIsSubmitting(true);
    try {
      const nextAccounts = await addAccountItem({
        name: form.name,
        email: form.email,
        contact: form.contact,
        role: accountType,
        handle: '',
        access: '',
        branch: form.branch,
        departmentId: accountType === 'admins' ? form.departmentId : undefined,
        status: form.status,
        address: accountType === 'agents' ? form.address : undefined,
        notes: accountType === 'agents' ? form.notes : undefined,
        priceAccess: accountType === 'agents' ? form.priceAccess : undefined,
        username: accountType === 'admins' ? form.username : undefined,
        roleId: accountType === 'admins' ? form.roleId : undefined,
        parentAdminAccountId: accountType === 'admins' ? form.parentAdminAccountId : undefined,
        permissionIds: accountType === 'admins' ? form.permissionIds : undefined,
        temporaryPassword: accountType === 'admins' ? form.temporaryPassword : undefined,
        profileImageFile: accountType === 'admins' ? form.profileImageFile ?? undefined : undefined,
        birthdate: accountType === 'admins' ? form.birthdate : undefined,
        gender: accountType === 'admins' ? form.gender : undefined,
        addressLine: accountType === 'admins' ? form.addressLine : undefined,
        city: accountType === 'admins' ? form.city : undefined,
        province: accountType === 'admins' ? form.province : undefined,
        postalCode: accountType === 'admins' ? form.postalCode : undefined,
        emergencyContactName: accountType === 'admins' ? form.emergencyContactName : undefined,
        emergencyContactRelationship: accountType === 'admins' ? form.emergencyContactRelationship : undefined,
        emergencyContactNumber: accountType === 'admins' ? form.emergencyContactNumber : undefined,
      });
      setForm(getInitialForm());
      onCreate(
        nextAccounts,
        `${accountType === 'admins' ? 'Internal admin created successfully.' : 'Account created successfully.'}${
          'warning' in nextAccounts && nextAccounts.warning ? ` ${nextAccounts.warning}` : ''
        }`,
      );
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Unable to create this account.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation">
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="create-account-title">
        <div className={styles.header}>
          <div>
            <h2 id="create-account-title" className={styles.title}>
              {accountType === 'admins' ? 'Create Internal Admin' : 'Create New Account'}
            </h2>
            <p className={styles.subtitle}>
              Create account for {accountType === 'admins' ? 'Internal Admin' : 'Agent'}
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close create account">
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        <div className={styles.divider}></div>

          <div className={styles.formContainer}>
          {accountType === 'admins' ? (
            <div className={styles.profilePicker}>
              <div className={styles.profilePreview} aria-hidden="true">
                {form.profileImagePreviewUrl ? (
                  <img src={form.profileImagePreviewUrl} alt="" className={styles.profileImage} />
                ) : (
                  <i className="fa-solid fa-user"></i>
                )}
              </div>
              <label className={styles.profileButton}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className={styles.profileInput}
                  onChange={(event) => handleProfileImageChange(event.target.files?.[0])}
                />
                {form.profileImageFile ? 'Replace Image' : 'Choose Image'}
              </label>
              {form.profileImageFile ? (
                <button type="button" className={styles.profileButton} onClick={() => handleProfileImageChange(undefined)}>
                  Remove Image
                </button>
              ) : null}
            </div>
          ) : null}

          <div className={styles.topGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Full Name</span>
              <input value={form.name} onChange={(event) => updateField('name', event.target.value)} className={styles.input} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Status</span>
              <select
                value={form.status}
                onChange={(event) => updateField('status', event.target.value as AccountForm['status'])}
                className={styles.select}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                {accountType === 'admins' ? <option value="Locked">Locked</option> : null}
                {accountType === 'agents' ? <option value="Blocked">Blocked</option> : null}
              </select>
            </label>
          </div>

          <div className={styles.formGrid}>
            {accountType === 'admins' ? (
              <>
                <label className={styles.field}>
                  <span className={styles.label}>Username</span>
                  <input
                    value={form.username}
                    onChange={(event) => updateField('username', event.target.value.toLowerCase())}
                    className={styles.input}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Role / Position</span>
                  <select value={form.roleId} onChange={(event) => updateField('roleId', event.target.value)} className={styles.select} disabled={isLoadingOptions}>
                    <option value="">Select role</option>
                    {options.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Department</span>
                  <select value={form.departmentId} onChange={(event) => updateField('departmentId', event.target.value)} className={styles.select} disabled={isLoadingOptions}>
                    <option value="">Select department</option>
                    {options.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Parent Gateway Account</span>
                  <select value={form.parentAdminAccountId} onChange={(event) => updateField('parentAdminAccountId', event.target.value)} className={styles.select} disabled={isLoadingOptions}>
                    <option value="">Select gateway</option>
                    {options.gateways.map((gateway) => <option key={gateway.id} value={gateway.id}>{gateway.label}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Temporary Password</span>
                  <input type="password" value={form.temporaryPassword} onChange={(event) => updateField('temporaryPassword', event.target.value)} className={styles.input} />
                  <span className={styles.fieldHelper}>Temporary password must be at least 8 characters.</span>
                </label>
                <div className={`${styles.sectionBlock} ${styles.wideField}`}>
                  <h3>Personal Information</h3>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span className={styles.label}>Birthdate</span>
                      <input type="date" value={form.birthdate} onChange={(event) => updateField('birthdate', event.target.value)} className={styles.input} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Gender</span>
                      <select value={form.gender} onChange={(event) => updateField('gender', event.target.value)} className={styles.select}>
                        <option value="">Select gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Prefer not to say">Prefer not to say</option>
                        <option value="Other">Other</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Email</span>
                      <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} className={styles.input} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Contact Number</span>
                      <input value={form.contact} onChange={(event) => updateField('contact', event.target.value)} className={styles.input} />
                    </label>
                  </div>
                </div>
                <div className={`${styles.sectionBlock} ${styles.wideField}`}>
                  <h3>Address</h3>
                  <div className={styles.formGrid}>
                    <label className={`${styles.field} ${styles.wideField}`}>
                      <span className={styles.label}>Address Line</span>
                      <input value={form.addressLine} onChange={(event) => updateField('addressLine', event.target.value)} className={styles.input} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>City</span>
                      <input value={form.city} onChange={(event) => updateField('city', event.target.value)} className={styles.input} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Province</span>
                      <input value={form.province} onChange={(event) => updateField('province', event.target.value)} className={styles.input} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Postal Code</span>
                      <input value={form.postalCode} onChange={(event) => updateField('postalCode', event.target.value)} className={styles.input} />
                    </label>
                  </div>
                </div>
                <div className={`${styles.sectionBlock} ${styles.wideField}`}>
                  <h3>Emergency Contact</h3>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span className={styles.label}>Name</span>
                      <input value={form.emergencyContactName} onChange={(event) => updateField('emergencyContactName', event.target.value)} className={styles.input} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Relationship</span>
                      <input value={form.emergencyContactRelationship} onChange={(event) => updateField('emergencyContactRelationship', event.target.value)} className={styles.input} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Contact Number</span>
                      <input value={form.emergencyContactNumber} onChange={(event) => updateField('emergencyContactNumber', event.target.value)} className={styles.input} />
                    </label>
                  </div>
                </div>
                <div className={styles.noticeCard}>
                  <span className={styles.label}>Password Backend</span>
                  <p>Creation will stay blocked until a secure RPC or Edge Function is available for password hashing.</p>
                </div>
                <div className={`${styles.noticeCard} ${styles.wideField}`}>
                  <span className={styles.label}>Access</span>
                  {groupedPermissions.map(([moduleCode, permissions]) => (
                    <div key={moduleCode} className={styles.accessGroup}>
                      <strong>{moduleCode}</strong>
                      {permissions.map((permission) => (
                        <label key={permission.id} className={styles.accessOptionInline}>
                          <input type="checkbox" checked={form.permissionIds.includes(permission.id)} onChange={() => togglePermission(permission.id)} className={styles.checkbox} />
                          <span>{permission.label}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <label className={styles.field}>
                  <span className={styles.label}>Email Address</span>
                  <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} className={styles.input} />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Contact</span>
                  <input value={form.contact} onChange={(event) => updateField('contact', formatContactInput(event.target.value))} className={styles.input} />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Company Name</span>
                  <input value={form.branch} onChange={(event) => updateField('branch', event.target.value)} className={styles.input} />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Address</span>
                  <input value={form.address} onChange={(event) => updateField('address', event.target.value)} className={styles.input} />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Notes</span>
                  <textarea value={form.notes} onChange={(event) => updateField('notes', event.target.value)} className={styles.textarea} />
                </label>
                <div className={styles.noticeCard}>
                  <span className={styles.label}>Initial Price Access</span>
                  <div className={styles.priceCircleGroup}>
                    {priceOptions.map((priceCode) => (
                      <button key={priceCode} type="button" className={`${styles.priceCircle} ${form.priceAccess.includes(priceCode) ? styles.priceCircleActive : ''}`} onClick={() => togglePriceAccess(priceCode)}>
                        {priceCode}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {validationError ? <p className={styles.validationError}>{validationError}</p> : null}

        <div className={styles.actions}>
          <button type="button" className={styles.createButton} onClick={() => void handleCreate()} disabled={isSubmitting || isLoadingOptions}>
            {isSubmitting ? 'Creating account...' : accountType === 'admins' ? 'Create Internal Admin' : 'Create Account'}
          </button>
          <button type="button" className={styles.cancelButton} onClick={onClose}>Cancel</button>
        </div>
      </section>
    </div>
  );
}
