"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import * as exifr from "exifr";

type Photo = { id: string; file: File; url: string; takenAt: Date | null };

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function UploadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></svg>;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export default function Home() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    const valid = incoming.filter((file) => ACCEPTED_TYPES.has(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name));
    if (!valid.length) {
      setNotice("Выберите фотографии в формате JPG, JPEG, PNG или WEBP");
      return;
    }
    setNotice(valid.length < incoming.length ? "Некоторые файлы не добавлены: их формат не поддерживается" : "");
    setReading(true);
    const loaded = await Promise.all(valid.map(async (file) => {
      let takenAt: Date | null = null;
      try {
        const data = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]);
        const value = data?.DateTimeOriginal ?? data?.CreateDate;
        if (value) takenAt = value instanceof Date ? value : new Date(value);
        if (takenAt && Number.isNaN(takenAt.getTime())) takenAt = null;
      } catch {
        takenAt = null;
      }
      return { id: crypto.randomUUID(), file, url: URL.createObjectURL(file), takenAt };
    }));
    setPhotos((current) => [...current, ...loaded]);
    setReading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void addFiles(event.target.files);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void addFiles(event.dataTransfer.files);
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const photo = current.find((item) => item.id === id);
      if (photo) URL.revokeObjectURL(photo.url);
      return current.filter((item) => item.id !== id);
    });
  }

  function clearAll() {
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    setPhotos([]);
    setNotice("");
  }

  function sortPhotos() {
    setPhotos((current) => [...current].sort((a, b) => {
      if (!a.takenAt && !b.takenAt) return 0;
      if (!a.takenAt) return 1;
      if (!b.takenAt) return -1;
      return a.takenAt.getTime() - b.takenAt.getTime();
    }));
  }

  const dated = photos.filter((photo) => photo.takenAt).length;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Семейная история — на главную"><span className="brand-mark">С</span><span>Семейная история</span></a>
        <span className="privacy"><span className="privacy-dot" />Ваши фото остаются на устройстве</span>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span>✦</span> Начните сохранять важное</div>
        <h1>Семейная<br /><em>история</em></h1>
        <p>Загрузите фотографии, и мы поможем<br className="desktop-break" /> превратить их в историю</p>
      </section>

      <section className="workspace" aria-label="Загрузка фотографий">
        <div
          className={`dropzone ${dragging ? "dragging" : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
          onDrop={onDrop}
        >
          <div className="upload-icon"><UploadIcon /></div>
          <h2>{reading ? "Читаем ваши фотографии…" : "Перетащите фотографии сюда"}</h2>
          <p>или выберите их на вашем устройстве</p>
          <button className="primary-button" type="button" disabled={reading} onClick={() => inputRef.current?.click()}>
            <UploadIcon /> Выбрать фотографии
          </button>
          <input ref={inputRef} className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple onChange={onInput} />
          <span className="formats">JPG · JPEG · PNG · WEBP</span>
        </div>
        {notice && <p className="notice" role="status">{notice}</p>}
      </section>

      {photos.length > 0 && (
        <section className="collection" aria-labelledby="collection-title">
          <div className="stats">
            <div><strong>{photos.length}</strong><span>Загружено<br />фотографий</span></div>
            <div><strong>{dated}</strong><span>С датой<br />съёмки</span></div>
            <div><strong>{photos.length - dated}</strong><span>Без<br />даты</span></div>
          </div>
          <div className="collection-heading">
            <div><span className="section-kicker">ВАША КОЛЛЕКЦИЯ</span><h2 id="collection-title">Семейные моменты</h2></div>
            <div className="actions">
              <button type="button" onClick={sortPhotos}><span>↕</span> Сортировать по дате</button>
              <button className="clear" type="button" onClick={clearAll}>Очистить всё</button>
            </div>
          </div>
          <div className="photo-grid">
            {photos.map((photo) => (
              <article className="photo-card" key={photo.id}>
                <div className="image-wrap">
                  {/* Object URLs are local browser resources and cannot use the Next image optimizer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.file.name} />
                  <button className="remove" type="button" onClick={() => removePhoto(photo.id)} aria-label={`Удалить ${photo.file.name}`}>×</button>
                </div>
                <div className="photo-info">
                  <h3 title={photo.file.name}>{photo.file.name}</h3>
                  <p>{formatSize(photo.file.size)}</p>
                  <div className={photo.takenAt ? "date" : "date missing"}><span>◷</span>{photo.takenAt ? formatDate(photo.takenAt) : "Дата съёмки не найдена"}</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer><span>Семейная история</span><p>Сохраняйте моменты. Берегите воспоминания.</p></footer>
    </main>
  );
}
