import { useEffect, useState } from 'react';
import {
  type BranchTypeStatus,
  addBranchTypeOption,
  getBranchTypeItems,
  removeBranchTypeOption,
  renameBranchTypeOption,
  subscribeBranchTypeItems,
  updateBranchTypeStatus,
} from '../../services/branchTypes';
import styles from './BranchTypes.module.css';

export default function BranchTypes() {
  const [branches, setBranches] = useState(() => getBranchTypeItems());
  const [branchName, setBranchName] = useState('');
  const [editingName, setEditingName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => subscribeBranchTypeItems(setBranches), []);

  function handleAddBranch() {
    const nextBranch = branchName.trim();

    if (!nextBranch) {
      setError('Enter a branch type.');
      return;
    }

    const hasDuplicate = branches.some(
      (branch) => branch.name.toLowerCase() === nextBranch.toLowerCase(),
    );

    if (hasDuplicate) {
      setError('This branch type already exists.');
      return;
    }

    setBranches(addBranchTypeOption(nextBranch));
    setBranchName('');
    setError('');
  }

  function handleStatusChange(branchName: string, status: BranchTypeStatus) {
    setBranches(updateBranchTypeStatus(branchName, status));
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
      setError('Enter a branch type.');
      return;
    }

    const hasDuplicate = branches.some(
      (branch) =>
        branch.name !== currentName && branch.name.toLowerCase() === nextName.toLowerCase(),
    );

    if (hasDuplicate) {
      setError('This branch type already exists.');
      return;
    }

    setBranches(renameBranchTypeOption(currentName, nextName));
    setEditingName('');
    setRenameValue('');
    setError('');
  }

  function getStatusClass(status: BranchTypeStatus) {
    return status === 'active' ? styles.statusActive : styles.statusInactive;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleAddBranch();
  }

  return (
    <section className={styles.panel} aria-labelledby="branch-types-title">
      <div className={styles.header}>
        <div>
          <h2 id="branch-types-title" className={styles.title}>
            Branch Types
          </h2>
          <p className={styles.subtitle}>Customize the Branch dropdown for branches.</p>
        </div>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span className={styles.label}>Branch type</span>
          <input
            type="text"
            value={branchName}
            onChange={(event) => {
              setBranchName(event.target.value);
              setError('');
            }}
            placeholder="Main Branch"
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
        {branches.length > 0 ? (
          branches.map((branch) => (
            <div key={branch.name} className={styles.item}>
              {editingName === branch.name ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) => {
                    setRenameValue(event.target.value);
                    setError('');
                  }}
                  className={styles.renameInput}
                  aria-label={`Rename ${branch.name}`}
                />
              ) : (
                <span className={styles.itemName}>{branch.name}</span>
              )}

              <select
                value={branch.status}
                onChange={(event) =>
                  handleStatusChange(branch.name, event.target.value as BranchTypeStatus)
                }
                className={`${styles.statusSelect} ${getStatusClass(branch.status)}`}
                aria-label={`${branch.name} status`}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              {editingName === branch.name ? (
                <div className={styles.actionGroup}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => saveRename(branch.name)}
                    aria-label={`Save ${branch.name}`}
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
                  onClick={() => startRename(branch.name)}
                  aria-label={`Rename ${branch.name}`}
                >
                  <i className="fa-solid fa-pen" aria-hidden="true"></i>
                </button>
              )}

              <button
                type="button"
                className={styles.removeButton}
                onClick={() => setBranches(removeBranchTypeOption(branch.name))}
                aria-label={`Remove ${branch.name}`}
              >
                <i className="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          ))
        ) : (
          <p className={styles.empty}>No branch types added yet.</p>
        )}
      </div>
    </section>
  );
}
