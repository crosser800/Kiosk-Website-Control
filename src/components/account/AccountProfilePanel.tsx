import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { CurrentAdminProfile } from '../../services/currentAdminProfile';
import {
  convertImageToWebp,
  getAdminProfilePath,
  getVersionedImageUrl,
  MAX_PROFILE_IMAGE_DIMENSION,
  PROFILE_IMAGE_BUCKET,
  PROFILE_IMAGE_QUALITY,
} from '../../utils/profileImages';
import styles from './AccountProfilePanel.module.css';

type AccountProfilePanelProps = {
  profile: CurrentAdminProfile | null;
  isLoading: boolean;
  error: string;
  onReload: () => Promise<CurrentAdminProfile | null>;
  onProfileUpdated: (profile: CurrentAdminProfile) => void;
  onClose: () => void;
};

type Draft = {
  fullName: string;
  email: string;
  contactNumber: string;
  address: string;
  position: string;
  department: string;
  bio: string;
  notes: string;
};

type PendingImage = {
  blob: Blob;
  previewUrl: string;
};

function toDraft(profile: CurrentAdminProfile): Draft {
  return {
    fullName: profile.fullName,
    email: profile.email,
    contactNumber: profile.contactNumber,
    address: profile.address,
    position: profile.position,
    department: profile.department,
    bio: profile.bio,
    notes: profile.notes,
  };
}

function trimDraft(draft: Draft): Draft {
  return {
    fullName: draft.fullName.trim(),
    email: draft.email.trim(),
    contactNumber: draft.contactNumber.trim(),
    address: draft.address.trim(),
    position: draft.position.trim(),
    department: draft.department.trim(),
    bio: draft.bio.trim(),
    notes: draft.notes.trim(),
  };
}

function stableDraft(draft: Draft) {
  return JSON.stringify(trimDraft(draft));
}

function isValidEmail(value: string) {
  return !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatDate(value: string) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Not recorded'
    : parsed.toLocaleString('en-PH');
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'A';
}

export default function AccountProfilePanel({
  profile,
  isLoading,
  error,
  onReload,
  onProfileUpdated,
  onClose,
}: AccountProfilePanelProps) {
  const [draft, setDraft] = useState<Draft | null>(() =>
    profile ? toDraft(profile) : null,
  );
  const [originalDraft, setOriginalDraft] = useState<Draft | null>(() =>
    profile ? toDraft(profile) : null,
  );
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [isImageRemoved, setIsImageRemoved] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageError, setImageError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const nextDraft = toDraft(profile);
    setDraft(nextDraft);
    setOriginalDraft(nextDraft);
    setPendingImage((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    setIsImageRemoved(false);
    setImageError('');
    setValidationError('');
    setSaveError('');
  }, [profile]);

  useEffect(
    () => () => {
      if (pendingImage) {
        URL.revokeObjectURL(pendingImage.previewUrl);
      }
    },
    [pendingImage],
  );

  const previewImageUrl = useMemo(() => {
    if (pendingImage) return pendingImage.previewUrl;
    if (isImageRemoved) return '';
    return profile?.profileImageUrl
      ? getVersionedImageUrl(profile.profileImageUrl, profile.updatedAt)
      : '';
  }, [isImageRemoved, pendingImage, profile]);

  const isDirty = useMemo(() => {
    if (!draft || !originalDraft) return Boolean(pendingImage || isImageRemoved);
    return (
      stableDraft(draft) !== stableDraft(originalDraft) ||
      Boolean(pendingImage) ||
      isImageRemoved
    );
  }, [draft, isImageRemoved, originalDraft, pendingImage]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      requestClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  function updateDraft<Field extends keyof Draft>(field: Field, value: Draft[Field]) {
    setValidationError('');
    setSaveError('');
    setSuccessMessage('');
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  function requestClose() {
    if (isSaving) return;
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }

  async function handleImageChange(file: File | undefined) {
    setImageError('');
    setSaveError('');
    setSuccessMessage('');

    if (!file) return;

    setIsPreparingImage(true);
    try {
      const blob = await convertImageToWebp(file, {
        maxWidth: MAX_PROFILE_IMAGE_DIMENSION,
        maxHeight: MAX_PROFILE_IMAGE_DIMENSION,
        quality: PROFILE_IMAGE_QUALITY,
      });
      const previewUrl = URL.createObjectURL(blob);
      setPendingImage((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl);
        return { blob, previewUrl };
      });
      setIsImageRemoved(false);
    } catch (nextError) {
      setImageError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to prepare this image.',
      );
    } finally {
      setIsPreparingImage(false);
    }
  }

  function handleRemoveImage() {
    setPendingImage((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    setIsImageRemoved(true);
    setImageError('');
    setSuccessMessage('');
  }

  async function handleSave() {
    if (!profile || !draft || isSaving) return;

    const trimmed = trimDraft(draft);

    if (!trimmed.fullName) {
      setValidationError('Full Name is required.');
      return;
    }

    if (!isValidEmail(trimmed.email)) {
      setValidationError('Enter a valid email address.');
      return;
    }

    setIsSaving(true);
    setSaveError('');
    setValidationError('');
    setSuccessMessage('');

    try {
      let nextProfileImageUrl = profile.profileImageUrl;
      const imagePath = getAdminProfilePath(profile.id);

      if (pendingImage) {
        const { error: uploadError } = await supabase.storage
          .from(PROFILE_IMAGE_BUCKET)
          .upload(imagePath, pendingImage.blob, {
            cacheControl: '3600',
            contentType: 'image/webp',
            upsert: true,
          });

        if (uploadError) {
          throw new Error('Profile image upload failed.');
        }

        const { data } = supabase.storage
          .from(PROFILE_IMAGE_BUCKET)
          .getPublicUrl(imagePath);
        nextProfileImageUrl = data.publicUrl;
      } else if (isImageRemoved && profile.profileImageUrl) {
        const { error: removeError } = await supabase.storage
          .from(PROFILE_IMAGE_BUCKET)
          .remove([imagePath]);

        if (removeError) {
          throw new Error('Profile image removal failed.');
        }

        nextProfileImageUrl = '';
      }

      const { error: updateError } = await supabase
        .from('admin_accounts')
        .update({
          full_name: trimmed.fullName,
          email: trimmed.email || null,
          contact_number: trimmed.contactNumber || null,
          address: trimmed.address || null,
          position: trimmed.position || null,
          department: trimmed.department || null,
          bio: trimmed.bio || null,
          notes: trimmed.notes || null,
          profile_image_url: nextProfileImageUrl || null,
        })
        .eq('id', profile.id);

      if (updateError) {
        throw new Error('Unable to save your admin profile.');
      }

      const refreshed = await onReload();
      if (!refreshed) {
        throw new Error('Saved, but the updated profile could not be reloaded.');
      }

      onProfileUpdated(refreshed);
      setSuccessMessage('Account profile updated.');
      setPendingImage((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl);
        return null;
      });
      setIsImageRemoved(false);
    } catch (nextError) {
      setSaveError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to save your account profile.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={requestClose}>
      <section
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Account profile"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.avatar}>
              {previewImageUrl ? (
                <img src={previewImageUrl} alt="" className={styles.avatarImage} />
              ) : (
                getInitial(draft?.fullName || profile?.fullName || 'Admin')
              )}
            </span>
            <div className={styles.identityText}>
              <p className={styles.eyebrow}>Account Profile</p>
              <h2>{draft?.fullName || profile?.fullName || 'Admin User'}</h2>
              <div className={styles.metaLine}>
                {profile?.adminCode ? <span>{profile.adminCode}</span> : null}
                {draft?.position ? <span>{draft.position}</span> : null}
                <span className={styles.roleBadge}>{profile?.roleLabel ?? 'Admin'}</span>
                <span className={styles.statusBadge}>{profile?.status ?? 'Active'}</span>
              </div>
            </div>
          </div>
          <button type="button" className={styles.closeButton} onClick={requestClose} aria-label="Close account profile">
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </header>

        <main className={styles.body}>
          {isLoading ? <p className={styles.notice}>Loading account profile...</p> : null}
          {error ? (
            <div className={styles.errorBox}>
              <p>{error}</p>
              <button type="button" className={styles.secondaryButton} onClick={() => void onReload()}>
                Retry
              </button>
            </div>
          ) : null}

          {profile && draft ? (
            <>
              <section className={styles.photoSection}>
                <div className={styles.profilePreview}>
                  {previewImageUrl ? (
                    <img src={previewImageUrl} alt="" className={styles.avatarImage} />
                  ) : (
                    getInitial(draft.fullName)
                  )}
                </div>
                <div className={styles.photoActions}>
                  <label className={styles.secondaryButton}>
                    <input
                      className={styles.fileInput}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => void handleImageChange(event.target.files?.[0])}
                    />
                    {isPreparingImage ? 'Preparing...' : 'Change Photo'}
                  </label>
                  <button type="button" className={styles.secondaryButton} onClick={handleRemoveImage} disabled={!previewImageUrl}>
                    Remove Photo
                  </button>
                  <p>JPG, PNG, or WEBP. Saved as WEBP in agent-profiles/admins/{profile.id}/profile.webp.</p>
                  {imageError ? <p className={styles.validationError}>{imageError}</p> : null}
                </div>
              </section>

              <section className={styles.formSection}>
                <h3>Personal Information</h3>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>Full Name *</span>
                    <input value={draft.fullName} onChange={(event) => updateDraft('fullName', event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span>Email Address</span>
                    <input type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span>Contact Number</span>
                    <input value={draft.contactNumber} onChange={(event) => updateDraft('contactNumber', event.target.value)} />
                  </label>
                  <label className={`${styles.field} ${styles.wideField}`}>
                    <span>Address</span>
                    <textarea value={draft.address} onChange={(event) => updateDraft('address', event.target.value)} />
                  </label>
                </div>
              </section>

              <section className={styles.formSection}>
                <h3>Work Information</h3>
                <div className={styles.formGrid}>
                  <div className={styles.summaryField}>
                    <span>Admin Code</span>
                    <strong>{profile.adminCode || 'System managed'}</strong>
                  </div>
                  <div className={styles.summaryField}>
                    <span>Role</span>
                    <strong>{profile.roleLabel}</strong>
                  </div>
                  <label className={styles.field}>
                    <span>Position</span>
                    <input value={draft.position} onChange={(event) => updateDraft('position', event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span>Department</span>
                    <input value={draft.department} onChange={(event) => updateDraft('department', event.target.value)} />
                  </label>
                  <label className={`${styles.field} ${styles.wideField}`}>
                    <span>Bio</span>
                    <textarea value={draft.bio} onChange={(event) => updateDraft('bio', event.target.value)} />
                  </label>
                  <label className={`${styles.field} ${styles.wideField}`}>
                    <span>Notes</span>
                    <textarea value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} />
                  </label>
                </div>
              </section>

              <section className={styles.securitySection}>
                <h3>Security</h3>
                <p>Password changes are not configured in this account panel.</p>
                <p>Last login: {formatDate(profile.lastLoginAt)}</p>
              </section>
            </>
          ) : null}
        </main>

        <footer className={styles.footer}>
          <div>
            {validationError ? <p className={styles.validationError}>{validationError}</p> : null}
            {saveError ? <p className={styles.validationError}>{saveError}</p> : null}
            {successMessage ? <p className={styles.successMessage}>{successMessage}</p> : null}
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!isDirty || isSaving || isLoading || Boolean(error)}
            onClick={() => void handleSave()}
          >
            {isSaving ? 'Saving Changes...' : 'Save Changes'}
          </button>
        </footer>
      </section>

      {showDiscardConfirm ? (
        <div className={styles.confirmOverlay} role="presentation">
          <div className={styles.confirmModal} role="dialog" aria-modal="true" aria-label="Unsaved changes">
            <h3>Unsaved Changes</h3>
            <p>You have unsaved account changes. Leaving now will discard them.</p>
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
