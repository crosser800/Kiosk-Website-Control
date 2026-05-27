import { useEffect, useState } from 'react';
import {
  getDeliveryTermOptions,
  subscribeDeliveryTermOptions,
} from '../../services/deliveryTerms';
import styles from './EditOrder.module.css';

type EditOrderData = {
  orderNo: string;
  agent: string;
  poNo: string;
  clientName: string;
  terms: string;
  poStatus: string;
};

type EditOrderProps = {
  order: EditOrderData;
  onClose: () => void;
};

type OrderListItem = {
  id: string;
  productName: string;
  code: string;
  price: number;
  specialPrice: number;
  variations: string;
  quantity: number;
  status: 'served' | 'unserve';
};

const initialOrderItems: OrderListItem[] = [
  {
    id: 'sample-n1',
    productName: 'Nail',
    code: 'N1',
    price: 120,
    specialPrice: 110,
    variations: '1 inch',
    quantity: 1,
    status: 'unserve',
  },
];

export default function EditOrder({ order, onClose }: EditOrderProps) {
  const [terms, setTerms] = useState(order.terms);
  const [poStatus, setPoStatus] = useState(order.poStatus);
  const [termOptions, setTermOptions] = useState(() => getDeliveryTermOptions());
  const [orderItems, setOrderItems] = useState<OrderListItem[]>(initialOrderItems);

  useEffect(() => subscribeDeliveryTermOptions(setTermOptions), []);

  function updateQuantity(itemId: string, change: number) {
    setOrderItems((items) =>
      items.map((item) =>
        item.id === itemId
          ? { ...item, quantity: Math.max(item.quantity + change, 1) }
          : item,
      ),
    );
  }

  function deleteItem(itemId: string) {
    setOrderItems((items) => items.filter((item) => item.id !== itemId));
  }

  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="edit-order-title">
        <div className={styles.modalHeader}>
          <h2 id="edit-order-title" className={styles.title}>
            Edit Order
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close edit order"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        <div className={styles.divider}></div>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Order Information</h3>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Order No.</span>
              <span className={styles.valueBox}>{order.orderNo || '-'}</span>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Agent</span>
              <span className={styles.valueBox}>{order.agent || '-'}</span>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>P.O. No.</span>
              <span className={styles.valueBox}>{order.poNo || '-'}</span>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Client Name</span>
              <span className={styles.valueBox}>{order.clientName || '-'}</span>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Terms</span>
              <select
                className={styles.selectField}
                value={terms}
                onChange={(event) => setTerms(event.target.value)}
              >
                <option value=""></option>
                {termOptions.map((term) => (
                  <option key={term.id} value={term.name}>
                    {term.name} ({term.code})
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Status</span>
              <select
                className={styles.selectField}
                value={poStatus}
                onChange={(event) => setPoStatus(event.target.value)}
              >
                <option value=""></option>
              </select>
            </label>
          </div>
        </section>

        <div className={styles.divider}></div>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Order List</h3>

          <div className={styles.orderTable}>
            <div className={styles.orderTableHeader}>
              <span>No.</span>
              <span>Product(Name)</span>
              <span>Code</span>
              <span>Price(PHP)</span>
              <span>Special Price</span>
              <span>Variations</span>
              <span>Quantity</span>
              <span>Status</span>
              <span className={styles.actionHeader}>Action</span>
            </div>

            {orderItems.length === 0 ? (
              <div className={styles.emptyState}>No products in this order.</div>
            ) : (
              orderItems.map((item, index) => (
                <div key={item.id} className={styles.orderTableRow}>
                  <span>{index + 1}</span>
                  <span>{item.productName}</span>
                  <span>{item.code}</span>
                  <span>{item.price.toLocaleString()}</span>
                  <span>{item.specialPrice.toLocaleString()}</span>
                  <span>{item.variations}</span>
                  <div className={styles.quantityControl}>
                    <button
                      type="button"
                      className={styles.quantityButton}
                      onClick={() => updateQuantity(item.id, -1)}
                      aria-label={`Decrease ${item.productName} quantity`}
                    >
                      -
                    </button>
                    <span className={styles.quantityValue}>{item.quantity}</span>
                    <button
                      type="button"
                      className={styles.quantityButton}
                      onClick={() => updateQuantity(item.id, 1)}
                      aria-label={`Increase ${item.productName} quantity`}
                    >
                      +
                    </button>
                  </div>
                  <span className={styles.statusText}>{item.status}</span>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => deleteItem(item.id)}
                    aria-label={`Delete ${item.productName}`}
                  >
                    <i className="fa-solid fa-trash" aria-hidden="true"></i>
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <div className={styles.divider}></div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.saveButton} onClick={onClose}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
