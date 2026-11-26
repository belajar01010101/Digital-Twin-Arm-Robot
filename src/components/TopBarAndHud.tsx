import React from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Compass,
  Crosshair,
  Eye,
  GitCommit,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import {
  CameraPreset,
  ConnectionState,
  OperationMode,
  SafetyReport,
  TcpPose,
  VisualHelpersConfig,
} from '../types/robotics';

interface TopBarAndHudProps {
  operationMode: OperationMode;
  onSelectOperationMode: (mode: OperationMode) => void;
  onExportJson: () => void;
  tcpPose: TcpPose;
  safetyReport: SafetyReport;
  connectionState: ConnectionState;
  latencyMs: number;
  fps: number;
  maxTempC: number;
  totalCurrentA: number;
  cameraPreset: CameraPreset;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  visualHelpers: VisualHelpersConfig;
  onToggleVisualHelper: (key: keyof Omit<VisualHelpersConfig, 'gizmoMode'>) => void;
  onClearTrail: () => void;
}

export const TopBarAndHud: React.FC<TopBarAndHudProps> = ({
  operationMode,
  onSelectOperationMode,
  onExportJson,
  tcpPose,
  safetyReport,
  connectionState,
  latencyMs,
  fps,
  maxTempC,
  totalCurrentA,
  cameraPreset,
  onSelectCameraPreset,
  visualHelpers,
  onToggleVisualHelper,
  onClearTrail,
}) => {
  const navModes: { id: OperationMode; label: string }[] = [
    { id: 'simulation', label: 'Simulation FK/IK' },
    { id: 'live', label: 'Live Twin' },
    { id: 'trajectory', label: 'Waypoints' },
    { id: 'replay', label: 'Replay Log' },
  ];

  const cameraPresets: { id: CameraPreset; label: string }[] = [
    { id: 'isometric', label: 'Isometric' },
    { id: 'front', label: 'Front' },
    { id: 'side', label: 'Side' },
    { id: 'top', label: 'Top' },
    { id: 'tcp', label: 'End-Effector' },
  ];

  const getStatusDisplay = () => {
    switch (safetyReport.overallStatus) {
      case 'OVERLOAD':
        return {
          text: 'OVERLOAD FAULT',
          colorClass: 'text-red-700',
          icon: <ShieldAlert className="w-3.5 h-3.5 text-red-600 shrink-0" />,
        };
      case 'COLLISION_RISK':
        return {
          text: 'FLOOR COLLISION RISK',
          colorClass: 'text-red-700',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />,
        };
      case 'UNREACHABLE':
        return {
          text: 'IK TARGET UNREACHABLE',
          colorClass: 'text-amber-700',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />,
        };
      case 'WARN_LIMIT':
        return {
          text: 'JOINT LIMIT WARNING',
          colorClass: 'text-amber-700',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />,
        };
      default:
        return {
          text: 'NOMINAL OK',
          colorClass: 'text-emerald-700',
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />,
        };
    }
  };

  const statusInfo = getStatusDisplay();

  return (
    <>
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="relative z-20 flex items-center justify-between gap-8 px-6 py-3 bg-white/95 border-b border-slate-200">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectOperationMode('simulation');
          }}
          className="text-base font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
        >
          RoboTwin 3D
        </a>

        {/* Zone 2: 4 clean single-line text navigation links */}
        <nav
          aria-label="Primary Workspace Modes"
          className="flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          {navModes.map((m) => {
            const isActive = operationMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectOperationMode(m.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  isActive
                    ? 'text-slate-900 font-semibold border-sky-600'
                    : 'text-slate-600 border-transparent hover:text-slate-900'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onExportJson}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Export Telemetry JSON
          </button>
        </div>
      </header>

      {/* Secondary Sub-Toolbar: TCP Readout, Connection Telemetry, Camera Presets & 3D Visual Helpers */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-6 py-2 bg-white/90 border-b border-slate-200/80 text-xs">
        {/* Left: Live TCP Coordinates & System Status (Unboxed metadata with · separators) */}
        <div className="flex flex-wrap items-center gap-2 text-slate-700">
          <span className="font-semibold text-slate-900">TCP (mm / deg):</span>
          <span className="font-mono tabular-nums text-slate-900">
            X {tcpPose.xMm >= 0 ? `+${tcpPose.xMm.toFixed(1)}` : tcpPose.xMm.toFixed(1)}
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="font-mono tabular-nums text-slate-900">
            Y {tcpPose.yMm >= 0 ? `+${tcpPose.yMm.toFixed(1)}` : tcpPose.yMm.toFixed(1)}
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="font-mono tabular-nums text-slate-900">
            Z {tcpPose.zMm >= 0 ? `+${tcpPose.zMm.toFixed(1)}` : tcpPose.zMm.toFixed(1)}
          </span>
          <span aria-hidden="true" className="text-slate-300">/</span>
          <span className="font-mono tabular-nums text-slate-600">
            R {tcpPose.rollDeg.toFixed(0)}° P {tcpPose.pitchDeg.toFixed(0)}° Y {tcpPose.yawDeg.toFixed(0)}°
          </span>

          <span aria-hidden="true" className="text-slate-300 mx-1">|</span>

          {/* Semantic Status Label with Icon (No Hue-Only Signaling) */}
          <div className={`flex items-center gap-1.5 font-semibold ${statusInfo.colorClass}`}>
            {statusInfo.icon}
            <span className="whitespace-nowrap">{statusInfo.text}</span>
          </div>

          <span aria-hidden="true" className="text-slate-300 mx-1">|</span>

          {/* Live Hardware Telemetry Summary */}
          <div className="flex items-center gap-2 text-slate-600 font-mono tabular-nums">
            <span>
              Link:{' '}
              <strong className="text-slate-900 uppercase">
                {connectionState}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>{latencyMs} ms</span>
            <span aria-hidden="true">·</span>
            <span>{maxTempC.toFixed(1)} °C</span>
            <span aria-hidden="true">·</span>
            <span>{totalCurrentA.toFixed(2)} A</span>
            <span aria-hidden="true">·</span>
            <span>{fps} FPS</span>
          </div>
        </div>

        {/* Right: Camera View Presets & 3D Visual Diagnostic Overlay Toggles */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Camera View Segmented Control */}
          <div
            role="group"
            aria-label="Camera View Presets"
            className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg border border-slate-200/70"
          >
            <span className="flex items-center gap-1 px-2 text-[11px] font-medium text-slate-500">
              <Camera className="w-3 h-3" />
              View
            </span>
            {cameraPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectCameraPreset(preset.id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  cameraPreset === preset.id
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* 3D Diagnostic Overlay Toggles */}
          <div
            role="group"
            aria-label="3D Safety and Diagnostic Overlays"
            className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200/70"
          >
            <button
              type="button"
              onClick={() => onToggleVisualHelper('showSafetyHighlights')}
              title="Toggle Real-Time Joint Limit & Floor Collision Highlights"
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                visualHelpers.showSafetyHighlights
                  ? 'bg-white text-amber-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3 h-3" />
              Limit Colors
            </button>

            <button
              type="button"
              onClick={() => onToggleVisualHelper('showTcpTrail')}
              title="Toggle 3D TCP Trajectory Path Trail"
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                visualHelpers.showTcpTrail
                  ? 'bg-white text-sky-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitCommit className="w-3 h-3" />
              TCP Trail
            </button>

            <button
              type="button"
              onClick={() => onToggleVisualHelper('showLocalAxes')}
              title="Toggle Per-Joint Local X/Y/Z Coordinate Frames"
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                visualHelpers.showLocalAxes
                  ? 'bg-white text-emerald-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Compass className="w-3 h-3" />
              Joint Axes
            </button>

            <button
              type="button"
              onClick={() => onToggleVisualHelper('showIkGizmo')}
              title="Toggle Interactive 3D TransformGizmo on TCP"
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                visualHelpers.showIkGizmo
                  ? 'bg-white text-orange-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Crosshair className="w-3 h-3" />
              3D IK Gizmo
            </button>

            <button
              type="button"
              onClick={onClearTrail}
              title="Clear 3D TCP Path Trail"
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-red-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Non-occluding Top-Center Safety Diagnostic Alert Banner when an anomaly is active */}
      {safetyReport.activeMessages.length > 0 && (
        <div
          role="status"
          className="fixed top-26 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 px-4 py-2 rounded-lg bg-white/95 border border-amber-300 shadow-sm text-xs text-slate-800 max-w-xl"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="font-medium truncate">
            {safetyReport.activeMessages[0]}
          </span>
          {safetyReport.activeMessages.length > 1 && (
            <span className="text-slate-500 whitespace-nowrap">
              (+{safetyReport.activeMessages.length - 1} more)
            </span>
          )}
        </div>
      )}
    </>
  );
};
