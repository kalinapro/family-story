"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import * as exifr from "exifr";
import { groupPhotosIntoEvents } from "@/lib/events";
import { getDuplicateGroups, getPhotoStats, PhotoSort, setStoryParticipation, sortPhotos } from "@/lib/photos";
import { createImageQualityScore, createPerceptualImage } from "@/lib/browser-image";
import { getCandidatePairs, groupSimilarPhotos } from "@/lib/similarity";
import { chooseBestPhoto, getSimilarStats, keepAll, keepOnlySelected, resolveRecommendedPhoto } from "@/lib/curation";

type Photo = { id: string; file: File; fileName: string; url: string; takenAt: Date | null; dateTimeOriginal: Date | null; createDate: Date | null; selectedForStory: boolean; hash?: string; perceptual?: Awaited<ReturnType<typeof createPerceptualImage>>; perceptualError?: string; faceIds: string[]; qualityScore: number | null; similarityGroupId: string | null };
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
function assignSimilarityGroups(photos: Photo[]) {
  const memberships = new Map<string, string>();
  groupSimilarPhotos(photos).forEach((group) => { const id = `series-${group.map((photo) => photo.id).toSorted().join("-")}`; group.forEach((photo) => memberships.set(photo.id, id)); });
  return photos.map((photo) => ({ ...photo, similarityGroupId: memberships.get(photo.id) ?? null }));
}
async function sha256(file: File) { const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

export default function Home() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [view, setView] = useState<View>("all");
  const [sort, setSort] = useState<PhotoSort>("oldest");
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [manualBest, setManualBest] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false); const [reading, setReading] = useState(false); const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const stats = useMemo(() => getPhotoStats(photos), [photos]);
  const duplicates = useMemo(() => getDuplicateGroups(photos), [photos]);
  const similarityPairs = useMemo(() => getCandidatePairs(photos), [photos]);
  const similarGroups = useMemo(() => groupSimilarPhotos(photos, similarityPairs), [photos, similarityPairs]);
  const similarPhotoCount = useMemo(() => new Set(similarGroups.flat().map((photo) => photo.id)).size, [similarGroups]);
  const similarStats = useMemo(() => getSimilarStats(similarGroups), [similarGroups]);
  const displayed = useMemo(() => sortPhotos(view === "excluded" ? photos.filter((p) => !p.selectedForStory) : photos, sort), [photos, sort, view]);
  const undated = photos.filter((photo) => !photo.takenAt && photo.selectedForStory);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.groupCollapsed(`[similarity] analysis: ${photos.length} photos, ${similarityPairs.length} candidate pairs, ${similarGroups.length} groups`);
    for (const photo of photos) console.table({ fileName: photo.fileName, DateTimeOriginal: photo.dateTimeOriginal?.toISOString() ?? null, CreateDate: photo.createDate?.toISOString() ?? null, effectiveCaptureTime: photo.takenAt?.toISOString() ?? null, dHash: photo.perceptual?.hash ?? null, dHashVariants: photo.perceptual?.hashVariants?.length ?? 0, perceptualError: photo.perceptualError ?? null });
    for (const pair of similarityPairs) {
      console.groupCollapsed(`[similarity] ${pair.first.fileName} ↔ ${pair.second.fileName}: similar=${pair.similar}`);
      console.table({
        files: `${pair.first.fileName} ↔ ${pair.second.fileName}`,
        firstExifTime: pair.first.takenAt?.toISOString() ?? null,
        secondExifTime: pair.second.takenAt?.toISOString() ?? null,
        timeDifferenceSeconds: pair.timeDifferenceSeconds,
        firstDHash: pair.first.perceptual?.hash ?? null,
        secondDHash: pair.second.perceptual?.hash ?? null,
        firstHashBits: pair.first.perceptual?.hash.length ?? 0,
        secondHashBits: pair.second.perceptual?.hash.length ?? 0,
        hammingDistance: pair.distance,
        luminanceDistance: pair.luminanceDistance,
        aspectRatio: `${pair.first.perceptual?.aspectRatio ?? "?"} ↔ ${pair.second.perceptual?.aspectRatio ?? "?"}`,
        orientationApplied: `${pair.first.perceptual?.orientationApplied ?? false} ↔ ${pair.second.perceptual?.orientationApplied ?? false}`,
        pixelDataReadable: `${pair.first.perceptual?.pixelDataReadable ?? false} ↔ ${pair.second.perceptual?.pixelDataReadable ?? false}`,
        source: "File pixels decoded by createImageBitmap (object URL and metadata are not hashed)",
        similar: pair.similar,
        rejectionReason: pair.rejectionReason ?? null,
      });
      console.groupEnd();
    }
    console.log("[similarity] resulting groups", similarGroups.map((group) => group.map((photo) => photo.fileName)));
    console.groupEnd();
  }, [photos, similarityPairs, similarGroups]);

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list); const valid = incoming.filter((file) => ACCEPTED_TYPES.has(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name));
    if (!valid.length) { setNotice("Выберите фотографии в формате JPG, JPEG, PNG или WEBP"); return; }
    setNotice(valid.length < incoming.length ? "Некоторые файлы не добавлены: их формат не поддерживается" : ""); setReading(true);
    const loaded = await Promise.all(valid.map(async (file): Promise<Photo> => {
      let takenAt: Date | null = null, dateTimeOriginal: Date | null = null, createDate: Date | null = null;
      try { const data = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]); const asDate = (value: unknown) => { if (!value) return null; const date = value instanceof Date ? value : new Date(value as string); return Number.isNaN(date.getTime()) ? null : date; }; dateTimeOriginal = asDate(data?.DateTimeOriginal); createDate = asDate(data?.CreateDate); takenAt = dateTimeOriginal ?? createDate; } catch { takenAt = null; }
      let hash: string | undefined; try { hash = await sha256(file); } catch { hash = undefined; }
      let perceptual: Photo["perceptual"]; let perceptualError: string | undefined;
      try { perceptual = await createPerceptualImage(file); }
      catch (error) { perceptualError = error instanceof DOMException && error.name === "SecurityError" ? "tainted canvas (SecurityError)" : error instanceof Error ? error.message : "image decode failed"; }
      let qualityScore: number | null = null;
      try { qualityScore = await createImageQualityScore(file); } catch { qualityScore = null; }
      return { id: crypto.randomUUID(), file, fileName: file.name, url: URL.createObjectURL(file), takenAt, dateTimeOriginal, createDate, selectedForStory: true, hash, perceptual, perceptualError, faceIds: [], qualityScore, similarityGroupId: null };
    }));
    setPhotos((current) => { const next = assignSimilarityGroups([...current, ...loaded]); setEvents(makeEvents(next)); return next; }); setReading(false); if (inputRef.current) inputRef.current.value = "";
  }
  function updateParticipation(id: string, selected: boolean) { setPhotos((current) => { const next = setStoryParticipation(current, id, selected); setEvents(makeEvents(next)); return next; }); }
  function excludeDuplicateCopies(group: Photo[]) { const ids = new Set(group.slice(1).map((photo) => photo.id)); setPhotos((current) => { const next = current.map((photo) => ids.has(photo.id) ? { ...photo, selectedForStory: false } : photo); setEvents(makeEvents(next)); return next; }); }
  function applySimilarChoice(group: Photo[], selectedId: string) { setPhotos((current) => { const next = keepOnlySelected(current, group.map((photo) => photo.id), selectedId); setEvents(makeEvents(next)); return next; }); }
  function restoreSimilarGroup(group: Photo[]) { setPhotos((current) => { const next = keepAll(current, group.map((photo) => photo.id)); setEvents(makeEvents(next)); return next; }); }
  function removePhoto(id: string) { if (!window.confirm("Удалить фотографию из текущей коллекции? Это не то же самое, что исключить её из истории.")) return; setPhotos((current) => { const item = current.find((photo) => photo.id === id); if (item) URL.revokeObjectURL(item.url); const next = current.filter((photo) => photo.id !== id); setEvents(makeEvents(next)); return next; }); }
  function clearAll() { if (!window.confirm("Удалить все фотографии из текущей коллекции?")) return; photos.forEach((photo) => URL.revokeObjectURL(photo.url)); setPhotos([]); setEvents([]); setOpenEventId(null); setNotice(""); }
  function renameEvent(id: string, title: string) { setEvents((current) => current.map((event) => event.id === id ? { ...event, title } : event)); }
  function mergeEvent(index: number, direction: -1 | 1) { const other = index + direction; if (other < 0 || other >= events.length) return; const first = Math.min(index, other), second = Math.max(index, other); setEvents((current) => { const combined = bounds([...current[first].photos, ...current[second].photos]); return current.filter((_, i) => i !== first && i !== second).toSpliced(first, 0, { ...current[first], ...combined }); }); setOpenEventId(events[first].id); }
  function splitEvent(eventIndex: number, photoIndex: number) { if (!photoIndex) return; setEvents((current) => { const source = current[eventIndex], left = bounds(source.photos.slice(0, photoIndex)), right = bounds(source.photos.slice(photoIndex)); return current.toSpliced(eventIndex, 1, { ...source, ...left }, { id: crypto.randomUUID(), title: `Событие — ${formatRange(right.start, right.end)}`, ...right }); }); }
  const openIndex = events.findIndex((event) => event.id === openEventId), openEvent = openIndex >= 0 ? events[openIndex] : null;

  const photoCard = (photo: Photo, split?: () => void) => <article className={`photo-card ${photo.selectedForStory ? "" : "excluded"}`} key={photo.id}>
    <div className="image-wrap">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.url} alt={photo.fileName} />{!photo.selectedForStory && <span className="excluded-badge">Исключено</span>}<details className="photo-menu"><summary aria-label={`Действия с ${photo.fileName}`}>•••</summary><div>{photo.selectedForStory ? <button onClick={() => updateParticipation(photo.id, false)}>Исключить из истории</button> : <button onClick={() => updateParticipation(photo.id, true)}>Вернуть в историю</button>}<button className="danger" onClick={() => removePhoto(photo.id)}>Удалить из коллекции</button></div></details></div>
    <div className="photo-info"><h3 title={photo.fileName}>{photo.fileName}</h3><p>{formatSize(photo.file.size)}</p><div className={photo.takenAt ? "date" : "date missing"}><span>◷</span>{photo.takenAt ? formatDate(photo.takenAt) : "Дата съёмки не найдена"}</div>{split && <button className="split-button" onClick={split}>Начать новое событие с этой фотографии</button>}</div>
  </article>;

  return <main><header className="topbar"><a className="brand" href="#top"><span className="brand-mark">С</span><span>Семейная история</span></a><span className="privacy"><span className="privacy-dot" />Фото и их цифровые отпечатки остаются на устройстве</span></header>
    <section className="hero" id="top"><div className="eyebrow"><span>✦</span> Начните сохранять важное</div><h1>Семейная<br /><em>история</em></h1><p>Загрузите фотографии, и мы поможем<br className="desktop-break" /> превратить их в историю</p></section>
    <section className="workspace"><div className={`dropzone ${dragging ? "dragging" : ""}`} onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }} onDrop={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}><div className="upload-icon"><UploadIcon /></div><h2>{reading ? "Читаем даты и ищем точные дубли…" : "Перетащите фотографии сюда"}</h2><p>или выберите их на вашем устройстве</p><button className="primary-button" disabled={reading} onClick={() => inputRef.current?.click()}><UploadIcon /> Выбрать фотографии</button><input ref={inputRef} className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple onChange={(e: ChangeEvent<HTMLInputElement>) => { if (e.target.files) void addFiles(e.target.files); }} /><span className="formats">JPG · JPEG · PNG · WEBP</span></div>{notice && <p className="notice">{notice}</p>}</section>
    {photos.length > 0 && <section className="collection"><div className="view-switch"><button className={view === "all" ? "active" : ""} onClick={() => { setView("all"); setOpenEventId(null); }}>Все фотографии</button><button className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")}>Хронология</button><button className={view === "excluded" ? "active" : ""} onClick={() => setView("excluded")}>Исключённые <b>{stats.excluded}</b></button><button className={view === "duplicates" ? "active" : ""} onClick={() => setView("duplicates")}>Точные дубли <b>{stats.duplicateGroups}</b></button><button className={view === "similar" ? "active" : ""} onClick={() => setView("similar")}>Похожие кадры <b>{similarPhotoCount}</b></button></div>
      <div className="stats stats-curation"><div><strong>{stats.selected}</strong><span>В истории</span></div><div><strong>{stats.excluded}</strong><span>Исключено</span></div><div><strong>{stats.duplicateCopies}</strong><span>Точные дубли</span></div><div><strong>{similarStats.similarPhotos}</strong><span>Похожие кадры</span></div><div><strong>{similarStats.series}</strong><span>Серий</span></div><div><strong>{stats.undated}</strong><span>Без даты</span></div></div>
      {(view === "all" || view === "excluded") && <><div className="collection-heading"><div><span className="section-kicker">{view === "excluded" ? "НЕ УЧАСТВУЮТ В ИСТОРИИ" : "ВАША КОЛЛЕКЦИЯ"}</span><h2>{view === "excluded" ? "Исключённые фотографии" : "Семейные моменты"}</h2></div><div className="actions"><label>Сортировка <select value={sort} onChange={(e) => setSort(e.target.value as PhotoSort)}><option value="oldest">По дате: сначала старые</option><option value="newest">По дате: сначала новые</option><option value="name">По имени файла</option></select></label><button className="clear" onClick={clearAll}>Очистить всё</button></div></div>{displayed.length ? <div className="photo-grid">{displayed.map((photo) => photoCard(photo))}</div> : <div className="empty-state">Здесь пока нет фотографий.</div>}</>}
      {view === "duplicates" && <><div className="collection-heading"><div><span className="section-kicker">СРАВНЕНИЕ СОДЕРЖИМОГО SHA-256</span><h2>Точные дубли</h2></div></div>{duplicates.length ? <div className="duplicate-list">{duplicates.map((group, index) => <section className="duplicate-group" key={group[0].hash}><header><div><h3>Группа {index + 1}</h3><p>{group.length} одинаковых копии. Выберите одну основную — остальные можно исключить, но они останутся в коллекции.</p></div><button onClick={() => excludeDuplicateCopies(group)}>Оставить первую в истории</button></header><div className="photo-grid">{group.map((photo) => photoCard(photo))}</div></section>)}</div> : <div className="empty-state">Точных дублей не найдено.</div>}</>}
      {view === "similar" && <><div className="similar-placeholder"><span>◌</span><h2>Похожие кадры</h2><p>{similarGroups.length ? `Похожие кадры: ${similarPhotoCount} фото · ${similarGroups.length} ${similarGroups.length === 1 ? "серия" : "серии"}. Сравнение выполнено локально.` : "Похожих кадров в пределах пяти минут не найдено."}</p></div>{similarGroups.length > 0 && <div className="duplicate-list similar-list">{similarGroups.map((group, index) => {
        const groupKey = group.map((photo) => photo.id).toSorted().join("-");
        const automatic = chooseBestPhoto(group), recommended = resolveRecommendedPhoto(group, manualBest[groupKey]);
        return <section className="duplicate-group similar-group" key={groupKey}><header><div><h3>Серия {index + 1}</h3><p>{group.length} кадров. Нажмите на фотографию, чтобы выбрать лучший кадр.</p></div><div className="group-actions"><button onClick={() => recommended && applySimilarChoice(group, recommended.id)}>Оставить выбранный, остальные исключить</button><button className="secondary" onClick={() => restoreSimilarGroup(group)}>Оставить все</button></div></header><div className="photo-grid">{group.map((photo) => <button type="button" className={`similar-photo ${recommended?.id === photo.id ? "chosen" : ""}`} aria-pressed={recommended?.id === photo.id} onClick={() => setManualBest((current) => ({ ...current, [groupKey]: photo.id }))} key={photo.id}><div className="similar-image">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.url} alt={photo.fileName} />{automatic?.id === photo.id && <span className="auto-badge">Автовыбор</span>}{recommended?.id === photo.id && <span className="recommend-badge">{manualBest[groupKey] ? "Выбран вами" : "Рекомендуем оставить"}</span>}{!photo.selectedForStory && <span className="excluded-badge">Исключено</span>}</div><div className="similar-info"><strong>{photo.fileName}</strong><span>Качество: {photo.qualityScore ?? "—"}/100</span></div></button>)}</div></section>;
      })}</div>}{process.env.NODE_ENV === "development" && <section className="similarity-debug"><h2>Диагностика похожести</h2><p>10 ближайших пар по Hamming distance</p><ol>{similarityPairs.filter((pair) => pair.distance !== null).toSorted((a, b) => a.distance! - b.distance!).slice(0, 10).map((pair) => <li key={`${pair.first.id}-${pair.second.id}`}><span>{pair.first.fileName} ↔ {pair.second.fileName}</span><strong>{pair.distance}</strong></li>)}</ol>{!similarityPairs.some((pair) => pair.distance !== null) && <p>Нет пар с доступными пикселями и EXIF-временем в пределах 5 минут.</p>}</section>}</>}
      {view === "timeline" && (openEvent ? <div className="event-detail"><button className="back-button" onClick={() => setOpenEventId(null)}>← Назад к хронологии</button><div className="event-detail-heading"><div><span className="section-kicker">СОБЫТИЕ</span><input aria-label="Название события" value={openEvent.title} onChange={(e) => renameEvent(openEvent.id, e.target.value)} /><p>{formatRange(openEvent.start, openEvent.end)} · {openEvent.photos.length} фото</p></div><div className="merge-actions"><button disabled={!openIndex} onClick={() => mergeEvent(openIndex, -1)}>Объединить с предыдущим</button><button disabled={openIndex === events.length - 1} onClick={() => mergeEvent(openIndex, 1)}>Объединить со следующим</button></div></div><div className="photo-grid">{openEvent.photos.map((photo, i) => photoCard(photo, i ? () => splitEvent(openIndex, i) : undefined))}</div></div> : <><div className="collection-heading"><div><span className="section-kicker">СЕМЕЙНАЯ ИСТОРИЯ</span><h2>Хронология</h2></div><div className="actions"><button className="clear" onClick={clearAll}>Очистить всё</button></div></div><div className="timeline">{events.map((event) => <article className="event-card" key={event.id}><div className="event-cover">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={event.photos[0].url} alt="" /></div><div className="event-content"><span className="event-date">{formatRange(event.start, event.end)}</span><h3>{event.title}</h3><p>{event.photos.length} фото</p><div className="event-previews">{event.photos.slice(0, 5).map((photo) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={photo.id} src={photo.url} alt="" />)}</div><button className="primary-button" onClick={() => setOpenEventId(event.id)}>Открыть событие</button></div></article>)}</div>{!events.length && <div className="empty-state">Для хронологии нужны участвующие в истории фотографии с датой.</div>}{undated.length > 0 && <section className="undated"><span className="section-kicker">ОТДЕЛЬНАЯ КОЛЛЕКЦИЯ</span><h2>Фотографии без даты</h2><p>Эти снимки участвуют в истории, но не включены в автоматические события.</p><div className="photo-grid">{undated.map((photo) => photoCard(photo))}</div></section>}</>)}
    </section>}<footer><span>Семейная история</span><p>Сохраняйте моменты. Берегите воспоминания.</p></footer></main>;
}
