import { Link } from 'react-router-dom';
import { Trophy } from '../components/race/Trophy';
import { ErrorNote, PageHeader, Panel } from '../components/ui';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { fmtMs, livery, providerLabel, shortName } from '../lib/livery';

export function ChampionsPage() {
  const board = useAsync(() => api.leaderboard(), [], 5_000);
  const races = useAsync(() => api.races(), [], 5_000);
  const rows = board.data?.rows ?? [];
  const top = rows.slice(0, 3);
  const podiumOrder = [top[1], top[0], top[2]];
  const recent = (races.data?.races ?? []).filter((r) => r.championId).slice(0, 8);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <PageHeader kicker="Hall of fame" title="Championship standings" />
      {board.error && <ErrorNote>{board.error}</ErrorNote>}
      {!rows.length && !board.loading && (
        <Panel>
          <p className="text-white/70">
            No completed races yet.{' '}
            <Link className="text-neon-cyan underline" to="/race">
              Run the first race
            </Link>{' '}
            to start the championship.
          </p>
        </Panel>
      )}

      {top.length > 0 && (
        <div className="mx-auto mb-10 grid max-w-3xl grid-cols-3 items-end gap-3">
          {podiumOrder.map((r, i) => {
            if (!r) return <div key={i} />;
            const lv = livery(r.modelId, r.name);
            const place = i === 1 ? 1 : i === 0 ? 2 : 3;
            return (
              <div key={r.modelId} className="text-center">
                <Trophy className={`mx-auto ${place === 1 ? 'w-20' : 'w-14'}`} color={place === 1 ? '#ffb627' : place === 2 ? '#c9d3ff' : '#e08a4a'} />
                <div className="mt-1 truncate font-display text-xs font-bold md:text-sm" style={{ color: lv.primary }}>
                  {shortName(r.name)}
                </div>
                <div className="text-xs text-white/50">
                  {r.wins} wins · {r.avgScore} avg
                </div>
                <div
                  className={`clip-angle mt-2 flex items-start justify-center pt-2 font-display text-4xl font-black italic ${place === 1 ? 'h-36' : place === 2 ? 'h-24' : 'h-16'}`}
                  style={{ background: `linear-gradient(180deg, ${lv.primary}bb, ${lv.primary}11)` }}
                >
                  {place}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rows.length > 0 && (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="font-display text-[10px] tracking-widest text-white/40">
              <tr>
                <th className="py-2">#</th>
                <th>MODEL</th>
                <th>RACES</th>
                <th>WINS</th>
                <th>WIN %</th>
                <th>PODIUMS</th>
                <th>DNF</th>
                <th>AVG QUALITY</th>
                <th>AVG LATENCY</th>
                <th>BEST</th>
                <th className="text-right">AVG SCORE</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const lv = livery(r.modelId, r.name);
                return (
                  <tr key={r.modelId} className="border-t border-white/5">
                    <td className="py-2 font-display font-black italic">{i + 1}</td>
                    <td>
                      <div className="font-display text-xs font-bold" style={{ color: lv.primary }}>
                        {shortName(r.name)}
                      </div>
                      <div className="text-[11px] text-white/40">{providerLabel(r.provider)}</div>
                    </td>
                    <td className="font-mono">{r.races}</td>
                    <td className="font-mono text-neon-amber">{r.wins}</td>
                    <td className="font-mono">{r.winRate}%</td>
                    <td className="font-mono">{r.podiums}</td>
                    <td className="font-mono text-red-300">{r.dnfs}</td>
                    <td className="font-mono">{r.avgQuality ?? '—'}</td>
                    <td className="font-mono">{fmtMs(r.avgLatencyMs)}</td>
                    <td className="font-mono text-neon-lime">{fmtMs(r.bestLatencyMs)}</td>
                    <td className="text-right font-display font-bold text-neon-cyan">{r.avgScore}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {recent.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 font-display text-lg font-bold tracking-widest">RECENT WINNERS</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {recent.map((r) => {
              const c = r.competitors.find((x) => x.modelId === r.championId)!;
              const lv = livery(c.modelId, c.name);
              return (
                <Link key={r.id} to={`/replays/${r.id}`} className="glass flex items-center gap-3 p-3 hover:bg-white/5" style={{ borderLeft: `4px solid ${lv.primary}` }}>
                  <Trophy className="w-8 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-display text-xs font-bold" style={{ color: lv.primary }}>
                      {shortName(c.name)}
                    </div>
                    <div className="truncate text-sm text-white/60">{r.prompt}</div>
                  </div>
                  <div className="ml-auto shrink-0 text-right font-mono text-xs text-white/50">
                    {c.scores?.total} pts
                    <br />
                    {new Date(r.createdAt).toLocaleDateString()}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
