import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import { RobotViewport3D } from './components/RobotViewport3D';
import { TopBarAndHud } from './components/TopBarAndHud';
import {
  CameraPreset,
  ConnectionState,
  DockTab,
  GizmoMode,
  OperationMode,
  RecordedLogEntry,
  TcpPose,
  TelemetryPacket,
  VisualHelpersConfig,
  Waypoint,
} from './types/robotics';
import {
  clampJointAngle,
  computeForwardKinematics,
  evaluateSafetyDiagnostics,
  solveInverseKinematics,
} from './utils/kinematics';
import {
  createDefaultWaypoints,
  exportTelemetryLogs,
  generateSimulatedTelemetryPacket,
} from './utils/telemetrySimulator';

const INITIAL_JOINTS: [number, number, number, number, number, number] = [
  15, -28, 52, 0, 66, -15,
];

export default function App() {
  // Primary Operation Mode & Bottom Dock Tab
  const [operationMode, setOperationMode] = useState<OperationMode>('simulation');
  const [activeTab, setActiveTab] = useState<DockTab>('fk');
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);

  // 6-DOF Joint Angles (degrees) & Parallel Gripper Opening (%)
  const [jointsDeg, setJointsDeg] =
    useState<[number, number, number, number, number, number]>(INITIAL_JOINTS);
  const [gripperPct, setGripperPct] = useState<number>(65);

  // Forward Kinematics & Safety Evaluation
  const fkResult = useMemo(
    () => computeForwardKinematics(jointsDeg),
    [jointsDeg]
  );

  // Inverse Kinematics Target Pose & Reachability Status
  const [ikTargetPose, setIkTargetPose] = useState<TcpPose>(() => {
    return computeForwardKinematics(INITIAL_JOINTS).tcpPose;
  });
  const [ikUnreachable, setIkUnreachable] = useState(false);
  const [ikErrorMm, setIkErrorMm] = useState(0);

  // 3D Viewport Visual Diagnostic Helpers & Camera Presets
  const [visualHelpers, setVisualHelpers] = useState<VisualHelpersConfig>({
    showWorkspaceEnvelope: false,
    showSafetyHighlights: true,
    showTcpTrail: true,
    showLocalAxes: true,
    showIkGizmo: false,
    gizmoMode: 'translate',
  });
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [cameraPresetTrigger, setCameraPresetTrigger] = useState(0);
  const [clearTrailTrigger, setClearTrailTrigger] = useState(0);
  const [fps, setFps] = useState(60);

  // Waypoint & Trajectory Interpolation State (FR-06)
  const [waypoints, setWaypoints] = useState<Waypoint[]>(() =>
    createDefaultWaypoints()
  );
  const [isTrajectoryRunning, setIsTrajectoryRunning] = useState(false);
  const [trajectoryInterpolation, setTrajectoryInterpolation] = useState<
    'joint' | 'linear'
  >('joint');
  const [trajectorySpeedMultiplier, setTrajectorySpeedMultiplier] =
    useState<number>(1);
  const [activeWaypointIndex, setActiveWaypointIndex] = useState<number>(0);

  // Live Twin Telemetry, WebSocket & Replay Log State (FR-02, FR-05)
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('simulated');
  const [wsUrl, setWsUrl] = useState<string>('ws://localhost:8080/telemetry');
  const [isSimulatorStreaming, setIsSimulatorStreaming] =
    useState<boolean>(false);
  const [streamFrequencyHz, setStreamFrequencyHz] = useState<number>(30);
  const [injectOverloadFault, setInjectOverloadFault] =
    useState<boolean>(false);
  const [latencyMs, setLatencyMs] = useState<number>(14);
  const [maxTempC, setMaxTempC] = useState<number>(41.2);
  const [totalCurrentA, setTotalCurrentA] = useState<number>(2.15);

  // Recorded Motion & Telemetry Logs (seeded with an initial entry so export works immediately)
  const sessionStartRef = useRef<number>(Date.now());
  const [recordedLogs, setRecordedLogs] = useState<RecordedLogEntry[]>(() => {
    const initialFk = computeForwardKinematics(INITIAL_JOINTS);
    return [
      {
        robot_id: 'arm-01',
        timestamp: new Date().toISOString(),
        mode: 'simulation',
        joints_deg: INITIAL_JOINTS,
        gripper: { state: 'partial', opening_pct: 65 },
        telemetry: {
          max_temp_c: 41.2,
          total_current_a: 2.15,
          status: 'OK',
        },
        elapsedSec: 0,
        tcpPose: initialFk.tcpPose,
        latencyMs: 14,
      },
    ];
  });
  const [replayIndex, setReplayIndex] = useState<number>(0);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);

  // Complete Safety Report
  const safetyReport = useMemo(
    () =>
      evaluateSafetyDiagnostics(
        jointsDeg,
        fkResult,
        ikUnreachable,
        ikErrorMm,
        injectOverloadFault
      ),
    [jointsDeg, fkResult, ikUnreachable, ikErrorMm, injectOverloadFault]
  );

  // Construct current PRD Section 6 Telemetry JSON Packet
  const latestPacket: TelemetryPacket = useMemo(() => {
    const gState =
      gripperPct < 20 ? 'closed' : gripperPct > 80 ? 'open' : 'partial';
    return {
      robot_id: 'arm-01',
      timestamp: new Date().toISOString(),
      mode:
        operationMode === 'live'
          ? 'live'
          : operationMode === 'replay'
          ? 'replay'
          : 'simulation',
      joints_deg: [
        Math.round(jointsDeg[0] * 10) / 10,
        Math.round(jointsDeg[1] * 10) / 10,
        Math.round(jointsDeg[2] * 10) / 10,
        Math.round(jointsDeg[3] * 10) / 10,
        Math.round(jointsDeg[4] * 10) / 10,
        Math.round(jointsDeg[5] * 10) / 10,
      ],
      gripper: {
        state: gState,
        opening_pct: Math.round(gripperPct),
      },
      telemetry: {
        max_temp_c: maxTempC,
        total_current_a: totalCurrentA,
        status: safetyReport.overallStatus,
      },
    };
  }, [
    operationMode,
    jointsDeg,
    gripperPct,
    maxTempC,
    totalCurrentA,
    safetyReport.overallStatus,
  ]);

  // Helper to append a snapshot to the motion log buffer (caps at 600 entries)
  const appendLogSnapshot = useCallback(
    (
      nextJoints: [number, number, number, number, number, number],
      nextGripper: number,
      mode: 'live' | 'simulation' | 'replay',
      temp = maxTempC,
      current = totalCurrentA,
      lat = latencyMs
    ) => {
      const fk = computeForwardKinematics(nextJoints);
      const gState =
        nextGripper < 20 ? 'closed' : nextGripper > 80 ? 'open' : 'partial';
      const entry: RecordedLogEntry = {
        robot_id: 'arm-01',
        timestamp: new Date().toISOString(),
        mode,
        joints_deg: [
          Math.round(nextJoints[0] * 10) / 10,
          Math.round(nextJoints[1] * 10) / 10,
          Math.round(nextJoints[2] * 10) / 10,
          Math.round(nextJoints[3] * 10) / 10,
          Math.round(nextJoints[4] * 10) / 10,
          Math.round(nextJoints[5] * 10) / 10,
        ],
        gripper: {
          state: gState,
          opening_pct: Math.round(nextGripper),
        },
        telemetry: {
          max_temp_c: temp,
          total_current_a: current,
          status: injectOverloadFault ? 'OVERLOAD' : 'OK',
        },
        elapsedSec: (Date.now() - sessionStartRef.current) / 1000,
        tcpPose: fk.tcpPose,
        latencyMs: lat,
      };

      setRecordedLogs((prev) => {
        const updated = [...prev, entry];
        if (updated.length > 600) updated.shift();
        return updated;
      });
    },
    [maxTempC, totalCurrentA, latencyMs, injectOverloadFault]
  );

  // Switch top-level operation mode and coordinate active dock tab
  const handleSelectOperationMode = (mode: OperationMode) => {
    setOperationMode(mode);
    if (mode === 'simulation') {
      setIsSimulatorStreaming(false);
      setIsReplaying(false);
      setIsTrajectoryRunning(false);
      if (activeTab === 'waypoints' || activeTab === 'telemetry') {
        setActiveTab('fk');
      }
    } else if (mode === 'live') {
      setIsTrajectoryRunning(false);
      setIsReplaying(false);
      setActiveTab('telemetry');
      setIsSimulatorStreaming(true);
    } else if (mode === 'trajectory') {
      setIsSimulatorStreaming(false);
      setIsReplaying(false);
      setActiveTab('waypoints');
    } else if (mode === 'replay') {
      setIsSimulatorStreaming(false);
      setIsTrajectoryRunning(false);
      setActiveTab('telemetry');
    }
  };

  // Switch dock tab and automatically enable 3D IK Gizmo when entering IK tab
  const handleSelectDockTab = (tab: DockTab) => {
    setActiveTab(tab);
    if (tab === 'ik') {
      setOperationMode('simulation');
      setIsSimulatorStreaming(false);
      setIsTrajectoryRunning(false);
      setIkTargetPose(fkResult.tcpPose);
      setVisualHelpers((prev) => ({ ...prev, showIkGizmo: true }));
    } else if (tab === 'fk') {
      setIkUnreachable(false);
      setIkErrorMm(0);
    }
  };

  // Update individual joint angle (FK)
  const handleUpdateJoint = (jointIndex: number, angleDeg: number) => {
    setIsSimulatorStreaming(false);
    setIsTrajectoryRunning(false);
    setIsReplaying(false);
    setIkUnreachable(false);
    setIkErrorMm(0);

    setJointsDeg((prev) => {
      const next: [number, number, number, number, number, number] = [...prev];
      next[jointIndex] = clampJointAngle(jointIndex, angleDeg);
      const nextFk = computeForwardKinematics(next);
      setIkTargetPose(nextFk.tcpPose);
      // Update simulated current proportional to joint movement
      const loadA =
        1.8 +
        Math.abs(next[1]) * 0.012 +
        Math.abs(next[2]) * 0.009;
      setTotalCurrentA(
        injectOverloadFault ? 5.35 : Math.round(loadA * 100) / 100
      );
      appendLogSnapshot(next, gripperPct, 'simulation');
      return next;
    });
  };

  // Apply full 6-DOF pose preset
  const handleApplyPose = (
    joints: [number, number, number, number, number, number],
    nextGripper: number
  ) => {
    setIsSimulatorStreaming(false);
    setIsTrajectoryRunning(false);
    setIsReplaying(false);
    setIkUnreachable(false);
    setIkErrorMm(0);
    setJointsDeg(joints);
    setGripperPct(nextGripper);
    const nextFk = computeForwardKinematics(joints);
    setIkTargetPose(nextFk.tcpPose);
    appendLogSnapshot(joints, nextGripper, 'simulation');
  };

  // Solve Inverse Kinematics when user drags 3D TransformGizmo or edits X/Y/Z/R/P/Y
  const handleUpdateIkTarget = useCallback(
    (newTargetPose: TcpPose) => {
      setIsSimulatorStreaming(false);
      setIsTrajectoryRunning(false);
      setIsReplaying(false);
      setIkTargetPose(newTargetPose);

      setJointsDeg((currentJoints) => {
        const solution = solveInverseKinematics(newTargetPose, currentJoints);
        setIkUnreachable(!solution.reachable);
        setIkErrorMm(solution.errorMm);
        return solution.jointsDeg;
      });
    },
    []
  );

  const handleSyncIkTargetToCurrentTcp = () => {
    setIkTargetPose(fkResult.tcpPose);
    setIkUnreachable(false);
    setIkErrorMm(0);
  };

  // Waypoint Trajectory Interpolation Loop (FR-06)
  useEffect(() => {
    if (!isTrajectoryRunning || waypoints.length < 2) return;

    let animId = 0;
    let segIdx = 0;
    let segElapsed = 0;
    let lastTimestamp = performance.now();

    const stepTrajectory = (now: number) => {
      const dt = Math.min((now - lastTimestamp) / 1000, 0.1);
      lastTimestamp = now;

      const fromWp = waypoints[segIdx];
      const toWp = waypoints[(segIdx + 1) % waypoints.length];
      const segmentDuration = 1.6 / trajectorySpeedMultiplier;

      segElapsed += dt;
      const rawT = Math.min(1, segElapsed / segmentDuration);
      // Smooth cubic ease-in-out interpolation
      const smoothT =
        rawT < 0.5
          ? 4 * rawT * rawT * rawT
          : 1 - Math.pow(-2 * rawT + 2, 3) / 2;

      const nextGripper = Math.round(
        fromWp.gripperPct + (toWp.gripperPct - fromWp.gripperPct) * smoothT
      );
      setGripperPct(nextGripper);

      if (trajectoryInterpolation === 'joint') {
        const interpJoints: [number, number, number, number, number, number] = [
          fromWp.jointsDeg[0] +
            (toWp.jointsDeg[0] - fromWp.jointsDeg[0]) * smoothT,
          fromWp.jointsDeg[1] +
            (toWp.jointsDeg[1] - fromWp.jointsDeg[1]) * smoothT,
          fromWp.jointsDeg[2] +
            (toWp.jointsDeg[2] - fromWp.jointsDeg[2]) * smoothT,
          fromWp.jointsDeg[3] +
            (toWp.jointsDeg[3] - fromWp.jointsDeg[3]) * smoothT,
          fromWp.jointsDeg[4] +
            (toWp.jointsDeg[4] - fromWp.jointsDeg[4]) * smoothT,
          fromWp.jointsDeg[5] +
            (toWp.jointsDeg[5] - fromWp.jointsDeg[5]) * smoothT,
        ];
        setJointsDeg(interpJoints);
        setIkTargetPose(computeForwardKinematics(interpJoints).tcpPose);
      } else {
        // Cartesian Linear Interpolation via Real-Time IK
        const linearPose: TcpPose = {
          xMm:
            fromWp.tcpPose.xMm +
            (toWp.tcpPose.xMm - fromWp.tcpPose.xMm) * smoothT,
          yMm:
            fromWp.tcpPose.yMm +
            (toWp.tcpPose.yMm - fromWp.tcpPose.yMm) * smoothT,
          zMm:
            fromWp.tcpPose.zMm +
            (toWp.tcpPose.zMm - fromWp.tcpPose.zMm) * smoothT,
          rollDeg:
            fromWp.tcpPose.rollDeg +
            (toWp.tcpPose.rollDeg - fromWp.tcpPose.rollDeg) * smoothT,
          pitchDeg:
            fromWp.tcpPose.pitchDeg +
            (toWp.tcpPose.pitchDeg - fromWp.tcpPose.pitchDeg) * smoothT,
          yawDeg:
            fromWp.tcpPose.yawDeg +
            (toWp.tcpPose.yawDeg - fromWp.tcpPose.yawDeg) * smoothT,
        };
        setIkTargetPose(linearPose);
        setJointsDeg((curr) => solveInverseKinematics(linearPose, curr).jointsDeg);
      }

      if (rawT >= 1) {
        segIdx = (segIdx + 1) % waypoints.length;
        setActiveWaypointIndex(segIdx);
        segElapsed = 0;
      }

      animId = requestAnimationFrame(stepTrajectory);
    };

    setActiveWaypointIndex(0);
    animId = requestAnimationFrame(stepTrajectory);
    return () => cancelAnimationFrame(animId);
  }, [
    isTrajectoryRunning,
    waypoints,
    trajectoryInterpolation,
    trajectorySpeedMultiplier,
  ]);

  // Built-in 20-50 Hz Live Hardware Telemetry Stream Simulator (FR-02, Section 6)
  useEffect(() => {
    if (!isSimulatorStreaming) return;

    setConnectionState('simulated');
    const intervalMs = Math.round(1000 / streamFrequencyHz);
    let simClock = 0;
    let tickCounter = 0;

    const timer = window.setInterval(() => {
      simClock += intervalMs / 1000;
      tickCounter++;
      const packet = generateSimulatedTelemetryPacket(
        simClock,
        injectOverloadFault
      );

      setJointsDeg(packet.joints_deg);
      setGripperPct(packet.gripper.opening_pct);
      setMaxTempC(packet.telemetry.max_temp_c);
      setTotalCurrentA(packet.telemetry.total_current_a);
      const simulatedLatency = 11 + (tickCounter % 7);
      setLatencyMs(simulatedLatency);
      setIkTargetPose(computeForwardKinematics(packet.joints_deg).tcpPose);

      // Record every 4th packet to log history buffer
      if (tickCounter % 4 === 0) {
        appendLogSnapshot(
          packet.joints_deg,
          packet.gripper.opening_pct,
          'live',
          packet.telemetry.max_temp_c,
          packet.telemetry.total_current_a,
          simulatedLatency
        );
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isSimulatorStreaming, streamFrequencyHz, injectOverloadFault, appendLogSnapshot]);

  // External Custom WebSocket / MQTT over WebSocket Client with Auto-Reconnect
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const handleConnectWebSocket = useCallback(() => {
    if (!wsUrl.trim()) return;
    setIsSimulatorStreaming(false);
    setConnectionState('reconnecting');

    try {
      if (wsRef.current) {
        wsRef.current.close();
      }
      const socket = new WebSocket(wsUrl.trim());
      wsRef.current = socket;

      socket.onopen = () => {
        setConnectionState('connected');
      };

      socket.onmessage = (event) => {
        const receiveTime = performance.now();
        try {
          const data = JSON.parse(event.data) as Partial<TelemetryPacket>;
          if (
            Array.isArray(data.joints_deg) &&
            data.joints_deg.length === 6
          ) {
            const clampedJoints: [
              number,
              number,
              number,
              number,
              number,
              number,
            ] = [
              clampJointAngle(0, Number(data.joints_deg[0])),
              clampJointAngle(1, Number(data.joints_deg[1])),
              clampJointAngle(2, Number(data.joints_deg[2])),
              clampJointAngle(3, Number(data.joints_deg[3])),
              clampJointAngle(4, Number(data.joints_deg[4])),
              clampJointAngle(5, Number(data.joints_deg[5])),
            ];
            setJointsDeg(clampedJoints);
            const gPct = data.gripper?.opening_pct ?? gripperPct;
            setGripperPct(gPct);
            if (data.telemetry) {
              setMaxTempC(Number(data.telemetry.max_temp_c) || 41.0);
              setTotalCurrentA(Number(data.telemetry.total_current_a) || 2.2);
            }
            const packetTs = data.timestamp
              ? Date.parse(data.timestamp)
              : Date.now();
            const computedLat = Math.max(
              4,
              Math.min(250, Math.abs(Date.now() - packetTs))
            );
            setLatencyMs(
              Number.isNaN(computedLat)
                ? Math.round(performance.now() - receiveTime + 12)
                : computedLat
            );
            appendLogSnapshot(clampedJoints, gPct, 'live');
          }
        } catch {
          // Ignore malformed JSON frames
        }
      };

      socket.onerror = () => {
        setConnectionState('reconnecting');
      };

      socket.onclose = () => {
        // Fallback smoothly to simulated mode if external socket closes
        setConnectionState('simulated');
      };
    } catch {
      setConnectionState('simulated');
    }
  }, [wsUrl, gripperPct, appendLogSnapshot]);

  const handleDisconnectWebSocket = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionState('simulated');
  };

  // Replay Log Playback Loop
  useEffect(() => {
    if (!isReplaying || recordedLogs.length === 0) return;

    const timer = window.setInterval(() => {
      setReplayIndex((prev) => {
        const nextIdx = (prev + 1) % recordedLogs.length;
        const entry = recordedLogs[nextIdx];
        if (entry) {
          setJointsDeg(entry.joints_deg);
          setGripperPct(entry.gripper.opening_pct);
          setMaxTempC(entry.telemetry.max_temp_c);
          setTotalCurrentA(entry.telemetry.total_current_a);
          setLatencyMs(entry.latencyMs);
        }
        return nextIdx;
      });
    }, 120);

    return () => clearInterval(timer);
  }, [isReplaying, recordedLogs]);

  // Keyboard shortcut 'H' to toggle collapsible Zen Mode dock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key.toLowerCase() === 'h') {
        setIsDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Waypoint Management Handlers
  const handleAddCurrentAsWaypoint = (customLabel?: string) => {
    const idx = waypoints.length + 1;
    const formattedNum = idx < 10 ? `0${idx}` : `${idx}`;
    const newWp: Waypoint = {
      id: `wp-${Date.now()}`,
      label: customLabel
        ? `${formattedNum}. ${customLabel}`
        : `${formattedNum}. Pose (${fkResult.tcpPose.xMm.toFixed(0)}, ${fkResult.tcpPose.yMm.toFixed(0)})`,
      jointsDeg: [...jointsDeg],
      gripperPct,
      tcpPose: fkResult.tcpPose,
      dwellSec: 0.4,
    };
    setWaypoints((prev) => [...prev, newWp]);
  };

  const handleDeleteWaypoint = (id: string) => {
    setWaypoints((prev) => prev.filter((w) => w.id !== id));
  };

  return (
    <div
      id="top"
      className="relative w-screen h-screen overflow-hidden bg-[#F1F5F9] flex flex-col select-none"
    >
      {/* Top Bar Contract + Live Telemetry Readout & 3D Overlay Sub-Toolbar */}
      <TopBarAndHud
        operationMode={operationMode}
        onSelectOperationMode={handleSelectOperationMode}
        onExportJson={() => exportTelemetryLogs(recordedLogs, 'json')}
        tcpPose={fkResult.tcpPose}
        safetyReport={safetyReport}
        connectionState={connectionState}
        latencyMs={latencyMs}
        fps={fps}
        maxTempC={maxTempC}
        totalCurrentA={totalCurrentA}
        cameraPreset={cameraPreset}
        onSelectCameraPreset={(preset) => {
          setCameraPreset(preset);
          setCameraPresetTrigger((c) => c + 1);
        }}
        visualHelpers={visualHelpers}
        onToggleVisualHelper={(key) =>
          setVisualHelpers((prev) => ({ ...prev, [key]: !prev[key] }))
        }
        onClearTrail={() => setClearTrailTrigger((c) => c + 1)}
      />

      {/* Full-Screen 3D Robotic Arm Digital Twin Canvas Viewport */}
      <main className="relative flex-1 w-full h-full overflow-hidden">
        <RobotViewport3D
          jointsDeg={jointsDeg}
          gripperPct={gripperPct}
          safetyReport={safetyReport}
          visualHelpers={visualHelpers}
          cameraPreset={cameraPreset}
          cameraPresetTrigger={cameraPresetTrigger}
          waypoints={waypoints}
          ikTargetPose={ikTargetPose}
          onIkGizmoTransform={handleUpdateIkTarget}
          onFpsUpdate={setFps}
          clearTrailTrigger={clearTrailTrigger}
        />
      </main>

      {/* Collapsible Unified Bottom Control Dock (Zero Central Viewport Occlusion) */}
      <ControlDock
        isCollapsed={isDockCollapsed}
        onToggleCollapse={() => setIsDockCollapsed((prev) => !prev)}
        activeTab={activeTab}
        onSelectTab={handleSelectDockTab}
        operationMode={operationMode}
        jointsDeg={jointsDeg}
        onUpdateJoint={handleUpdateJoint}
        onApplyPose={handleApplyPose}
        gripperPct={gripperPct}
        onUpdateGripper={(pct) => {
          setGripperPct(pct);
          appendLogSnapshot(jointsDeg, pct, 'simulation');
        }}
        safetyReport={safetyReport}
        tcpPose={fkResult.tcpPose}
        ikTargetPose={ikTargetPose}
        onUpdateIkTarget={handleUpdateIkTarget}
        onSyncIkTargetToCurrentTcp={handleSyncIkTargetToCurrentTcp}
        visualHelpers={visualHelpers}
        onSetGizmoMode={(mode: GizmoMode) =>
          setVisualHelpers((prev) => ({ ...prev, gizmoMode: mode }))
        }
        onSetShowIkGizmo={(visible: boolean) =>
          setVisualHelpers((prev) => ({ ...prev, showIkGizmo: visible }))
        }
        waypoints={waypoints}
        onAddCurrentAsWaypoint={handleAddCurrentAsWaypoint}
        onDeleteWaypoint={handleDeleteWaypoint}
        onLoadDefaultWaypoints={() => {
          setIsTrajectoryRunning(false);
          setWaypoints(createDefaultWaypoints());
        }}
        onJumpToWaypoint={(wp) => handleApplyPose(wp.jointsDeg, wp.gripperPct)}
        isTrajectoryRunning={isTrajectoryRunning}
        onToggleTrajectoryRun={() => {
          setIsSimulatorStreaming(false);
          setIsReplaying(false);
          setIsTrajectoryRunning((prev) => !prev);
        }}
        trajectoryInterpolation={trajectoryInterpolation}
        onSetTrajectoryInterpolation={setTrajectoryInterpolation}
        trajectorySpeedMultiplier={trajectorySpeedMultiplier}
        onSetTrajectorySpeedMultiplier={setTrajectorySpeedMultiplier}
        activeWaypointIndex={activeWaypointIndex}
        connectionState={connectionState}
        wsUrl={wsUrl}
        onSetWsUrl={setWsUrl}
        onConnectWebSocket={handleConnectWebSocket}
        onDisconnectWebSocket={handleDisconnectWebSocket}
        isSimulatorStreaming={isSimulatorStreaming}
        onToggleSimulatorStream={() => {
          setIsTrajectoryRunning(false);
          setIsReplaying(false);
          setIsSimulatorStreaming((prev) => !prev);
        }}
        streamFrequencyHz={streamFrequencyHz}
        onSetStreamFrequencyHz={setStreamFrequencyHz}
        injectOverloadFault={injectOverloadFault}
        onToggleOverloadFault={() => setInjectOverloadFault((prev) => !prev)}
        latestPacket={latestPacket}
        recordedLogs={recordedLogs}
        onClearLogs={() => {
          setIsReplaying(false);
          setRecordedLogs([]);
          setReplayIndex(0);
        }}
        replayIndex={replayIndex}
        onSeekReplay={(idx) => {
          setIsSimulatorStreaming(false);
          setIsTrajectoryRunning(false);
          setReplayIndex(idx);
          const entry = recordedLogs[idx];
          if (entry) {
            setJointsDeg(entry.joints_deg);
            setGripperPct(entry.gripper.opening_pct);
            setMaxTempC(entry.telemetry.max_temp_c);
            setTotalCurrentA(entry.telemetry.total_current_a);
          }
        }}
        isReplaying={isReplaying}
        onToggleReplayPlay={() => {
          setIsSimulatorStreaming(false);
          setIsTrajectoryRunning(false);
          setOperationMode('replay');
          setIsReplaying((prev) => !prev);
        }}
        onExportLogs={(format) => exportTelemetryLogs(recordedLogs, format)}
      />
    </div>
  );
}
