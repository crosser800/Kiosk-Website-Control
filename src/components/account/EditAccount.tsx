import { useEffect, useMemo, useState } from 'react';
import type { AccountSummaryItem } from './AccountsSummary';
import {
  groupPermissionsByModule,
  INTERNAL_TEMPORARY_PASSWORD_MIN_LENGTH,
  loadInternalAdminFormOptions,
  resetInternalAdminPassword,
  updateAccountItem,
  type InternalAdminFormOptions,
} from '../../services/accounts';
import AgentProfilePanel from './AgentProfilePanel';
import styles from './AccountModal.module.css';

type EditAccountProps = {
  account: AccountSummaryItem;
  onSave: (accounts: Promise<AccountSummaryItem[]> | AccountSummaryItem[], message?: string) => void;
  onClose: () => void;
};

type AdminForm = {
  profileImage: string;
  name: string;
  username: string;
  roleId: string;
  departmentId: string;
  parentAdminAccountId: string;
  permissionIds: string[];
  status: 'Active' | 'Inactive' | 'Locked';
};

function formatDateTime(value: string | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString('en-PH');
}

function getInitialForm(account: AccountSummaryItem): AdminForm {
  return {
    profileImage: account.profileImage ?? '',
    name: account.name,
    username: account.username ?? account.handle,
    roleId: account.roleId ?? '',
    departmentId: account.departmentId ?? '',
    parentAdminAccountId: account.parentAdminAccountId ?? '',
    permissionIds: account.permissionIds ?? [],
    status: account.status === 'Inactive' ? 'Inactive' : account.status === 'Locked' ? 'Locked' : 'Active',
  };
}

export default function EditAccount({ account, onSave, onClose }: EditAccountProps) {
  if (account.role === 'agents') {
    return <AgentProfilePanel account={account} onSave={onSave} onClose={onClose} />;
  }

  return <InternalAdminEditAccount account={account} onSave={onSave} onClose={onClose} />;
}

function InternalAdminEditAccount({ account, onSave, onClose }: EditAccountProps) {
  const [form, setForm] = useState<AdminForm>(() => getInitialForm(account));
  const [options, setOptions] = useState<InternalAdminFormOptions>({
    roles: [],
    departments: [],
    gateways: [],
    permissions: [],
  });
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [validationError, setValidationError] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const groupedPermissions = useMemo(() => {
    return groupPermissionsByModule(options.permissions);
  }, [options]);

  useEffect(() => {
    loadInternalAdminFormOptions()
      .then(setOptions)
      .catch((error) => {
        setValidationError(error instanceof Error ? error.message : 'Unable to load internal admin options.');
      })
      .finally(() => setIsLoadingOptions(false));
  }, []);

  function updateField<Field extends keyof AdminForm>(field: Field, value: AdminForm[Field]) {
    setValidationError('');
    setResetError('');
    setResetSuccess('');
    setForm((current) => ({ ...current, [field]: value }));
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

  function validateForm() {
    if (!form.name.trim()) {
      setValidationError('Full Name is required.');
      return false;
    }
    if (!form.username.trim()) {
      setValidationError('Username is required.');
      return false;
    }
    if (!form.parentAdminAccountId) {
      setValidationError('Select a parent gateway account.');
      return false;
    }
    return true;
  }

  async function handleSave() {
    if (isSubmitting || !validateForm()) return;

    setIsSubmitting(true);
    try {
      const nextAccounts = await updateAccountItem(account.id, {
        profileImage: form.profileImage || undefined,
        name: form.name,
        email: '',
        contact: '',
        role: 'admins',
        handle: form.username,
        access: form.permissionIds,
        branch: '',
        departmentId: form.departmentId || undefined,
        status: form.status,
        username: form.username,
        roleId: form.roleId || undefined,
        parentAdminAccountId: form.parentAdminAccountId,
        permissionIds: form.permissionIds,
      });
      onSave(nextAccounts, 'Internal admin updated successfully.');
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Unable to update this internal admin.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleResetPasswordRequest() {
    if (isResettingPassword) return;
    if (!resetPassword.trim()) {
      setResetError('Temporary password is required.');
      return;
    }
    if (resetPassword.length < INTERNAL_TEMPORARY_PASSWORD_MIN_LENGTH) {
      setResetError('Temporary password must be at least 8 characters.');
      return;
    }

    setIsResetConfirmOpen(true);
  }

  async function handleConfirmResetPassword() {
    if (isResettingPassword) return;

    setIsResettingPassword(true);
    try {
      const nextAccounts = await resetInternalAdminPassword(account.id, resetPassword);
      setResetPassword('');
      setResetSuccess('Password reset successfully.');
      setIsResetConfirmOpen(false);
      onSave(nextAccounts, 'Password reset successfully.');
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Unable to reset this password.');
    } finally {
      setIsResettingPassword(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation">
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="edit-account-title">
        <div className={styles.header}>
          <div>
            <h2 id="edit-account-title" className={styles.title}>Edit Internal Admin</h2>
            <p className={styles.subtitle}>Role is a label. Access checkboxes control permissions.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close edit account">
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        <div className={styles.divider}></div>

        <div className={styles.formContainer}>
          <div className={styles.profilePicker}>
            <div className={styles.profilePreview} aria-hidden="true">
              {form.profileImage ? <img src={form.profileImage} alt="" className={styles.profileImage} /> : <i className="fa-solid fa-user"></i>}
            </div>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Profile Image URL</span>
              <input value={form.profileImage} onChange={(event) => updateField('profileImage', event.target.value)} className={styles.input} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Full Name</span>
              <input value={form.name} onChange={(event) => updateField('name', event.target.value)} className={styles.input} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Username</span>
              <input value={form.username} onChange={(event) => updateField('username', event.target.value.toLowerCase())} className={styles.input} />
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
              <span className={styles.label}>Status</span>
              <select value={form.status} onChange={(event) => updateField('status', event.target.value as AdminForm['status'])} className={styles.select}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Locked">Locked</option>
              </select>
            </label>
            <div className={styles.noticeCard}>
              <span className={styles.label}>Password Status</span>
              <p>{account.passwordStatus ?? 'Password Changed'}</p>
              <p>Changed: {formatDateTime(account.passwordChangedAt)}</p>
              <p>Last reset: {formatDateTime(account.passwordResetAt)}</p>
              <input
                type="password"
                value={resetPassword}
                onChange={(event) => {
                  setResetPassword(event.target.value);
                  setResetError('');
                  setResetSuccess('');
                }}
                className={styles.input}
                placeholder="Temporary password"
              />
              <span className={styles.fieldHelper}>Temporary password must be at least 8 characters.</span>
              {resetError ? <p className={styles.validationError}>{resetError}</p> : null}
              {resetSuccess ? <p className={styles.successMessage}>{resetSuccess}</p> : null}
              <button type="button" className={styles.cancelButton} onClick={handleResetPasswordRequest} disabled={isResettingPassword}>
                {isResettingPassword ? 'Resetting...' : 'Reset Password'}
              </button>
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
          </div>
        </div>

        {validationError ? <p className={styles.validationError}>{validationError}</p> : null}

        <div className={styles.actions}>
          <button type="button" className={styles.createButton} onClick={() => void handleSave()} disabled={isLoadingOptions || isSubmitting}>
            {isSubmitting ? 'Saving changes...' : 'Save Changes'}
          </button>
          <button type="button" className={styles.cancelButton} onClick={onClose}>Cancel</button>
        </div>

        {isResetConfirmOpen ? (
          <div className={styles.confirmOverlay} role="presentation">
            <section
              className={styles.confirmModal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="reset-internal-password-title"
              aria-describedby="reset-internal-password-message"
            >
              <h3 id="reset-internal-password-title">Reset Internal Admin Password?</h3>
              <p id="reset-internal-password-message">
                This will set a temporary password and require this internal admin to change it on the next login.
              </p>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={() => setIsResetConfirmOpen(false)}
                  disabled={isResettingPassword}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.createButton}
                  onClick={() => void handleConfirmResetPassword()}
                  disabled={isResettingPassword}
                >
                  {isResettingPassword ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}
