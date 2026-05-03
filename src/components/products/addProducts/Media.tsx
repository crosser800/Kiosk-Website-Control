import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import styles from './Media.module.css';

type MediaProps = {
  onBack: () => void;
  onNext: () => void;
};

type MediaItem = {
  id: string;
  file: File;
  previewUrl: string;
  type: 'image' | 'video';
};

const MAX_MEDIA_FILES = 30;
const acceptedTypes = 'image/jpeg,image/jpg,image/png,video/mp4';
const supportedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'video/mp4'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 25 * 1024 * 1024;

function createMediaItems(files: File[]) {
  const nextItems: MediaItem[] = [];
  const rejectedFiles: string[] = [];

  files.forEach((file) => {
    if (!supportedMimeTypes.includes(file.type)) {
      rejectedFiles.push(`${file.name} is not a supported file type.`);
      return;
    }

    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;

    if (file.size > maxSize) {
      rejectedFiles.push(
        `${file.name} exceeds the ${isVideo ? '25 MB video' : '5 MB image'} limit.`,
      );
      return;
    }

    nextItems.push({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 9)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' : 'image',
    });
  });

  return { nextItems, rejectedFiles };
}

function moveItem(items: MediaItem[], fromIndex: number, toIndex: number) {
  const updatedItems = [...items];
  const [movedItem] = updatedItems.splice(fromIndex, 1);

  updatedItems.splice(toIndex, 0, movedItem);
  return updatedItems;
}

export default function Media({ onBack, onNext }: MediaProps) {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [isDragOverUpload, setIsDragOverUpload] = useState(false);
  const [mainMediaId, setMainMediaId] = useState<string | null>(null);
  const [draggedMediaId, setDraggedMediaId] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string>('');
  const previewUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    };
  }, []);

  function addFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    const remainingSlots = MAX_MEDIA_FILES - mediaItems.length;

    if (remainingSlots <= 0) {
      setUploadMessage(`You can upload up to ${MAX_MEDIA_FILES} media files only.`);
      return;
    }

    const { nextItems: validItems, rejectedFiles } = createMediaItems(files);
    const nextItems = validItems.slice(0, remainingSlots);

    if (validItems.length > remainingSlots) {
      rejectedFiles.push(
        `Only ${remainingSlots} more file${remainingSlots === 1 ? '' : 's'} can be uploaded.`,
      );
    }

    if (rejectedFiles.length > 0) {
      setUploadMessage(rejectedFiles[0]);
    } else {
      setUploadMessage('');
    }

    if (nextItems.length === 0) {
      return;
    }

    nextItems.forEach((item) => {
      previewUrlsRef.current.add(item.previewUrl);
    });

    setMediaItems((currentItems) => {
      const updatedItems = [...currentItems, ...nextItems];

      if (!mainMediaId && updatedItems.length > 0) {
        setMainMediaId(updatedItems[0].id);
      }

      return updatedItems;
    });
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    addFiles(selectedFiles);
    event.target.value = '';
  }

  function handleUploadDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragOverUpload(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function handleDelete(itemId: string) {
    setMediaItems((currentItems) => {
      const itemToRemove = currentItems.find((item) => item.id === itemId);

      if (itemToRemove) {
        URL.revokeObjectURL(itemToRemove.previewUrl);
        previewUrlsRef.current.delete(itemToRemove.previewUrl);
      }

      const updatedItems = currentItems.filter((item) => item.id !== itemId);

      if (mainMediaId === itemId) {
        setMainMediaId(updatedItems[0]?.id ?? null);
      }

      return updatedItems;
    });
  }

  function handleMediaDrop(targetId: string) {
    if (!draggedMediaId || draggedMediaId === targetId) {
      setDraggedMediaId(null);
      return;
    }

    setMediaItems((currentItems) => {
      const fromIndex = currentItems.findIndex((item) => item.id === draggedMediaId);
      const toIndex = currentItems.findIndex((item) => item.id === targetId);

      if (fromIndex === -1 || toIndex === -1) {
        return currentItems;
      }

      return moveItem(currentItems, fromIndex, toIndex);
    });

    setDraggedMediaId(null);
  }

  return (
    <section className={styles.wrapper}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.title}>Add Images/Videos</h3>
        </div>

        <label
          className={`${styles.uploadArea} ${
            isDragOverUpload ? styles.uploadAreaActive : ''
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragOverUpload(true);
          }}
          onDragLeave={() => setIsDragOverUpload(false)}
          onDrop={handleUploadDrop}
        >
          <input
            type="file"
            accept={acceptedTypes}
            multiple
            className={styles.fileInput}
            onChange={handleFileSelection}
          />

          <div className={styles.uploadContent}>
            <p className={styles.uploadHeadline}>
              Drag and drop your image or video here, or{' '}
              <span className={styles.browseText}>Browse</span>
            </p>
            <p className={styles.uploadHint}>
              You can upload up to {MAX_MEDIA_FILES} media files
            </p>
            <p className={styles.uploadFormats}>
              Accepted: JPEG, JPG, PNG up to 5 MB, MP4 up to 25 MB
            </p>
            {uploadMessage ? (
              <p className={styles.uploadMessage}>{uploadMessage}</p>
            ) : null}
          </div>
        </label>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.title}>Images/Videos Uploaded</h3>
          <span className={styles.counter}>
            {mediaItems.length}/{MAX_MEDIA_FILES}
          </span>
        </div>

        {mediaItems.length === 0 ? (
          <div className={styles.emptyState}>
            Your uploaded media will appear here.
          </div>
        ) : (
          <div className={styles.mediaGrid}>
            {mediaItems.map((item) => {
              const isMainMedia = mainMediaId === item.id;

              return (
                <article
                  key={item.id}
                  className={`${styles.mediaCard} ${
                    draggedMediaId === item.id ? styles.mediaCardDragging : ''
                  }`}
                  draggable
                  onDragStart={() => setDraggedMediaId(item.id)}
                  onDragEnd={() => setDraggedMediaId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleMediaDrop(item.id)}
                >
                  <div className={styles.mediaPreview}>
                    {item.type === 'image' ? (
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className={styles.previewAsset}
                      />
                    ) : (
                      <video
                        src={item.previewUrl}
                        className={styles.previewAsset}
                        muted
                        playsInline
                        preload="metadata"
                      />
                    )}
                  </div>

                  <div className={styles.cardFooter}>
                    <span className={styles.fileName} title={item.file.name}>
                      {item.file.name}
                    </span>
                    {isMainMedia ? (
                      <span className={styles.mainBadge}>Main</span>
                    ) : null}
                  </div>

                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${
                        isMainMedia ? styles.iconButtonPrimary : ''
                      }`}
                      onClick={() => setMainMediaId(item.id)}
                      aria-label={
                        isMainMedia
                          ? 'Selected as main media'
                          : 'Set as main media'
                      }
                      title={
                        isMainMedia ? 'Main media selected' : 'Set as main media'
                      }
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
                        <path
                          d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.56L12 17.52 6.12 20.62l1.12-6.56L2.48 9.42l6.58-.96L12 2.5z"
                          fill={isMainMedia ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>

                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.deleteButton}`}
                      onClick={() => handleDelete(item.id)}
                      aria-label={`Delete ${item.file.name}`}
                      title="Delete media"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
                        <path
                          d="M9 3.75h6l.75 1.5H20v1.5H4v-1.5h4.25L9 3.75zm-1.5 6h1.5v7.5H7.5v-7.5zm4.5 0h1.5v7.5H12v-7.5zm4.5 0H18v7.5h-1.5v-7.5zM6 8.25h12v10.5A2.25 2.25 0 0 1 15.75 21h-7.5A2.25 2.25 0 0 1 6 18.75V8.25z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          Back
        </button>
        <button type="button" className={styles.nextButton} onClick={onNext}>
          Next
        </button>
      </div>
    </section>
  );
}
