'use client';
import { Hand, Move, ScanLine } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ReactNode } from 'react';
import type { Drill, MotionMode, TennisSettings } from './types';

export function Range({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.05,
  display,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  display: string;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <div className="tn-range">
      <div>
        <span>{label}</span>
        <output>{display}</output>
      </div>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(value) =>
          onChange(Array.isArray(value) ? value[0] : value)
        }
      />
      {hint && <p>{hint}</p>}
    </div>
  );
}
function Toggle({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="tn-toggle">
      <label>
        <span>{label}</span>
        <Switch checked={value} onCheckedChange={onChange} aria-label={label} />
      </label>
      {hint && <p>{hint}</p>}
    </div>
  );
}
const MODES: {
  id: MotionMode;
  title: string;
  description: string;
  icon: ReactNode;
}[] = [
  {
    id: 'swat',
    title: 'Hand swat',
    description: 'Just your hand. No elbow or shoulder needed.',
    icon: <Hand size={20} />,
  },
  {
    id: 'arm',
    title: 'Full swing',
    description: 'Shoulder, elbow and wrist together.',
    icon: <ScanLine size={20} />,
  },
  {
    id: 'dual',
    title: 'Two-hand control',
    description: 'Off hand positions. Playing hand swings.',
    icon: <Move size={20} />,
  },
];
export function TennisSettingsPanel({
  settings,
  onChange,
  camera,
}: {
  settings: TennisSettings;
  onChange: (settings: TennisSettings) => void;
  camera: ReactNode;
}) {
  const change = <K extends keyof TennisSettings>(
    key: K,
    value: TennisSettings[K],
  ) => onChange({ ...settings, [key]: value });
  return (
    <>
      <Tabs defaultValue="motion" className="tn-settings-tabs">
        <TabsList aria-label="Practice settings">
          <TabsTrigger value="motion">Motion</TabsTrigger>
          <TabsTrigger value="ball">Ball & spin</TabsTrigger>
          <TabsTrigger value="session">Session</TabsTrigger>
        </TabsList>
        <TabsContent value="motion" keepMounted>
          <RadioGroup
            value={settings.mode}
            onValueChange={(value) =>
              onChange({
                ...settings,
                mode: value as MotionMode,
                assistPlacement: value !== 'dual',
              })
            }
            aria-label="Motion style"
            className="tn-motion-options"
          >
            {MODES.map((mode) => (
              <label
                key={mode.id}
                className={`tn-motion-option ${settings.mode === mode.id ? 'active' : ''}`}
              >
                <span className="tn-mode-icon">{mode.icon}</span>
                <span>
                  <strong>{mode.title}</strong>
                  <small>{mode.description}</small>
                </span>
                <RadioGroupItem value={mode.id} aria-label={mode.title} />
              </label>
            ))}
          </RadioGroup>
          <div className="tn-hand-choice">
            <span>Playing hand</span>
            <RadioGroup
              value={settings.hand}
              onValueChange={(value) =>
                change('hand', value as 'left' | 'right')
              }
              aria-label="Playing hand"
            >
              {(['left', 'right'] as const).map((hand) => (
                <label key={hand}>
                  <RadioGroupItem value={hand} aria-label={hand} />
                  <span>{hand === 'left' ? 'Left' : 'Right'}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
          {camera}
          <Range
            label="Motion sensitivity"
            value={settings.sensitivity}
            min={0.5}
            max={2.5}
            display={`${settings.sensitivity.toFixed(1)}×`}
            onChange={(v) => change('sensitivity', v)}
            hint="Higher values respond to smaller movements."
          />
          <details className="tn-details">
            <summary>Fine-tune tracking</summary>
            <Range
              label="Smoothing"
              value={settings.smoothing}
              display={`${Math.round(settings.smoothing * 100)}%`}
              onChange={(v) => change('smoothing', v)}
              hint="Less smoothing responds faster; more reduces jitter."
            />
            <Toggle
              label="Help reach the ball"
              value={settings.assistPlacement}
              onChange={(v) => change('assistPlacement', v)}
              hint="Extends reach during a swing. Your hand always moves the racket."
            />
            <Range
              label="Grip angle"
              value={settings.gripAngle}
              min={-0.3}
              max={0.9}
              step={0.05}
              display={`${Math.round((settings.gripAngle * 180) / Math.PI)}°`}
              onChange={(v) => change('gripAngle', v)}
              hint="Adjust the handle angle. The string bed stays on the contact point."
            />
            <Toggle
              label="Wrist spin estimate"
              value={settings.wristSpin}
              onChange={(v) => change('wristSpin', v)}
              hint="Uses palm rotation when fingers are visible. Brush direction also adds spin."
            />
            <Range
              label="Gesture spin gain"
              value={settings.spinGain}
              min={0}
              max={2}
              display={`${settings.spinGain.toFixed(1)}×`}
              onChange={(v) => change('spinGain', v)}
            />
            <Toggle
              label="Hand navigation while paused"
              value={settings.handNavigation}
              onChange={(v) => change('handNavigation', v)}
              hint="Pinch to grab and pan. Spread two pinched hands to zoom in."
            />
            <p className="tn-fine-print">
              Keep the same camera position after calibration. Recalibrate if
              you move your chair. Camera spin is a game control estimate.
            </p>
          </details>
        </TabsContent>
        <TabsContent value="ball">
          <Range
            label="Swing power"
            value={settings.power}
            min={0.05}
            display={`${Math.round(settings.power * 100)}%`}
            onChange={(v) => change('power', v)}
          />
          <Range
            label="Aim"
            value={settings.aim}
            min={-1}
            max={1}
            display={
              settings.aim === 0
                ? 'Centre'
                : `${Math.round(Math.abs(settings.aim) * 100)}% ${settings.aim < 0 ? 'left' : 'right'}`
            }
            onChange={(v) => change('aim', v)}
          />
          <Range
            label="Launch angle"
            value={settings.lift}
            display={`${Math.round(settings.lift * 100)}% lift`}
            onChange={(v) => change('lift', v)}
            hint="Add lift to clear the net. Reduce it if the ball travels long."
          />
          <Range
            label="Base spin"
            value={settings.spin}
            min={-45}
            max={60}
            step={1}
            display={`${Math.abs(settings.spin)} rev/s`}
            onChange={(v) => change('spin', v)}
            hint={
              settings.spin > 0
                ? 'Topspin brings the ball down into the court.'
                : settings.spin < 0
                  ? 'Slice floats longer and changes the bounce.'
                  : 'Flat ball. Your gesture can still add spin.'
            }
          />
          <div className="tn-spin-presets">
            <button onClick={() => change('spin', -15)}>Slice</button>
            <button onClick={() => change('spin', 0)}>Flat</button>
            <button onClick={() => change('spin', 25)}>Topspin</button>
          </div>
          <Range
            label="Contact assistance"
            value={settings.assist}
            display={`${Math.round(settings.assist * 100)}%`}
            onChange={(v) => change('assist', v)}
            hint="Widens the contact area and timing window. Lower it for a stricter challenge."
          />
          <Range
            label="Simulation speed"
            value={settings.pace}
            min={0.2}
            max={1}
            step={0.1}
            display={`${settings.pace.toFixed(1)}×`}
            onChange={(v) => change('pace', v)}
            hint="Slow the whole flight to see timing and spin."
          />
          <Toggle
            label="Ball trail"
            value={settings.trail}
            onChange={(v) => change('trail', v)}
          />
        </TabsContent>
        <TabsContent value="session">
          <span className="tn-field-title">Choose a drill</span>
          <RadioGroup
            value={settings.drill}
            onValueChange={(value) => change('drill', value as Drill)}
            aria-label="Practice drill"
            className="tn-drill-options"
          >
            {[
              { id: 'rally', label: 'Alternating feeds' },
              { id: 'forehand', label: 'Forehand feeds' },
              { id: 'backhand', label: 'Backhand feeds' },
              { id: 'serve', label: 'Toss & serve' },
            ].map((drill) => (
              <label key={drill.id}>
                <RadioGroupItem value={drill.id} aria-label={drill.label} />
                <span>{drill.label}</span>
              </label>
            ))}
          </RadioGroup>
          {settings.drill === 'serve' && (
            <p className="tn-fine-print">
              Lift your off hand to toss, then swing your playing hand near the
              top. Space tosses a ball too. Aim for the diagonal service box.
            </p>
          )}
          <Toggle
            label="Keep feeding balls"
            value={settings.autoFeed}
            onChange={(v) => change('autoFeed', v)}
            hint="Starts after your first feed. Each ball waits for the previous result."
          />
          <Range
            label="Time between feeds"
            value={settings.feedInterval}
            min={1}
            max={6}
            step={0.5}
            display={`${settings.feedInterval.toFixed(1)} sec`}
            onChange={(v) => change('feedInterval', v)}
          />
          <Toggle
            label="Court sounds"
            value={settings.sound}
            onChange={(v) => change('sound', v)}
          />
          <Range
            label="Volume"
            value={settings.volume}
            display={`${Math.round(settings.volume * 100)}%`}
            onChange={(v) => change('volume', v)}
          />
          <Toggle
            label="Detailed graphics"
            value={settings.quality === 'high'}
            onChange={(v) => change('quality', v ? 'high' : 'performance')}
            hint="Turn off for a lighter render while using the camera."
          />
          <details className="tn-details">
            <summary>Controls & inspection</summary>
            <p>
              Click the court to focus keyboard controls. Space feeds or tosses.
              F swings a forehand; B swings a backhand. Drag and release to
              swing with your mouse. An upward brush adds topspin.
            </p>
            <p>
              P pauses time. Drag to orbit, right-drag to pan, and scroll or
              pinch to zoom. WASD moves through space; Q lowers the camera and E
              raises it. F focuses the ball while paused.
            </p>
            <p>
              The amber arrow shows the spin axis. The blue arrow shows the
              ball’s travel direction.
            </p>
          </details>
        </TabsContent>
      </Tabs>
    </>
  );
}
