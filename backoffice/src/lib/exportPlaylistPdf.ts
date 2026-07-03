import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type PlaylistItemType = 'TRACK' | 'MODERATION_TEXT';
type PresentationType = 'A_CAPELLA' | 'LIVE_PIANO' | 'PLAYBACK';

interface MusicSummary {
  title: string;
  author: string;
  version?: string;
  performer?: string;
  bpm?: number;
  duration?: number;
  key?: string;
  presentation_type?: PresentationType;
}

interface PlaylistItemData {
  type: PlaylistItemType;
  performer?: string;
  music?: MusicSummary;
  moderation_text?: { text: string; author: string; category: string };
}

interface PlaylistLike {
  name: string;
  items: PlaylistItemData[];
}

const PRESENTATION_LABELS: Record<PresentationType, string> = {
  A_CAPELLA: 'A Capella',
  LIVE_PIANO: 'Live Piano',
  PLAYBACK: 'Playback',
};

// Gospel-friends brand teal (sampled from the Programmablauf template)
const TEAL: [number, number, number] = [31, 95, 117];
const LOGO_URL = '/logo-gospelfriends.png';

function formatLength(seconds?: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function resolvePerformer(item: PlaylistItemData): string {
  if (item.type === 'TRACK') {
    return item.performer || item.music?.performer || item.music?.author || '';
  }
  return item.performer || item.moderation_text?.author || '';
}

function totalMinutes(items: PlaylistItemData[]): number {
  const seconds = items
    .filter((i) => i.type === 'TRACK')
    .reduce((sum, i) => sum + (i.music?.duration ?? 0), 0);
  return Math.round(seconds / 60);
}

async function loadLogo(): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const ratio = await new Promise<number>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.width / img.height);
      img.onerror = () => resolve(1.21); // fallback to the known logo aspect ratio
      img.src = dataUrl;
    });
    return { dataUrl, ratio };
  } catch {
    return null;
  }
}

function sanitizeFilename(name: string): string {
  return (name || 'Playlist').replace(/[^\w\d-_äöüÄÖÜß ]+/g, '').trim().replace(/\s+/g, '_');
}

export async function exportPlaylistPdf(playlist: PlaylistLike): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 15;

  // ── Logo (top right) ──
  const logo = await loadLogo();
  if (logo) {
    const logoW = 30;
    const logoH = logoW / logo.ratio;
    doc.addImage(logo.dataUrl, 'PNG', pageWidth - marginX - logoW, 12, logoW, logoH);
  }

  // ── Title ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(TEAL[0], TEAL[1], TEAL[2]);
  doc.text('Programmablauf', marginX, 24);

  // ── Playlist name ──
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(playlist.name || '', marginX, 34);

  // ── Table ──
  let runningNr = 0;
  const body = playlist.items.map((item) => {
    const isPause = item.type === 'MODERATION_TEXT'
      && item.moderation_text?.text?.trim().toLowerCase() === 'pause';
    if (isPause) {
      runningNr = 0; // section break — numbering restarts after a pause
      // Pause row: single cell spanning all columns, white, centered.
      return [
        {
          content: 'Pause',
          colSpan: 8,
          styles: {
            halign: 'center' as const,
            fontStyle: 'bold' as const,
            fillColor: [255, 255, 255] as [number, number, number],
            textColor: [0, 0, 0] as [number, number, number],
          },
        },
      ];
    }
    runningNr += 1;
    if (item.type === 'TRACK') {
      const m = item.music;
      return [
        String(runningNr),
        m?.title ?? '',
        m?.version ?? '',
        resolvePerformer(item),
        m?.presentation_type ? PRESENTATION_LABELS[m.presentation_type] : '',
        m?.bpm != null ? String(m.bpm) : '',
        m?.key ?? '',
        formatLength(m?.duration),
      ];
    }
    const category = item.moderation_text?.category;
    return [
      String(runningNr),
      category ? `Moderation – ${category}` : 'Moderation',
      '',
      resolvePerformer(item),
      '',
      '',
      '',
      '',
    ];
  });

  autoTable(doc, {
    startY: 42,
    head: [['Nr.', 'Titel', 'Version', 'Interpret / Moderator', 'Darbietung', 'BPM', 'Tonart', 'Länge']],
    body,
    margin: { left: marginX, right: marginX },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0] },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineColor: [0, 0, 0], lineWidth: 0.2 },
    // All columns centered (header + body) except Titel, which is left-aligned
    // and wraps onto multiple lines when it doesn't fit on one line.
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 44, halign: 'left', overflow: 'linebreak' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 34, halign: 'center' },
      4: { cellWidth: 24, halign: 'center' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 16, halign: 'center' },
      7: { cellWidth: 16, halign: 'center' },
    },
    // Moderation rows get a light gray background to stand out — but the Pause
    // row stays white (styled inline in the body above).
    didParseCell: (data) => {
      if (data.section === 'body') {
        const item = playlist.items[data.row.index];
        const isPause =
          item?.type === 'MODERATION_TEXT' &&
          item.moderation_text?.text?.trim().toLowerCase() === 'pause';
        if (isPause) return;
        if (item?.type === 'MODERATION_TEXT') {
          data.cell.styles.fillColor = [240, 240, 240];
          data.cell.styles.textColor = [90, 90, 90];
          data.cell.styles.fontStyle = 'italic';
        }
      }
    },
  });

  // ── Total length ──
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(`Gesamtlänge:        ${totalMinutes(playlist.items)} Minuten`, marginX, finalY + 12);

  doc.save(`Programmablauf_${sanitizeFilename(playlist.name)}.pdf`);
}
