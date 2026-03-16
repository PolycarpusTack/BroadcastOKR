import { memo } from 'react';
import type { Channel } from '../../types';
import { FONT_MONO } from '../../constants/config';

interface ChannelBadgeProps {
  channel: Channel;
}

export const ChannelBadge = memo(function ChannelBadge({ channel }: ChannelBadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: '10.5px',
        fontWeight: 600,
        fontFamily: FONT_MONO,
        background: channel.color + '18',
        color: channel.color,
        border: `1px solid ${channel.color}4D`,
        whiteSpace: 'nowrap',
      }}
    >
      {channel.icon} {channel.name}
    </span>
  );
});
