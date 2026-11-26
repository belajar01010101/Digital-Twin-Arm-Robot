import * as THREE from 'three';
import {
  JOINT_SPECS,
  JointDiagnostic,
  JointSafetyLevel,
  SafetyReport,
  TcpPose,
} from '../types/robotics';

/**
 * Mechanical link lengths in meters (1 scene unit = 1 meter = 1000 mm).
 * Total vertical reach ~ 1.24m; max radial workspace radius from Shoulder J2 ~ 0.94m.
 */
export const ROBOT_DIMENSIONS = {
  baseHeight: 0.22,      // Floor to J1 turntable surface
  j1ToJ2Height: 0.14,    // J1 turntable to J2 shoulder pivot (total shoulder Y = 0.36m)
  upperArmLength: 0.42,  // J2 shoulder to J3 elbow pivot
  forearmBaseLen: 0.18,  // J3 elbow to J4 wrist roll split
  forearmTubeLen: 0.20,  // J4 wrist roll split to J5 wrist pitch (total J3->J5 = 0.38m)
  wristToFlange: 0.09,   // J5 wrist pitch to J6 tool flange
  gripperTcpOffset: 0.11,// J6 tool flange to TCP center between jaws
  maxReachRadiusM: 0.96, // Max radial reach from shoulder pivot (0, 0.36, 0)
  minInnerRadiusM: 0.19, // Inner dead-zone sphere around shoulder
};

// Pre-allocated math helpers to keep zero-GC in kinematic calculations
const _matTemp = new THREE.Matrix4();
const _matRot = new THREE.Matrix4();
const _matTrans = new THREE.Matrix4();
const _posVec = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();

export interface ForwardKinematicsResult {
  /** World positions (in meters) of [Base0, J1, J2, J3, J4, J5, J6, TCP] */
  jointPositionsM: THREE.Vector3[];
  /** World transformation matrix of the TCP */
  tcpMatrix: THREE.Matrix4;
  /** Calculated TCP pose in millimeters and degrees */
  tcpPose: TcpPose;
}

/**
 * Clamps a joint angle in degrees to its physical [minDeg, maxDeg] limits.
 */
export function clampJointAngle(jointIndex: number, angleDeg: number): number {
  const spec = JOINT_SPECS[jointIndex];
  if (!spec) return angleDeg;
  return THREE.MathUtils.clamp(angleDeg, spec.minDeg, spec.maxDeg);
}

/**
 * Exact Forward Kinematics (FK) matching the Three.js hierarchical pivot chain:
 * - Base sits at (0, 0, 0)
 * - J1 rotates around +Y at Y = baseHeight (0.22m)
 * - J2 rotates around +Z at Y = +j1ToJ2Height (0.14m -> 0.36m total)
 *   Note: at 0 deg all links point straight up (+Y). Positive Z rotation tilts toward -X,
 *   or we align J2/J3/J5 around Z so positive angle pitches forward (+X).
 *   Specifically, rotating around -Z (or +Z with sign convention) tilts +Y toward +X.
 *   To stay 100% consistent between Three.js pivot.rotation and FK math, both use the exact
 *   same axis-angle convention defined below.
 */
export function applyJointRotationToObject(
  pivot: THREE.Object3D,
  jointIndex: number,
  angleDeg: number
): void {
  const rad = THREE.MathUtils.degToRad(angleDeg);
  const axis = JOINT_SPECS[jointIndex].axis;
  if (axis === 'Y') {
    pivot.rotation.set(0, rad, 0);
  } else if (axis === 'Z') {
    // Rotating by -rad around Z tilts the +Y vertical arm forward toward +X
    pivot.rotation.set(0, 0, -rad);
  } else {
    pivot.rotation.set(rad, 0, 0);
  }
}

/**
 * Computes analytical Forward Kinematics for the 6-DOF arm.
 * Returns the world positions of every joint pivot plus the TCP pose in mm and degrees.
 */
export function computeForwardKinematics(
  jointsDeg: readonly number[]
): ForwardKinematicsResult {
  const positions: THREE.Vector3[] = [];
  const acc = new THREE.Matrix4().identity();

  // 0. Base Ground Origin
  positions.push(new THREE.Vector3(0, 0, 0));

  // 1. Translate up to J1 Turntable (Y = 0.22) & rotate J1 around Y
  _matTrans.makeTranslation(0, ROBOT_DIMENSIONS.baseHeight, 0);
  acc.multiply(_matTrans);
  _matRot.makeRotationY(THREE.MathUtils.degToRad(jointsDeg[0] || 0));
  acc.multiply(_matRot);
  positions.push(new THREE.Vector3().setFromMatrixPosition(acc));

  // 2. Translate up to J2 Shoulder (Y += 0.14) & rotate J2 around Z (-rad tilts toward +X)
  _matTrans.makeTranslation(0, ROBOT_DIMENSIONS.j1ToJ2Height, 0);
  acc.multiply(_matTrans);
  _matRot.makeRotationZ(-THREE.MathUtils.degToRad(jointsDeg[1] || 0));
  acc.multiply(_matRot);
  positions.push(new THREE.Vector3().setFromMatrixPosition(acc));

  // 3. Translate along Upper Arm (Y += 0.42) to J3 Elbow & rotate J3 around Z
  _matTrans.makeTranslation(0, ROBOT_DIMENSIONS.upperArmLength, 0);
  acc.multiply(_matTrans);
  _matRot.makeRotationZ(-THREE.MathUtils.degToRad(jointsDeg[2] || 0));
  acc.multiply(_matRot);
  positions.push(new THREE.Vector3().setFromMatrixPosition(acc));

  // 4. Translate along Forearm lower housing (Y += 0.18) to J4 Wrist 1 Roll & rotate around Y
  _matTrans.makeTranslation(0, ROBOT_DIMENSIONS.forearmBaseLen, 0);
  acc.multiply(_matTrans);
  _matRot.makeRotationY(THREE.MathUtils.degToRad(jointsDeg[3] || 0));
  acc.multiply(_matRot);
  positions.push(new THREE.Vector3().setFromMatrixPosition(acc));

  // 5. Translate along Forearm upper tube (Y += 0.20) to J5 Wrist 2 Pitch & rotate around Z
  _matTrans.makeTranslation(0, ROBOT_DIMENSIONS.forearmTubeLen, 0);
  acc.multiply(_matTrans);
  _matRot.makeRotationZ(-THREE.MathUtils.degToRad(jointsDeg[4] || 0));
  acc.multiply(_matRot);
  positions.push(new THREE.Vector3().setFromMatrixPosition(acc));

  // 6. Translate to J6 Tool Flange (Y += 0.09) & rotate around Y
  _matTrans.makeTranslation(0, ROBOT_DIMENSIONS.wristToFlange, 0);
  acc.multiply(_matTrans);
  _matRot.makeRotationY(THREE.MathUtils.degToRad(jointsDeg[5] || 0));
  acc.multiply(_matRot);
  positions.push(new THREE.Vector3().setFromMatrixPosition(acc));

  // 7. Translate to Tool Center Point (TCP) between gripper fingers (Y += 0.11)
  _matTrans.makeTranslation(0, ROBOT_DIMENSIONS.gripperTcpOffset, 0);
  acc.multiply(_matTrans);
  const tcpPos = new THREE.Vector3().setFromMatrixPosition(acc);
  positions.push(tcpPos);

  acc.decompose(_posVec, _quat, new THREE.Vector3());
  _euler.setFromQuaternion(_quat, 'XYZ');

  const tcpPose: TcpPose = {
    xMm: Math.round(tcpPos.x * 1000 * 10) / 10,
    yMm: Math.round(tcpPos.y * 1000 * 10) / 10,
    zMm: Math.round(tcpPos.z * 1000 * 10) / 10,
    rollDeg: Math.round(THREE.MathUtils.radToDeg(_euler.x) * 10) / 10,
    pitchDeg: Math.round(THREE.MathUtils.radToDeg(_euler.z) * 10) / 10,
    yawDeg: Math.round(THREE.MathUtils.radToDeg(_euler.y) * 10) / 10,
  };

  return {
    jointPositionsM: positions,
    tcpMatrix: acc.clone(),
    tcpPose,
  };
}

export interface IkSolutionResult {
  jointsDeg: [number, number, number, number, number, number];
  reachable: boolean;
  errorMm: number;
  iterations: number;
}

/**
 * Real-time Cyclic Coordinate Descent (CCD) + Orientation Alignment 6-DOF Inverse Kinematics Solver.
 * Solves for [J1..J6] to reach target (xMm, yMm, zMm) and tool orientation (rollDeg, pitchDeg, yawDeg)
 * while strictly respecting joint limits [minDeg, maxDeg].
 */
export function solveInverseKinematics(
  targetPose: TcpPose,
  currentJointsDeg: readonly number[],
  maxIterations = 32,
  toleranceMm = 4.5
): IkSolutionResult {
  const joints: [number, number, number, number, number, number] = [
    currentJointsDeg[0] ?? 0,
    currentJointsDeg[1] ?? 0,
    currentJointsDeg[2] ?? 0,
    currentJointsDeg[3] ?? 0,
    currentJointsDeg[4] ?? 0,
    currentJointsDeg[5] ?? 0,
  ];

  const targetPosM = new THREE.Vector3(
    targetPose.xMm / 1000,
    targetPose.yMm / 1000,
    targetPose.zMm / 1000
  );

  // Fast analytical seed for J1 (base yaw) when target has horizontal radius > 30mm
  const horizRadius = Math.hypot(targetPosM.x, targetPosM.z);
  if (horizRadius > 0.03) {
    // At J1 = 0, positive pitch tilts toward +X. Rotating J1 around +Y by theta moves +X toward (cos(theta), 0, -sin(theta))
    const analyticalYawDeg = THREE.MathUtils.radToDeg(
      Math.atan2(-targetPosM.z, targetPosM.x)
    );
    joints[0] = clampJointAngle(0, analyticalYawDeg);
  }

  const toTcp = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const worldAxis = new THREE.Vector3();
  const crossVec = new THREE.Vector3();

  let errorMm = Infinity;
  let iter = 0;

  // Local rotation axis for each joint in its local frame
  const getJointWorldAxis = (jointIdx: number, currentAngles: number[]): THREE.Vector3 => {
    const acc = new THREE.Matrix4().identity();
    const steps: { ty: number; axis: 'Y' | 'Z'; deg: number }[] = [
      { ty: ROBOT_DIMENSIONS.baseHeight, axis: 'Y', deg: currentAngles[0] },
      { ty: ROBOT_DIMENSIONS.j1ToJ2Height, axis: 'Z', deg: currentAngles[1] },
      { ty: ROBOT_DIMENSIONS.upperArmLength, axis: 'Z', deg: currentAngles[2] },
      { ty: ROBOT_DIMENSIONS.forearmBaseLen, axis: 'Y', deg: currentAngles[3] },
      { ty: ROBOT_DIMENSIONS.forearmTubeLen, axis: 'Z', deg: currentAngles[4] },
      { ty: ROBOT_DIMENSIONS.wristToFlange, axis: 'Y', deg: currentAngles[5] },
    ];

    for (let i = 0; i <= jointIdx; i++) {
      _matTrans.makeTranslation(0, steps[i].ty, 0);
      acc.multiply(_matTrans);
      if (i < jointIdx) {
        if (steps[i].axis === 'Y') {
          _matRot.makeRotationY(THREE.MathUtils.degToRad(steps[i].deg));
        } else {
          _matRot.makeRotationZ(-THREE.MathUtils.degToRad(steps[i].deg));
        }
        acc.multiply(_matRot);
      }
    }

    const rotOnly = new THREE.Matrix4().extractRotation(acc);
    if (steps[jointIdx].axis === 'Y') {
      return new THREE.Vector3(0, 1, 0).applyMatrix4(rotOnly).normalize();
    } else {
      // Negative Z rotation corresponds to positive joint degree
      return new THREE.Vector3(0, 0, -1).applyMatrix4(rotOnly).normalize();
    }
  };

  for (iter = 0; iter < maxIterations; iter++) {
    const fk = computeForwardKinematics(joints);
    const tcpM = fk.jointPositionsM[7];
    errorMm = tcpM.distanceTo(targetPosM) * 1000;

    if (errorMm <= toleranceMm) {
      break;
    }

    // Iterate from wrist J5 down to base J1 for position convergence
    const activeOrder = [4, 2, 1, 0, 3];
    for (const jIdx of activeOrder) {
      const fkStep = computeForwardKinematics(joints);
      const pivotPos = fkStep.jointPositionsM[jIdx + 1];
      const currentTcp = fkStep.jointPositionsM[7];

      toTcp.subVectors(currentTcp, pivotPos);
      toTarget.subVectors(targetPosM, pivotPos);

      const lenTcp = toTcp.length();
      const lenTarget = toTarget.length();
      if (lenTcp < 1e-4 || lenTarget < 1e-4) continue;

      worldAxis.copy(getJointWorldAxis(jIdx, joints));

      // Project both vectors onto the plane perpendicular to worldAxis
      toTcp.addScaledVector(worldAxis, -toTcp.dot(worldAxis));
      toTarget.addScaledVector(worldAxis, -toTarget.dot(worldAxis));

      if (toTcp.lengthSq() < 1e-6 || toTarget.lengthSq() < 1e-6) continue;
      toTcp.normalize();
      toTarget.normalize();

      const cosAngle = THREE.MathUtils.clamp(toTcp.dot(toTarget), -1, 1);
      let deltaRad = Math.acos(cosAngle);
      crossVec.crossVectors(toTcp, toTarget);
      if (crossVec.dot(worldAxis) < 0) {
        deltaRad = -deltaRad;
      }

      // Damped step for stability and natural posture
      const damping = jIdx === 4 ? 0.65 : 0.85;
      const deltaDeg = THREE.MathUtils.radToDeg(deltaRad) * damping;
      joints[jIdx] = clampJointAngle(jIdx, joints[jIdx] + deltaDeg);
    }

    // Keep wrist pitch J5 balanced with desired pitch inclination
    const desiredGlobalPitch = targetPose.pitchDeg;
    const armPitchSum = joints[1] + joints[2];
    const targetJ5 = THREE.MathUtils.clamp(
      desiredGlobalPitch - armPitchSum * 0.35,
      JOINT_SPECS[4].minDeg,
      JOINT_SPECS[4].maxDeg
    );
    joints[4] = clampJointAngle(4, THREE.MathUtils.lerp(joints[4], targetJ5, 0.25));
  }

  // Apply tool roll/yaw adjustments to J4 and J6
  joints[3] = clampJointAngle(3, targetPose.rollDeg);
  joints[5] = clampJointAngle(5, targetPose.yawDeg - joints[0]);

  const finalFk = computeForwardKinematics(joints);
  const finalErrorMm =
    Math.round(finalFk.jointPositionsM[7].distanceTo(targetPosM) * 1000 * 10) / 10;

  // Check if target is outside physical reach envelope or below floor
  const shoulderOrigin = new THREE.Vector3(
    0,
    ROBOT_DIMENSIONS.baseHeight + ROBOT_DIMENSIONS.j1ToJ2Height,
    0
  );
  const distFromShoulder = targetPosM.distanceTo(shoulderOrigin);
  const reachable =
    finalErrorMm <= 25 &&
    distFromShoulder <= ROBOT_DIMENSIONS.maxReachRadiusM + 0.02 &&
    targetPosM.y >= -0.01;

  return {
    jointsDeg: joints,
    reachable,
    errorMm: finalErrorMm,
    iterations: iter,
  };
}

/**
 * Evaluates joint limits, floor proximity collision risk, and IK reachability
 * to produce a complete real-time safety diagnostic report (FR-04).
 */
export function evaluateSafetyDiagnostics(
  jointsDeg: readonly number[],
  fk: ForwardKinematicsResult,
  ikUnreachable = false,
  ikErrorMm = 0,
  isOverloadInjected = false
): SafetyReport {
  const jointDiagnostics: JointDiagnostic[] = [];
  const messages: string[] = [];
  let hasCriticalLimit = false;
  let hasWarningLimit = false;

  for (let i = 0; i < JOINT_SPECS.length; i++) {
    const spec = JOINT_SPECS[i];
    const angle = jointsDeg[i] ?? 0;
    const halfSpan = (spec.maxDeg - spec.minDeg) / 2;
    const center = (spec.maxDeg + spec.minDeg) / 2;
    const utilizationPct = Math.min(
      100,
      Math.round((Math.abs(angle - center) / halfSpan) * 100)
    );

    let level: JointSafetyLevel = 'normal';
    let reason: string | undefined;

    if (utilizationPct >= 98) {
      level = 'critical';
      hasCriticalLimit = true;
      reason = `${spec.code} (${spec.name}) reached hardware limit (${angle.toFixed(1)}°)`;
      messages.push(reason);
    } else if (utilizationPct >= 85) {
      level = 'warning';
      hasWarningLimit = true;
      reason = `${spec.code} approaching limit (${utilizationPct}% of range)`;
      messages.push(reason);
    }

    jointDiagnostics.push({
      jointIndex: i,
      angleDeg: angle,
      utilizationPct,
      level,
      reason,
    });
  }

  // Check floor clearance for Elbow (J3), Wrist (J4, J5, J6), and TCP
  let minClearanceM = Infinity;
  for (let idx = 3; idx < fk.jointPositionsM.length; idx++) {
    const y = fk.jointPositionsM[idx].y;
    if (y < minClearanceM) {
      minClearanceM = y;
    }
  }
  const minClearanceMm = Math.round(minClearanceM * 1000);
  const floorCollisionRisk = minClearanceMm <= 35;

  if (floorCollisionRisk) {
    messages.unshift(
      `Floor collision risk: Tool clearance is ${minClearanceMm} mm (threshold 35 mm)`
    );
  }

  if (ikUnreachable) {
    messages.unshift(
      `Target unreachable: Residual distance ${ikErrorMm.toFixed(1)} mm exceeds workspace envelope`
    );
  }

  if (isOverloadInjected) {
    messages.unshift('Actuator current overload (> 4.8 A) and thermal warning on J2/J3');
  }

  let overallStatus: SafetyReport['overallStatus'] = 'OK';
  if (isOverloadInjected) {
    overallStatus = 'OVERLOAD';
  } else if (floorCollisionRisk) {
    overallStatus = 'COLLISION_RISK';
  } else if (ikUnreachable) {
    overallStatus = 'UNREACHABLE';
  } else if (hasCriticalLimit || hasWarningLimit) {
    overallStatus = 'WARN_LIMIT';
  }

  return {
    overallStatus,
    joints: jointDiagnostics,
    floorCollisionRisk,
    minClearanceMm,
    ikUnreachable,
    ikErrorMm,
    activeMessages: messages,
  };
}
