import { useMemo } from 'react';
import type { User, Client, Goal, Theme } from '../../types';
import { Avatar } from '../ui/Avatar';
import { ProgressBar } from '../ui/ProgressBar';
import { FONT_BODY, FONT_HEADING } from '../../constants/config';

interface ClientCoverageMatrixProps {
  users: User[];
  clients: Client[];
  goals: Goal[];
  theme: Theme;
}

export function ClientCoverageMatrix({
  users,
  clients,
  goals,
  theme,
}: ClientCoverageMatrixProps) {
  // Pre-compute per (user, client) aggregates
  const matrix = useMemo(() => {
    return users.map((user) => ({
      user,
      cells: clients.map((client) => {
        const matched = goals.filter(
          (g) =>
            g.owner === user.id && (g.clientIds ?? []).includes(client.id),
        );
        const count = matched.length;
        const avgProgress =
          count > 0
            ? matched.reduce((sum, g) => sum + g.progress, 0) / count
            : 0;
        return { count, avgProgress };
      }),
    }));
  }, [users, clients, goals]);

  if (clients.length === 0) {
    return (
      <div
        style={{
          padding: '32px 0',
          textAlign: 'center',
          color: theme.textMuted,
          fontSize: 13,
          fontFamily: FONT_BODY,
        }}
      >
        No clients configured. Add clients first via the Clients page.
      </div>
    );
  }

  const COL_WIDTH = 120;
  const ROW_LABEL_WIDTH = 140;
  const ROW_HEIGHT = 52;
  const HEADER_HEIGHT = 56;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          borderCollapse: 'collapse',
          minWidth: ROW_LABEL_WIDTH + clients.length * COL_WIDTH,
          width: '100%',
        }}
      >
        <thead>
          <tr>
            {/* Empty top-left cell */}
            <th
              style={{
                width: ROW_LABEL_WIDTH,
                minWidth: ROW_LABEL_WIDTH,
                height: HEADER_HEIGHT,
                background: theme.bgCard,
                borderBottom: `1px solid ${theme.border}`,
                borderRight: `1px solid ${theme.border}`,
                padding: 0,
              }}
            />
            {clients.map((client) => (
              <th
                key={client.id}
                style={{
                  width: COL_WIDTH,
                  minWidth: COL_WIDTH,
                  height: HEADER_HEIGHT,
                  background: theme.bgCard,
                  borderBottom: `1px solid ${theme.border}`,
                  borderRight: `1px solid ${theme.borderLight}`,
                  padding: '6px 10px',
                  textAlign: 'center',
                  verticalAlign: 'middle',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: client.color,
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: theme.text,
                      fontFamily: FONT_HEADING,
                      maxWidth: COL_WIDTH - 16,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={client.name}
                  >
                    {client.name}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map(({ user, cells }) => (
            <tr key={user.id}>
              {/* Row header */}
              <td
                style={{
                  height: ROW_HEIGHT,
                  background: theme.bgCard,
                  borderBottom: `1px solid ${theme.borderLight}`,
                  borderRight: `1px solid ${theme.border}`,
                  padding: '6px 10px',
                  verticalAlign: 'middle',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Avatar user={user} size={20} />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: theme.text,
                      fontFamily: FONT_HEADING,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: ROW_LABEL_WIDTH - 44,
                    }}
                    title={user.name}
                  >
                    {user.name}
                  </span>
                </div>
              </td>

              {cells.map((cell, colIdx) => {
                const client = clients[colIdx];
                const isCovered = cell.count > 0;

                return (
                  <td
                    key={client.id}
                    style={{
                      height: ROW_HEIGHT,
                      background: isCovered
                        ? theme.bgCard
                        : theme.bgMuted,
                      border: isCovered
                        ? `1px solid ${theme.borderLight}`
                        : `1px dashed ${theme.border}`,
                      padding: '6px 10px',
                      verticalAlign: 'middle',
                      textAlign: 'center',
                    }}
                  >
                    {isCovered ? (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: theme.text,
                            fontFamily: FONT_HEADING,
                            lineHeight: 1,
                          }}
                        >
                          {cell.count}
                        </span>
                        <div style={{ width: '100%' }}>
                          <ProgressBar
                            value={cell.avgProgress}
                            height={4}
                            theme={theme}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 9,
                            color: theme.textMuted,
                            fontFamily: FONT_BODY,
                          }}
                        >
                          {Math.round(cell.avgProgress * 100)}%
                        </span>
                      </div>
                    ) : (
                      <span
                        style={{
                          fontSize: 11,
                          color: theme.textFaint,
                          fontFamily: FONT_BODY,
                        }}
                      >
                        —
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
