"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import * as exifr from "exifr";
import { groupPhotosIntoEvents } from "@/lib/events";

type Photo = { id: string; file: File; url: string; takenAt: Date | null };
type FamilyEvent = { id: string; title: string; photos: Photo[]; start: Date; end: Date };
type View = "all" | "timeline";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function UploadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></svg>;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
function formatDate(date: Date) { return dateFormatter.format(date); }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function formatRange(start: Date, end: Date) {
  if (sameDay(start, end)) return formatDate(start);
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(end)}`;
  }
  return `${formatDate(start)} — ${formatDate(end)}`;
}
function makeEvents(photos: Photo[]): FamilyEvent[] {
  return groupPhotosIntoEvents(photos).map((group) => ({ id: crypto.randomUUID(), title: `Событие — ${formatRange(group.start, group.end)}`, photos: group.photos, start: group.start, end: group.end }));
}
function bounds(photos: Photo[]) {
  const sorted = [...photos].sort((a, b) => a.takenAt!.getTime() - b.takenAt!.getTime());
  return { photos: sorted, start: sorted[0].takenAt!, end: sorted.at(-1)!.takenAt! };
}

export default function Home() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [view, setView] = useState<View>("all");
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    const valid = incoming.filter((file) => ACCEPTED_TYPES.has(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name));
    if (!valid.length) { setNotice("Выберите фотографии в формате JPG, JPEG, PNG или WEBP"); return; }
    setNotice(valid.length < incoming.length ? "Некоторые файлы не добавлены: их формат не поддерживается" : "");
    setReading(true);
    const loaded = await Promise.all(valid.map(async (file) => {
      let takenAt: Date | null = null;
      try {
        const data = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]);
        const value = data?.DateTimeOriginal ?? data?.CreateDate;
        if (value) takenAt = value instanceof Date ? value : new Date(value);
        if (takenAt && Number.isNaN(takenAt.getTime())) takenAt = null;
      } catch { takenAt = null; }
      return { id: crypto.randomUUID(), file, url: URL.createObjectURL(file), takenAt };
    }));
    setPhotos((current) => { const next = [...current, ...loaded]; setEvents(makeEvents(next)); return next; });
    setReading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const photo = current.find((item) => item.id === id); if (photo) URL.revokeObjectURL(photo.url);
      return current.filter((item) => item.id !== id);
    });
    setEvents((current) => current.flatMap((event) => {
      const remaining = event.photos.filter((photo) => photo.id !== id);
      if (!remaining.length) return [];
      const next = bounds(remaining); return [{ ...event, ...next }];
    }));
  }
  function clearAll() { photos.forEach((photo) => URL.revokeObjectURL(photo.url)); setPhotos([]); setEvents([]); setOpenEventId(null); setNotice(""); }
  function sortPhotos() { setPhotos((current) => [...current].sort((a, b) => !a.takenAt ? 1 : !b.takenAt ? -1 : a.takenAt.getTime() - b.takenAt.getTime())); }
  function renameEvent(id: string, title: string) { setEvents((current) => current.map((event) => event.id === id ? { ...event, title } : event)); }
  function mergeEvent(index: number, direction: -1 | 1) {
    const other = index + direction; if (other < 0 || other >= events.length) return;
    const first = Math.min(index, other); const second = Math.max(index, other);
    setEvents((current) => {
      const combined = bounds([...current[first].photos, ...current[second].photos]);
      const merged = { ...current[first], ...combined };
      return current.filter((_, i) => i !== first && i !== second).toSpliced(first, 0, merged);
    });
    setOpenEventId(events[first].id);
  }
  function splitEvent(eventIndex: number, photoIndex: number) {
    if (photoIndex === 0) return;
    setEvents((current) => {
      const source = current[eventIndex]; const left = bounds(source.photos.slice(0, photoIndex)); const right = bounds(source.photos.slice(photoIndex));
      const created: FamilyEvent = { id: crypto.randomUUID(), title: `Событие — ${formatRange(right.start, right.end)}`, ...right };
      return current.toSpliced(eventIndex, 1, { ...source, ...left }, created);
    });
  }

  const dated = photos.filter((photo) => photo.takenAt).length;
  const undated = photos.filter((photo) => !photo.takenAt);
  const openIndex = events.findIndex((event) => event.id === openEventId);
  const openEvent = openIndex >= 0 ? events[openIndex] : null;

  const photoCard = (photo: Photo, split?: () => void) => <article className="photo-card" key={photo.id}>
    <div className="image-wrap">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.url} alt={photo.file.name} /><button className="remove" type="button" onClick={() => removePhoto(photo.id)} aria-label={`Удалить ${photo.file.name}`}>×</button></div>
    <div className="photo-info"><h3 title={photo.file.name}>{photo.file.name}</h3><p>{formatSize(photo.file.size)}</p><div className={photo.takenAt ? "date" : "date missing"}><span>◷</span>{photo.takenAt ? formatDate(photo.takenAt) : "Дата съёмки не найдена"}</div>{split && <button className="split-button" type="button" onClick={split}>Начать новое событие с этой фотографии</button>}</div>
  </article>;

  return <main>
    <header className="topbar"><a className="brand" href="#top" aria-label="Семейная история — на главную"><span className="brand-mark">С</span><span>Семейная история</span></a><span className="privacy"><span className="privacy-dot" />Ваши фото остаются на устройстве</span></header>
    <section className="hero" id="top"><div className="eyebrow"><span>✦</span> Начните сохранять важное</div><h1>Семейная<br /><em>история</em></h1><p>Загрузите фотографии, и мы поможем<br className="desktop-break" /> превратить их в историю</p></section>
    <section className="workspace" aria-label="Загрузка фотографий"><div className={`dropzone ${dragging ? "dragging" : ""}`} onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }} onDrop={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}><div className="upload-icon"><UploadIcon /></div><h2>{reading ? "Читаем ваши фотографии…" : "Перетащите фотографии сюда"}</h2><p>или выберите их на вашем устройстве</p><button className="primary-button" type="button" disabled={reading} onClick={() => inputRef.current?.click()}><UploadIcon /> Выбрать фотографии</button><input ref={inputRef} className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple onChange={(e: ChangeEvent<HTMLInputElement>) => { if (e.target.files) void addFiles(e.target.files); }} /><span className="formats">JPG · JPEG · PNG · WEBP</span></div>{notice && <p className="notice" role="status">{notice}</p>}</section>
    {photos.length > 0 && <section className="collection" aria-labelledby="collection-title">
      <div className="view-switch" role="group" aria-label="Режим просмотра"><button className={view === "all" ? "active" : ""} onClick={() => { setView("all"); setOpenEventId(null); }}>Все фотографии</button><button className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")}>Хронология</button></div>
      {view === "all" ? <><div className="stats"><div><strong>{photos.length}</strong><span>Загружено<br />фотографий</span></div><div><strong>{dated}</strong><span>С датой<br />съёмки</span></div><div><strong>{undated.length}</strong><span>Без<br />даты</span></div></div><div className="collection-heading"><div><span className="section-kicker">ВАША КОЛЛЕКЦИЯ</span><h2 id="collection-title">Семейные моменты</h2></div><div className="actions"><button type="button" onClick={sortPhotos}><span>↕</span> Сортировать по дате</button><button className="clear" type="button" onClick={clearAll}>Очистить всё</button></div></div><div className="photo-grid">{photos.map((photo) => photoCard(photo))}</div></> :
      openEvent ? <div className="event-detail"><button className="back-button" onClick={() => setOpenEventId(null)}>← Назад к хронологии</button><div className="event-detail-heading"><div><span className="section-kicker">СОБЫТИЕ</span><input aria-label="Название события" value={openEvent.title} onChange={(e) => renameEvent(openEvent.id, e.target.value)} /><p>{formatRange(openEvent.start, openEvent.end)} · {openEvent.photos.length} фото</p></div><div className="merge-actions"><button disabled={openIndex === 0} onClick={() => mergeEvent(openIndex, -1)}>Объединить с предыдущим</button><button disabled={openIndex === events.length - 1} onClick={() => mergeEvent(openIndex, 1)}>Объединить со следующим</button></div></div><div className="photo-grid">{openEvent.photos.map((photo, i) => photoCard(photo, i ? () => splitEvent(openIndex, i) : undefined))}</div></div> :
      <><div className="stats timeline-stats"><div><strong>{events.length}</strong><span>Найдено<br />событий</span></div><div><strong>{dated}</strong><span>Фотографий<br />в событиях</span></div><div><strong>{undated.length}</strong><span>Фотографий<br />без даты</span></div></div><div className="collection-heading"><div><span className="section-kicker">СЕМЕЙНАЯ ИСТОРИЯ</span><h2 id="collection-title">Хронология</h2></div><div className="actions"><button className="clear" type="button" onClick={clearAll}>Очистить всё</button></div></div><div className="timeline">{events.map((event) => <article className="event-card" key={event.id}><div className="event-cover">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={event.photos[0].url} alt="" /></div><div className="event-content"><span className="event-date">{formatRange(event.start, event.end)}</span><h3>{event.title}</h3><p>{event.photos.length} {event.photos.length === 1 ? "фотография" : "фотографий"}</p><div className="event-previews">{event.photos.slice(0, 5).map((photo) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={photo.id} src={photo.url} alt="" />)}</div><button className="primary-button" onClick={() => setOpenEventId(event.id)}>Открыть событие</button></div></article>)}</div>{undated.length > 0 && <section className="undated"><span className="section-kicker">ОТДЕЛЬНАЯ КОЛЛЕКЦИЯ</span><h2>Фотографии без даты</h2><p>Эти снимки не включены в автоматические события.</p><div className="photo-grid">{undated.map((photo) => photoCard(photo))}</div></section>}</>}
    </section>}
    <footer><span>Семейная история</span><p>Сохраняйте моменты. Берегите воспоминания.</p></footer>
  </main>;
}
