export const EVENT_GAP_MS = 6 * 60 * 60 * 1000;

export type DatedPhoto = { takenAt: Date | null };

export type GroupedEvent<T extends DatedPhoto> = {
  photos: T[];
  start: Date;
  end: Date;
  cover: T;
};

/** Groups dated photos chronologically. Undated photos are deliberately omitted. */
export function groupPhotosIntoEvents<T extends DatedPhoto>(photos: T[]): GroupedEvent<T>[] {
  const dated = photos
    .filter((photo): photo is T & { takenAt: Date } => photo.takenAt instanceof Date && !Number.isNaN(photo.takenAt.getTime()))
    .sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());

  const groups: Array<Array<T & { takenAt: Date }>> = [];
  for (const photo of dated) {
    const current = groups.at(-1);
    const previous = current?.at(-1);
    if (!current || !previous || photo.takenAt.getTime() - previous.takenAt.getTime() > EVENT_GAP_MS) {
      groups.push([photo]);
    } else {
      current.push(photo);
    }
  }

  return groups.map((group) => ({
    photos: group,
    start: group[0].takenAt,
    end: group[group.length - 1].takenAt,
    cover: group[0],
  }));
}
