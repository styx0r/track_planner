// Same "Name:" speaker-block rendering as the moderator view (moderator/src/app/page.tsx).
import styles from './ModerationBody.module.css';

// Distinct, readable colors on the dark background — assigned per speaker in order of appearance.
const SPEAKER_PALETTE = ['#fbbf24', '#60a5fa', '#4ade80', '#f472b6', '#a78bfa', '#22d3ee', '#fb923c', '#f87171'];

// A line that is exactly "Name:" (letters/spaces/&/./'/- then a colon, nothing after) starts a speaker block.
const SPEAKER_LINE = /^\s*([\p{L}][\p{L} .&'-]{0,29}):\s*$/u;

interface ModerationBlock {
  speaker: string | null;
  text: string;
}

function parseModerationBlocks(raw: string): ModerationBlock[] {
  const blocks: ModerationBlock[] = [];
  let current: ModerationBlock | null = null;
  for (const line of raw.split('\n')) {
    const match = line.match(SPEAKER_LINE);
    if (match) {
      current = { speaker: match[1].trim(), text: '' };
      blocks.push(current);
    } else {
      if (!current) {
        current = { speaker: null, text: '' };
        blocks.push(current);
      }
      current.text += (current.text ? '\n' : '') + line;
    }
  }
  return blocks;
}

export function ModerationBody({ text }: { text: string }) {
  const blocks = parseModerationBlocks(text);
  const hasSpeakers = blocks.some((b) => b.speaker);

  // No "Name:" structure → render plainly (preserves the existing pre-wrap behaviour).
  if (!hasSpeakers) return <>{text}</>;

  const colors = new Map<string, string>();
  for (const b of blocks) {
    const key = b.speaker?.toLowerCase();
    if (key && !colors.has(key)) colors.set(key, SPEAKER_PALETTE[colors.size % SPEAKER_PALETTE.length]);
  }

  return (
    <>
      {blocks.map((b, i) => {
        if (!b.speaker) {
          return b.text.trim() ? (
            <div key={i} className={styles.speakerText}>{b.text.trim()}</div>
          ) : null;
        }
        const color = colors.get(b.speaker.toLowerCase())!;
        return (
          <div
            key={i}
            className={styles.speakerBlock}
            style={{ borderLeftColor: color, background: `${color}1a` }}
          >
            <div className={styles.speakerName} style={{ color }}>{b.speaker}</div>
            <div className={styles.speakerText}>{b.text.trim()}</div>
          </div>
        );
      })}
    </>
  );
}
