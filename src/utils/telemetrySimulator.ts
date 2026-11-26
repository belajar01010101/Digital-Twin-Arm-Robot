import { RecordedLogEntry, TelemetryPacket, Waypoint } from '../types/robotics';
import { computeForwardKinematics } from './kinematics';

/**
 * Generates realistic 20-50 Hz simulated hardware telemetry packets matching PRD Section 6 JSON schema.
 */
export function generateSimulatedTelemetryPacket(
  timeSec: number,
  injectOverload = false
): TelemetryPacket {
  // Smooth multi-axis harmonic industrial pick-and-inspect cycle
  const j1 = Math.round(Math.sin(timeSec * 0.55) * 65 * 10) / 10;
  const j2 = Math.round((-22 + Math.sin(timeSec * 0.8) * 32) * 10) / 10;
  const j3 = Math.round((48 + Math.cos(timeSec * 0.8) * 28) * 10) / 10;
  const j4 = Math.round(Math.sin(timeSec * 1.1) * 40 * 10) / 10;
  const j5 = Math.round((55 - Math.sin(timeSec * 0.8) * 25) * 10) / 10;
  const j6 = Math.round(Math.cos(timeSec * 1.4) * 90 * 10) / 10;

  const gripperWave = (Math.sin(timeSec * 0.9) + 1) / 2;
  const openingPct = Math.round(12 + gripperWave * 78);
  const gripperState =
    openingPct < 20 ? 'closed' : openingPct > 80 ? 'open' : 'partial';

  // Realistic actuator current & thermal curve based on shoulder/elbow load
  const dynamicLoadA =
    1.65 +
    Math.abs(Math.sin(timeSec * 0.8)) * 1.15 +
    Math.abs(Math.cos(timeSec * 1.3)) * 0.35;
  const totalCurrentA = injectOverload
    ? Math.round((5.2 + Math.sin(timeSec * 6) * 0.45) * 100) / 100
    : Math.round(dynamicLoadA * 100) / 100;

  const maxTempC = injectOverload
    ? Math.round((68.4 + Math.sin(timeSec * 2) * 2.1) * 10) / 10
    : Math.round((41.2 + Math.sin(timeSec * 0.25) * 1.8) * 10) / 10;

  return {
    robot_id: 'arm-01',
    timestamp: new Date().toISOString(),
    mode: 'live',
    joints_deg: [j1, j2, j3, j4, j5, j6],
    gripper: {
      state: gripperState,
      opening_pct: openingPct,
    },
    telemetry: {
      max_temp_c: maxTempC,
      total_current_a: totalCurrentA,
      status: injectOverload ? 'OVERLOAD' : 'OK',
    },
  };
}

/**
 * Default industrial pick-and-place waypoint sequence for immediate testing (FR-06).
 */
export function createDefaultWaypoints(): Waypoint[] {
  const rawWaypoints: {
    id: string;
    label: string;
    jointsDeg: [number, number, number, number, number, number];
    gripperPct: number;
    dwellSec: number;
  }[] = [
    {
      id: 'wp-1',
      label: '01. Home Standby',
      jointsDeg: [15, -28, 52, 0, 66, -15],
      gripperPct: 80,
      dwellSec: 0.4,
    },
    {
      id: 'wp-2',
      label: '02. Approach Pick Station',
      jointsDeg: [38, 18, 42, 0, 30, 15],
      gripperPct: 85,
      dwellSec: 0.3,
    },
    {
      id: 'wp-3',
      label: '03. Grasp Workpiece',
      jointsDeg: [38, 34, 48, 0, 10, 15],
      gripperPct: 14,
      dwellSec: 0.5,
    },
    {
      id: 'wp-4',
      label: '04. Lift & Transfer Arc',
      jointsDeg: [-20, -18, 44, -15, 62, -20],
      gripperPct: 14,
      dwellSec: 0.3,
    },
    {
      id: 'wp-5',
      label: '05. Place at Inspection Tray',
      jointsDeg: [-65, 28, 46, 0, 18, -65],
      gripperPct: 85,
      dwellSec: 0.5,
    },
  ];

  return rawWaypoints.map((wp) => ({
    ...wp,
    tcpPose: computeForwardKinematics(wp.jointsDeg).tcpPose,
  }));
}

/**
 * Exports recorded motion logs to a downloadable JSON or CSV file (FR-05).
 */
export function exportTelemetryLogs(
  logs: RecordedLogEntry[],
  format: 'json' | 'csv'
): void {
  if (logs.length === 0) return;

  let content = '';
  let mimeType = 'application/json';
  let extension = 'json';

  if (format === 'json') {
    content = JSON.stringify(logs, null, 2);
  } else {
    mimeType = 'text/csv;charset=utf-8;';
    extension = 'csv';
    const headers = [
      'timestamp',
      'elapsed_sec',
      'robot_id',
      'mode',
      'j1_deg',
      'j2_deg',
      'j3_deg',
      'j4_deg',
      'j5_deg',
      'j6_deg',
      'tcp_x_mm',
      'tcp_y_mm',
      'tcp_z_mm',
      'gripper_state',
      'gripper_pct',
      'max_temp_c',
      'total_current_a',
      'status',
      'latency_ms',
    ];
    const rows = logs.map((entry) =>
      [
        entry.timestamp,
        entry.elapsedSec.toFixed(2),
        entry.robot_id,
        entry.mode,
        ...entry.joints_deg.map((d) => d.toFixed(2)),
        entry.tcpPose.xMm.toFixed(1),
        entry.tcpPose.yMm.toFixed(1),
        entry.tcpPose.zMm.toFixed(1),
        entry.gripper.state,
        entry.gripper.opening_pct,
        entry.telemetry.max_temp_c.toFixed(1),
        entry.telemetry.total_current_a.toFixed(2),
        entry.telemetry.status,
        entry.latencyMs,
      ].join(',')
    );
    content = [headers.join(','), ...rows].join('\n');
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `robotwin-telemetry-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
