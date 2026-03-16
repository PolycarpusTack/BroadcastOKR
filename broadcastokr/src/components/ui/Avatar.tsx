import { memo } from 'react';
import type { User } from '../../types';
import { FONT_BODY, COLOR_SIDEBAR_BORDER } from '../../constants/config';

interface AvatarProps {
  user: User;
  size?: number;
}

export const Avatar = memo(function Avatar({ user, size = 32 }: AvatarProps) {
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
        fontFamily: FONT_BODY,
        border: `2px solid ${COLOR_SIDEBAR_BORDER}`,
        flexShrink: 0,
      }}
    >
      {user.av}
    </div>
  );
});
