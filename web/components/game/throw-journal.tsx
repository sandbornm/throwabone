'use client';
import { useState } from 'react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  ReferenceLine,
  ScatterChart,
  Scatter,
} from 'recharts';
import { ArrowUpRight, Activity } from 'lucide-react';
import { SURFACE_INFO, type ThrowRecord } from '@/lib/game/types';
export default function ThrowJournal({
  history,
  onTrace,
  nickname,
}: {
  history: ThrowRecord[];
  onTrace: (r: ThrowRecord) => void;
  nickname: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const current = history.find((r) => r.id === selected) ?? history.at(-1);
  if (!current) return null;
  const same = history.filter(
      (r) =>
        r.surface === current.surface &&
        (r.resetCount !== undefined) === (current.resetCount !== undefined),
    ),
    best = same.reduce((b, r) => (r.down > b.down ? r : b), same[0]),
    surface = SURFACE_INFO.find((s) => s.id === current.surface)!;
  const paths = same.slice(-5);
  if (!paths.includes(current)) {
    paths.shift();
    paths.push(current);
  }

  return (
    <section className="journal" id="throw-journal" aria-label="Throw journal">
      <div className="journal-heading">
        <div>
          <div className="eyebrow">LEARN YOUR THROW</div>
          <h2>{nickname ? `${nickname}’s throws` : 'Your throws'}</h2>
        </div>
        <span className="journal-save">
          Saved on this device · {history.length} / 30 throws
        </span>
      </div>
      <div className="journal-grid">
        <div className="journal-plot">
          <div className="plot-heading">
            <h3>Flight & runout</h3>
            <span>
              {surface.name} · last {paths.length}
            </span>
          </div>
          <ChartContainer
            config={{ height: { label: 'Height', color: '#40efff' } }}
            className="trajectory-chart"
            aria-label="Recorded trajectories: distance from release versus height in metres"
          >
            <LineChart
              margin={{ left: -15, right: 12, top: 20, bottom: 12 }}
              data={current.path.map((p) => ({
                distance: 10.12 - p.z,
                height: Math.max(0, p.y),
              }))}
            >
              <CartesianGrid strokeDasharray="3 5" vertical={false} />
              <XAxis
                type="number"
                dataKey="distance"
                domain={[
                  0,
                  Math.max(12, ...current.path.map((p) => 10.12 - p.z)),
                ]}
                tickFormatter={(v) => `${Number(v).toFixed(0)} m`}
                allowDataOverflow
              />
              <YAxis
                type="number"
                domain={[
                  0,
                  Math.max(
                    1.5,
                    ...paths.flatMap((r) => r.path.map((p) => p.y)),
                  ) + 0.3,
                ]}
                tickFormatter={(v) => `${Number(v).toFixed(1)} m`}
                width={65}
              />
              <ReferenceLine
                x={10.12}
                stroke="#b5c7a1"
                strokeDasharray="4 4"
                label={{
                  value: 'TARGET ROW',
                  fill: '#adbf9d',
                  fontSize: 10,
                  position: 'insideTopLeft',
                }}
              />
              {paths.map((r) => (
                <Line
                  key={r.id}
                  data={r.path.map((p) => ({
                    distance: 10.12 - p.z,
                    height: Math.max(0, p.y),
                  }))}
                  dataKey="height"
                  type="linear"
                  stroke={r.id === current.id ? '#40efff' : '#8ca595'}
                  strokeWidth={r.id === current.id ? 2.5 : 1}
                  strokeOpacity={r.id === current.id ? 1 : 0.4}
                  dot={false}
                  isAnimationActive={false}
                  xAxisId={0}
                />
              ))}
            </LineChart>
          </ChartContainer>
          <div className="plot-caption">
            <span className="orange-dot" />
            Selected throw <span className="muted-dot" />
            Other throws on this surface
          </div>
        </div>
        <div className="landing-plot">
          <div className="plot-heading">
            <h3>Line & landing</h3>
            <button
              aria-label="Show this trajectory on the court"
              className="trace-button"
              onClick={() => onTrace(current)}
            >
              <ArrowUpRight size={16} />
            </button>
          </div>
          <svg
            className="court-diagram"
            viewBox="0 0 240 235"
            role="img"
            aria-label="Top-down recorded throw path and first landing point"
          >
            <rect
              x="32"
              y="20"
              width="176"
              height="191"
              rx="3"
              fill="#26392f"
              stroke="#5b715e"
            />
            <line
              x1="32"
              x2="208"
              y1="33"
              y2="33"
              stroke="#b6c1a2"
              strokeDasharray="4 4"
            />
            <line x1="32" x2="208" y1="195" y2="195" stroke="#b6c1a2" />
            {Array.from({ length: 20 }, (_, i) => (
              <rect
                key={i}
                x={120 + (i - 9.5) * 2.87 - 1.1}
                y="30"
                width="2.2"
                height="5"
                rx=".6"
                fill="#eee1bd"
              />
            ))}
            {[-1, 1].map((x) => (
              <rect
                key={x}
                x={120 + x * 49.5 - 2}
                y="29"
                width="4"
                height="6"
                rx="1"
                fill="#111d17"
                stroke="#9ba68a"
                strokeWidth=".5"
              />
            ))}
            <defs>
              <clipPath id="court-clip">
                <rect x="20" y="10" width="200" height="210" />
              </clipPath>
            </defs>
            <g clipPath="url(#court-clip)">
              <polyline
                points={current.path
                  .map((p) => `${120 + p.x * 48},${33 + p.z * 16}`)
                  .join(' ')}
                fill="none"
                stroke="#40efff"
                strokeWidth="2"
              />
              {current.landing && (
                <circle
                  cx={120 + current.landing.x * 48}
                  cy={33 + current.landing.z * 16}
                  r="4"
                  fill="#40efff"
                  stroke="#fff1dd"
                  strokeWidth="1.5"
                />
              )}
            </g>
            <text
              x="120"
              y="229"
              textAnchor="middle"
              fill="#92ab98"
              fontSize="10"
              letterSpacing="1"
            >
              THROW LINE
            </text>
          </svg>
          <p className="plot-caption">● First ground contact</p>
        </div>
        <div className="journal-insight">
          <div className="section-label">SELECTED THROW</div>
          <div className="result-number">
            {current.down}
            <small> bones down</small>
          </div>
          <div className="result-grid">
            <span>
              Release speed<strong>{current.speed.toFixed(1)} m/s</strong>
            </span>
            <span>
              {current.spinSource === 'hand'
                ? 'Wrist spin estimate'
                : 'Spin setting'}
              <strong>{current.spin.toFixed(1)} rps</strong>
            </span>
            <span>
              Release angle<strong>{current.loft}°</strong>
            </span>
            <span>
              Landing to row
              <strong>
                {current.landing
                  ? `${Math.abs(current.landing.z).toFixed(2)} m ${current.landing.z >= 0 ? 'short' : 'past'}`
                  : 'Off court'}
              </strong>
            </span>
          </div>
          {(current.resetCount ?? 0) > 0 && (
            <p className="journal-penalty">
              {current.resetCount} early soldiers reset; excluded from the
              score.
            </p>
          )}
          <p className="insight-note">
            <Activity size={16} />
            {same.length < 3
              ? 'Try a few throws on the same surface to compare the landing and runout.'
              : `Best on ${surface.name.toLowerCase()}: ${best.down} bones at ${best.spin.toFixed(1)} rps and ${best.loft}°. These are observations from your throws, not an optimum.`}
          </p>
        </div>
      </div>
      <div className="journal-bottom">
        <div className="throw-table-wrap">
          <table className="throw-table">
            <caption>Choose a throw to inspect its path</caption>
            <thead>
              <tr>
                <th>Throw</th>
                <th>Surface</th>
                <th>Power</th>
                <th>Spin</th>
                <th>Down</th>
                <th>
                  <span className="screen-reader-only">Select</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {history
                .slice(-8)
                .reverse()
                .map((r, i) => (
                  <tr
                    key={r.id}
                    className={r.id === current.id ? 'selected' : ''}
                  >
                    <td>#{history.length - i}</td>
                    <td>
                      {SURFACE_INFO.find((s) => s.id === r.surface)?.name}
                    </td>
                    <td>{Math.round(r.power * 100)}%</td>
                    <td>{r.spin.toFixed(1)} rps</td>
                    <td>{r.down}</td>
                    <td>
                      <button
                        className="trace-button"
                        aria-label={`Inspect throw ${history.length - i}`}
                        onClick={() => setSelected(r.id)}
                      >
                        <ArrowUpRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="spin-chart-wrap">
          <div className="plot-heading">
            <h3>Spin & knockdowns</h3>
            <span>{surface.name} only</span>
          </div>
          <ChartContainer
            config={{ down: { label: 'Bones down', color: '#40efff' } }}
            className="spin-chart"
            aria-label="Scatter plot of spin and newly fallen bones"
          >
            <ScatterChart margin={{ left: -15, right: 20, top: 15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 5" />
              <XAxis
                type="number"
                dataKey="spin"
                domain={[0, 5]}
                name="Spin"
                unit=" rps"
              />
              <YAxis
                type="number"
                dataKey="down"
                allowDecimals={false}
                domain={[0, Math.max(2, ...same.map((r) => r.down))]}
                name="Bones down"
                width={45}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Scatter data={same} fill="#ffa079" isAnimationActive={false} />
            </ScatterChart>
          </ChartContainer>
          <p className="plot-caption">
            Each dot is one throw. Aim, power and remaining targets also affect
            the result.
          </p>
        </div>
      </div>
      <p className="calibration-note">
        Practice observations from this simulation. Bone mass and surface
        response still need calibration against measured real throws.
      </p>
    </section>
  );
}
