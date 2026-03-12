import type { User } from '../../types';

interface AvatarProps {
  user: User;
  size?: number;
}

export function Avatar({ user, size = 32 }: AvatarProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: user.color,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {user.av}
    </div>
  );
}
