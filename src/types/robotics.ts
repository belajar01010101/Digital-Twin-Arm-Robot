export type OperationMode = 'simulation' | 'live' | 'trajectory' | 'replay';

export type DockTab = 'fk' | 'ik' | 'waypoints' | 'telemetry';

export type CameraPreset = 'isometric' | 'front' | 'top' | 'side' | 'tcp';

export type GizmoMode = 'translate' | 'rotate';

export type ConnectionState = 'simulated' | 'connected' | 'reconnecting' | 'disconnected';

export type DiagnosticStatus = 'OK' | 'WARN_LIMIT' | 'OVERLOAD' | 'COLLISION_RISK' | 'UNREACHABLE';

export interface JointSpec {
  id: number;
  code: string;
  name: string;
  axis: 'X' | 'Y' | 'Z';
  minDeg: number;
  maxDeg: number;
  maxSpeedDegPerSec: number;
  defaultDeg: number;
  description: string;
}

export interface TcpPose {
  /** Millimeters in robot world frame (1 scene unit = 1000 mm = 1 m) */
  xMm: number;
  yMm: number;
  zMm: number;
  /** Orientation Euler angles in degrees */
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number;
}

export type JointSafetyLevel = 'normal' | 'warning' | 'critical';

export interface JointDiagnostic {
  jointIndex: number;
  angleDeg: number;
  utilizationPct: number;
  level: JointSafetyLevel;
  reason?: string;
}

export interface SafetyReport {
  overallStatus: DiagnosticStatus;
  joints: JointDiagnostic[];
  floorCollisionRisk: boolean;
  minClearanceMm: number;
  ikUnreachable: boolean;
  ikErrorMm: number;
  activeMessages: string[];
}

/** Exact JSON contract specified in PRD Section 6 */
export interface TelemetryPacket {
  robot_id: string;
  timestamp: string;
  mode: 'live' | 'simulation' | 'replay';
  joints_deg: [number, number, number, number, number, number];
  gripper: {
    state: 'open' | 'closed' | 'partial';
    opening_pct: number;
  };
  telemetry: {
    max_temp_c: number;
    total_current_a: number;
    status: DiagnosticStatus;
  };
}

export interface RecordedLogEntry extends TelemetryPacket {
  elapsedSec: number;
  tcpPose: TcpPose;
  latencyMs: number;
}

export interface Waypoint {
  id: string;
  label: string;
  jointsDeg: [number, number, number, number, number, number];
  gripperPct: number;
  tcpPose: TcpPose;
  dwellSec: number;
}

export interface VisualHelpersConfig {
  showWorkspaceEnvelope: boolean;
  showSafetyHighlights: boolean;
  showTcpTrail: boolean;
  showLocalAxes: boolean;
  showIkGizmo: boolean;
  gizmoMode: GizmoMode;
}

export const JOINT_SPECS: JointSpec[] = [
  {
    id: 1,
    code: 'J1',
    name: 'Base Yaw',
    axis: 'Y',
    minDeg: -180,
    maxDeg: 180,
    maxSpeedDegPerSec: 150,
    defaultDeg: 15,
    description: 'Turntable rotation around vertical Y axis',
  },
  {
    id: 2,
    code: 'J2',
    name: 'Shoulder Pitch',
    axis: 'Z',
    minDeg: -95,
    maxDeg: 95,
    maxSpeedDegPerSec: 120,
    defaultDeg: -28,
    description: 'Lower arm elevation around Z axis',
  },
  {
    id: 3,
    code: 'J3',
    name: 'Elbow Pitch',
    axis: 'Z',
    minDeg: -135,
    maxDeg: 135,
    maxSpeedDegPerSec: 150,
    defaultDeg: 52,
    description: 'Forearm articulation around Z axis',
  },
  {
    id: 4,
    code: 'J4',
    name: 'Wrist 1 Roll',
    axis: 'Y',
    minDeg: -180,
    maxDeg: 180,
    maxSpeedDegPerSec: 200,
    defaultDeg: 0,
    description: 'Forearm axial roll around local Y axis',
  },
  {
    id: 5,
    code: 'J5',
    name: 'Wrist 2 Pitch',
    axis: 'Z',
    minDeg: -120,
    maxDeg: 120,
    maxSpeedDegPerSec: 200,
    defaultDeg: 66,
    description: 'Wrist pitch inclination around Z axis',
  },
  {
    id: 6,
    code: 'J6',
    name: 'Tool Flange Roll',
    axis: 'Y',
    minDeg: -360,
    maxDeg: 360,
    maxSpeedDegPerSec: 300,
    defaultDeg: -15,
    description: 'End-effector continuous flange roll',
  },
];

export const PRESET_POSES: {
  name: string;
  joints: [number, number, number, number, number, number];
  gripperPct: number;
}[] = [
  {
    name: 'Ready / Home',
    joints: [15, -28, 52, 0, 66, -15],
    gripperPct: 65,
  },
  {
    name: 'Zero Calibration',
    joints: [0, 0, 0, 0, 0, 0],
    gripperPct: 100,
  },
  {
    name: 'Forward Pick Pose',
    joints: [0, 38, 44, 0, 8, 0],
    gripperPct: 20,
  },
  {
    name: 'Bin Drop Lateral',
    joints: [-85, 24, 52, 15, 14, -45],
    gripperPct: 90,
  },
  {
    name: 'Inspection High',
    joints: [42, -55, 85, -30, 45, 30],
    gripperPct: 40,
  },
];
