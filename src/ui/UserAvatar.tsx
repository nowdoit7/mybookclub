import { USER_AVATAR_POSITION, type UserAvatarId } from "./userAvatars";

export function UserAvatarArtwork({
  avatarId,
  className = "",
  portrait = false,
  label,
}: {
  avatarId: UserAvatarId;
  className?: string;
  portrait?: boolean;
  label?: string;
}) {
  const { column, row } = USER_AVATAR_POSITION[avatarId];
  const left = portrait ? (column === 0 ? "-25%" : "-175%") : column === 0 ? "0" : "-100%";

  return (
    <span
      className={`relative block overflow-hidden ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      <img
        src="/portraits/user-avatar-sheet.png"
        alt=""
        className="absolute max-w-none"
        style={{
          height: "200%",
          left,
          top: row === 0 ? "0" : "-100%",
        }}
      />
    </span>
  );
}
