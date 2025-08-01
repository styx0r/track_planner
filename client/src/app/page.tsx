import styles from './page.module.css';
import { SharedUiButton } from '@track-planner/shared-ui';

export default function Index() {
  return (
    <div className={styles.page}>
      <h1>Client Application</h1>
      <p>This is the client application. Here is a button from the shared UI library:</p>
      <SharedUiButton />
    </div>
  );
}
