import Link from 'next/link';
import styles from './page.module.css';

export default function Index() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.glow} />
        
        <h1 className={styles.title}>
          <span className={styles.titleLine}>Track</span>
          <span className={styles.titleLine}>Planner</span>
        </h1>
        
        <p className={styles.subtitle}>
          Remote playback controller with synchronized metronome
        </p>

        <div className={styles.features}>
          <div className={styles.feature}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
            </svg>
            <span>Playlist Management</span>
          </div>
          <div className={styles.feature}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
            <span>Server-side Playback</span>
          </div>
          <div className={styles.feature}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
            </svg>
            <span>Time Synchronized</span>
          </div>
          <div className={styles.feature}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
            </svg>
            <span>Visual Metronome</span>
          </div>
        </div>

        <Link href="/playlists" className={styles.cta}>
          <span>Open Controller</span>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
          </svg>
        </Link>
      </div>

      <div className={styles.decorLine} />
    </div>
  );
}
