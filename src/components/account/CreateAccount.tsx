import { useEffect, useRef, useState } from 'react';
import type { AccountSummaryItem, AccountView } from './AccountsSummary';
import { addAccountItem } from '../../services/accounts';
import {
  loadAdminDepartments,
  type AdminDepartment,
} from '../../services/adminDepartments';
import type { OrderPriceCode } from '../../services/orderPricing';
import styles from './AccountModal.module.css';

type CreateAccountProps = {
  accountType: AccountView;
  onCreate: (accounts: Promise<AccountSummaryItem[]> | AccountSummaryItem[]) => void;
  onClose: () => void;
};

type AccountForm = {
  profileImage: string;
  profileImageFile: File | null;
  name: string;
  role: AccountView;
  access: string[];
  handling: string;
  branch: string;
  departmentId: string;
  departmentName: string;
  isActive: boolean;
  status: 'Active' | 'Inactive' | 'Blocked';
  email: string;
  contact: string;
  address: string;
  notes: string;
  priceAccess: OrderPriceCode[];
};

const priceOptions: OrderPriceCode[] = ['R1', 'R2', 'W1', 'W2', 'SP', 'CP'];

function formatContactInput(value: string) {
  const digitsOnly = value.replace(/\D/g, '').slice(0, 11);
  const first = digitsOnly.slice(0, 4);
  const second = digitsOnly.slice(4, 7);
  const third = digitsOnly.slice(7, 11);

  return [first, second, third].filter(Boolean).join('-');
}

function getInitialForm(accountType: AccountView): AccountForm {
  return {
    profileImage: '',
    profileImageFile: null,
    name: '',
    role: accountType,
    access: [],
    handling: '',
    branch: '',
    departmentId: '',
    departmentName: '',
    isActive: true,
    status: 'Active',
    email: '',
    contact: '',
    address: '',
    notes: '',
    priceAccess: [],
  };
}

function isValidEmail(email: string) {
  return !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function CreateAccount({ accountType, onCreate, onClose }: CreateAccountProps) {
  const [form, setForm] = useState<AccountForm>(() => getInitialForm(accountType));
  const previousProfilePreviewRef = useRef('');
  const [departments, setDepartments] = useState<AdminDepartment[]>([]);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(accountType === 'admins');
  const [departmentLoadError, setDepartmentLoadError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const contactInputRef = useRef<HTMLInputElement>(null);
  const departmentSelectRef = useRef<HTMLSelectElement>(null);
  const accountLabel = form.role === 'admins' ? 'Admin' : 'Agent';

  useEffect(
    () => () => {
      if (previousProfilePreviewRef.current) {
        URL.revokeObjectURL(previousProfilePreviewRef.current);
      }
    },
    [],
  );

  function fetchDepartments() {
    setIsLoadingDepartments(true);
    setDepartmentLoadError('');

    return loadAdminDepartments()
      .then((nextDepartments) => {
        setDepartments(nextDepartments);
        setForm((current) => {
          const selectedDepartment = nextDepartments.find(
            (department) => department.id === current.departmentId,
          );

          if (selectedDepartment) {
            return {
              ...current,
              departmentId: selectedDepartment.id,
              departmentName: selectedDepartment.name,
              branch: selectedDepartment.name,
            };
          }

          const staleDepartmentText =
            current.departmentId || current.departmentName || current.branch;

          if (!staleDepartmentText) {
            return current;
          }

          const matchingDepartments = nextDepartments.filter(
            (department) =>
              department.name.localeCompare(staleDepartmentText, undefined, {
                sensitivity: 'accent',
              }) === 0,
          );

          if (matchingDepartments.length === 1) {
            const [matchedDepartment] = matchingDepartments;
            return {
              ...current,
              departmentId: matchedDepartment.id,
              departmentName: matchedDepartment.name,
              branch: matchedDepartment.name,
            };
          }

          return { ...current, departmentId: '', departmentName: '', branch: '' };
        });
      })
      .catch((error) => {
        console.error('Admin departments failed to load', error);
        setDepartmentLoadError(
          error instanceof Error ? error.message : 'Unable to load admin departments.',
        );
      })
      .finally(() => setIsLoadingDepartments(false));
  }

  useEffect(() => {
    if (form.role !== 'admins') {
      return;
    }

    void fetchDepartments();
  }, [form.role]);

  function updateField<Field extends keyof AccountForm>(
    field: Field,
    value: AccountForm[Field],
  ) {
    setValidationError('');
    setForm((current) => ({ ...current, [field]: value }));
  }

  function validateForm() {
    if (!form.name.trim()) {
      setValidationError(
        form.role === 'admins'
          ? 'Name and email are required for admin accounts.'
          : 'Name, email address, and status are required for agent accounts.',
      );
      nameInputRef.current?.focus();
      return false;
    }

    if (!form.email.trim()) {
      setValidationError(
        form.role === 'admins'
          ? 'Name and email are required for admin accounts.'
          : 'Name, email address, and status are required for agent accounts.',
      );
      emailInputRef.current?.focus();
      return false;
    }

    if (form.role === 'admins') {
      if (form.departmentId && isLoadingDepartments) {
        setValidationError('Wait for departments to finish loading.');
        departmentSelectRef.current?.focus();
        return false;
      }

      if (form.departmentId && departmentLoadError) {
        setValidationError('Departments could not be loaded. Retry before creating this account.');
        departmentSelectRef.current?.focus();
        return false;
      }

      if (form.departmentId && !departments.some((department) => department.id === form.departmentId)) {
        setValidationError('Please select a valid department.');
        departmentSelectRef.current?.focus();
        return false;
      }
    }

    if (!isValidEmail(form.email)) {
      setValidationError('Enter a valid email address.');
      emailInputRef.current?.focus();
      return false;
    }

    setValidationError('');
    return true;
  }

  function handleDepartmentChange(departmentId: string) {
    const selectedDepartment = departments.find((department) => department.id === departmentId);

    setValidationError('');
    setForm((current) => ({
      ...current,
      departmentId,
      departmentName: selectedDepartment?.name ?? '',
      branch: selectedDepartment?.name ?? '',
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

  function handleProfileImageChange(file: File | null) {
    setValidationError('');

    if (previousProfilePreviewRef.current) {
      URL.revokeObjectURL(previousProfilePreviewRef.current);
      previousProfilePreviewRef.current = '';
    }

    if (!file) {
      setForm((current) => ({
        ...current,
        profileImage: '',
        profileImageFile: null,
      }));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    previousProfilePreviewRef.current = previewUrl;
    setForm((current) => ({
      ...current,
      profileImage: previewUrl,
      profileImageFile: file,
    }));
  }

  async function handleCreate() {
    if (isSubmitting || !validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const selectedDepartment = departments.find(
        (department) => department.id === form.departmentId,
      );
      const nextAccounts = await addAccountItem({
        profileImage: form.profileImage || undefined,
        profileImageFile: form.role === 'agents' ? form.profileImageFile ?? undefined : undefined,
        name: form.name,
        email: form.email,
        contact: form.contact,
        role: form.role,
        handle: '',
        access: '',
        branch: form.role === 'admins' ? selectedDepartment?.name ?? '' : form.branch,
        departmentId: form.role === 'admins' ? selectedDepartment?.id : undefined,
        status: form.role === 'agents' ? form.status : form.isActive ? 'Active' : 'Inactive',
        address: form.role === 'agents' ? form.address : undefined,
        notes: form.role === 'agents' ? form.notes : undefined,
        priceAccess: form.role === 'agents' ? form.priceAccess : undefined,
      });
      onCreate(nextAccounts);
      if ('warning' in nextAccounts && nextAccounts.warning) {
        window.setTimeout(() => window.alert(nextAccounts.warning), 0);
      }
    } catch (error) {
      console.error('Create account failed', error);
      setValidationError(
        error instanceof Error ? error.message : 'Unable to create this account.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation">
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-account-title"
      >
        <div className={styles.header}>
          <div>
            <h2 id="create-account-title" className={styles.title}>
              Create New Account
            </h2>
            <p className={styles.subtitle}>Create account for {accountLabel}</p>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close create account"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        <div className={styles.divider}></div>

        <div className={styles.formContainer}>
          {form.role === 'agents' ? (
            <div className={styles.profilePicker}>
              <div className={styles.profilePreview} aria-hidden="true">
                {form.profileImage ? (
                  <img
                    src={form.profileImage}
                    alt=""
                    className={styles.profileImage}
                  />
                ) : (
                  <i className="fa-solid fa-user" aria-hidden="true"></i>
                )}
              </div>
              <label className={styles.profileButton}>
                <i className="fa-solid fa-camera" aria-hidden="true"></i>
                <span>Add Profile</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className={styles.profileInput}
                  onChange={(event) => {
                    handleProfileImageChange(event.target.files?.[0] ?? null);
                    event.target.value = '';
                  }}
                />
              </label>
            </div>
          ) : null}

          <div className={styles.topGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Name</span>
              <input
                type="text"
                ref={nameInputRef}
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                className={styles.input}
                required
              />
            </label>

            {form.role === 'agents' ? (
              <label className={styles.field}>
                <span className={styles.label}>Status</span>
                <select
                  value={form.status}
                  onChange={(event) => updateField('status', event.target.value as AccountForm['status'])}
                  className={styles.select}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Blocked">Blocked</option>
                </select>
              </label>
            ) : (
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => updateField('isActive', event.target.checked)}
                  className={styles.checkbox}
                />
                <span>Set Active</span>
              </label>
            )}
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Email Address</span>
              <input
                type="email"
                ref={emailInputRef}
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                className={styles.input}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Contact</span>
              <input
                type="tel"
                inputMode="numeric"
                ref={contactInputRef}
                value={form.contact}
                onChange={(event) => updateField('contact', formatContactInput(event.target.value))}
                placeholder="0000-000-0000"
                className={styles.input}
              />
            </label>

            {form.role === 'admins' ? (
              <label className={styles.field}>
                <span className={styles.label}>Department</span>
                <select
                  ref={departmentSelectRef}
                  value={form.departmentId}
                  onChange={(event) => handleDepartmentChange(event.target.value)}
                  className={styles.select}
                  disabled={isLoadingDepartments}
                >
                  <option value="">
                    {isLoadingDepartments ? 'Loading departments...' : 'Select department'}
                  </option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
                {departmentLoadError ? (
                  <small className={styles.inlineError}>
                    Departments could not be loaded.
                    <button type="button" onClick={() => void fetchDepartments()}>
                      Retry
                    </button>
                  </small>
                ) : null}
              </label>
            ) : (
              <label className={styles.field}>
                <span className={styles.label}>Company Name</span>
                <input
                  type="text"
                  value={form.branch}
                  onChange={(event) => updateField('branch', event.target.value)}
                  placeholder="Enter company name"
                  className={styles.input}
              />
            </label>
            )}

            {form.role === 'agents' ? (
              <>
                <label className={styles.field}>
                  <span className={styles.label}>Address</span>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(event) => updateField('address', event.target.value)}
                    placeholder="Enter address"
                    className={styles.input}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Notes</span>
                  <textarea
                    value={form.notes}
                    onChange={(event) => updateField('notes', event.target.value)}
                    placeholder="Optional notes"
                    className={styles.textarea}
                  />
                </label>

                <div className={styles.noticeCard}>
                  <span className={styles.label}>Initial Price Access</span>
                  <div className={styles.priceCircleGroup}>
                    {priceOptions.map((priceCode) => (
                      <button
                        key={priceCode}
                        type="button"
                        className={`${styles.priceCircle} ${
                          form.priceAccess.includes(priceCode) ? styles.priceCircleActive : ''
                        }`}
                        onClick={() => togglePriceAccess(priceCode)}
                        aria-pressed={form.priceAccess.includes(priceCode)}
                      >
                        {priceCode}
                      </button>
                    ))}
                  </div>
                  <p>
                    {form.priceAccess.length === 0
                      ? 'No price access enabled.'
                      : `${form.priceAccess.length} price ${
                          form.priceAccess.length === 1 ? 'class' : 'classes'
                        } enabled.`}
                  </p>
                </div>
              </>
            ) : null}

            {form.role === 'admins' ? (
              <div className={styles.noticeCard}>
                <span className={styles.label}>Authentication Setup</span>
                <p>
                  This account will be created as an Admin. The user will verify
                  their email and create a password during first-time login.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {validationError && <p className={styles.validationError}>{validationError}</p>}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.createButton}
            onClick={() => void handleCreate()}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating account...' : 'Create Account'}
          </button>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
