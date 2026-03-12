import type { Channel } from '../../types';

interface ChannelBadgeProps {
  channel: Channel;
}

export function ChannelBadge({ channel }: ChannelBadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        background: channel.color + '18',
        color: channel.color,
        whiteSpace: 'nowrap',
      }}
    >
      {channel.icon} {channel.name}
    </span>
  );
}
