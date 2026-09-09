export const FACE_CLUSTER_DISTANCE_THRESHOLD = 0.42;

export type FaceDetection = {
  id: string;
  photoId: string;
  descriptor: number[];
  box: { x: number; y: number; width: number; height: number };
  confidence: number;
};

export type Person = {
  id: string;
  name: string;
  faceDetectionIds: string[];
  photoIds: string[];
  representativePhotoIds: string[];
};

export type CharacterPhoto = {
  id: string;
  selectedForStory: boolean;
  manualExcluded: boolean;
  faceIds: string[];
};

export function euclideanDistance(first: number[], second: number[]): number {
  if (first.length !== second.length) return Number.POSITIVE_INFINITY;
  return Math.sqrt(first.reduce((sum, value, index) => sum + (value - second[index]) ** 2, 0));
}

/** Conservative, order-independent connected-component clustering. */
export function clusterFaceDetections(detections: FaceDetection[], threshold = FACE_CLUSTER_DISTANCE_THRESHOLD): FaceDetection[][] {
  const neighbors = detections.map(() => new Set<number>());
  for (let first = 0; first < detections.length; first += 1) {
    for (let second = first + 1; second < detections.length; second += 1) {
      if (euclideanDistance(detections[first].descriptor, detections[second].descriptor) <= threshold) {
        neighbors[first].add(second); neighbors[second].add(first);
      }
    }
  }
  const visited = new Set<number>(); const groups: FaceDetection[][] = [];
  for (let start = 0; start < detections.length; start += 1) {
    if (visited.has(start)) continue;
    const queue = [start]; const group: FaceDetection[] = []; visited.add(start);
    while (queue.length) { const index = queue.shift()!; group.push(detections[index]); for (const next of neighbors[index]) if (!visited.has(next)) { visited.add(next); queue.push(next); } }
    groups.push(group);
  }
  return groups;
}

export function makePeople(groups: FaceDetection[][]): Person[] {
  return groups.map((group, index) => { const photoIds = [...new Set(group.map((face) => face.photoId))]; return { id: `person-${crypto.randomUUID()}`, name: "", faceDetectionIds: group.map((face) => face.id), photoIds, representativePhotoIds: photoIds.slice(0, 3), }; });
}

export function mergePeople(people: Person[], targetId: string, sourceId: string): Person[] {
  const target = people.find((person) => person.id === targetId), source = people.find((person) => person.id === sourceId);
  if (!target || !source || targetId === sourceId) return people;
  const merged = { ...target, faceDetectionIds: [...new Set([...target.faceDetectionIds, ...source.faceDetectionIds])], photoIds: [...new Set([...target.photoIds, ...source.photoIds])], representativePhotoIds: [...new Set([...target.representativePhotoIds, ...source.representativePhotoIds])].slice(0, 3) };
  return people.filter((person) => person.id !== sourceId).map((person) => person.id === targetId ? merged : person);
}

export function detachFace(people: Person[], personId: string, face: FaceDetection): Person[] {
  return people.flatMap((person) => {
    if (person.id !== personId || !person.faceDetectionIds.includes(face.id)) return [person];
    const remainingFaceIds = person.faceDetectionIds.filter((id) => id !== face.id);
    const remainingPhotoIds = person.photoIds.filter((id) => id !== face.photoId || remainingFaceIds.some((faceId) => faceId !== face.id));
    const updated = { ...person, faceDetectionIds: remainingFaceIds, photoIds: remainingPhotoIds, representativePhotoIds: person.representativePhotoIds.filter((id) => remainingPhotoIds.includes(id)) };
    return [updated, { id: `person-${crypto.randomUUID()}`, name: "", faceDetectionIds: [face.id], photoIds: [face.photoId], representativePhotoIds: [face.photoId] }];
  });
}

export function isPhotoInCurrentStory(photo: CharacterPhoto, selectedPersonIds: string[], people: Person[]): boolean {
  if (photo.manualExcluded || !photo.selectedForStory) return false;
  if (!selectedPersonIds.length) return true;
  const selectedFaces = new Set(people.filter((person) => selectedPersonIds.includes(person.id)).flatMap((person) => person.faceDetectionIds));
  return photo.faceIds.some((faceId) => selectedFaces.has(faceId));
}

export function photosWithoutPeople<T extends { faceIds: string[] }>(photos: T[]): T[] { return photos.filter((photo) => photo.faceIds.length === 0); }
