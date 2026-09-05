'use client';
import { useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  MoveDown,
} from 'lucide-react';
import { dragShot, clamp, type ShotSettings } from '@/lib/game/types';
export function ThrowPad({
  shot,
  disabled,
  onChange,
  onThrow,
}: {
  shot: ShotSettings;
  disabled: boolean;
  onChange: (s: ShotSettings) => void;
  onThrow: () => void;
}) {
  const start = useRef<{ x: number; y: number; shot: ShotSettings } | null>(
      null,
    ),
    [dragging, setDragging] = useState(false);
  const cancel = () => {
    if (start.current) {
      onChange(start.current.shot);
      start.current = null;
    }
    setDragging(false);
  };
  return (
    <div className="throw-dock">
      <div
        className="throw-pad"
        tabIndex={0}
        role="application"
        aria-label="Throw pad. Drag sideways to aim and down for power; release to throw. Arrow keys adjust aim and power. Space throws."
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          e.currentTarget.focus({ preventScroll: true });
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = { x: e.clientX, y: e.clientY, shot: { ...shot } };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (start.current && !disabled)
            onChange(
              dragShot(
                start.current.shot,
                e.clientX - start.current.x,
                e.clientY - start.current.y,
                e.currentTarget.clientWidth,
              ),
            );
        }}
        onPointerUp={(e) => {
          if (!start.current) return;
          const moved =
            Math.hypot(
              e.clientX - start.current.x,
              e.clientY - start.current.y,
            ) > 9;
          start.current = null;
          setDragging(false);
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          if (moved && !disabled) onThrow();
        }}
        onPointerCancel={cancel}
        onKeyDown={(e) => {
          if (disabled) return;
          let s = { ...shot };
          if (e.key === 'ArrowLeft') s.aim = clamp(s.aim - 0.025, -1.65, 1.65);
          else if (e.key === 'ArrowRight')
            s.aim = clamp(s.aim + 0.025, -1.65, 1.65);
          else if (e.key === 'ArrowUp')
            s.power = clamp(s.power + 0.01, 0.15, 1);
          else if (e.key === 'ArrowDown')
            s.power = clamp(s.power - 0.01, 0.15, 1);
          else if (e.key === 'Escape') {
            cancel();
            return;
          } else if (e.code === 'Space') {
            e.preventDefault();
            onThrow();
            return;
          } else return;
          e.preventDefault();
          onChange(s);
        }}
        data-dragging={dragging}
        aria-disabled={disabled}
      >
        <div className="pad-horizon" />
        <div className="pad-centre" />
        <div className="pad-rings" aria-hidden="true" />
        <div className="pad-label">
          <span>{dragging ? 'RELEASE TO THROW' : 'PULL BACK. LET FLY.'}</span>
          <small>Sideways to aim · down for power</small>
        </div>
        <svg
          className="pad-tether"
          aria-hidden="true"
          width="100%"
          height="100%"
        >
          <line
            x1="50%"
            y1="20%"
            x2={`${50 + (shot.aim / 1.65) * 36}%`}
            y2={`${32 + shot.power * 48}%`}
            stroke={dragging ? '#ffb28a' : '#92ae9955'}
            strokeWidth="2"
            strokeDasharray={dragging ? '' : '4 6'}
          />
        </svg>
        <div
          className="throw-puck"
          style={{
            left: `${50 + (shot.aim / 1.65) * 36}%`,
            top: `${32 + shot.power * 48}%`,
            boxShadow: `0 0 0 ${5 + shot.power * 14}px ${dragging ? '#fb936b24' : '#ffffff09'}`,
          }}
        >
          <ArrowUpRight size={23} />
        </div>
        <MoveDown className="pad-pull" size={18} />
        <span className="pad-side left">L</span>
        <span className="pad-side right">R</span>
      </div>
      <div className="fine-controls">
        <div className="fine-control">
          <span>
            AIM{' '}
            <strong>
              {Math.abs(shot.aim).toFixed(2)} m {shot.aim < 0 ? 'L' : 'R'}
            </strong>
          </span>
          <div>
            <button
              disabled={disabled}
              aria-label="Aim left"
              onClick={() =>
                onChange({ ...shot, aim: clamp(shot.aim - 0.025, -1.65, 1.65) })
              }
            >
              <ChevronLeft size={14} />
            </button>
            <button
              disabled={disabled}
              aria-label="Aim right"
              onClick={() =>
                onChange({ ...shot, aim: clamp(shot.aim + 0.025, -1.65, 1.65) })
              }
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <div className="fine-control">
          <span>
            POWER <strong>{Math.round(shot.power * 100)}%</strong>
          </span>
          <div>
            <button
              disabled={disabled}
              aria-label="Less power"
              onClick={() =>
                onChange({ ...shot, power: clamp(shot.power - 0.01, 0.15, 1) })
              }
            >
              <Minus size={13} />
            </button>
            <button
              disabled={disabled}
              aria-label="More power"
              onClick={() =>
                onChange({ ...shot, power: clamp(shot.power + 0.01, 0.15, 1) })
              }
            >
              <Plus size={13} />
            </button>
          </div>
        </div>
        <button className="throw-button" disabled={disabled} onClick={onThrow}>
          {disabled ? 'In motion…' : 'Throw bone'}
          <ArrowUpRight size={18} />
        </button>
      </div>
    </div>
  );
}
