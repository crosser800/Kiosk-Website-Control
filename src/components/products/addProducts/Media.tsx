import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import styles from './Media.module.css';
import type { MediaItem } from './types';

type MediaProps = {
  onBack?: () => void;
  onNext?: () => void;
  items: MediaItem[];
  mainMediaId: string | null;
  onChange: (items: MediaItem[]) => void;
  onMainMediaChange: (id: string | null) => void;
  showActions?: boolean;
  nextLabel?: string;
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
      rejectedFiles.push(`${file.name} exceeds the ${isVideo ? '25 MB video' : '5 MB image'} limit.`);
      return;
    }

    nextItems.push({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 9)}`,
      file,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' : 'image',
      title: '',
      altText: '',
      isExisting: false,
      mediaPath: null,
    });
  });

  return { nextItems, rejectedFiles };
}

function moveItem(current: MediaItem[], fromIndex: number, toIndex: number) {
  const updatedItems = [...current];
  const [movedItem] = updatedItems.splice(fromIndex, 1);
  updatedItems.splice(toIndex, 0, movedItem);
  return updatedItems;
}

export default function Media({
  onBack,
  onNext,
  items,
  mainMediaId,
  onChange,
  onMainMediaChange,
  showActions = true,
  nextLabel = 'Next',
}: MediaProps) {
  const [isDragOverUpload, setIsDragOverUpload] = useState(false);
  const [draggedMediaId, setDraggedMediaId] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string>('');
  const previewUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    };
  }, []);

  function addFiles(files: File[]) {
    if (files.length === 0) return;

    const remainingSlots = MAX_MEDIA_FILES - items.length;
    if (remainingSlots <= 0) {
      setUploadMessage(`You can upload up to ${MAX_MEDIA_FILES} media files only.`);
      return;
    }

    const { nextItems: validItems, rejectedFiles } = createMediaItems(files);
    const nextItems = validItems.slice(0, remainingSlots);

    if (validItems.length > remainingSlots) {
      rejectedFiles.push(`Only ${remainingSlots} more file${remainingSlots === 1 ? '' : 's'} can be uploaded.`);
    }

    setUploadMessage(rejectedFiles[0] ?? '');
    if (nextItems.length === 0) return;

    nextItems.forEach((item) => previewUrlsRef.current.add(item.previewUrl));

    const updatedItems = [...items, ...nextItems];
    onChange(updatedItems);

    if (!mainMediaId && updatedItems.length > 0) {
      onMainMediaChange(updatedItems[0].id);
    }
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
    const itemToRemove = items.find((item) => item.id === itemId);
    if (itemToRemove) {
      URL.revokeObjectURL(itemToRemove.previewUrl);
      previewUrlsRef.current.delete(itemToRemove.previewUrl);
    }

    const updatedItems = items.filter((item) => item.id !== itemId);
    onChange(updatedItems);

    if (mainMediaId === itemId) {
      onMainMediaChange(updatedItems[0]?.id ?? null);
    }
  }

  function handleMediaDrop(targetId: string) {
    if (!draggedMediaId || draggedMediaId === targetId) {
      setDraggedMediaId(null);
      return;
    }

    const fromIndex = items.findIndex((item) => item.id === draggedMediaId);
    const toIndex = items.findIndex((item) => item.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    onChange(moveItem(items, fromIndex, toIndex));
    setDraggedMediaId(null);
  }

  return (
    <section className={styles.wrapper}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.title}>Add Images/Videos</h3>
        </div>

        <label
          className={`${styles.uploadArea} ${isDragOverUpload ? styles.uploadAreaActive : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragOverUpload(true);
          }}
          onDragLeave={() => setIsDragOverUpload(false)}
          onDrop={handleUploadDrop}
        >
          <input type="file" accept={acceptedTypes} multiple className={styles.fileInput} onChange={handleFileSelection} />
          <div className={styles.uploadContent}>
            <p className={styles.uploadHeadline}>Drag and drop your image or video here, or <span className={styles.browseText}>Browse</span></p>
            <p className={styles.uploadHint}>You can upload up to {MAX_MEDIA_FILES} media files</p>
            <p className={styles.uploadFormats}>Accepted: JPEG, JPG, PNG up to 5 MB, MP4 up to 25 MB</p>
            {uploadMessage ? <p className={styles.uploadMessage}>{uploadMessage}</p> : null}
          </div>
        </label>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.title}>Images/Videos Uploaded</h3>
          <span className={styles.counter}>{items.length}/{MAX_MEDIA_FILES}</span>
        </div>

        {items.length === 0 ? (
          <div className={styles.emptyState}>Your uploaded media will appear here.</div>
        ) : (
          <div className={styles.mediaGrid}>
            {items.map((item) => {
              const isMainMedia = mainMediaId === item.id;
              return (
                <article
                  key={item.id}
                  className={`${styles.mediaCard} ${draggedMediaId === item.id ? styles.mediaCardDragging : ''}`}
                  draggable
                  onDragStart={() => setDraggedMediaId(item.id)}
                  onDragEnd={() => setDraggedMediaId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleMediaDrop(item.id)}
                >
                  <div className={styles.mediaPreview}>
                    {item.type === 'image' ? (
                      <img src={item.previewUrl} alt={item.fileName} className={styles.previewAsset} />
                    ) : (
                      <video src={item.previewUrl} className={styles.previewAsset} muted playsInline preload="metadata" />
                    )}
                  </div>

                  <div className={styles.cardFooter}>
                    <span className={styles.fileName} title={item.fileName}>{item.fileName}</span>
                    {isMainMedia ? <span className={styles.mainBadge}>Main</span> : null}
                  </div>

                  <div className={styles.metaGrid}>
                    <input
                      type="text"
                      className={styles.metaInput}
                      placeholder="Title"
                      value={item.title ?? ''}
                      onChange={(event) => onChange(items.map((entry) => (entry.id === item.id ? { ...entry, title: event.target.value } : entry)))}
                    />
                    <input
                      type="text"
                      className={styles.metaInput}
                      placeholder="Alt text"
                      value={item.altText ?? ''}
                      onChange={(event) => onChange(items.map((entry) => (entry.id === item.id ? { ...entry, altText: event.target.value } : entry)))}
                    />
                  </div>

                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${isMainMedia ? styles.iconButtonPrimary : ''}`}
                      onClick={() => onMainMediaChange(item.id)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}><path d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.56L12 17.52 6.12 20.62l1.12-6.56L2.48 9.42l6.58-.96L12 2.5z" fill={isMainMedia ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
                    </button>

                    <button type="button" className={`${styles.iconButton} ${styles.deleteButton}`} onClick={() => handleDelete(item.id)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}><path d="M9 3.75h6l.75 1.5H20v1.5H4v-1.5h4.25L9 3.75zm-1.5 6h1.5v7.5H7.5v-7.5zm4.5 0h1.5v7.5H12v-7.5zm4.5 0H18v7.5h-1.5v-7.5zM6 8.25h12v10.5A2.25 2.25 0 0 1 15.75 21h-7.5A2.25 2.25 0 0 1 6 18.75V8.25z" fill="currentColor" /></svg>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {showActions ? (
        <div className={styles.actions}>
          <button type="button" className={styles.backButton} onClick={onBack}>Back</button>
          <button type="button" className={styles.nextButton} onClick={onNext}>{nextLabel}</button>
        </div>
      ) : null}
    </section>
  );
}
