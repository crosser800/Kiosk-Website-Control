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
  birthdate: string;
  gender: string;
  email: string;
  contact: string;
  addressLine: string;
  city: string;
  province: string;
  postalCode: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactNumber: string;
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
    profileImage: account.profileImageUrl ?? '',
    name: account.name,
    username: account.username ?? account.handle,
    birthdate: account.birthdate ?? '',
    gender: account.gender ?? '',
    email: account.email ?? '',
    contact: account.contact ?? '',
    addressLine: account.addressLine ?? '',
    city: account.city ?? '',
    province: account.province ?? '',
    postalCode: account.postalCode ?? '',
    emergencyContactName: account.emergencyContactName ?? '',
    emergencyContactRelationship: account.emergencyContactRelationship ?? '',
    emergencyContactNumber: account.emergencyContactNumber ?? '',
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
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreviewUrl, setProfileImagePreviewUrl] = useState('');
  const [isProfileImageRemoved, setIsProfileImageRemoved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const groupedPermissions = useMemo(() => {
    return groupPermissionsByModule(options.permissions);
  }, [options]);
  const currentProfileImage = account.profileImage ?? form.profileImage;
  const displayedProfileImage = profileImagePreviewUrl || (!isProfileImageRemoved ? currentProfileImage : '');
  const canRemoveProfileImage = Boolean(
    profileImagePreviewUrl ||
    (!isProfileImageRemoved && (currentProfileImage || account.profileImagePath)),
  );

  useEffect(() => {
    loadInternalAdminFormOptions()
      .then(setOptions)
      .catch((error) => {
        setValidationError(error instanceof Error ? error.message : 'Unable to load internal admin options.');
      })
      .finally(() => setIsLoadingOptions(false));
  }, []);

  useEffect(
    () => () => {
      if (profileImagePreviewUrl) {
        URL.revokeObjectURL(profileImagePreviewUrl);
      }
    },
    [profileImagePreviewUrl],
  );

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
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setValidationError('Enter a valid email address.');
      return false;
    }
    if (form.birthdate) {
      const parsed = new Date(`${form.birthdate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (Number.isNaN(parsed.getTime()) || parsed > today) {
        setValidationError('Birthdate cannot be in the future.');
        return false;
      }
    }
    return true;
  }

  async function handleSave() {
    if (isSubmitting || !validateForm()) return;

    setIsSubmitting(true);
    try {
      const nextAccounts = await updateAccountItem(account.id, {
        profileImageUrl: form.profileImage || undefined,
        name: form.name,
        email: form.email,
        contact: form.contact,
        birthdate: form.birthdate,
        gender: form.gender,
        addressLine: form.addressLine,
        city: form.city,
        province: form.province,
        postalCode: form.postalCode,
        emergencyContactName: form.emergencyContactName,
        emergencyContactRelationship: form.emergencyContactRelationship,
        emergencyContactNumber: form.emergencyContactNumber,
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
        profileImageFile: profileImageFile ?? undefined,
        removeProfileImage: isProfileImageRemoved,
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

  function handleProfileImageChange(file: File | undefined) {
    setValidationError('');
    setProfileImagePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : '';
    });
    setProfileImageFile(file ?? null);
    setIsProfileImageRemoved(false);
  }

  function handleRemoveProfileImage() {
    setValidationError('');
    setProfileImagePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
    setProfileImageFile(null);
    setIsProfileImageRemoved(true);
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
    <div className={`${styles.overlay} ${styles.editInternalAdminOverlay}`} role="presentation">
      <section className={`${styles.modal} ${styles.editInternalAdminModal}`} role="dialog" aria-modal="true" aria-labelledby="edit-account-title">
        <div className={`${styles.header} ${styles.editInternalAdminHeader}`}>
          <div>
            <h2 id="edit-account-title" className={styles.title}>Edit Internal Admin</h2>
            <p className={styles.subtitle}>Role is a label. Access checkboxes control permissions.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close edit account">
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        <div className={styles.editInternalAdminBody}>
          <div className={styles.formContainer}>
            <div className={styles.profilePicker}>
              <div className={styles.profilePreview} aria-hidden="true">
                {displayedProfileImage ? (
                  <img src={displayedProfileImage} alt="" className={styles.profileImage} />
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
                {displayedProfileImage ? 'Replace Image' : 'Choose Image'}
              </label>
              <button
                type="button"
                className={styles.profileButton}
                onClick={handleRemoveProfileImage}
                disabled={!canRemoveProfileImage}
              >
                Remove Image
              </button>
            </div>

            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.label}>Full Name</span>
                <input value={form.name} onChange={(event) => updateField('name', event.target.value)} className={styles.input} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Username</span>
                <input value={form.username} onChange={(event) => updateField('username', event.target.value.toLowerCase())} className={styles.input} />
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
                <div className={styles.passwordStatusRow}>
                  <div className={styles.passwordStatusItem}>
                    <span className={styles.label}>Password Status</span>
                    <strong>{account.passwordStatus ?? 'Password Changed'}</strong>
                  </div>
                  <div className={styles.passwordStatusItem}>
                    <span>Changed</span>
                    <strong>{formatDateTime(account.passwordChangedAt)}</strong>
                  </div>
                  <div className={styles.passwordStatusItem}>
                    <span>Last reset</span>
                    <strong>{formatDateTime(account.passwordResetAt)}</strong>
                  </div>
                  <label className={styles.passwordResetField}>
                    <span className={styles.label}>Temporary Password</span>
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
                  </label>
                  <button type="button" className={styles.cancelButton} onClick={handleResetPasswordRequest} disabled={isResettingPassword}>
                    {isResettingPassword ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
                <span className={styles.fieldHelper}>Temporary password must be at least 8 characters.</span>
                {resetError ? <p className={styles.validationError}>{resetError}</p> : null}
                {resetSuccess ? <p className={styles.successMessage}>{resetSuccess}</p> : null}
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
        </div>

        <div className={styles.editInternalAdminFooter}>
          {validationError ? <p className={styles.validationError}>{validationError}</p> : null}

          <div className={styles.actions}>
            <button type="button" className={styles.createButton} onClick={() => void handleSave()} disabled={isLoadingOptions || isSubmitting}>
              {isSubmitting ? 'Saving changes...' : 'Save Changes'}
            </button>
            <button type="button" className={styles.cancelButton} onClick={onClose}>Cancel</button>
          </div>
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
