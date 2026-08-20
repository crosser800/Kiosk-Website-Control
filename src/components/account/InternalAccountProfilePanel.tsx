import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { InternalAdminProfile } from '../../services/internalAdminAuth';
import {
  ADMIN_PROFILE_BUCKET,
  convertImageToWebp,
  internalAdminProfilePath,
  MAX_PROFILE_IMAGE_DIMENSION,
  PROFILE_IMAGE_QUALITY,
  resolveAdminProfileImageUrl,
  uploadAdminProfileImage,
} from '../../utils/profileImages';
import styles from './AccountProfilePanel.module.css';

type PendingImage = {
  blob: Blob;
  previewUrl: string;
};

type Draft = {
  birthdate: string;
  gender: string;
  email: string;
  contactNumber: string;
  addressLine: string;
  city: string;
  province: string;
  postalCode: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactNumber: string;
};

type Props = {
  profile: InternalAdminProfile;
  onProfileUpdated: (profile: InternalAdminProfile) => void;
  onClose: () => void;
};

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'A';
}

function toDraft(profile: InternalAdminProfile): Draft {
  return {
    birthdate: profile.birthdate,
    gender: profile.gender,
    email: profile.email,
    contactNumber: profile.contactNumber,
    addressLine: profile.addressLine,
    city: profile.city,
    province: profile.province,
    postalCode: profile.postalCode,
    emergencyContactName: profile.emergencyContactName,
    emergencyContactRelationship: profile.emergencyContactRelationship,
    emergencyContactNumber: profile.emergencyContactNumber,
  };
}

function trim(value: string) {
  return value.trim();
}

export default function InternalAccountProfilePanel({
  profile,
  onProfileUpdated,
  onClose,
}: Props) {
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [isImageRemoved, setIsImageRemoved] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageError, setImageError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile));
  const [originalDraft, setOriginalDraft] = useState<Draft>(() => toDraft(profile));

  useEffect(() => {
    const nextDraft = toDraft(profile);
    setDraft(nextDraft);
    setOriginalDraft(nextDraft);
  }, [profile]);

  useEffect(
    () => () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    },
    [pendingImage],
  );

  const currentImageUrl = useMemo(
    () =>
      resolveAdminProfileImageUrl({
        profileImagePath: profile.profileImagePath,
        profileImageUrl: profile.profileImageUrl,
        updatedAt: profile.updatedAt,
      }),
    [profile.profileImagePath, profile.profileImageUrl, profile.updatedAt],
  );

  const previewImageUrl = pendingImage?.previewUrl || (isImageRemoved ? '' : currentImageUrl);
  const isDirty = Boolean(pendingImage || isImageRemoved || JSON.stringify(draft) !== JSON.stringify(originalDraft));

  function updateDraft<Field extends keyof Draft>(field: Field, value: Draft[Field]) {
    setSaveError('');
    setSuccessMessage('');
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function validateDraft() {
    if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
      return 'Enter a valid email address.';
    }
    if (draft.birthdate) {
      const parsed = new Date(`${draft.birthdate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (Number.isNaN(parsed.getTime()) || parsed > today) {
        return 'Birthdate cannot be in the future.';
      }
    }
    if (draft.gender && !['Male', 'Female', 'Prefer not to say', 'Other'].includes(draft.gender)) {
      return 'Select a valid gender.';
    }
    return '';
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
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Unable to prepare this image.');
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
    setSaveError('');
    setSuccessMessage('');
  }

  async function handleSave() {
    if (!isDirty || isSaving) return;

    setIsSaving(true);
    setSaveError('');
    setSuccessMessage('');
    const validationError = validateDraft();
    if (validationError) {
      setSaveError(validationError);
      setIsSaving(false);
      return;
    }

    const imagePath = internalAdminProfilePath(profile.id);
    let uploadedPath = '';

    try {
      const payload: Record<string, string | null> = {
        birthdate: trim(draft.birthdate) || null,
        gender: trim(draft.gender) || null,
        email: trim(draft.email) || null,
        contact_number: trim(draft.contactNumber) || null,
        address_line: trim(draft.addressLine) || null,
        city: trim(draft.city) || null,
        province: trim(draft.province) || null,
        postal_code: trim(draft.postalCode) || null,
        emergency_contact_name: trim(draft.emergencyContactName) || null,
        emergency_contact_relationship: trim(draft.emergencyContactRelationship) || null,
        emergency_contact_number: trim(draft.emergencyContactNumber) || null,
      };

      if (pendingImage) {
        await uploadAdminProfileImage(imagePath, pendingImage.blob);
        uploadedPath = imagePath;
        payload.profile_image_path = imagePath;
      } else if (isImageRemoved) {
        if (profile.profileImagePath) {
          const { error } = await supabase.storage
            .from(ADMIN_PROFILE_BUCKET)
            .remove([profile.profileImagePath]);

          if (error) throw new Error(`Profile image removal failed: ${error.message}`);
          payload.profile_image_path = null;
        }

        if (profile.profileImageUrl) {
          payload.profile_image_url = null;
        }
      }

      const { data, error } = await supabase
        .from('internal_admin_accounts')
        .update(payload)
        .eq('id', profile.id)
        .select('profile_image_path, profile_image_url, updated_at, birthdate, gender, email, contact_number, address_line, city, province, postal_code, emergency_contact_name, emergency_contact_relationship, emergency_contact_number')
        .maybeSingle<{
          profile_image_path: string | null;
          profile_image_url: string | null;
          updated_at: string | null;
          birthdate: string | null;
          gender: string | null;
          email: string | null;
          contact_number: string | null;
          address_line: string | null;
          city: string | null;
          province: string | null;
          postal_code: string | null;
          emergency_contact_name: string | null;
          emergency_contact_relationship: string | null;
          emergency_contact_number: string | null;
        }>();

      if (error) {
        if (uploadedPath) {
          await supabase.storage.from(ADMIN_PROFILE_BUCKET).remove([uploadedPath]);
        }
        throw new Error('Profile image saved to storage, but your account could not be updated.');
      }

      onProfileUpdated({
        ...profile,
        profileImagePath: String(data?.profile_image_path ?? ''),
        profileImageUrl: String(data?.profile_image_url ?? ''),
        updatedAt: String(data?.updated_at ?? new Date().toISOString()),
        birthdate: String(data?.birthdate ?? ''),
        gender: String(data?.gender ?? ''),
        email: String(data?.email ?? ''),
        contactNumber: String(data?.contact_number ?? ''),
        addressLine: String(data?.address_line ?? ''),
        city: String(data?.city ?? ''),
        province: String(data?.province ?? ''),
        postalCode: String(data?.postal_code ?? ''),
        emergencyContactName: String(data?.emergency_contact_name ?? ''),
        emergencyContactRelationship: String(data?.emergency_contact_relationship ?? ''),
        emergencyContactNumber: String(data?.emergency_contact_number ?? ''),
      });
      setOriginalDraft(draft);
      setPendingImage((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl);
        return null;
      });
      setIsImageRemoved(false);
      setSuccessMessage('Account profile updated.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save your account profile.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={onClose}>
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
                getInitial(profile.fullName || profile.username)
              )}
            </span>
            <div className={styles.identityText}>
              <p className={styles.eyebrow}>Account Profile</p>
              <h2>{profile.fullName || 'Internal Admin'}</h2>
              <div className={styles.metaLine}>
                <span>{profile.username}</span>
                <span className={styles.roleBadge}>Internal Admin</span>
                <span className={styles.statusBadge}>{profile.status || 'Active'}</span>
              </div>
            </div>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close account profile">
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </header>

        <main className={styles.body}>
          <section className={styles.photoSection}>
            <div className={styles.profilePreview}>
              {previewImageUrl ? (
                <img src={previewImageUrl} alt="" className={styles.avatarImage} />
              ) : (
                getInitial(profile.fullName || profile.username)
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
                {isPreparingImage ? 'Preparing...' : previewImageUrl ? 'Replace Photo' : 'Choose Photo'}
              </label>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleRemoveImage}
                disabled={!previewImageUrl}
              >
                Remove Photo
              </button>
              <p>JPG, PNG, or WEBP. Maximum 5 MB.</p>
              {imageError ? <p className={styles.validationError}>{imageError}</p> : null}
            </div>
          </section>

          <section className={styles.formSection}>
            <h3>Personal Information</h3>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Birthdate</span>
                <input type="date" value={draft.birthdate} onChange={(event) => updateDraft('birthdate', event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Gender</span>
                <select value={draft.gender} onChange={(event) => updateDraft('gender', event.target.value)}>
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Email</span>
                <input type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Contact Number</span>
                <input value={draft.contactNumber} onChange={(event) => updateDraft('contactNumber', event.target.value)} />
              </label>
            </div>
          </section>

          <section className={styles.formSection}>
            <h3>Address</h3>
            <div className={styles.formGrid}>
              <label className={`${styles.field} ${styles.wideField}`}>
                <span>Address Line</span>
                <input value={draft.addressLine} onChange={(event) => updateDraft('addressLine', event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>City</span>
                <input value={draft.city} onChange={(event) => updateDraft('city', event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Province</span>
                <input value={draft.province} onChange={(event) => updateDraft('province', event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Postal Code</span>
                <input value={draft.postalCode} onChange={(event) => updateDraft('postalCode', event.target.value)} />
              </label>
            </div>
          </section>

          <section className={styles.formSection}>
            <h3>Emergency Contact</h3>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Name</span>
                <input value={draft.emergencyContactName} onChange={(event) => updateDraft('emergencyContactName', event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Relationship</span>
                <input value={draft.emergencyContactRelationship} onChange={(event) => updateDraft('emergencyContactRelationship', event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Contact Number</span>
                <input value={draft.emergencyContactNumber} onChange={(event) => updateDraft('emergencyContactNumber', event.target.value)} />
              </label>
            </div>
          </section>

          <section className={styles.formSection}>
            <h3>Account Details</h3>
            <div className={styles.formGrid}>
              <div className={styles.summaryField}>
                <span>Full Name</span>
                <strong>{profile.fullName || '-'}</strong>
              </div>
              <div className={styles.summaryField}>
                <span>Username</span>
                <strong>{profile.username || '-'}</strong>
              </div>
              <div className={styles.summaryField}>
                <span>Status</span>
                <strong>{profile.status || 'Active'}</strong>
              </div>
              <div className={styles.summaryField}>
                <span>Access</span>
                <strong>Internal Admin</strong>
              </div>
            </div>
          </section>
        </main>

        <footer className={styles.footer}>
          <div>
            {saveError ? <p className={styles.validationError}>{saveError}</p> : null}
            {successMessage ? <p className={styles.successMessage}>{successMessage}</p> : null}
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!isDirty || isSaving || isPreparingImage}
            onClick={() => void handleSave()}
          >
            {isSaving ? 'Saving Changes...' : 'Save Changes'}
          </button>
        </footer>
      </section>
    </div>
  );
}
