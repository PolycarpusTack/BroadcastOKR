import { CHANNEL_PALETTE } from '../constants/channels';
import type { ChannelScope, Client, ScopedChannelRef } from '../types';

/** Channels as the bridge returns them get a palette colour by position. */
export function assignChannelColors<T extends object>(channels: T[]): Array<T & { color: string }> {
  return channels.map((ch, i) => ({ ...ch, color: CHANNEL_PALETTE[i % CHANNEL_PALETTE.length] }));
}

export function scopedChannelKey(channel: ScopedChannelRef) {
  return `${channel.clientId}::${channel.channelId}`;
}

export function isScopedChannelSelected(
  channels: ScopedChannelRef[],
  clientId: string,
  channelId: string,
) {
  const key = scopedChannelKey({ clientId, channelId });
  return channels.some((channel) => scopedChannelKey(channel) === key);
}

export function pruneScopedChannels(channels: ScopedChannelRef[], clientIds: string[]) {
  return channels.filter((channel) => clientIds.includes(channel.clientId));
}

export function resolveScopedChannels(
  scope: Extract<ChannelScope, { type: 'selected' }> | undefined,
  clients: Client[],
) {
  if (!scope) return [];

  return scope.channels.flatMap((scopedChannel) => {
    const client = clients.find((item) => item.id === scopedChannel.clientId);
    const channel = client?.channels.find((item) => item.id === scopedChannel.channelId);
    if (!client || !channel) return [];

    return [{
      key: scopedChannelKey(scopedChannel),
      label: `${client.name}: ${channel.name}`,
      color: channel.color ?? client.color,
    }];
  });
}
