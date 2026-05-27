import { useEffect, useState } from 'react';
import type { AccountSummaryItem, AccountView } from './AccountsSummary';
import {
  getAccountHandlingOptions,
  subscribeAccountHandlingOptions,
} from '../../services/accountHandling';
import { addAccountItem } from '../../services/accounts';
import { getBranchTypeOptions, subscribeBranchTypeOptions } from '../../services/branchTypes';
import styles from './AccountModal.module.css';

type CreateAccountProps = {
  accountType: AccountView;
  onCreate: (accounts: AccountSummaryItem[]) => void;
  onClose: () => void;
};

type AccountForm = {
  profileImage: string;
  name: string;
  role: AccountView;
  access: string[];
  handling: string;
  branch: string;
  isActive: boolean;
  email: string;
  contact: string;
  password: string;
  confirmPassword: string;
};

const accessOptions = ['Products', 'Order', 'Sales', 'Accounts', 'Settings'];

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
    name: '',
    role: accountType,
    access: [],
    handling: '',
    branch: '',
    isActive: false,
    email: '',
    contact: '',
    password: '',
    confirmPassword: '',
  };
}

export default function CreateAccount({ accountType, onCreate, onClose }: CreateAccountProps) {
  const [form, setForm] = useState<AccountForm>(() => getInitialForm(accountType));
  const [handlingOptions, setHandlingOptions] = useState<string[]>(() => getAccountHandlingOptions());
  const [branchOptions, setBranchOptions] = useState<string[]>(() => getBranchTypeOptions());
  const [isAccessOpen, setIsAccessOpen] = useState(false);
  const [validationError, setValidationError] = useState('');
  const accountLabel = form.role === 'admins' ? 'Admin' : 'Agent';

  useEffect(() => subscribeAccountHandlingOptions(setHandlingOptions), []);
  useEffect(() => subscribeBranchTypeOptions(setBranchOptions), []);

  function updateField<Field extends keyof AccountForm>(
    field: Field,
    value: AccountForm[Field],
  ) {
    setValidationError('');
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleAccess(access: string) {
    setValidationError('');
    setForm((current) => {
      const hasAccess = current.access.includes(access);

      return {
        ...current,
        access: hasAccess
          ? current.access.filter((item) => item !== access)
          : [...current.access, access],
      };
    });
  }

  function handleProfileImageChange(file: File | undefined) {
    setValidationError('');

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      setForm((current) => ({
        ...current,
        profileImage: typeof reader.result === 'string' ? reader.result : '',
      }));
    };

    reader.readAsDataURL(file);
  }

  function validateForm() {
    const requiredValues = [
      form.name,
      form.role,
      form.contact,
      form.branch,
      form.password,
      form.confirmPassword,
    ];
    const hasRoleSpecificValue =
      form.role === 'admins' ? form.access.length > 0 : Boolean(form.handling);

    if (requiredValues.some((value) => !value.trim()) || !hasRoleSpecificValue) {
      setValidationError('Complete all required fields except email address.');
      return false;
    }

    if (form.password !== form.confirmPassword) {
      setValidationError('Passwords do not match.');
      return false;
    }

    setValidationError('');
    return true;
  }

  function handleCreate() {
    if (!validateForm()) {
      return;
    }

    onCreate(
      addAccountItem({
        profileImage: form.profileImage || undefined,
        name: form.name,
        email: form.email,
        contact: form.contact,
        role: form.role,
        handle: form.role === 'agents' ? form.handling : '',
        access: form.role === 'admins' ? form.access.join(', ') : '',
        branch: form.branch,
        status: form.isActive ? 'Active' : 'Inactive',
      }),
    );
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
          <div className={styles.profilePicker}>
            <div className={styles.profilePreview} aria-hidden="true">
              {form.profileImage ? (
                <img src={form.profileImage} alt="" className={styles.profileImage} />
              ) : (
                <i className="fa-solid fa-user"></i>
              )}
            </div>

            <label className={styles.profileButton}>
              <input
                type="file"
                accept="image/*"
                className={styles.profileInput}
                onChange={(event) => handleProfileImageChange(event.target.files?.[0])}
              />
              <i className="fa-solid fa-camera" aria-hidden="true"></i>
              <span>Add Profile</span>
            </label>
          </div>

          <div className={styles.topGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                className={styles.input}
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Role</span>
              <select
                value={form.role}
                onChange={(event) => {
                  updateField('role', event.target.value as AccountView);
                  setIsAccessOpen(false);
                }}
                className={styles.select}
                required
              >
                <option value="admins">Admin</option>
                <option value="agents">Agent</option>
              </select>
            </label>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => updateField('isActive', event.target.checked)}
                className={styles.checkbox}
              />
              <span>Set Active</span>
            </label>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Email Address</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                className={styles.input}
              />
            </label>

            {form.role === 'admins' ? (
              <div className={styles.field}>
                <span className={styles.label}>Access</span>
                <div className={styles.accessDropdown}>
                  <button
                    type="button"
                    className={styles.accessButton}
                    onClick={() => setIsAccessOpen((current) => !current)}
                    aria-expanded={isAccessOpen}
                    aria-required="true"
                  >
                    <span>{form.access.length > 0 ? form.access.join(', ') : 'Select access'}</span>
                    <i className="fa-solid fa-chevron-down" aria-hidden="true"></i>
                  </button>

                  {isAccessOpen && (
                    <div className={styles.accessMenu}>
                      {accessOptions.map((access) => (
                        <label key={access} className={styles.accessOption}>
                          <input
                            type="checkbox"
                            checked={form.access.includes(access)}
                            onChange={() => toggleAccess(access)}
                            className={styles.checkbox}
                          />
                          <span>{access}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <label className={styles.field}>
                <span className={styles.label}>Handling</span>
                <select
                  value={form.handling}
                  onChange={(event) => updateField('handling', event.target.value)}
                  className={styles.select}
                  required
                >
                  <option value=""></option>
                  {handlingOptions.map((handling) => (
                    <option key={handling} value={handling}>
                      {handling}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className={styles.field}>
              <span className={styles.label}>Contact</span>
              <input
                type="tel"
                inputMode="numeric"
                value={form.contact}
                onChange={(event) => updateField('contact', formatContactInput(event.target.value))}
                placeholder="0000-000-0000"
                className={styles.input}
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Choose Branch</span>
              <select
                value={form.branch}
                onChange={(event) => updateField('branch', event.target.value)}
                className={styles.select}
                required
              >
                <option value=""></option>
                {branchOptions.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Password</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                className={styles.input}
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Confirm Password</span>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => updateField('confirmPassword', event.target.value)}
                className={styles.input}
                required
              />
            </label>
          </div>
        </div>

        {validationError && <p className={styles.validationError}>{validationError}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.createButton} onClick={handleCreate}>
            Create Account
          </button>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
