import { useEffect, useState } from 'react';
import {
  backfillAgentInternalAccounts,
  previewAgentUsernames,
  type AgentUsernamePreviewRow,
  type GeneratedAgentCredential,
} from '../../services/agentInternalAccounts';
import styles from './AgentUsernamePreviewModal.module.css';

type AgentUsernamePreviewModalProps = {
  onClose: () => void;
};

export default function AgentUsernamePreviewModal({ onClose }: AgentUsernamePreviewModalProps) {
  const [rows, setRows] = useState<AgentUsernamePreviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generatedCredentials, setGeneratedCredentials] = useState<GeneratedAgentCredential[]>([]);

  async function loadPreview() {
    setIsLoading(true);
    setLoadError('');
    try {
      setRows(await previewAgentUsernames());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load agent username preview.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPreview();
  }, []);

  const pendingCount = rows.filter((row) => !row.hasInternalAccount).length;

  async function handleGenerateAccounts() {
    if (isGenerating || pendingCount === 0) return;

    setIsGenerating(true);
    setGenerateError('');
    try {
      const created = await backfillAgentInternalAccounts();
      setGeneratedCredentials(created);
      await loadPreview();
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : 'Failed to generate agent internal accounts.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access can fail silently (e.g. insecure context); the
      // value is still visible on screen for manual copying.
    }
  }

  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Agent internal account preview">
        <div className={styles.header}>
          <div>
            <h2>Agent Internal Accounts</h2>
            <p>
              Read-only preview of usernames for Active agents, generated the same way Create Internal Account
              would. Nothing is created until you click Generate Accounts.
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        {loadError ? <p className={styles.errorNotice}>{loadError}</p> : null}
        {generateError ? <p className={styles.errorNotice}>{generateError}</p> : null}

        {generatedCredentials.length > 0 ? (
          <>
            <p className={styles.warningNotice}>
              These temporary passwords are shown only once and cannot be retrieved again. Copy and deliver them to
              each agent through a secure channel before closing this dialog.
            </p>
            <div className={styles.credentialList}>
              {generatedCredentials.map((credential) => (
                <div key={credential.agentId} className={styles.credentialRow}>
                  <strong>{credential.username}</strong>
                  <strong>{credential.temporaryPassword}</strong>
                  <button type="button" onClick={() => void handleCopy(`${credential.username} / ${credential.temporaryPassword}`)}>
                    Copy
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {isLoading ? (
          <p>Loading agent usernames...</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Agent Code</th>
                  <th>Full Name</th>
                  <th>Current Status</th>
                  <th>Proposed Username</th>
                  <th>Internal Account Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No Active agents were found.</td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.agentId}>
                      <td>{row.agentCode || '-'}</td>
                      <td>{row.fullName || 'Unnamed Agent'}</td>
                      <td>{row.agentStatus}</td>
                      <td>{row.proposedUsername}</td>
                      <td className={row.hasInternalAccount ? styles.pillCreated : styles.pillMissing}>
                        {row.hasInternalAccount ? row.internalAccountStatus ?? 'Created' : 'Not Created'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" onClick={onClose}>
            Close
          </button>
          <button type="button" onClick={() => void handleGenerateAccounts()} disabled={isGenerating || pendingCount === 0}>
            {isGenerating
              ? 'Generating Accounts...'
              : pendingCount === 0
                ? 'All Active Agents Have Accounts'
                : `Generate Accounts (${pendingCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}
