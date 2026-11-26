import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Download,
  Move3d,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  RotateCw,
  Sliders,
  Trash2,
  Wifi,
  Zap,
} from 'lucide-react';
import {
  ConnectionState,
  DockTab,
  GizmoMode,
  JOINT_SPECS,
  OperationMode,
  PRESET_POSES,
  RecordedLogEntry,
  SafetyReport,
  TcpPose,
  TelemetryPacket,
  VisualHelpersConfig,
  Waypoint,
} from '../types/robotics';
import { clampJointAngle } from '../utils/kinematics';

interface ControlDockProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  activeTab: DockTab;
  onSelectTab: (tab: DockTab) => void;
  operationMode: OperationMode;
  jointsDeg: [number, number, number, number, number, number];
  onUpdateJoint: (jointIndex: number, angleDeg: number) => void;
  onApplyPose: (
    joints: [number, number, number, number, number, number],
    gripperPct: number
  ) => void;
  gripperPct: number;
  onUpdateGripper: (pct: number) => void;
  safetyReport: SafetyReport;
  tcpPose: TcpPose;
  ikTargetPose: TcpPose;
  onUpdateIkTarget: (newPose: TcpPose) => void;
  onSyncIkTargetToCurrentTcp: () => void;
  visualHelpers: VisualHelpersConfig;
  onSetGizmoMode: (mode: GizmoMode) => void;
  onSetShowIkGizmo: (visible: boolean) => void;
  // Waypoints & Trajectory
  waypoints: Waypoint[];
  onAddCurrentAsWaypoint: (label?: string) => void;
  onDeleteWaypoint: (id: string) => void;
  onLoadDefaultWaypoints: () => void;
  onJumpToWaypoint: (wp: Waypoint) => void;
  isTrajectoryRunning: boolean;
  onToggleTrajectoryRun: () => void;
  trajectoryInterpolation: 'joint' | 'linear';
  onSetTrajectoryInterpolation: (mode: 'joint' | 'linear') => void;
  trajectorySpeedMultiplier: number;
  onSetTrajectorySpeedMultiplier: (speed: number) => void;
  activeWaypointIndex: number;
  // Live Twin, WebSocket/MQTT & Replay
  connectionState: ConnectionState;
  wsUrl: string;
  onSetWsUrl: (url: string) => void;
  onConnectWebSocket: () => void;
  onDisconnectWebSocket: () => void;
  isSimulatorStreaming: boolean;
  onToggleSimulatorStream: () => void;
  streamFrequencyHz: number;
  onSetStreamFrequencyHz: (hz: number) => void;
  injectOverloadFault: boolean;
  onToggleOverloadFault: () => void;
  latestPacket: TelemetryPacket;
  recordedLogs: RecordedLogEntry[];
  onClearLogs: () => void;
  replayIndex: number;
  onSeekReplay: (index: number) => void;
  isReplaying: boolean;
  onToggleReplayPlay: () => void;
  onExportLogs: (format: 'json' | 'csv') => void;
}

export const ControlDock: React.FC<ControlDockProps> = ({
  isCollapsed,
  onToggleCollapse,
  activeTab,
  onSelectTab,
  jointsDeg,
  onUpdateJoint,
  onApplyPose,
  gripperPct,
  onUpdateGripper,
  safetyReport,
  tcpPose,
  ikTargetPose,
  onUpdateIkTarget,
  onSyncIkTargetToCurrentTcp,
  visualHelpers,
  onSetGizmoMode,
  onSetShowIkGizmo,
  waypoints,
  onAddCurrentAsWaypoint,
  onDeleteWaypoint,
  onLoadDefaultWaypoints,
  onJumpToWaypoint,
  isTrajectoryRunning,
  onToggleTrajectoryRun,
  trajectoryInterpolation,
  onSetTrajectoryInterpolation,
  trajectorySpeedMultiplier,
  onSetTrajectorySpeedMultiplier,
  activeWaypointIndex,
  connectionState,
  wsUrl,
  onSetWsUrl,
  onConnectWebSocket,
  onDisconnectWebSocket,
  isSimulatorStreaming,
  onToggleSimulatorStream,
  streamFrequencyHz,
  onSetStreamFrequencyHz,
  injectOverloadFault,
  onToggleOverloadFault,
  latestPacket,
  recordedLogs,
  onClearLogs,
  replayIndex,
  onSeekReplay,
  isReplaying,
  onToggleReplayPlay,
  onExportLogs,
}) => {
  const [newWaypointName, setNewWaypointName] = useState('');

  const dockTabs: { id: DockTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'fk',
      label: '01. Joint Jogging (FK)',
      icon: <Sliders className="w-3.5 h-3.5" />,
    },
    {
      id: 'ik',
      label: '02. Target IK & 3D Gizmo',
      icon: <Crosshair className="w-3.5 h-3.5" />,
    },
    {
      id: 'waypoints',
      label: '03. Waypoints & Trajectory',
      icon: <Move3d className="w-3.5 h-3.5" />,
    },
    {
      id: 'telemetry',
      label: '04. Live Twin & Replay I/O',
      icon: <Radio className="w-3.5 h-3.5" />,
    },
  ];

  const handleIkNumericChange = (field: keyof TcpPose, value: number) => {
    if (Number.isNaN(value)) return;
    onUpdateIkTarget({
      ...ikTargetPose,
      [field]: value,
    });
  };

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(1040px,95vw)] transition-transform duration-200 ease-out"
      style={{
        transform: isCollapsed
          ? 'translateY(calc(100% - 36px))'
          : 'translateY(0)',
      }}
    >
      {/* Top Collapse / Expand Zen Mode Handle */}
      <div className="flex items-center justify-between px-3">
        <div className="flex items-center gap-1 bg-white/95 border border-b-0 border-slate-200 rounded-t-xl px-2 py-1 shadow-xs">
          {dockTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  onSelectTab(tab.id);
                  if (isCollapsed) onToggleCollapse();
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white/95 border border-b-0 border-slate-200 rounded-t-xl hover:text-slate-950 shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {isCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Control Dock (H)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide Controls (H)</span>
            </>
          )}
        </button>
      </div>

      {/* Main Dock Panel Surface (Solid rgba surface, no backdrop-filter over WebGL) */}
      <div className="bg-white/96 border border-slate-200 rounded-xl rounded-tl-none shadow-lg p-4">
        {/* ===================================================================== */}
        {/* TAB 1: FORWARD KINEMATICS (6-DOF JOINT JOGGING & GRIPPER)            */}
        {/* ===================================================================== */}
        {activeTab === 'fk' && (
          <div className="space-y-3">
            {/* Top Bar: Preset Poses & Parallel Gripper Control */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-slate-200/80">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-700 mr-1">
                  Quick Poses:
                </span>
                {PRESET_POSES.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => onApplyPose(preset.joints, preset.gripperPct)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>

              {/* Parallel Jaw Gripper Actuation Control */}
              <div className="flex items-center gap-2.5 bg-slate-50 px-3 py-1 rounded-lg border border-slate-200/80">
                <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                  Gripper Jaw:
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={gripperPct}
                  onChange={(e) => onUpdateGripper(Number(e.target.value))}
                  aria-label="Gripper Opening Percentage"
                  className="w-24 industrial-slider bg-slate-200 rounded-lg"
                />
                <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums w-10 text-right">
                  {gripperPct}%
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateGripper(gripperPct > 50 ? 12 : 90)}
                  className="px-2 py-0.5 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {gripperPct > 50 ? 'Close' : 'Open'}
                </button>
              </div>
            </div>

            {/* 6-DOF Joint Grid (3 Columns x 2 Rows) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2.5">
              {JOINT_SPECS.map((spec, idx) => {
                const angle = jointsDeg[idx];
                const diag = safetyReport.joints[idx];
                const pct =
                  ((angle - spec.minDeg) / (spec.maxDeg - spec.minDeg)) * 100;

                const levelColor =
                  diag?.level === 'critical'
                    ? 'text-red-700 font-bold'
                    : diag?.level === 'warning'
                    ? 'text-amber-700 font-semibold'
                    : 'text-slate-900 font-semibold';

                const trackColor =
                  diag?.level === 'critical'
                    ? '#FCA5A5'
                    : diag?.level === 'warning'
                    ? '#FCD34D'
                    : '#CBD5E1';

                const fillColor =
                  diag?.level === 'critical'
                    ? '#DC2626'
                    : diag?.level === 'warning'
                    ? '#D97706'
                    : '#0284C7';

                return (
                  <div
                    key={spec.code}
                    className="flex flex-col gap-1 py-1"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-slate-900">
                          {spec.code}
                        </span>
                        <span className="text-slate-600 font-medium">
                          {spec.name}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          ({spec.axis})
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateJoint(
                              idx,
                              clampJointAngle(idx, Math.round((angle - 5) * 10) / 10)
                            )
                          }
                          title="Decrement 5°"
                          className="px-1.5 py-0.5 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer"
                        >
                          -5°
                        </button>
                        <input
                          type="number"
                          min={spec.minDeg}
                          max={spec.maxDeg}
                          step={0.5}
                          value={Number(angle.toFixed(1))}
                          onChange={(e) =>
                            onUpdateJoint(
                              idx,
                              clampJointAngle(idx, Number(e.target.value))
                            )
                          }
                          aria-label={`${spec.code} ${spec.name} Angle in Degrees`}
                          className={`w-16 px-1.5 py-0.5 text-right font-mono text-xs tabular-nums bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-sky-600 ${levelColor}`}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateJoint(
                              idx,
                              clampJointAngle(idx, Math.round((angle + 5) * 10) / 10)
                            )
                          }
                          title="Increment 5°"
                          className="px-1.5 py-0.5 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer"
                        >
                          +5°
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums w-8">
                        {spec.minDeg}°
                      </span>
                      <input
                        type="range"
                        min={spec.minDeg}
                        max={spec.maxDeg}
                        step={0.5}
                        value={angle}
                        onChange={(e) =>
                          onUpdateJoint(idx, Number(e.target.value))
                        }
                        aria-label={`${spec.code} Slider`}
                        className="flex-1 industrial-slider"
                        style={{
                          background: `linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${pct}%, ${trackColor} ${pct}%, ${trackColor} 100%)`,
                          borderRadius: '3px',
                          height: '6px',
                        }}
                      />
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums w-8 text-right">
                        +{spec.maxDeg}°
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 2: INVERSE KINEMATICS (CARTESIAN TARGET & 3D TRANSFORM GIZMO)    */}
        {/* ===================================================================== */}
        {activeTab === 'ik' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-slate-200/80">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-800">
                  3D Viewport Target Gizmo:
                </span>
                <button
                  type="button"
                  onClick={() => onSetShowIkGizmo(!visualHelpers.showIkGizmo)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    visualHelpers.showIkGizmo
                      ? 'bg-orange-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {visualHelpers.showIkGizmo
                    ? 'Gizmo Active in 3D'
                    : 'Enable 3D Gizmo'}
                </button>

                <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                  <button
                    type="button"
                    onClick={() => {
                      onSetShowIkGizmo(true);
                      onSetGizmoMode('translate');
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      visualHelpers.gizmoMode === 'translate'
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Translate (XYZ)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSetShowIkGizmo(true);
                      onSetGizmoMode('rotate');
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      visualHelpers.gizmoMode === 'rotate'
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Rotate (RPY)
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onSyncIkTargetToCurrentTcp}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Snap Gizmo to Current TCP
                </button>
              </div>

              {/* IK Solver Convergence Diagnostic */}
              <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                <span className="text-slate-600">
                  Residual Error:{' '}
                  <strong
                    className={
                      safetyReport.ikUnreachable
                        ? 'text-red-600'
                        : 'text-emerald-700'
                    }
                  >
                    {safetyReport.ikErrorMm.toFixed(1)} mm
                  </strong>
                </span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="text-slate-600">
                  Floor Clearance:{' '}
                  <strong
                    className={
                      safetyReport.floorCollisionRisk
                        ? 'text-red-600'
                        : 'text-slate-900'
                    }
                  >
                    {safetyReport.minClearanceMm} mm
                  </strong>
                </span>
              </div>
            </div>

            {/* Cartesian Position (X, Y, Z in mm) & Orientation (Roll, Pitch, Yaw in deg) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Cartesian XYZ Target Sliders & Inputs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">
                    Target Position (Millimeters)
                  </span>
                  <span className="text-slate-500 font-mono text-[11px]">
                    Actual TCP: ({tcpPose.xMm.toFixed(0)}, {tcpPose.yMm.toFixed(0)},{' '}
                    {tcpPose.zMm.toFixed(0)}) mm
                  </span>
                </div>

                {(
                  [
                    {
                      key: 'xMm',
                      label: 'X Axis (Forward/Back)',
                      min: -900,
                      max: 900,
                      color: '#EF4444',
                    },
                    {
                      key: 'yMm',
                      label: 'Y Axis (Elevation Height)',
                      min: 20,
                      max: 1220,
                      color: '#16A34A',
                    },
                    {
                      key: 'zMm',
                      label: 'Z Axis (Lateral Left/Right)',
                      min: -900,
                      max: 900,
                      color: '#0284C7',
                    },
                  ] as const
                ).map((axis) => (
                  <div key={axis.key} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-700 w-44 shrink-0">
                      {axis.label}
                    </span>
                    <input
                      type="range"
                      min={axis.min}
                      max={axis.max}
                      step={5}
                      value={ikTargetPose[axis.key]}
                      onChange={(e) =>
                        handleIkNumericChange(axis.key, Number(e.target.value))
                      }
                      className="flex-1 industrial-slider bg-slate-200 rounded"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={axis.min}
                        max={axis.max}
                        step={5}
                        value={Math.round(ikTargetPose[axis.key])}
                        onChange={(e) =>
                          handleIkNumericChange(axis.key, Number(e.target.value))
                        }
                        className="w-20 px-2 py-0.5 text-right font-mono text-xs tabular-nums bg-slate-50 border border-slate-200 rounded"
                      />
                      <span className="text-[11px] font-mono text-slate-400">
                        mm
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right Column: End-Effector Orientation Roll, Pitch, Yaw */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">
                    End-Effector Orientation (Degrees)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateIkTarget({
                          ...ikTargetPose,
                          xMm: 460,
                          yMm: 340,
                          zMm: 0,
                          rollDeg: 0,
                          pitchDeg: 90,
                          yawDeg: 0,
                        })
                      }
                      className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer"
                    >
                      Front Reach
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateIkTarget({
                          ...ikTargetPose,
                          xMm: 380,
                          yMm: 140,
                          zMm: 260,
                          rollDeg: 0,
                          pitchDeg: 110,
                          yawDeg: -35,
                        })
                      }
                      className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer"
                    >
                      Low Pick Target
                    </button>
                  </div>
                </div>

                {(
                  [
                    {
                      key: 'rollDeg',
                      label: 'Roll (Wrist Axial Twist)',
                      min: -180,
                      max: 180,
                    },
                    {
                      key: 'pitchDeg',
                      label: 'Pitch (Tool Tilt Angle)',
                      min: -120,
                      max: 120,
                    },
                    {
                      key: 'yawDeg',
                      label: 'Yaw (Flange Heading)',
                      min: -180,
                      max: 180,
                    },
                  ] as const
                ).map((orient) => (
                  <div key={orient.key} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-700 w-44 shrink-0">
                      {orient.label}
                    </span>
                    <input
                      type="range"
                      min={orient.min}
                      max={orient.max}
                      step={1}
                      value={ikTargetPose[orient.key]}
                      onChange={(e) =>
                        handleIkNumericChange(
                          orient.key,
                          Number(e.target.value)
                        )
                      }
                      className="flex-1 industrial-slider bg-slate-200 rounded"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={orient.min}
                        max={orient.max}
                        step={1}
                        value={Math.round(ikTargetPose[orient.key])}
                        onChange={(e) =>
                          handleIkNumericChange(
                            orient.key,
                            Number(e.target.value)
                          )
                        }
                        className="w-20 px-2 py-0.5 text-right font-mono text-xs tabular-nums bg-slate-50 border border-slate-200 rounded"
                      />
                      <span className="text-[11px] font-mono text-slate-400">
                        deg
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 3: WAYPOINTS & TRAJECTORY INTERPOLATION (FR-06)                  */}
        {/* ===================================================================== */}
        {activeTab === 'waypoints' && (
          <div className="space-y-3">
            {/* Trajectory Execution Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-slate-200/80">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleTrajectoryRun}
                  disabled={waypoints.length < 2}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isTrajectoryRunning
                      ? 'bg-amber-600 text-white hover:bg-amber-700'
                      : 'bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40'
                  }`}
                >
                  {isTrajectoryRunning ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause Trajectory</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Run Trajectory Sequence</span>
                    </>
                  )}
                </button>

                {/* Interpolation Space Selector */}
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => onSetTrajectoryInterpolation('joint')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      trajectoryInterpolation === 'joint'
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Joint Space (Cubic)
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetTrajectoryInterpolation('linear')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      trajectoryInterpolation === 'linear'
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Cartesian Linear (IK)
                  </button>
                </div>

                {/* Speed Multiplier */}
                <div className="flex items-center gap-1.5 text-xs text-slate-700 ml-1">
                  <span className="font-medium">Speed:</span>
                  {[0.5, 1, 1.5, 2].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => onSetTrajectorySpeedMultiplier(spd)}
                      className={`px-2 py-0.5 font-mono text-xs rounded transition-colors cursor-pointer ${
                        trajectorySpeedMultiplier === spd
                          ? 'bg-slate-900 text-white font-semibold'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Save Current Pose as Waypoint */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Waypoint label..."
                  value={newWaypointName}
                  onChange={(e) => setNewWaypointName(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-sky-600 w-38"
                />
                <button
                  type="button"
                  onClick={() => {
                    onAddCurrentAsWaypoint(newWaypointName.trim() || undefined);
                    setNewWaypointName('');
                  }}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save Current Pose</span>
                </button>
                <button
                  type="button"
                  onClick={onLoadDefaultWaypoints}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>Reset Pick Cycle</span>
                </button>
              </div>
            </div>

            {/* Horizontal Waypoint Sequence Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 max-h-32 overflow-y-auto">
              {waypoints.map((wp, idx) => {
                const isCurrent = isTrajectoryRunning && activeWaypointIndex === idx;
                return (
                  <div
                    key={wp.id}
                    className={`flex flex-col justify-between p-2.5 rounded-lg border transition-colors ${
                      isCurrent
                        ? 'bg-sky-50/80 border-sky-500'
                        : 'bg-slate-50/70 border-slate-200/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => onJumpToWaypoint(wp)}
                        className="text-left text-xs font-semibold text-slate-900 hover:text-sky-700 truncate cursor-pointer"
                      >
                        {wp.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteWaypoint(wp.id)}
                        title="Remove Waypoint"
                        className="text-slate-400 hover:text-red-600 p-0.5 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="mt-1.5 font-mono text-[10px] text-slate-600 tabular-nums space-y-0.5">
                      <div>
                        TCP: {wp.tcpPose.xMm.toFixed(0)}, {wp.tcpPose.yMm.toFixed(0)},{' '}
                        {wp.tcpPose.zMm.toFixed(0)} mm
                      </div>
                      <div className="text-slate-500 truncate">
                        J: [{wp.jointsDeg.map((d) => d.toFixed(0)).join(', ')}]° · Grip{' '}
                        {wp.gripperPct}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB 4: LIVE TWIN STREAMING, WEBSOCKET/MQTT & REPLAY SCRUBBER         */}
        {/* ===================================================================== */}
        {activeTab === 'telemetry' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Left 5 cols: Hardware Stream Simulator & Custom WebSocket Connector */}
            <div className="md:col-span-5 space-y-2.5 pr-2 border-r border-slate-200/80">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  Telemetry Stream Source
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onToggleSimulatorStream}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      isSimulatorStreaming
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Zap className="w-3 h-3" />
                    <span>
                      {isSimulatorStreaming
                        ? `Simulating (${streamFrequencyHz} Hz)`
                        : 'Start 30Hz Simulator'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={onToggleOverloadFault}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      injectOverloadFault
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {injectOverloadFault ? 'Clear Fault' : 'Test Overload'}
                  </button>
                </div>
              </div>

              {/* WebSocket / MQTT over WebSocket URL Input */}
              <div className="flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={wsUrl}
                  onChange={(e) => onSetWsUrl(e.target.value)}
                  placeholder="ws://localhost:8080/robot-telemetry"
                  aria-label="WebSocket or MQTT over WebSocket URL"
                  className="flex-1 px-2.5 py-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-sky-600"
                />
                {connectionState === 'connected' ||
                connectionState === 'reconnecting' ? (
                  <button
                    type="button"
                    onClick={onDisconnectWebSocket}
                    className="px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onConnectWebSocket}
                    className="px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Connect WS
                  </button>
                )}
              </div>

              {/* Frequency Selector & Replay Timeline Scrubber */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1 text-xs text-slate-600">
                  <span>Rate:</span>
                  {[20, 30, 50].map((hz) => (
                    <button
                      key={hz}
                      type="button"
                      onClick={() => onSetStreamFrequencyHz(hz)}
                      className={`px-1.5 py-0.5 font-mono text-[11px] rounded cursor-pointer ${
                        streamFrequencyHz === hz
                          ? 'bg-slate-900 text-white font-semibold'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {hz}Hz
                    </button>
                  ))}
                </div>

                {/* Replay Log Scrubber */}
                <div className="flex items-center gap-1.5 flex-1 max-w-xs">
                  <button
                    type="button"
                    onClick={onToggleReplayPlay}
                    disabled={recordedLogs.length === 0}
                    className="p-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-800 disabled:opacity-40 cursor-pointer"
                    title="Replay Recorded Telemetry Log"
                  >
                    {isReplaying ? (
                      <Pause className="w-3 h-3" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, recordedLogs.length - 1)}
                    value={Math.min(replayIndex, Math.max(0, recordedLogs.length - 1))}
                    onChange={(e) => onSeekReplay(Number(e.target.value))}
                    disabled={recordedLogs.length === 0}
                    aria-label="Replay Timeline Scrubber"
                    className="flex-1 industrial-slider bg-slate-200 rounded"
                  />
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                    {recordedLogs.length > 0
                      ? `${replayIndex + 1}/${recordedLogs.length}`
                      : '0 frames'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right 7 cols: Live PRD Section 6 JSON Contract Preview & Export Actions */}
            <div className="md:col-span-7 flex items-center justify-between gap-3">
              <pre className="flex-1 p-2.5 bg-slate-900 text-slate-100 rounded-lg font-mono text-[11px] leading-tight overflow-x-auto max-h-28 select-all">
                {JSON.stringify(latestPacket, null, 2)}
              </pre>

              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onExportLogs('json')}
                  disabled={recordedLogs.length === 0}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON ({recordedLogs.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => onExportLogs('csv')}
                  disabled={recordedLogs.length === 0}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
                <button
                  type="button"
                  onClick={onClearLogs}
                  disabled={recordedLogs.length === 0}
                  className="flex items-center justify-center gap-1 px-3 py-1 text-[11px] font-medium text-slate-500 hover:text-red-600 rounded-md disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Log Buffer</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
