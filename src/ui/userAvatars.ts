export type UserAvatarId = "reader-1" | "reader-2" | "reader-3" | "reader-4";

export const USER_AVATARS: Array<{ id: UserAvatarId; label: string }> = [
  { id: "reader-1", label: "Reader 1" },
  { id: "reader-2", label: "Reader 2" },
  { id: "reader-3", label: "Reader 3" },
  { id: "reader-4", label: "Reader 4" },
];

export const USER_AVATAR_POSITION: Record<
  UserAvatarId,
  { column: 0 | 1; row: 0 | 1 }
> = {
  "reader-1": { column: 0, row: 0 },
  "reader-2": { column: 1, row: 0 },
  "reader-3": { column: 0, row: 1 },
  "reader-4": { column: 1, row: 1 },
};
