import { USER_AVATAR_POSITION, type UserAvatarId } from "./userAvatars";

export function UserAvatarArtwork({
  avatarId,
  className = "",
  label,
}: {
  avatarId: UserAvatarId;
  className?: string;
  portrait?: boolean;
  label?: string;
}) {
  const { column, row } = USER_AVATAR_POSITION[avatarId];
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
          left: "50%",
          top: "50%",
          transform: `translate(${column === 0 ? "-25%" : "-75%"}, ${
            row === 0 ? "-25%" : "-75%"
          })`,
        }}
      />
    </span>
  );
}
