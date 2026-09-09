"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import * as exifr from "exifr";
import { groupPhotosIntoEvents } from "@/lib/events";
import { getDuplicateGroups, getPhotoStats, PhotoSort, setStoryParticipation, sortPhotos } from "@/lib/photos";
import { assignSimilarityGroups, dHashFromGrayscale, getSimilarityGroups, keepAllInGroup, keepOnlySelected, recommendedPhoto, SIMILARITY_HASH_THRESHOLD } from "@/lib/similarity";

type Photo = { id: string; file: File; fileName: string; url: string; takenAt: Date | null; selectedForStory: boolean; hash?: string; perceptualHash?: string; faceIds: string[]; qualityScore: number | null; similarityGroupId: string | null };
type FamilyEvent = { id: string; title: string; photos: Photo[]; start: Date; end: Date };
type View = "all" | "timeline" | "excluded" | "duplicates" | "similar";
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function UploadIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></svg>; }
function formatSize(bytes: number) { return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} КБ` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`; }
const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
function formatDate(date: Date) { return dateFormatter.format(date); }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function formatRange(start: Date, end: Date) { if (sameDay(start, end)) return formatDate(start); return `${formatDate(start)} — ${formatDate(end)}`; }
function makeEvents(photos: Photo[]): FamilyEvent[] { return groupPhotosIntoEvents(photos).map((group) => ({ id: crypto.randomUUID(), title: `Событие — ${formatRange(group.start, group.end)}`, photos: group.photos, start: group.start, end: group.end })); }
function bounds(photos: Photo[]) { const sorted = [...photos].sort((a, b) => a.takenAt!.getTime() - b.takenAt!.getTime()); return { photos: sorted, start: sorted[0].takenAt!, end: sorted.at(-1)!.takenAt! }; }
async function sha256(file: File) { const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function analyzeImage(file: File): Promise<{ perceptualHash?: string; qualityScore: number | null }> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) return { qualityScore: null };
    context.drawImage(bitmap, 0, 0, 64, 64); const data = context.getImageData(0, 0, 64, 64).data;
    const gray = new Float32Array(4096); let luminance = 0;
    for (let i = 0; i < gray.length; i += 1) { gray[i] = .299 * data[i * 4] + .587 * data[i * 4 + 1] + .114 * data[i * 4 + 2]; luminance += gray[i]; }
    let edges = 0; for (let y = 1; y < 63; y += 1) for (let x = 1; x < 63; x += 1) { const i = y * 64 + x; edges += Math.abs(4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - 64] - gray[i + 64]); }
    const small = document.createElement("canvas"); small.width = 9; small.height = 8; const smallContext = small.getContext("2d", { willReadFrequently: true }); if (!smallContext) return { qualityScore: null };
    smallContext.drawImage(bitmap, 0, 0, 9, 8); const pixels = smallContext.getImageData(0, 0, 9, 8).data;
    const grayscale = Array.from({ length: 72 }, (_, i) => .299 * pixels[i * 4] + .587 * pixels[i * 4 + 1] + .114 * pixels[i * 4 + 2]);
    const average = luminance / gray.length, exposure = Math.max(0, 1 - Math.abs(135 - average) / 135), sharpness = Math.min(1, edges / (62 * 62 * 45));
    const qualityScore = Math.round(100 * (.35 * Math.min(1, bitmap.width * bitmap.height / 12_000_000) + .15 * Math.min(1, file.size / 5_000_000) + .35 * sharpness + .15 * exposure));
    return { perceptualHash: dHashFromGrayscale(grayscale), qualityScore };
  } catch { return { qualityScore: null }; } finally { bitmap?.close(); }
}

export default function Home() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [view, setView] = useState<View>("all");
  const [sort, setSort] = useState<PhotoSort>("oldest");
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false); const [reading, setReading] = useState(false); const [notice, setNotice] = useState("");
  const [bestFrames, setBestFrames] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const stats = useMemo(() => getPhotoStats(photos), [photos]);
  const duplicates = useMemo(() => getDuplicateGroups(photos), [photos]);
  const similarGroups = useMemo(() => getSimilarityGroups(photos), [photos]);
  const similarCount = similarGroups.reduce((sum, group) => sum + group.length, 0);
  const displayed = useMemo(() => sortPhotos(view === "excluded" ? photos.filter((p) => !p.selectedForStory) : photos, sort), [photos, sort, view]);
  const undated = photos.filter((photo) => !photo.takenAt && photo.selectedForStory);

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list); const valid = incoming.filter((file) => ACCEPTED_TYPES.has(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name));
    if (!valid.length) { setNotice("Выберите фотографии в формате JPG, JPEG, PNG или WEBP"); return; }
    setNotice(valid.length < incoming.length ? "Некоторые файлы не добавлены: их формат не поддерживается" : ""); setReading(true);
    const loaded: Photo[] = [];
    for (let index = 0; index < valid.length; index += 1) { const file = valid[index];
      let takenAt: Date | null = null;
      try { const data = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]); const value = data?.DateTimeOriginal ?? data?.CreateDate; if (value) takenAt = value instanceof Date ? value : new Date(value); if (takenAt && Number.isNaN(takenAt.getTime())) takenAt = null; } catch { takenAt = null; }
      let hash: string | undefined; try { hash = await sha256(file); } catch { hash = undefined; }
      const analysis = await analyzeImage(file);
      loaded.push({ id: crypto.randomUUID(), file, fileName: file.name, url: URL.createObjectURL(file), takenAt, selectedForStory: true, hash, ...analysis, faceIds: [], similarityGroupId: null });
      if (index % 6 === 5) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    setPhotos((current) => { const next = assignSimilarityGroups([...current, ...loaded]); setEvents(makeEvents(next)); return next; }); setReading(false); if (inputRef.current) inputRef.current.value = "";
  }
  function updateParticipation(id: string, selected: boolean) { setPhotos((current) => { const next = setStoryParticipation(current, id, selected); setEvents(makeEvents(next)); return next; }); }
  function excludeDuplicateCopies(group: Photo[]) { const ids = new Set(group.slice(1).map((photo) => photo.id)); setPhotos((current) => { const next = current.map((photo) => ids.has(photo.id) ? { ...photo, selectedForStory: false } : photo); setEvents(makeEvents(next)); return next; }); }
  function updateSimilarGroup(groupId: string, selectedId?: string) { setPhotos((current) => { const next = selectedId ? keepOnlySelected(current, groupId, selectedId) : keepAllInGroup(current, groupId); setEvents(makeEvents(next)); return next; }); }
  function removePhoto(id: string) { if (!window.confirm("Удалить фотографию из текущей коллекции? Это не то же самое, что исключить её из истории.")) return; setPhotos((current) => { const item = current.find((photo) => photo.id === id); if (item) URL.revokeObjectURL(item.url); const next = current.filter((photo) => photo.id !== id); setEvents(makeEvents(next)); return next; }); }
  function clearAll() { if (!window.confirm("Удалить все фотографии из текущей коллекции?")) return; photos.forEach((photo) => URL.revokeObjectURL(photo.url)); setPhotos([]); setEvents([]); setOpenEventId(null); setNotice(""); }
  function renameEvent(id: string, title: string) { setEvents((current) => current.map((event) => event.id === id ? { ...event, title } : event)); }
  function mergeEvent(index: number, direction: -1 | 1) { const other = index + direction; if (other < 0 || other >= events.length) return; const first = Math.min(index, other), second = Math.max(index, other); setEvents((current) => { const combined = bounds([...current[first].photos, ...current[second].photos]); return current.filter((_, i) => i !== first && i !== second).toSpliced(first, 0, { ...current[first], ...combined }); }); setOpenEventId(events[first].id); }
  function splitEvent(eventIndex: number, photoIndex: number) { if (!photoIndex) return; setEvents((current) => { const source = current[eventIndex], left = bounds(source.photos.slice(0, photoIndex)), right = bounds(source.photos.slice(photoIndex)); return current.toSpliced(eventIndex, 1, { ...source, ...left }, { id: crypto.randomUUID(), title: `Событие — ${formatRange(right.start, right.end)}`, ...right }); }); }
  const openIndex = events.findIndex((event) => event.id === openEventId), openEvent = openIndex >= 0 ? events[openIndex] : null;

  const photoCard = (photo: Photo, split?: () => void) => <article className={`photo-card ${photo.selectedForStory ? "" : "excluded"}`} key={photo.id}>
    <div className="image-wrap">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.url} alt={photo.fileName} />{!photo.selectedForStory && <span className="excluded-badge">Исключено</span>}{photo.similarityGroupId && bestFrames[photo.similarityGroupId] === photo.id && <span className="best-badge">Лучший кадр</span>}<details className="photo-menu"><summary aria-label={`Действия с ${photo.fileName}`}>•••</summary><div>{photo.selectedForStory ? <button onClick={() => updateParticipation(photo.id, false)}>Исключить из истории</button> : <button onClick={() => updateParticipation(photo.id, true)}>Вернуть в историю</button>}<button className="danger" onClick={() => removePhoto(photo.id)}>Удалить из коллекции</button></div></details></div>
    <div className="photo-info"><h3 title={photo.fileName}>{photo.fileName}</h3><p>{formatSize(photo.file.size)}</p><div className={photo.takenAt ? "date" : "date missing"}><span>◷</span>{photo.takenAt ? formatDate(photo.takenAt) : "Дата съёмки не найдена"}</div>{split && <button className="split-button" onClick={split}>Начать новое событие с этой фотографии</button>}</div>
  </article>;

  return <main><header className="topbar"><a className="brand" href="#top"><span className="brand-mark">С</span><span>Семейная история</span></a><span className="privacy"><span className="privacy-dot" />Фото и их цифровые отпечатки остаются на устройстве</span></header>
    <section className="hero" id="top"><div className="eyebrow"><span>✦</span> Начните сохранять важное</div><h1>Семейная<br /><em>история</em></h1><p>Загрузите фотографии, и мы поможем<br className="desktop-break" /> превратить их в историю</p></section>
    <section className="workspace"><div className={`dropzone ${dragging ? "dragging" : ""}`} onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }} onDrop={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}><div className="upload-icon"><UploadIcon /></div><h2>{reading ? "Анализ похожих кадров…" : "Перетащите фотографии сюда"}</h2><p>или выберите их на вашем устройстве</p><button className="primary-button" disabled={reading} onClick={() => inputRef.current?.click()}><UploadIcon /> Выбрать фотографии</button><input ref={inputRef} className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple onChange={(e: ChangeEvent<HTMLInputElement>) => { if (e.target.files) void addFiles(e.target.files); }} /><span className="formats">JPG · JPEG · PNG · WEBP</span></div>{notice && <p className="notice">{notice}</p>}</section>
    {photos.length > 0 && <section className="collection"><div className="view-switch"><button className={view === "all" ? "active" : ""} onClick={() => { setView("all"); setOpenEventId(null); }}>Все фотографии</button><button className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")}>Хронология</button><button className={view === "excluded" ? "active" : ""} onClick={() => setView("excluded")}>Исключённые <b>{stats.excluded}</b></button><button className={view === "duplicates" ? "active" : ""} onClick={() => setView("duplicates")}>Точные дубли <b>{stats.duplicateGroups}</b></button><button className={view === "similar" ? "active" : ""} onClick={() => setView("similar")}>Похожие кадры <b>{similarGroups.length}</b></button></div>
      <div className="stats five"><div><strong>{stats.total}</strong><span>Всего<br />фотографий</span></div><div><strong>{stats.selected}</strong><span>Участвуют<br />в истории</span></div><div><strong>{stats.excluded}</strong><span>Исключено</span></div><div><strong>{stats.duplicateCopies}/{stats.duplicateGroups}</strong><span>Дублей /<br />групп</span></div><div><strong>{stats.undated}</strong><span>Без даты</span></div></div>
      {(view === "all" || view === "excluded") && <><div className="collection-heading"><div><span className="section-kicker">{view === "excluded" ? "НЕ УЧАСТВУЮТ В ИСТОРИИ" : "ВАША КОЛЛЕКЦИЯ"}</span><h2>{view === "excluded" ? "Исключённые фотографии" : "Семейные моменты"}</h2></div><div className="actions"><label>Сортировка <select value={sort} onChange={(e) => setSort(e.target.value as PhotoSort)}><option value="oldest">По дате: сначала старые</option><option value="newest">По дате: сначала новые</option><option value="name">По имени файла</option></select></label><button className="clear" onClick={clearAll}>Очистить всё</button></div></div>{displayed.length ? <div className="photo-grid">{displayed.map((photo) => photoCard(photo))}</div> : <div className="empty-state">Здесь пока нет фотографий.</div>}</>}
      {view === "duplicates" && <><div className="collection-heading"><div><span className="section-kicker">СРАВНЕНИЕ СОДЕРЖИМОГО SHA-256</span><h2>Точные дубли</h2></div></div>{duplicates.length ? <div className="duplicate-list">{duplicates.map((group, index) => <section className="duplicate-group" key={group[0].hash}><header><div><h3>Группа {index + 1}</h3><p>{group.length} одинаковых копии. Выберите одну основную — остальные можно исключить, но они останутся в коллекции.</p></div><button onClick={() => excludeDuplicateCopies(group)}>Оставить первую в истории</button></header><div className="photo-grid">{group.map((photo) => photoCard(photo))}</div></section>)}</div> : <div className="empty-state">Точных дублей не найдено.</div>}</>}
      {view === "similar" && <><div className="collection-heading similar-heading"><div><span className="section-kicker">ЛОКАЛЬНЫЙ АНАЛИЗ · DHASH ≤ {SIMILARITY_HASH_THRESHOLD}</span><h2>Похожие кадры</h2><p>{similarGroups.length} групп · {similarCount} фотографий. Ничего не удаляется автоматически.</p></div></div>{similarGroups.length ? <div className="similar-list">{similarGroups.map((group) => { const groupId = group[0].similarityGroupId!; const recommended = recommendedPhoto(group); const selectedId = bestFrames[groupId] ?? recommended?.id ?? group[0].id; return <section className="similar-group" key={groupId}><header><div><h3>Похожая серия — {group.length} фотографий</h3><p>Выберите лучший кадр. Остальные можно исключить из истории, сохранив в коллекции.</p></div><div className="similar-actions"><button className="secondary-button" onClick={() => updateSimilarGroup(groupId)}>Оставить все</button><button onClick={() => updateSimilarGroup(groupId, selectedId)}>Оставить выбранный, остальные исключить</button></div></header><div className="similar-grid">{group.map((photo) => <label className={`similar-choice ${selectedId === photo.id ? "chosen" : ""}`} key={photo.id}><input type="radio" name={groupId} checked={selectedId === photo.id} onChange={() => setBestFrames((current) => ({ ...current, [groupId]: photo.id }))} />{photoCard(photo)}<span className="choice-caption">{recommended?.id === photo.id && <b>Рекомендуемый кадр</b>}<small>Качество: {photo.qualityScore ?? "—"}/100</small></span></label>)}</div></section>; })}</div> : <div className="similar-placeholder"><span>◌</span><h2>Похожие серии не найдены</h2><p>Мы сравниваем разные снимки, сделанные в пределах 5 минут, а фотографии без даты — только с ближайшими соседями. Точные дубли остаются в отдельном разделе.</p></div>}</>}
      {view === "timeline" && (openEvent ? <div className="event-detail"><button className="back-button" onClick={() => setOpenEventId(null)}>← Назад к хронологии</button><div className="event-detail-heading"><div><span className="section-kicker">СОБЫТИЕ</span><input aria-label="Название события" value={openEvent.title} onChange={(e) => renameEvent(openEvent.id, e.target.value)} /><p>{formatRange(openEvent.start, openEvent.end)} · {openEvent.photos.length} фото</p></div><div className="merge-actions"><button disabled={!openIndex} onClick={() => mergeEvent(openIndex, -1)}>Объединить с предыдущим</button><button disabled={openIndex === events.length - 1} onClick={() => mergeEvent(openIndex, 1)}>Объединить со следующим</button></div></div><div className="photo-grid">{openEvent.photos.map((photo, i) => photoCard(photo, i ? () => splitEvent(openIndex, i) : undefined))}</div></div> : <><div className="collection-heading"><div><span className="section-kicker">СЕМЕЙНАЯ ИСТОРИЯ</span><h2>Хронология</h2></div><div className="actions"><button className="clear" onClick={clearAll}>Очистить всё</button></div></div><div className="timeline">{events.map((event) => <article className="event-card" key={event.id}><div className="event-cover">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={event.photos[0].url} alt="" /></div><div className="event-content"><span className="event-date">{formatRange(event.start, event.end)}</span><h3>{event.title}</h3><p>{event.photos.length} фото</p><div className="event-previews">{event.photos.slice(0, 5).map((photo) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={photo.id} src={photo.url} alt="" />)}</div><button className="primary-button" onClick={() => setOpenEventId(event.id)}>Открыть событие</button></div></article>)}</div>{!events.length && <div className="empty-state">Для хронологии нужны участвующие в истории фотографии с датой.</div>}{undated.length > 0 && <section className="undated"><span className="section-kicker">ОТДЕЛЬНАЯ КОЛЛЕКЦИЯ</span><h2>Фотографии без даты</h2><p>Эти снимки участвуют в истории, но не включены в автоматические события.</p><div className="photo-grid">{undated.map((photo) => photoCard(photo))}</div></section>}</>)}
    </section>}<footer><span>Семейная история</span><p>Сохраняйте моменты. Берегите воспоминания.</p></footer></main>;
}
