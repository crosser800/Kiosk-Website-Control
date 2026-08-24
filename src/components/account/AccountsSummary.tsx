import { useEffect, useMemo, useState } from 'react';
import { groupPermissionsByModule } from '../../services/accounts';
import styles from './AccountsSummary.module.css';

export type AccountView = 'admins' | 'agents';
type FilterMode = 'alphabetical' | 'recentlyAdded';
type SortOrder = 'ascending' | 'descending';

export type AccountSummaryItem = {
  id: string;
  profileImage?: string;
  profileImagePath?: string;
  profileImageUrl?: string;
  name: string;
  email: string;
  contact: string;
  birthdate?: string;
  gender?: string;
  addressLine?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactNumber?: string;
  role: AccountView;
  handle: string;
  access: string;
  branch: string;
  agentGroupId?: string;
  agentGroupName?: string;
  agentGroupCode?: string;
  clientCount?: number;
  status: string;
  authUserId?: string;
  address?: string;
  notes?: string;
  roleLabel?: string;
  username?: string;
  roleId?: string;
  departmentId?: string;
  parentAdminAccountId?: string;
  permissionIds?: string[];
  assignedPermissions?: AccountPermissionSummary[];
  totalPermissionCount?: number;
  passwordStatus?: string;
  mustChangePassword?: boolean;
  passwordChangedAt?: string;
  passwordResetAt?: string;
  updatedAt?: string;
  themePreference?: 'light' | 'dark';
  isSystemOwner?: boolean;
  canEdit?: boolean;
  createdAt: string;
};

export type AccountPermissionSummary = {
  id: string;
  moduleCode: string;
  permissionCode: string;
  label: string;
  sortOrder: number;
};

type AccountsSummaryProps = {
  accounts?: AccountSummaryItem[];
  onCreateAccount?: (accountType: AccountView) => void;
  onEditAccount?: (account: AccountSummaryItem) => void;
};

const ROWS_PER_PAGE = 7;

const accountViewLabels: Record<AccountView, string> = {
  admins: 'Admins',
  agents: 'Agents',
};

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.paginationIcon}>
      <path
        d="M15 6l-6 6 6 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.paginationIcon}>
      <path
        d="M9 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M20 20l-4.2-4.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        d="M4 6h16M7 12h10M10 18h4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        d="M8 6v12M8 18l-3-3M8 18l3-3M16 18V6M16 6l-3 3M16 6l3 3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.actionIcon}>
      <path
        d="M4 20h4l10-10-4-4L4 16v4z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M12 6l4 4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function buildVisiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, 5];
  }

  if (currentPage >= totalPages - 2) {
    return [
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    currentPage - 2,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    currentPage + 2,
  ];
}

function formatContactNumber(contact: string) {
  const digitsOnly = contact.replace(/\D/g, '');

  if (digitsOnly.length !== 11) {
    return contact;
  }

  return `${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4, 7)}-${digitsOnly.slice(7)}`;
}

function getStatusClass(status: string) {
  if (status.toLowerCase() === 'pending setup') {
    return styles.statusPending;
  }
  if (status.toLowerCase() === 'locked') {
    return styles.statusPending;
  }
  return status.toLowerCase() === 'active' ? styles.statusActive : styles.statusInactive;
}

function ShieldIcon() {
  return <i className="fa-solid fa-shield-halved" aria-hidden="true"></i>;
}

function formatDateTime(value: string | undefined) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString('en-PH');
}

function getAccessSummary(account: AccountSummaryItem) {
  const assignedPermissions = account.assignedPermissions ?? [];
  const assignedModuleCount = new Set(
    assignedPermissions.map((permission) => permission.moduleCode).filter(Boolean),
  ).size;
  const assignedPermissionCount = assignedPermissions.length;
  const totalPermissionCount = account.totalPermissionCount ?? assignedPermissionCount;

  return {
    assignedModuleCount,
    assignedPermissionCount,
    totalPermissionCount,
  };
}

export default function AccountsSummary({
  accounts = [],
  onCreateAccount,
  onEditAccount,
}: AccountsSummaryProps) {
  const [activeView, setActiveView] = useState<AccountView>('admins');
  const [searchValue, setSearchValue] = useState('');
  const [filterBy, setFilterBy] = useState<FilterMode>('alphabetical');
  const [sortOrder, setSortOrder] = useState<SortOrder>('ascending');
  const [agentGroupFilter, setAgentGroupFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [accessDetailsAccount, setAccessDetailsAccount] = useState<AccountSummaryItem | null>(null);
  const [profileImageViewer, setProfileImageViewer] = useState<{ url: string; name: string } | null>(null);

  const agentGroupOptions = useMemo(() => {
    const groups = new Map<string, { id: string; label: string }>();
    accounts.forEach((account) => {
      if (account.role !== 'agents' || !account.agentGroupId) return;
      groups.set(account.agentGroupId, {
        id: account.agentGroupId,
        label: account.agentGroupName || account.agentGroupCode || 'Unnamed Group',
      });
    });
    return Array.from(groups.values()).sort((left, right) => left.label.localeCompare(right.label));
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    const searchedAccounts = accounts.filter((account) => {
      if (account.role !== activeView) {
        return false;
      }

      if (activeView === 'agents') {
        if (agentGroupFilter === 'ungrouped' && account.agentGroupId) return false;
        if (
          agentGroupFilter !== 'all' &&
          agentGroupFilter !== 'ungrouped' &&
          account.agentGroupId !== agentGroupFilter
        ) {
          return false;
        }
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        account.name,
        account.email,
        account.contact,
        account.handle,
        account.access,
        account.branch,
        account.agentGroupName ?? '',
        account.agentGroupCode ?? '',
        account.status,
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    });

    const sortedAccounts = [...searchedAccounts].sort((left, right) => {
      if (filterBy === 'alphabetical') {
        return left.name.localeCompare(right.name);
      }

      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    });

    if (sortOrder === 'descending') {
      sortedAccounts.reverse();
    }

    return sortedAccounts;
  }, [accounts, activeView, agentGroupFilter, filterBy, searchValue, sortOrder]);

  const totalDataCount = filteredAccounts.length;
  const totalPages = Math.max(Math.ceil(totalDataCount / ROWS_PER_PAGE), 1);
  const pageStartIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const pagedAccounts = filteredAccounts.slice(pageStartIndex, pageStartIndex + ROWS_PER_PAGE);
  const pageStart = totalDataCount === 0 ? 0 : pageStartIndex + 1;
  const pageEnd =
    totalDataCount === 0 ? 0 : Math.min(pageStartIndex + ROWS_PER_PAGE, totalDataCount);
  const visiblePages = buildVisiblePages(currentPage, totalPages);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeView, agentGroupFilter, filterBy, searchValue, sortOrder]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!accessDetailsAccount && !profileImageViewer) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAccessDetailsAccount(null);
        setProfileImageViewer(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [accessDetailsAccount, profileImageViewer]);

  function handlePageInputChange(value: string) {
    if (value === '') {
      return;
    }

    const page = Number(value);

    if (Number.isNaN(page)) {
      return;
    }

    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
  }

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <div className={styles.filterTabs} aria-label="Account type filter">
          {(Object.keys(accountViewLabels) as AccountView[]).map((view) => (
            <button
              key={view}
              type="button"
              className={`${styles.filterTab} ${
                activeView === view ? styles.filterTabActive : ''
              }`}
              onClick={() => setActiveView(view)}
            >
              {accountViewLabels[view]}
            </button>
          ))}
        </div>

        <div className={styles.toolbar}>
          <label className={styles.search}>
            <SearchIcon />
            <input
              type="text"
              placeholder={
                activeView === 'admins'
                  ? 'Search name, email, branch'
                  : 'Search name, code, company'
              }
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              className={styles.searchInput}
            />
          </label>

          <label className={styles.selectControl}>
            <FilterIcon />
            <select
              value={filterBy}
              onChange={(event) => setFilterBy(event.target.value as FilterMode)}
              className={styles.selectField}
            >
              <option value="alphabetical">Alphabetical</option>
              <option value="recentlyAdded">Recently Added</option>
            </select>
          </label>

          <label className={styles.selectControl}>
            <SortIcon />
            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as SortOrder)}
              className={styles.selectField}
            >
              <option value="ascending">Ascending</option>
              <option value="descending">Descending</option>
            </select>
          </label>

          {activeView === 'agents' ? (
            <label className={styles.selectControl}>
              <FilterIcon />
              <select
                value={agentGroupFilter}
                onChange={(event) => setAgentGroupFilter(event.target.value)}
                className={styles.selectField}
              >
                <option value="all">All Groups</option>
                <option value="ungrouped">Ungrouped</option>
                {agentGroupOptions.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => onCreateAccount?.(activeView)}
          >
            <PlusIcon />
            <span>{activeView === 'admins' ? 'Create Internal Admin' : 'Create New Account'}</span>
          </button>
        </div>
      </div>

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>Profile</span>
          <span>Name</span>
          <span>{activeView === 'admins' ? 'Username' : 'Email'}</span>
          <span>{activeView === 'admins' ? 'Role / Position' : 'Contact'}</span>
          <span>{activeView === 'admins' ? 'Department' : 'Client Count'}</span>
          <span>{activeView === 'admins' ? 'Access' : 'Agent Code'}</span>
          <span>{activeView === 'admins' ? 'Password Status' : 'Group'}</span>
          <span>Status</span>
          <span className={styles.actionHeader}>Action</span>
        </div>

        {pagedAccounts.length === 0 ? (
          <div className={styles.emptyState}>
            <span>No {accountViewLabels[activeView].toLowerCase()} added yet.</span>
          </div>
        ) : (
          pagedAccounts.map((account) => (
            <div key={account.id} className={styles.tableRow}>
              <span className={styles.profileCell}>
                {account.profileImage ? (
                  <button
                    type="button"
                    className={styles.profileImageButton}
                    onClick={() => setProfileImageViewer({ url: account.profileImage ?? '', name: account.name })}
                    aria-label={`View profile image for ${account.name}`}
                  >
                    <img
                      src={account.profileImage}
                      alt=""
                      className={styles.profileImage}
                    />
                  </button>
                ) : (
                  <span className={styles.profileBlank} aria-hidden="true">
                    <i className="fa-solid fa-user"></i>
                  </span>
                )}
              </span>
              <span>
                <span className={styles.nameCell}>
                  {account.name}
                  {account.isSystemOwner ? (
                    <span className={styles.protectedPill}>
                      <ShieldIcon />
                      Protected
                    </span>
                  ) : null}
                </span>
              </span>
              <span>{account.role === 'admins' ? account.username || '-' : account.email}</span>
              <span>{account.role === 'admins' ? account.roleLabel ?? '-' : formatContactNumber(account.contact)}</span>
              <span>
                {account.role === 'admins'
                  ? account.branch || '-'
                  : (account.clientCount ?? 0).toLocaleString()}
              </span>
              <span>
                {account.role === 'admins' ? (
                  <button
                    type="button"
                    className={styles.accessSummaryButton}
                    onClick={() => setAccessDetailsAccount(account)}
                    aria-label={`View access details for ${account.name}`}
                  >
                    <span>{getAccessSummary(account).assignedModuleCount} Modules</span>
                    <small>
                      {getAccessSummary(account).assignedPermissionCount}/
                      {getAccessSummary(account).totalPermissionCount} Permissions
                    </small>
                  </button>
                ) : (
                  account.handle
                )}
              </span>
              <span>
                {account.role === 'admins' ? (
                  <span className={`${styles.statusBadge} ${account.passwordStatus === 'Default Password' ? styles.statusPending : styles.statusActive}`}>
                    {account.passwordStatus ?? 'Password Changed'}
                  </span>
                ) : (
                  account.agentGroupName || 'Ungrouped'
                )}
                {account.role === 'admins' && account.passwordChangedAt ? (
                  <small className={styles.metaText}>{formatDateTime(account.passwordChangedAt)}</small>
                ) : null}
              </span>
              <span className={`${styles.statusBadge} ${getStatusClass(account.status)}`}>
                {account.status}
              </span>
              <button
                type="button"
                className={styles.actionButton}
                aria-label={`Edit ${account.name}`}
                disabled={account.canEdit === false}
                onClick={() => onEditAccount?.(account)}
                title={account.canEdit === false ? 'Protected system account' : `Edit ${account.name}`}
              >
                <EditIcon />
              </button>
            </div>
          ))
        )}
      </div>

      <div className={styles.mobileAccountCards}>
        {pagedAccounts.length === 0 ? (
          <div className={styles.mobileEmptyState}>
            No {accountViewLabels[activeView].toLowerCase()} added yet.
          </div>
        ) : (
          pagedAccounts.map((account) => (
            <article key={`mobile-${account.id}`} className={styles.mobileAccountCard}>
              <div className={styles.mobileAccountGrid}>
                <div className={styles.mobileAccountIdentity}>
                  <div className={styles.mobileProfileRow}>
                    {account.profileImage ? (
                      <button
                        type="button"
                        className={styles.mobileProfileImageButton}
                        onClick={() => setProfileImageViewer({ url: account.profileImage ?? '', name: account.name })}
                        aria-label={`View profile image for ${account.name}`}
                      >
                        <img src={account.profileImage} alt="" className={styles.mobileProfileImage} />
                      </button>
                    ) : (
                      <span className={styles.mobileProfileBlank} aria-hidden="true">
                        <i className="fa-solid fa-user"></i>
                      </span>
                    )}
                    <div>
                      <h3>{account.name}</h3>
                      <p>{account.role === 'admins' ? account.username || '-' : account.email}</p>
                      <span className={`${styles.statusBadge} ${styles.mobileAccountStatus} ${getStatusClass(account.status)}`}>
                        {account.status}
                      </span>
                    </div>
                  </div>

                  <dl className={styles.mobileIdentityDetails}>
                    <div>
                      <dt>{account.role === 'admins' ? 'Role' : 'Client Count'}</dt>
                      <dd>
                        {account.role === 'admins'
                          ? account.roleLabel ?? '-'
                          : (account.clientCount ?? 0).toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt>Department</dt>
                      <dd>{account.branch || '-'}</dd>
                    </div>
                  </dl>
                </div>

                <div className={styles.mobileAccountControls}>
                  <div className={styles.mobileAccountDetail}>
                    <span>Access</span>
                    {account.role === 'admins' ? (
                      <button
                        type="button"
                        className={styles.accessSummaryButton}
                        onClick={() => setAccessDetailsAccount(account)}
                        aria-label={`View access details for ${account.name}`}
                      >
                        <span>{getAccessSummary(account).assignedModuleCount} Modules</span>
                        <small>{getAccessSummary(account).assignedPermissionCount}/{getAccessSummary(account).totalPermissionCount} Permissions</small>
                      </button>
                    ) : (
                      <strong>{account.handle || '-'}</strong>
                    )}
                  </div>

                  <div className={styles.mobileAccountDetail}>
                    <span>Password Status</span>
                    <strong>{account.passwordStatus ?? '-'}</strong>
                  </div>

                  <button
                    type="button"
                    className={`${styles.actionButton} ${styles.mobileAccountAction}`}
                    aria-label={`Edit ${account.name}`}
                    disabled={account.canEdit === false}
                    onClick={() => onEditAccount?.(account)}
                    title={account.canEdit === false ? 'Protected system account' : `Edit ${account.name}`}
                  >
                    <EditIcon />
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerText}>
          Showing {pageStart}-{pageEnd} from {totalDataCount.toLocaleString()} data
        </span>

        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.paginationButton}
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            aria-label="Previous page"
            disabled={currentPage === 1}
          >
            <ChevronLeftIcon />
          </button>

          {visiblePages.map((page) => (
            <button
              key={page}
              type="button"
              className={`${styles.pageButton} ${
                currentPage === page ? styles.pageButtonActive : ''
              }`}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}

          <input
            type="number"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={(event) => handlePageInputChange(event.target.value)}
            className={styles.pageInput}
            aria-label="Go to page"
          />

          <button
            type="button"
            className={styles.paginationButton}
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            aria-label="Next page"
            disabled={currentPage === totalPages}
          >
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      {accessDetailsAccount ? (
        <AccessDetailsModal
          account={accessDetailsAccount}
          onClose={() => setAccessDetailsAccount(null)}
        />
      ) : null}

      {profileImageViewer ? (
        <ProfileImageViewer
          imageUrl={profileImageViewer.url}
          name={profileImageViewer.name}
          onClose={() => setProfileImageViewer(null)}
        />
      ) : null}
    </section>
  );
}

function ProfileImageViewer({
  imageUrl,
  name,
  onClose,
}: {
  imageUrl: string;
  name: string;
  onClose: () => void;
}) {
  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.imageViewer}
        role="dialog"
        aria-modal="true"
        aria-label={`Profile image for ${name}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className={styles.imageViewerClose} onClick={onClose} aria-label="Close profile image">
          <i className="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
        <img src={imageUrl} alt="" className={styles.imageViewerAsset} />
      </section>
    </div>
  );
}

type AccessDetailsModalProps = {
  account: AccountSummaryItem;
  onClose: () => void;
};

function AccessDetailsModal({ account, onClose }: AccessDetailsModalProps) {
  const summary = getAccessSummary(account);
  const groupedPermissions = groupPermissionsByModule(account.assignedPermissions ?? []);

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.accessModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.accessModalHeader}>
          <div>
            <h2 id="access-details-title">Access Details</h2>
            <p>{account.name}</p>
          </div>
          <button type="button" className={styles.accessModalClose} onClick={onClose} aria-label="Close access details">
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        <div className={styles.accessModalMeta}>
          <span>{account.roleLabel ?? 'No role'}</span>
          <strong>{summary.assignedModuleCount} Modules</strong>
          <strong>
            {summary.assignedPermissionCount}/{summary.totalPermissionCount} Permissions
          </strong>
        </div>

        <div className={styles.accessModalBody}>
          {groupedPermissions.length === 0 ? (
            <p className={styles.emptyPermissions}>No permissions assigned.</p>
          ) : (
            groupedPermissions.map(([moduleCode, permissions]) => (
              <section key={moduleCode} className={styles.permissionGroup}>
                <h3>{moduleCode}</h3>
                <div className={styles.permissionList}>
                  {permissions.map((permission) => (
                    <span key={permission.id} className={styles.permissionItem}>
                      <i className="fa-solid fa-check" aria-hidden="true"></i>
                      {permission.label}
                    </span>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <div className={styles.accessModalActions}>
          <button type="button" className={styles.primaryButton} onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
