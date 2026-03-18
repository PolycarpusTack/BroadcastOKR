import { useState, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { PillBadge } from '../ui/PillBadge';
import { inputStyle, buttonStyle } from '../../styles/formStyles';
import { PRIMARY_COLOR, COLOR_SUCCESS, COLOR_WARNING, COLOR_DANGER, FONT_BODY, FONT_MONO } from '../../constants/config';
import type { Client, GoalTemplate, Theme } from '../../types';

interface MaterializeModalProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  template: GoalTemplate;
  clients: Client[];
  existingClientIds: string[];
  onMaterialize: (clientIds: string[]) => void;
}

export function MaterializeModal({
  open,
  onClose,
  theme,
  template,
  clients,
  existingClientIds,
  onMaterialize,
}: MaterializeModalProps) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Collect all unique tags across clients
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const c of clients) {
      for (const t of c.tags ?? []) tags.add(t);
    }
    return Array.from(tags).sort();
  }, [clients]);

  const existingSet = useMemo(() => new Set(existingClientIds), [existingClientIds]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clients.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (tagFilter && !(c.tags ?? []).includes(tagFilter)) return false;
      return true;
    });
  }, [clients, search, tagFilter]);

  const newSelectable = filtered.filter((c) => !existingSet.has(c.id) && !!c.connectionId);

  const toggle = (id: string) => {
    if (existingSet.has(id) || !filtered.find((c) => c.id === id)?.connectionId) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(newSelectable.map((c) => c.id)));
  };

  const deselectAll = () => setSelectedIds(new Set());

  const handleMaterialize = () => {
    onMaterialize(Array.from(selectedIds));
    setSelectedIds(new Set());
    setSearch('');
    setTagFilter(null);
  };

  const inp = inputStyle(theme);

  return (
    <Modal
      open={open}
      onClose={() => {
        setSelectedIds(new Set());
        setSearch('');
        setTagFilter(null);
        onClose();
      }}
      title={`\u{1F4CB} Materialize: ${template.title}`}
      theme={theme}
      width={560}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT_BODY }}>
        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients..."
          style={inp}
        />

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: theme.textMuted, marginRight: 2 }}>Filter:</span>
            <button
              onClick={() => setTagFilter(null)}
              style={{
                padding: '2px 8px',
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                background: tagFilter === null ? PRIMARY_COLOR : 'transparent',
                color: tagFilter === null ? '#fff' : theme.textSecondary,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setTagFilter(tag === tagFilter ? null : tag)}
                style={{
                  padding: '2px 8px',
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  background: tagFilter === tag ? PRIMARY_COLOR : 'transparent',
                  color: tagFilter === tag ? '#fff' : theme.textSecondary,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Select / Deselect All */}
        {newSelectable.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={selectAll}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: `1px solid ${theme.border}`,
                background: 'transparent',
                color: theme.textSecondary,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: `1px solid ${theme.border}`,
                background: 'transparent',
                color: theme.textSecondary,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Deselect All
            </button>
          </div>
        )}

        {/* Client list */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: theme.textFaint, fontSize: 12 }}>
              No clients match your search.
            </div>
          )}
          {filtered.map((client) => {
            const isExisting = existingSet.has(client.id);
            const isSelected = selectedIds.has(client.id);
            const noConnection = !client.connectionId;
            const isDisabled = isExisting || noConnection;
            const hasOverride =
              client.sqlOverrides?.[template.id] &&
              Object.keys(client.sqlOverrides[template.id]).length > 0;

            return (
              <label
                key={client.id}
                title={noConnection ? 'Configure a database connection for this client first' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: isExisting
                    ? `${COLOR_SUCCESS}10`
                    : isSelected
                    ? `${PRIMARY_COLOR}10`
                    : theme.bgMuted,
                  border: `1px solid ${
                    isExisting
                      ? `${COLOR_SUCCESS}40`
                      : isSelected
                      ? `${PRIMARY_COLOR}40`
                      : theme.borderLight
                  }`,
                  cursor: isDisabled ? 'default' : 'pointer',
                  opacity: isDisabled ? 0.55 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={isExisting || isSelected}
                  disabled={isDisabled}
                  onChange={() => toggle(client.id)}
                  style={{ width: 14, height: 14, accentColor: PRIMARY_COLOR, flexShrink: 0 }}
                />
                {/* Client color dot */}
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: client.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: 12,
                    fontWeight: 600,
                    color: theme.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {client.name}
                </span>
                {!client.connectionId && (
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: FONT_MONO,
                      color: COLOR_WARNING,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    (no connection)
                  </span>
                )}
                {isExisting && (
                  <PillBadge label="active" color={COLOR_SUCCESS} />
                )}
                {hasOverride && (
                  <PillBadge label="\u{1F4DD} override" color={COLOR_WARNING} />
                )}
                {(client.tags ?? []).length > 0 && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(client.tags ?? []).slice(0, 2).map((tag) => (
                      <PillBadge key={tag} label={tag} color={PRIMARY_COLOR} />
                    ))}
                  </div>
                )}
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
          <span style={{ flex: 1, fontSize: 11, color: theme.textMuted }}>
            {selectedIds.size} client{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={handleMaterialize}
            disabled={selectedIds.size === 0}
            style={buttonStyle(PRIMARY_COLOR, selectedIds.size === 0)}
          >
            {'\u{1F4CB}'} Materialize ({selectedIds.size})
          </button>
          <button
            onClick={() => {
              setSelectedIds(new Set());
              setSearch('');
              setTagFilter(null);
              onClose();
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              background: 'transparent',
              color: theme.text,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>

        {clients.length === 0 && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: `${COLOR_DANGER}18`,
              border: `1px solid ${COLOR_DANGER}4D`,
              fontSize: 12,
              color: COLOR_DANGER,
            }}
          >
            No clients configured. Add clients first via the bridge settings.
          </div>
        )}
      </div>
    </Modal>
  );
}
