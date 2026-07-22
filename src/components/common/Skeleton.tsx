import styles from './Skeleton.module.css';

type SkeletonProps = {
  className?: string;
  height?: number | string;
  width?: number | string;
};

export default function Skeleton({ className = '', height, width }: SkeletonProps) {
  return (
    <span
      className={`${styles.skeleton} ${className}`.trim()}
      aria-hidden="true"
      style={{
        height,
        width,
      }}
    />
  );
}
