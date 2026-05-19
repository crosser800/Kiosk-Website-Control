import { useEffect, useMemo, useState } from 'react';
import styles from './AccountsSummary.module.css';

export type AccountView = 'admins' | 'agents';
type FilterMode = 'alphabetical' | 'recentlyAdded';
type SortOrder = 'ascending' | 'descending';

export type AccountSummaryItem = {
  id: string;
  name: string;
  email: string;
  contact: string;
  role: AccountView;
  handle: string;
  access: string;
  branch: string;
  status: string;
  createdAt: string;
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

export default function AccountsSummary({
  accounts = [],
  onCreateAccount,
  onEditAccount,
}: AccountsSummaryProps) {
  const [activeView, setActiveView] = useState<AccountView>('admins');
  const [searchValue, setSearchValue] = useState('');
  const [filterBy, setFilterBy] = useState<FilterMode>('alphabetical');
  const [sortOrder, setSortOrder] = useState<SortOrder>('ascending');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredAccounts = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    const searchedAccounts = accounts.filter((account) => {
      if (account.role !== activeView) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return account.name.toLowerCase().includes(normalizedSearch);
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
  }, [accounts, activeView, filterBy, searchValue, sortOrder]);

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
  }, [activeView, filterBy, searchValue, sortOrder]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

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
              placeholder="Search Name"
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

          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => onCreateAccount?.(activeView)}
          >
            <PlusIcon />
            <span>Create New Account</span>
          </button>
        </div>
      </div>

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>Name</span>
          <span>Email</span>
          <span>Contact</span>
          <span>Role</span>
          <span>{activeView === 'admins' ? 'Access' : 'Handle'}</span>
          <span>Branch</span>
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
              <span>{account.name}</span>
              <span>{account.email}</span>
              <span>{formatContactNumber(account.contact)}</span>
              <span>{account.role === 'admins' ? 'Admin' : 'Agent'}</span>
              <span>{account.role === 'admins' ? account.access : account.handle}</span>
              <span>{account.branch}</span>
              <span>{account.status}</span>
              <button
                type="button"
                className={styles.actionButton}
                aria-label={`Edit ${account.name}`}
                onClick={() => onEditAccount?.(account)}
              >
                <EditIcon />
              </button>
            </div>
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
    </section>
  );
}
