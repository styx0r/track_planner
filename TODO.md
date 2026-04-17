# Track Planner – TODO

## 1. Presentation Types
- [x] `PresentationType` Enum ersetzen: `LIVE/STUDIO/REMIX/ACOUSTIC` → `A_CAPELLA/LIVE_PIANO/PLAYBACK`
  - Backend DTO (`music.dto.ts`)
  - GraphQL Schema
  - Backoffice UI (Dropdown mit Labels "A Capella", "Live Piano", "Playback")

## 2. Music Entity – neue Felder
- [x] `performer` (string, default: `"Chor"`)
- [x] `time_signature` (string, z.B. `"4/4"`, `"3/4"`, `"6/8"`, `"2/4"`, `"5/4"`)
- [x] `metronome_default_enabled` (boolean)

## 3. Playlist Entity – neue Felder
- [x] `performer` (string)
- [x] Referenzen auf Moderationstexte (`moderation_text_uids`, Array mit UIDs)

## 4. PlaylistTrack – neue Felder
- [x] `metronome_enabled_override` (`boolean | null` — `null` = Wert aus Music übernehmen)
- [x] `performer_override` (`string | null`)

## 5. Backend: Moderation Library
- [x] Neue Entity `ModerationText` mit Feldern:
  - `uid`, `author`, `creation_date` (frei setzbar), `category`, `text`
- [x] GraphQL Resolver + Service + Schema für ModerationText (CRUD + Duplikation)
- [x] Neue Entity `ModerationCategory`:
  - Built-in: `"Weihnachten"` und `"Ganzjährig"` — nicht löschbar, immer oben
  - Custom: hinzufügbar, löschbar nur wenn keine Texte mehr darauf referenzieren
- [x] GraphQL Resolver + Service für ModerationCategory

## 6. Backoffice: Moderation Library Seite
- [x] Neue Seite `/moderation` im Backoffice + Link auf Startseite
- [x] Tabelle: Kategorie, Author, Datum, Textvorschau
- [x] Erstellen / Bearbeiten / Löschen / Duplizieren
- [x] Kategorie-Dropdown mit:
  - `"Weihnachten"` und `"Ganzjährig"` immer oben, nicht löschbar
  - Custom Kategorien hinzufügbar (+ Button)
  - Custom Kategorien löschbar (Chip mit X, Fehler wenn noch Texte vorhanden)

## 7. Backoffice: Music-Formular erweitern
- [x] `performer` Textfeld (Placeholder/Default: "Chor")
- [x] `time_signature` Dropdown
- [x] `metronome_default_enabled` Toggle (Switch)

## 8. Backoffice: Playlist-Formular erweitern
- [x] `performer` Textfeld
- [x] Moderationstexte zur Playlist hinzufügen (Dropdown + Remove)

## 9. Backoffice: Playlist-Track-Zeile erweitern
- [x] Metronom-Override (ToggleButtonGroup: `inherit` / `on` / `off`)
- [x] Optionaler `performer_override` (Textfeld, leer = aus Music übernehmen)
- [x] Per-Track Accordion (Expand/Collapse für die Override-Felder)

## 10. Playback Service
- [x] Beim Trackstart `metronome_default_enabled` aus der Music-Entity lesen
- [x] Per-Track-Override `metronome_enabled_override` respektieren
- [x] `currentTrackPerformer` und `timeSignature` in PlaybackState mitgeben
- [x] `METRONOME_STATE` nach `PLAYBACK_STARTED` broadcasten

## 11. Metronom: Time Signature Support
- [x] `time_signature` Prop am Metronome-Component
- [x] `beatsPerMeasure` aus Taktart berechnen (Zähler)
- [x] Beat-Visualizer dynamisch anhand `beatsPerMeasure` rendern
- [x] Akzent-Logik (`beat % beatsPerMeasure === 0`) angepasst

## 12. Client: Metronom-State propagieren
- [x] Auto-Enable-Logik in `usePlayback.ts` entfernt
- [x] Server sendet `METRONOME_STATE` nach `PLAYBACK_STARTED` → Client übernimmt den State

## 13. Client: Performer anzeigen
- [x] Performer-Name im `Player`-Component: `currentTrackPerformer` (Fallback: `currentTrackAuthor`)
