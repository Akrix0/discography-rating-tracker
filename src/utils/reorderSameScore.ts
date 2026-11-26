import type { Song } from '../types';

export interface ReorderResult {
  nextList: Song[];
  rating: number;
  orderedIdsForRating: number[];
}

export function canMoveWithinSameRating(
  list: Song[],
  index: number
): { canUp: boolean; canDown: boolean } {
  const cur = list[index];
  if (!cur || cur.rating === null || cur.rating === undefined) {
    return { canUp: false, canDown: false };
  }
  const canUp = index > 0 && list[index - 1]?.rating === cur.rating;
  const canDown = index < list.length - 1 && list[index + 1]?.rating === cur.rating;
  return { canUp, canDown };
}

export function hasAnyTiedRating(list: Song[]): boolean {
  for (let i = 0; i < list.length - 1; i++) {
    const r = list[i]?.rating;
    if (r !== null && r !== undefined && list[i + 1]?.rating === r) {
      return true;
    }
  }
  return false;
}

export function stepMoveWithinSameRating(
  list: Song[],
  index: number,
  dir: -1 | 1
): ReorderResult | null {
  const targetIdx = index + dir;
  if (targetIdx < 0 || targetIdx >= list.length) return null;
  const a = list[index];
  const b = list[targetIdx];
  if (!a || !b || a.rating === null || a.rating === undefined || a.rating !== b.rating) {
    return null;
  }
  const nextList = [...list];
  nextList[index] = b;
  nextList[targetIdx] = a;
  const rating = a.rating;
  const orderedIdsForRating = nextList.filter((s) => s.rating === rating).map((s) => s.id);
  return { nextList, rating, orderedIdsForRating };
}

export function reorderWithinSameRating(
  list: Song[],
  fromId: number,
  toId: number
): ReorderResult | null {
  if (fromId === toId) return null;
  const fromItem = list.find((s) => s.id === fromId);
  const toItem = list.find((s) => s.id === toId);
  if (
    !fromItem ||
    !toItem ||
    fromItem.rating === null ||
    fromItem.rating === undefined ||
    fromItem.rating !== toItem.rating
  ) {
    return null;
  }

  const rating = fromItem.rating;
  const group = list.filter((s) => s.rating === rating);
  const fromGroupIdx = group.findIndex((s) => s.id === fromId);
  const toGroupIdx = group.findIndex((s) => s.id === toId);
  if (fromGroupIdx === -1 || toGroupIdx === -1) return null;

  const reorderedGroup = [...group];
  const [moved] = reorderedGroup.splice(fromGroupIdx, 1);
  reorderedGroup.splice(toGroupIdx, 0, moved);

  let cursor = 0;
  const nextList = list.map((s) => (s.rating === rating ? reorderedGroup[cursor++] : s));
  return {
    nextList,
    rating,
    orderedIdsForRating: reorderedGroup.map((s) => s.id),
  };
}
