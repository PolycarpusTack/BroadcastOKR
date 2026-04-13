import { useState, useMemo, useRef, useEffect } from 'react';
import type { Theme, Client, ScopedChannelRef } from '../../types';
import { PRIMARY_COLOR, COLOR_DANGER } from '../../constants/config';
import { isScopedChannelSelected, pruneScopedChannels, scopedChannelKey } from '../../utils/channelScope';

export interface GoalFormChannelScopeProps {
  theme: Theme;
  selectStyle: React.CSSProperties;
  clients: Client[];
  selectedClientIds: string[];
  setSelectedClientIds: (ids: string[]) => void;
  channelScopeType: 'all' | 'selected';
  setChannelScopeType: (type: 'all' | 'selected') => void;
  selectedChannels: ScopedChannelRef[];
  setSelectedChannels: (channels: ScopedChannelRef[]) => void;
}

export function GoalFormChannelScope({
  theme,
  selectStyle: _selectStyle,
  clients,
  selectedClientIds,
  setSelectedClientIds,
  channelScopeType,
  setChannelScopeType,
  selectedChannels,
  setSelectedChannels,
}: GoalFormChannelScopeProps) {
  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.borderInput}`, background: theme.bgInput, color: theme.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { fontSize: 12, fontWeight: 600 as const, color: theme.textMuted, display: 'block' as const, marginBottom: 4 };

  const clientsSelected = selectedClientIds.length > 0;

  // ── Client multi-select state ──
  const [clientDropOpen, setClientDropOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const clientDropRef = useRef<HTMLDivElement>(null);

  // ── Channel scope state ──
  const [channelSearch, setChannelSearch] = useState('');

  // Close client dropdown on outside click
  useEffect(() => {
    if (!clientDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (clientDropRef.current && !clientDropRef.current.contains(e.target as Node)) {
        setClientDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [clientDropOpen]);

  const toggleClient = (id: string) => {
    if (selectedClientIds.includes(id)) {
      const nextClientIds = selectedClientIds.filter((c) => c !== id);
      setSelectedClientIds(nextClientIds);
      setSelectedChannels(pruneScopedChannels(selectedChannels, nextClientIds));
    } else {
      setSelectedClientIds([...selectedClientIds, id]);
    }
  };

  const removeClient = (id: string) => {
    const nextClientIds = selectedClientIds.filter((c) => c !== id);
    setSelectedClientIds(nextClientIds);
    setSelectedChannels(pruneScopedChannels(selectedChannels, nextClientIds));
  };

  const filteredClients = useMemo(
    () => clients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase())),
    [clients, clientSearch],
  );

  // Channels from selected clients (grouped)
  const selectedClientsData = useMemo(
    () => clients.filter((c) => selectedClientIds.includes(c.id)),
    [clients, selectedClientIds],
  );

  const allScopedChannels = useMemo(
    () => selectedClientsData.flatMap((c) => (c.channels || []).map((ch) => ({ ...ch, clientId: c.id, clientName: c.name, clientColor: c.color }))),
    [selectedClientsData],
  );

  const filteredScopedChannels = useMemo(
    () => allScopedChannels.filter((ch) => ch.name.toLowerCase().includes(channelSearch.toLowerCase())),
    [allScopedChannels, channelSearch],
  );

  const toggleChannel = (clientId: string, channelId: string) => {
    const candidate = { clientId, channelId };
    const key = scopedChannelKey(candidate);
    if (selectedChannels.some((channel) => scopedChannelKey(channel) === key)) {
      setSelectedChannels(selectedChannels.filter((channel) => scopedChannelKey(channel) !== key));
    } else {
      setSelectedChannels([...selectedChannels, candidate]);
    }
  };

  const selectAllChannels = () => {
    setSelectedChannels(
      filteredScopedChannels.map((channel) => ({
        clientId: channel.clientId,
        channelId: channel.id,
      })),
    );
  };

  const deselectAllChannels = () => {
    setSelectedChannels([]);
  };

  useEffect(() => {
    const allowedKeys = new Set(
      allScopedChannels.map((channel) => scopedChannelKey({ clientId: channel.clientId, channelId: channel.id })),
    );
    const nextSelected = selectedChannels.filter((channel) => allowedKeys.has(scopedChannelKey(channel)));
    if (nextSelected.length !== selectedChannels.length) {
      setSelectedChannels(nextSelected);
    }
  }, [allScopedChannels, selectedChannels, setSelectedChannels]);

  const selectedChannelCount = selectedChannels.length;
  const totalChannelCount = allScopedChannels.length;

  return (
    <>
      {/* Client multi-select */}
      <div>
        <label style={labelStyle}>Clients</label>
        <div ref={clientDropRef} style={{ position: 'relative' }}>
          {/* Trigger area */}
          <div
            onClick={() => setClientDropOpen((o) => !o)}
            style={{
              minHeight: 42,
              padding: '6px 10px',
              borderRadius: 8,
              border: `1px solid ${clientDropOpen ? PRIMARY_COLOR : theme.borderInput}`,
              background: theme.bgInput,
              cursor: 'pointer',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              alignItems: 'center',
            }}
          >
            {selectedClientIds.length === 0 ? (
              <span style={{ fontSize: 12, color: theme.textFaint }}>No clients selected (optional)</span>
            ) : (
              selectedClientsData.map((c) => (
                <span
                  key={c.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 6px',
                    borderRadius: 10,
                    background: c.color + '22',
                    border: `1px solid ${c.color}55`,
                    fontSize: 11,
                    color: theme.text,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                  {c.name}
                  <span
                    onClick={(e) => { e.stopPropagation(); removeClient(c.id); }}
                    style={{ cursor: 'pointer', color: theme.textFaint, fontSize: 12, lineHeight: 1, marginLeft: 2 }}
                  >
                    ×
                  </span>
                </span>
              ))
            )}
            <span style={{ marginLeft: 'auto', color: theme.textFaint, fontSize: 12 }}>{clientDropOpen ? '▲' : '▼'}</span>
          </div>

          {/* Dropdown */}
          {clientDropOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 50,
                marginTop: 4,
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: theme.bgCard,
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '8px 10px', borderBottom: `1px solid ${theme.borderLight}` }}>
                <input
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Search clients..."
                  autoFocus
                  style={{ ...inputStyle, padding: '6px 10px', fontSize: 12 }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {filteredClients.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: 12, color: theme.textFaint }}>No clients found</div>
                ) : (
                  filteredClients.map((c) => (
                    <label
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        cursor: 'pointer',
                        background: selectedClientIds.includes(c.id) ? PRIMARY_COLOR + '12' : 'transparent',
                        fontSize: 12,
                        color: theme.text,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedClientIds.includes(c.id)}
                        onChange={() => toggleClient(c.id)}
                        style={{ accentColor: PRIMARY_COLOR, width: 14, height: 14 }}
                      />
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{c.name}</span>
                      <span style={{ fontSize: 10, color: theme.textFaint }}>{(c.channels || []).length} ch</span>
                    </label>
                  ))
                )}
              </div>
              <div style={{ padding: '6px 12px', borderTop: `1px solid ${theme.borderLight}`, textAlign: 'right' }}>
                <button
                  onClick={() => setClientDropOpen(false)}
                  style={{ background: 'none', border: 'none', fontSize: 11, color: PRIMARY_COLOR, cursor: 'pointer', fontWeight: 600, padding: 0 }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Channel scope radio buttons — only when clients are selected */}
      {clientsSelected && (
        <div>
          <label style={labelStyle}>Channels</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              onClick={() => setChannelScopeType('all')}
              style={{
                flex: 1,
                padding: '8px 6px',
                borderRadius: 6,
                border: `1px solid ${channelScopeType === 'all' ? PRIMARY_COLOR : theme.border}`,
                background: channelScopeType === 'all' ? PRIMARY_COLOR + '18' : 'transparent',
                color: channelScopeType === 'all' ? PRIMARY_COLOR : theme.textMuted,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              All Channels
            </button>
            <button
              type="button"
              onClick={() => setChannelScopeType('selected')}
              style={{
                flex: 1,
                padding: '8px 6px',
                borderRadius: 6,
                border: `1px solid ${channelScopeType === 'selected' ? PRIMARY_COLOR : theme.border}`,
                background: channelScopeType === 'selected' ? PRIMARY_COLOR + '18' : 'transparent',
                color: channelScopeType === 'selected' ? PRIMARY_COLOR : theme.textMuted,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Select
            </button>
          </div>
        </div>
      )}

      {/* Channel picker — only when clients selected AND scope = 'selected' */}
      {clientsSelected && channelScopeType === 'selected' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={labelStyle}>Select Channels</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: theme.textFaint }}>
                {selectedChannelCount} of {totalChannelCount} selected
              </span>
              <button
                onClick={selectAllChannels}
                style={{ background: 'none', border: 'none', fontSize: 10, color: PRIMARY_COLOR, cursor: 'pointer', fontWeight: 600, padding: 0 }}
              >
                All
              </button>
              <span style={{ fontSize: 10, color: theme.textFaint }}>·</span>
              <button
                onClick={deselectAllChannels}
                style={{ background: 'none', border: 'none', fontSize: 10, color: theme.textFaint, cursor: 'pointer', padding: 0 }}
              >
                None
              </button>
            </div>
          </div>
          <div style={{ marginBottom: 6 }}>
            <input
              value={channelSearch}
              onChange={(e) => setChannelSearch(e.target.value)}
              placeholder="Search channels..."
              style={{ ...inputStyle, padding: '7px 10px', fontSize: 12 }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', borderRadius: 8, border: `1px solid ${theme.borderLight}`, background: theme.bgMuted }}>
            {selectedClientsData.map((client) => {
              const clientChannels = (client.channels || []).filter((ch) =>
                ch.name.toLowerCase().includes(channelSearch.toLowerCase()),
              );
              if (clientChannels.length === 0) return null;
              return (
                <div key={client.id}>
                  {/* Group header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    background: theme.bgInput,
                    borderBottom: `1px solid ${theme.borderLight}`,
                    fontSize: 11,
                    fontWeight: 700,
                    color: theme.textMuted,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
                    {client.name}
                  </div>
                  {clientChannels.map((ch) => (
                    <label
                      key={ch.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '7px 12px 7px 20px',
                        cursor: 'pointer',
                        background: isScopedChannelSelected(selectedChannels, client.id, ch.id) ? PRIMARY_COLOR + '10' : 'transparent',
                        borderBottom: `1px solid ${theme.borderLight}`,
                        fontSize: 12,
                        color: theme.text,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isScopedChannelSelected(selectedChannels, client.id, ch.id)}
                        onChange={() => toggleChannel(client.id, ch.id)}
                        style={{ accentColor: PRIMARY_COLOR, width: 13, height: 13 }}
                      />
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: ch.color ?? client.color,
                        flexShrink: 0,
                      }} />
                      <span style={{ flex: 1 }}>{ch.name}</span>
                      {ch.channelKind && (
                        <span style={{ fontSize: 10, color: theme.textFaint }}>{ch.channelKind}</span>
                      )}
                    </label>
                  ))}
                </div>
              );
            })}
            {filteredScopedChannels.length === 0 && (
              <div style={{ padding: '12px', fontSize: 12, color: theme.textFaint, textAlign: 'center' }}>No channels match</div>
            )}
          </div>
          {channelScopeType === 'selected' && selectedChannelCount === 0 && (
            <div style={{ fontSize: 11, color: COLOR_DANGER, marginTop: 4 }}>Select at least one channel</div>
          )}
        </div>
      )}
    </>
  );
}
