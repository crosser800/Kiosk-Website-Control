import { useEffect, useState } from 'react';
import {
  type AccountHandlingStatus,
  addAccountHandlingOption,
  getAccountHandlingItems,
  removeAccountHandlingOption,
  renameAccountHandlingOption,
  subscribeAccountHandlingItems,
  updateAccountHandlingStatus,
} from '../../services/accountHandling';
import styles from './AccountHandling.module.css';

export default function AccountHandling() {
  const [handlings, setHandlings] = useState(() => getAccountHandlingItems());
  const [handlingName, setHandlingName] = useState('');
  const [editingName, setEditingName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => subscribeAccountHandlingItems(setHandlings), []);

  function handleAddHandling() {
    const nextHandling = handlingName.trim();

    if (!nextHandling) {
      setError('Enter a handling name.');
      return;
    }

    const hasDuplicate = handlings.some(
      (handling) => handling.name.toLowerCase() === nextHandling.toLowerCase(),
    );

    if (hasDuplicate) {
      setError('This handling already exists.');
      return;
    }

    setHandlings(addAccountHandlingOption(nextHandling));
    setHandlingName('');
    setError('');
  }

  function handleStatusChange(handlingName: string, status: AccountHandlingStatus) {
    setHandlings(updateAccountHandlingStatus(handlingName, status));
  }

  function startRename(currentName: string) {
    setEditingName(currentName);
    setRenameValue(currentName);
    setError('');
  }

  function cancelRename() {
    setEditingName('');
    setRenameValue('');
    setError('');
  }

  function saveRename(currentName: string) {
    const nextName = renameValue.trim();

    if (!nextName) {
      setError('Enter a handling name.');
      return;
    }

    const hasDuplicate = handlings.some(
      (handling) =>
        handling.name !== currentName && handling.name.toLowerCase() === nextName.toLowerCase(),
    );

    if (hasDuplicate) {
      setError('This handling already exists.');
      return;
    }

    setHandlings(renameAccountHandlingOption(currentName, nextName));
    setEditingName('');
    setRenameValue('');
    setError('');
  }

  function getStatusClass(status: AccountHandlingStatus) {
    return status === 'active' ? styles.statusActive : styles.statusInactive;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleAddHandling();
  }

  return (
    <section className={styles.panel} aria-labelledby="account-handling-title">
      <div className={styles.header}>
        <div>
          <h2 id="account-handling-title" className={styles.title}>
            Accounts Handling
          </h2>
          <p className={styles.subtitle}>Customize the Handling dropdown for agent accounts.</p>
        </div>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span className={styles.label}>Handling name</span>
          <input
            type="text"
            value={handlingName}
            onChange={(event) => {
              setHandlingName(event.target.value);
              setError('');
            }}
            placeholder="Retail 1"
            className={styles.input}
          />
        </label>

        <button type="submit" className={styles.addButton}>
          <i className="fa-solid fa-plus" aria-hidden="true"></i>
          <span>Add</span>
        </button>
      </form>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.list} aria-live="polite">
        {handlings.length > 0 ? (
          handlings.map((handling) => (
            <div key={handling.name} className={styles.item}>
              {editingName === handling.name ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) => {
                    setRenameValue(event.target.value);
                    setError('');
                  }}
                  className={styles.renameInput}
                  aria-label={`Rename ${handling.name}`}
                />
              ) : (
                <span className={styles.itemName}>{handling.name}</span>
              )}

              <select
                value={handling.status}
                onChange={(event) =>
                  handleStatusChange(handling.name, event.target.value as AccountHandlingStatus)
                }
                className={`${styles.statusSelect} ${getStatusClass(handling.status)}`}
                aria-label={`${handling.name} status`}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              {editingName === handling.name ? (
                <div className={styles.actionGroup}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => saveRename(handling.name)}
                    aria-label={`Save ${handling.name}`}
                  >
                    <i className="fa-solid fa-check" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={cancelRename}
                    aria-label="Cancel rename"
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => startRename(handling.name)}
                  aria-label={`Rename ${handling.name}`}
                >
                  <i className="fa-solid fa-pen" aria-hidden="true"></i>
                </button>
              )}

              <button
                type="button"
                className={styles.removeButton}
                onClick={() => setHandlings(removeAccountHandlingOption(handling.name))}
                aria-label={`Remove ${handling.name}`}
              >
                <i className="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          ))
        ) : (
          <p className={styles.empty}>No account handlings added yet.</p>
        )}
      </div>
    </section>
  );
}
