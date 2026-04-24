'use client';

import { useState, useCallback, useEffect } from 'react';
import styles from './ConductorSheetViewer.module.css';

interface Sheet {
  uid: string;
  url: string;
}

interface ConductorSheetViewerProps {
  sheets: Sheet[];
}

export function ConductorSheetViewer({ sheets }: ConductorSheetViewerProps) {
  const [index, setIndex] = useState(0);

  // Reset to first sheet when track changes (sheets array identity changes)
  useEffect(() => {
    setIndex(0);
  }, [sheets]);

  const clampedIndex = Math.min(index, Math.max(0, sheets.length - 1));
  const sheet = sheets[clampedIndex];

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const isLeft = e.clientX - rect.left < rect.width / 2;
      if (isLeft) {
        setIndex(i => Math.max(0, i - 1));
      } else {
        setIndex(i => Math.min(sheets.length - 1, i + 1));
      }
    },
    [sheets.length],
  );

  if (!sheet) {
    return (
      <div className={styles.empty}>
        <svg viewBox="0 0 24 24" fill="currentColor" className={styles.emptyIcon}>
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
        </svg>
        <p>Kein Notenblatt vorhanden</p>
      </div>
    );
  }

  const pdfUrl = `${sheet.url}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`;

  return (
    <div className={styles.root}>
      <iframe
        key={sheet.uid}
        src={pdfUrl}
        className={styles.frame}
        title="Notenblatt"
      />
      {/* Transparent overlay: left half = prev sheet, right half = next sheet */}
      <div className={styles.clickOverlay} onClick={handleClick} />
      {sheets.length > 1 && (
        <div className={styles.pager}>
          {clampedIndex + 1} / {sheets.length}
        </div>
      )}
      {/* Subtle click hints on hover */}
      {sheets.length > 1 && (
        <>
          {clampedIndex > 0 && <div className={styles.hintLeft}>‹</div>}
          {clampedIndex < sheets.length - 1 && <div className={styles.hintRight}>›</div>}
        </>
      )}
    </div>
  );
}
