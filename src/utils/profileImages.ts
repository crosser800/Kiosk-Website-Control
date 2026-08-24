import { supabase } from '../lib/supabase';

export const PROFILE_IMAGE_BUCKET = 'agent-profiles';
export const ADMIN_PROFILE_BUCKET = 'admin-profiles';
export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PROFILE_IMAGE_DIMENSION = 720;
export const PROFILE_IMAGE_QUALITY = 0.82;

const ACCEPTED_PROFILE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

type ConvertImageOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
};

export function getAgentProfilePath(agentId: string) {
  return `agents/${agentId}/profile.webp`;
}

export function getAdminProfilePath(adminId: string) {
  return `admins/${adminId}/profile.webp`;
}

export function gatewayAdminProfilePath(adminId: string) {
  return `gateway/${adminId}/profile.webp`;
}

export function internalAdminProfilePath(adminId: string) {
  return `internal/${adminId}/profile.webp`;
}

export function getAdminProfilePublicUrl(path: string) {
  const normalizedPath = path.trim();
  if (!normalizedPath) return '';
  const { data } = supabase.storage
    .from(ADMIN_PROFILE_BUCKET)
    .getPublicUrl(normalizedPath);
  return data.publicUrl;
}

export function getVersionedImageUrl(url: string, version: string) {
  if (!url) return '';
  const normalizedVersion = version || String(Date.now());

  try {
    const parsedUrl = new URL(
      url,
      typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
    );
    parsedUrl.searchParams.set('v', normalizedVersion);
    return parsedUrl.toString();
  } catch {
    const [baseUrl, query = ''] = url.split('?');
    const params = query
      .split('&')
      .filter((item) => item && !item.startsWith('v='));
    params.push(`v=${encodeURIComponent(normalizedVersion)}`);
    return `${baseUrl}?${params.join('&')}`;
  }
}

export function resolveAdminProfileImageUrl({
  profileImagePath,
  profileImageUrl,
  updatedAt,
}: {
  profileImagePath?: string | null;
  profileImageUrl?: string | null;
  updatedAt?: string | null;
}) {
  const path = String(profileImagePath ?? '').trim();
  const legacyUrl = String(profileImageUrl ?? '').trim();
  if (path) {
    const storageUrl = getAdminProfilePublicUrl(path);
    return storageUrl && updatedAt ? getVersionedImageUrl(storageUrl, updatedAt) : storageUrl;
  }

  return legacyUrl;
}

export async function uploadAdminProfileImage(path: string, imageBlob: Blob) {
  const webpFile = new File([imageBlob], 'profile.webp', { type: 'image/webp' });
  const options = {
    cacheControl: '3600',
    contentType: 'image/webp',
    upsert: true,
  };

  const { error } = await supabase.storage
    .from(ADMIN_PROFILE_BUCKET)
    .upload(path, webpFile, options);

  if (!error) return;

  await supabase.storage.from(ADMIN_PROFILE_BUCKET).remove([path]);

  const retry = await supabase.storage
    .from(ADMIN_PROFILE_BUCKET)
    .upload(path, webpFile, options);

  if (retry.error) {
    throw new Error(`Profile image upload failed: ${retry.error.message || error.message}`);
  }
}

export async function convertImageToWebp(
  file: File,
  options: ConvertImageOptions = {},
) {
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

    const scale = Math.min(
      (options.maxWidth ?? MAX_PROFILE_IMAGE_DIMENSION) / sourceWidth,
      (options.maxHeight ?? MAX_PROFILE_IMAGE_DIMENSION) / sourceHeight,
      1,
    );
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

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('WEBP conversion failed.'));
            return;
          }
          resolve(blob);
        },
        'image/webp',
        options.quality ?? PROFILE_IMAGE_QUALITY,
      );
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
