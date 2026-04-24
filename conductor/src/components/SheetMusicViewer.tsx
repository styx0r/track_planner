'use client';

import { useState, useCallback, useEffect, memo } from 'react';
import styles from './SheetMusicViewer.module.css';

interface SheetMusicViewerProps {
  url: string | null;
  title?: string;
  onClose?: () => void;
  minimal?: boolean; // fit-to-page, no header/hints (conductor mode)
}

export const SheetMusicViewer = memo(function SheetMusicViewer({
  url,
  title,
  onClose,
  minimal = false,
}: SheetMusicViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Reset loading state when URL changes
  useEffect(() => {
    if (url) {
      setIsLoading(true);
      setError(null);
    }
  }, [url]);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setError('Failed to load sheet music');
    setIsLoading(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // Handle escape key for fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  if (!url) {
    return (
      <div className={styles.container}>
        <div className={styles.noSheet}>
          <svg viewBox="0 0 24 24" fill="currentColor" className={styles.noSheetIcon}>
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
          </svg>
          <p>No sheet music available</p>
          <span className={styles.hint}>Upload sheet music in the backoffice</span>
        </div>
      </div>
    );
  }

  const pdfUrl = minimal
    ? `${url}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`
    : `${url}#toolbar=1&navpanes=0&scrollbar=1`;

  return (
    <div className={`${styles.container} ${isFullscreen ? styles.fullscreen : ''}`}>
      {/* Header — hidden in minimal mode */}
      {!minimal && (
        <div className={styles.header}>
          <div className={styles.titleSection}>
            <svg viewBox="0 0 24 24" fill="currentColor" className={styles.titleIcon}>
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
            <h3 className={styles.title}>{title || 'Sheet Music'}</h3>
          </div>
          <div className={styles.headerActions}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.iconBtn}
              title="Open in new tab"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
              </svg>
            </a>
            <button
              className={styles.iconBtn}
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                </svg>
              )}
            </button>
            {onClose && (
              <button className={styles.iconBtn} onClick={onClose} title="Close">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* PDF Viewer */}
      <div className={styles.viewer}>
        {isLoading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            <span>Loading sheet music...</span>
          </div>
        )}

        {error && (
          <div className={styles.error}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span>{error}</span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.fallbackLink}
            >
              Open PDF in new tab
            </a>
          </div>
        )}

        <iframe
          src={pdfUrl}
          className={styles.pdfFrame}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          title={title || 'Sheet Music'}
        />
      </div>

      {/* Hints — hidden in minimal mode */}
      {!minimal && (
        <div className={styles.hints}>
          <span>Use browser controls to navigate pages</span>
          <span>Scroll or pinch to zoom</span>
        </div>
      )}
    </div>
  );
});
