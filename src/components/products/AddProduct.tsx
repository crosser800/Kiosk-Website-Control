import { useState } from 'react';
import styles from './AddProduct.module.css';
import BasicInformation from './addProducts/BasicInformation';

type AddProductSection =
  | 'Basic Information'
  | 'Images'
  | 'Variation & Pricing'
  | 'Discount'
  | 'Surcharge';

type AddProductProps = {
  onCancel: () => void;
};

const sections: AddProductSection[] = [
  'Basic Information',
  'Images',
  'Variation & Pricing',
  'Discount',
  'Surcharge',
];

export default function AddProduct({ onCancel }: AddProductProps) {
  const [activeSection, setActiveSection] =
    useState<AddProductSection>('Basic Information');

  const handleNext = () => {
    const currentIndex = sections.indexOf(activeSection);

    if (currentIndex < sections.length - 1) {
      setActiveSection(sections[currentIndex + 1]);
    }
  };

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Add Product</h2>

        <div className={styles.navigation} role="tablist" aria-label="Add product sections">
          {sections.map((section) => (
            <button
              key={section}
              type="button"
              role="tab"
              aria-selected={activeSection === section}
              className={`${styles.navButton} ${
                activeSection === section ? styles.navButtonActive : ''
              }`}
              onClick={() => setActiveSection(section)}
            >
              {section}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.content}>
        {activeSection === 'Basic Information' ? (
          <BasicInformation onCancel={onCancel} onNext={handleNext} />
        ) : (
          <div className={styles.placeholder}>
            <h3 className={styles.placeholderTitle}>{activeSection}</h3>
            <p className={styles.placeholderText}>
              This section is ready for the next form step.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
