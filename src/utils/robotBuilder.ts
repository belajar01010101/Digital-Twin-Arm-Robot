import * as THREE from 'three';
import { JointSafetyLevel } from '../types/robotics';
import { ROBOT_DIMENSIONS } from './kinematics';

export interface RoboticArmRig {
  rootGroup: THREE.Group;
  pivots: THREE.Group[]; // [J1, J2, J3, J4, J5, J6]
  tcpAnchor: THREE.Group;
  leftFinger: THREE.Group;
  rightFinger: THREE.Group;
  localAxesHelpers: THREE.Group[];
  setJointSafetyHighlight: (
    jointLevels: JointSafetyLevel[],
    floorCollisionRisk: boolean,
    enabled: boolean
  ) => void;
  setGripperOpening: (openingPct: number) => void;
  setLocalAxesVisible: (visible: boolean) => void;
  dispose: () => void;
}

/**
 * Generates a procedural brushed metal & safety stripe canvas texture for industrial arm links.
 */
function createIndustrialDecalTexture(
  renderer: THREE.WebGLRenderer,
  label: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // Clean titanium white-silver base
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(0, 0, 512, 128);

  // Subtle horizontal brushed lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1;
  for (let y = 0; y < 128; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Safety orange accent band
  ctx.fillStyle = '#EA580C';
  ctx.fillRect(24, 18, 12, 92);

  // Dark slate technical label
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 34px "JetBrains Mono", monospace';
  ctx.fillText(label, 52, 62);

  ctx.fillStyle = '#475569';
  ctx.font = '500 20px "JetBrains Mono", monospace';
  ctx.fillText('ROBOTWIN 6-DOF SERIES', 52, 96);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates a crisp 3-axis RGB coordinate frame gizmo (X=Red, Y=Green, Z=Blue) using cylinder/cone arrows.
 */
export function createCoordinateAxesGizmo(scale = 0.11): THREE.Group {
  const group = new THREE.Group();
  const shaftGeo = new THREE.CylinderGeometry(0.0035, 0.0035, scale, 10);
  shaftGeo.translate(0, scale / 2, 0);
  const headGeo = new THREE.ConeGeometry(0.009, 0.024, 12);
  headGeo.translate(0, scale + 0.012, 0);

  const axes: { color: number; rot: [number, number, number] }[] = [
    { color: 0xef4444, rot: [0, 0, -Math.PI / 2] }, // +X Red
    { color: 0x16a34a, rot: [0, 0, 0] },            // +Y Green
    { color: 0x0284c7, rot: [Math.PI / 2, 0, 0] },  // +Z Blue
  ];

  axes.forEach(({ color, rot }) => {
    const mat = new THREE.MeshBasicMaterial({ color });
    const axisGroup = new THREE.Group();
    const shaft = new THREE.Mesh(shaftGeo, mat);
    const head = new THREE.Mesh(headGeo, mat);
    axisGroup.add(shaft, head);
    axisGroup.rotation.set(rot[0], rot[1], rot[2]);
    group.add(axisGroup);
  });

  return group;
}

/**
 * Creates a circular bolt ring using THREE.InstancedMesh for mechanical realism with 1 draw call.
 */
function createBoltRingInstanced(
  radius: number,
  count: number,
  yPos: number,
  axis: 'Y' | 'Z',
  material: THREE.Material
): THREE.InstancedMesh {
  const boltGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.008, 8);
  const instanced = new THREE.InstancedMesh(boltGeo, material, count);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    if (axis === 'Y') {
      dummy.position.set(
        Math.cos(angle) * radius,
        yPos,
        Math.sin(angle) * radius
      );
      dummy.rotation.set(0, 0, 0);
    } else {
      dummy.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        yPos
      );
      dummy.rotation.set(Math.PI / 2, 0, 0);
    }
    dummy.updateMatrix();
    instanced.setMatrixAt(i, dummy.matrix);
  }
  instanced.instanceMatrix.needsUpdate = true;
  instanced.computeBoundingSphere();
  return instanced;
}

/**
 * Builds the complete hierarchical 6-DOF Robotic Arm 3D assembly.
 * Respects exact pivot dimensions in ROBOT_DIMENSIONS so visual angles have 0.00° deviation from FK/IK math.
 */
export function buildRoboticArmRig(renderer: THREE.WebGLRenderer): RoboticArmRig {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'RoboTwinArmRoot';

  const disposableGeometries: THREE.BufferGeometry[] = [];
  const disposableMaterials: THREE.Material[] = [];
  const disposableTextures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMaterials.push(m);
    return m;
  };

  // Shared PBR structural materials (varying roughness >= 0.25 across adjacent parts)
  const darkCastIronMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.75,
      roughness: 0.48,
    })
  );

  const brushedSteelMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x94a3b8,
      metalness: 0.92,
      roughness: 0.18,
      clearcoat: 0.3,
    })
  );

  const safetyOrangeAccentMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xea580c,
      metalness: 0.35,
      roughness: 0.22,
      clearcoat: 0.6,
    })
  );

  const darkServoCapMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.6,
      roughness: 0.35,
    })
  );

  // Per-joint link body materials so each joint can glow Amber/Red on limit/collision warnings
  const jointHousingMaterials: THREE.MeshPhysicalMaterial[] = [];
  for (let i = 0; i < 6; i++) {
    const mat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xf1f5f9,
        metalness: 0.25,
        roughness: 0.32,
        clearcoat: 0.45,
        clearcoatRoughness: 0.2,
      })
    );
    jointHousingMaterials.push(mat);
  }

  const decalUpperTex = createIndustrialDecalTexture(renderer, 'RT-600 // LINK A');
  const decalForearmTex = createIndustrialDecalTexture(renderer, 'RT-600 // LINK B');
  disposableTextures.push(decalUpperTex, decalForearmTex);

  const upperDecalMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: decalUpperTex,
      metalness: 0.2,
      roughness: 0.35,
    })
  );
  const forearmDecalMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: decalForearmTex,
      metalness: 0.2,
      roughness: 0.35,
    })
  );

  const pivots: THREE.Group[] = [];
  const localAxesHelpers: THREE.Group[] = [];

  // ============================================================================
  // 0. FIXED BASE PEDESTAL (Y: 0.00m -> 0.22m)
  // ============================================================================
  const baseGroup = new THREE.Group();
  rootGroup.add(baseGroup);

  // Heavy octagonal-like mounting plate at Y = 0
  const plateMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.185, 0.20, 0.03, 24)),
    darkCastIronMat
  );
  plateMesh.position.y = 0.015;
  plateMesh.castShadow = true;
  plateMesh.receiveShadow = true;
  baseGroup.add(plateMesh);

  // Base pedestal column
  const pedestalColumn = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.125, 0.15, 0.16, 32)),
    darkCastIronMat
  );
  pedestalColumn.position.y = 0.11;
  pedestalColumn.castShadow = true;
  pedestalColumn.receiveShadow = true;
  baseGroup.add(pedestalColumn);

  // Machined bearing collar below J1
  const baseBearingRing = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.132, 0.132, 0.028, 32)),
    brushedSteelMat
  );
  baseBearingRing.position.y = 0.205;
  baseGroup.add(baseBearingRing);

  // Anchor bolts around floor plate
  const baseBolts = createBoltRingInstanced(0.17, 12, 0.032, 'Y', brushedSteelMat);
  disposableGeometries.push(baseBolts.geometry);
  baseGroup.add(baseBolts);

  // Power & EtherCAT junction box on the back of the base
  const junctionBox = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.09, 0.08, 0.05)),
    darkServoCapMat
  );
  junctionBox.position.set(-0.135, 0.09, 0);
  baseGroup.add(junctionBox);

  // ============================================================================
  // 1. J1 PIVOT — BASE YAW (Origin at Y = 0.22m, rotates around +Y)
  // ============================================================================
  const j1Pivot = new THREE.Group();
  j1Pivot.position.set(0, ROBOT_DIMENSIONS.baseHeight, 0);
  rootGroup.add(j1Pivot);
  pivots.push(j1Pivot);

  const j1Axes = createCoordinateAxesGizmo(0.13);
  j1Pivot.add(j1Axes);
  localAxesHelpers.push(j1Axes);

  // Turntable rotating drum
  const j1Turntable = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.12, 0.125, 0.06, 32)),
    jointHousingMaterials[0]
  );
  j1Turntable.position.y = 0.03;
  j1Turntable.castShadow = true;
  j1Turntable.receiveShadow = true;
  j1Pivot.add(j1Turntable);

  // Orange safety ring at turntable base
  const j1OrangeCollar = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.123, 0.006, 12, 36)),
    safetyOrangeAccentMat
  );
  j1OrangeCollar.rotation.x = Math.PI / 2;
  j1OrangeCollar.position.y = 0.006;
  j1Pivot.add(j1OrangeCollar);

  // Dual shoulder support clevis brackets rising to Y = 0.14m (J2 height)
  const clevisGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.13, 0.036));
  const leftClevis = new THREE.Mesh(clevisGeo, jointHousingMaterials[0]);
  leftClevis.position.set(0, 0.11, 0.068);
  leftClevis.castShadow = true;
  const rightClevis = new THREE.Mesh(clevisGeo, jointHousingMaterials[0]);
  rightClevis.position.set(0, 0.11, -0.068);
  rightClevis.castShadow = true;
  j1Pivot.add(leftClevis, rightClevis);

  // ============================================================================
  // 2. J2 PIVOT — SHOULDER PITCH (Origin at Y = +0.14m from J1, rotates around Z)
  // ============================================================================
  const j2Pivot = new THREE.Group();
  j2Pivot.position.set(0, ROBOT_DIMENSIONS.j1ToJ2Height, 0);
  j1Pivot.add(j2Pivot);
  pivots.push(j2Pivot);

  const j2Axes = createCoordinateAxesGizmo(0.13);
  j2Pivot.add(j2Axes);
  localAxesHelpers.push(j2Axes);

  // Horizontal shoulder motor drum aligned along Z
  const j2MotorDrum = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.082, 0.082, 0.185, 32)),
    darkServoCapMat
  );
  j2MotorDrum.rotation.x = Math.PI / 2;
  j2MotorDrum.castShadow = true;
  j2Pivot.add(j2MotorDrum);

  // Anodized orange end caps on shoulder drum
  const j2CapGeo = trackGeo(new THREE.CylinderGeometry(0.068, 0.072, 0.20, 28));
  const j2Cap = new THREE.Mesh(j2CapGeo, safetyOrangeAccentMat);
  j2Cap.rotation.x = Math.PI / 2;
  j2Pivot.add(j2Cap);

  const j2Bolts = createBoltRingInstanced(0.055, 8, 0.102, 'Z', brushedSteelMat);
  disposableGeometries.push(j2Bolts.geometry);
  j2Pivot.add(j2Bolts);

  // Upper Arm Structural Twin Spars (Y: 0 -> 0.42m)
  const upperArmLength = ROBOT_DIMENSIONS.upperArmLength;
  const upperMainBody = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.095, upperArmLength - 0.06, 0.092)),
    jointHousingMaterials[1]
  );
  upperMainBody.position.set(0, upperArmLength / 2, 0);
  upperMainBody.castShadow = true;
  upperMainBody.receiveShadow = true;
  j2Pivot.add(upperMainBody);

  // Branded decal plate on side of Upper Arm
  const upperDecalPlate = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(0.28, 0.07)),
    upperDecalMat
  );
  upperDecalPlate.position.set(0, upperArmLength / 2, 0.047);
  upperDecalPlate.rotation.z = Math.PI / 2;
  j2Pivot.add(upperDecalPlate);

  // Decorative recessed cooling ribs on upper arm
  const ribGeo = trackGeo(new THREE.BoxGeometry(0.102, 0.18, 0.025));
  const upperRib = new THREE.Mesh(ribGeo, darkCastIronMat);
  upperRib.position.set(0, upperArmLength * 0.5, 0);
  j2Pivot.add(upperRib);

  // ============================================================================
  // 3. J3 PIVOT — ELBOW PITCH (Origin at Y = +0.42m from J2, rotates around Z)
  // ============================================================================
  const j3Pivot = new THREE.Group();
  j3Pivot.position.set(0, ROBOT_DIMENSIONS.upperArmLength, 0);
  j2Pivot.add(j3Pivot);
  pivots.push(j3Pivot);

  const j3Axes = createCoordinateAxesGizmo(0.11);
  j3Pivot.add(j3Axes);
  localAxesHelpers.push(j3Axes);

  // Elbow motor housing aligned along Z
  const j3Drum = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.066, 0.066, 0.15, 28)),
    darkServoCapMat
  );
  j3Drum.rotation.x = Math.PI / 2;
  j3Drum.castShadow = true;
  j3Pivot.add(j3Drum);

  const j3OrangeRing = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.052, 0.052, 0.162, 24)),
    safetyOrangeAccentMat
  );
  j3OrangeRing.rotation.x = Math.PI / 2;
  j3Pivot.add(j3OrangeRing);

  // Lower Forearm housing rising to J4 split (Y: 0 -> 0.18m)
  const forearmLower = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.052, 0.06, ROBOT_DIMENSIONS.forearmBaseLen, 24)),
    jointHousingMaterials[2]
  );
  forearmLower.position.y = ROBOT_DIMENSIONS.forearmBaseLen / 2;
  forearmLower.castShadow = true;
  forearmLower.receiveShadow = true;
  j3Pivot.add(forearmLower);

  // ============================================================================
  // 4. J4 PIVOT — WRIST 1 ROLL (Origin at Y = +0.18m from J3, rotates around Y)
  // ============================================================================
  const j4Pivot = new THREE.Group();
  j4Pivot.position.set(0, ROBOT_DIMENSIONS.forearmBaseLen, 0);
  j3Pivot.add(j4Pivot);
  pivots.push(j4Pivot);

  const j4Axes = createCoordinateAxesGizmo(0.10);
  j4Pivot.add(j4Axes);
  localAxesHelpers.push(j4Axes);

  // Machined metallic rotation collar at J4 split
  const j4Collar = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.055, 0.055, 0.024, 28)),
    brushedSteelMat
  );
  j4Collar.position.y = 0.012;
  j4Pivot.add(j4Collar);

  // Upper Forearm tube rising to J5 Wrist Pitch (Y: 0 -> 0.20m)
  const forearmUpper = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.044, 0.05, ROBOT_DIMENSIONS.forearmTubeLen - 0.02, 24)),
    jointHousingMaterials[3]
  );
  forearmUpper.position.y = ROBOT_DIMENSIONS.forearmTubeLen / 2;
  forearmUpper.castShadow = true;
  j4Pivot.add(forearmUpper);

  // Forearm specification plate
  const forearmDecal = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(0.14, 0.036)),
    forearmDecalMat
  );
  forearmDecal.position.set(0, ROBOT_DIMENSIONS.forearmTubeLen * 0.52, 0.049);
  forearmDecal.rotation.z = Math.PI / 2;
  j4Pivot.add(forearmDecal);

  // Wrist fork brackets leading into J5
  const wristForkGeo = trackGeo(new THREE.BoxGeometry(0.058, 0.065, 0.022));
  const leftWristFork = new THREE.Mesh(wristForkGeo, jointHousingMaterials[3]);
  leftWristFork.position.set(0, ROBOT_DIMENSIONS.forearmTubeLen - 0.01, 0.038);
  const rightWristFork = new THREE.Mesh(wristForkGeo, jointHousingMaterials[3]);
  rightWristFork.position.set(0, ROBOT_DIMENSIONS.forearmTubeLen - 0.01, -0.038);
  j4Pivot.add(leftWristFork, rightWristFork);

  // ============================================================================
  // 5. J5 PIVOT — WRIST 2 PITCH (Origin at Y = +0.20m from J4, rotates around Z)
  // ============================================================================
  const j5Pivot = new THREE.Group();
  j5Pivot.position.set(0, ROBOT_DIMENSIONS.forearmTubeLen, 0);
  j4Pivot.add(j5Pivot);
  pivots.push(j5Pivot);

  const j5Axes = createCoordinateAxesGizmo(0.09);
  j5Pivot.add(j5Axes);
  localAxesHelpers.push(j5Axes);

  const j5Cylinder = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.044, 0.044, 0.098, 24)),
    darkServoCapMat
  );
  j5Cylinder.rotation.x = Math.PI / 2;
  j5Cylinder.castShadow = true;
  j5Pivot.add(j5Cylinder);

  const j5Neck = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.038, 0.042, ROBOT_DIMENSIONS.wristToFlange, 24)),
    jointHousingMaterials[4]
  );
  j5Neck.position.y = ROBOT_DIMENSIONS.wristToFlange / 2;
  j5Neck.castShadow = true;
  j5Pivot.add(j5Neck);

  // ============================================================================
  // 6. J6 PIVOT — TOOL FLANGE ROLL & PARALLEL GRIPPER (Origin at Y = +0.09m from J5)
  // ============================================================================
  const j6Pivot = new THREE.Group();
  j6Pivot.position.set(0, ROBOT_DIMENSIONS.wristToFlange, 0);
  j5Pivot.add(j6Pivot);
  pivots.push(j6Pivot);

  // ISO Tool Flange盘
  const flangeDisk = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.042, 0.042, 0.018, 24)),
    brushedSteelMat
  );
  flangeDisk.position.y = 0.009;
  flangeDisk.castShadow = true;
  j6Pivot.add(flangeDisk);

  // Parallel pneumatic gripper body
  const gripperBody = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.096, 0.038, 0.054)),
    jointHousingMaterials[5]
  );
  gripperBody.position.y = 0.036;
  gripperBody.castShadow = true;
  j6Pivot.add(gripperBody);

  const gripperRail = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.102, 0.01, 0.03)),
    safetyOrangeAccentMat
  );
  gripperRail.position.y = 0.058;
  j6Pivot.add(gripperRail);

  // Left and Right Actuated Parallel Gripper Jaws
  const leftFinger = new THREE.Group();
  const rightFinger = new THREE.Group();
  leftFinger.position.set(0.03, 0.062, 0);
  rightFinger.position.set(-0.03, 0.062, 0);
  j6Pivot.add(leftFinger, rightFinger);

  const fingerBaseGeo = trackGeo(new THREE.BoxGeometry(0.012, 0.052, 0.024));
  const fingerTipGeo = trackGeo(new THREE.BoxGeometry(0.008, 0.024, 0.024));

  const leftJawMesh = new THREE.Mesh(fingerBaseGeo, darkCastIronMat);
  leftJawMesh.position.y = 0.026;
  const leftTipMesh = new THREE.Mesh(fingerTipGeo, safetyOrangeAccentMat);
  leftTipMesh.position.set(-0.004, 0.044, 0);
  leftFinger.add(leftJawMesh, leftTipMesh);

  const rightJawMesh = new THREE.Mesh(fingerBaseGeo, darkCastIronMat);
  rightJawMesh.position.y = 0.026;
  const rightTipMesh = new THREE.Mesh(fingerTipGeo, safetyOrangeAccentMat);
  rightTipMesh.position.set(0.004, 0.044, 0);
  rightFinger.add(rightJawMesh, rightTipMesh);

  // ============================================================================
  // 7. TCP ANCHOR (Tool Center Point at Y = +0.11m from J6 Flange)
  // ============================================================================
  const tcpAnchor = new THREE.Group();
  tcpAnchor.position.set(0, ROBOT_DIMENSIONS.gripperTcpOffset, 0);
  j6Pivot.add(tcpAnchor);

  // Subtle glowing TCP center reticle sphere
  const tcpMarker = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.009, 16, 16)),
    trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x0284c7,
      })
    )
  );
  tcpAnchor.add(tcpMarker);

  const tcpAxes = createCoordinateAxesGizmo(0.085);
  tcpAnchor.add(tcpAxes);
  localAxesHelpers.push(tcpAxes);

  // Methods to update gripper opening, local axes visibility, and safety coloration
  const setGripperOpening = (openingPct: number) => {
    const clamped = THREE.MathUtils.clamp(openingPct, 0, 100);
    // Stroke ranges from 0.008m (closed) to 0.042m (100% open) per finger
    const offset = THREE.MathUtils.lerp(0.008, 0.042, clamped / 100);
    leftFinger.position.x = offset;
    rightFinger.position.x = -offset;
  };

  const setLocalAxesVisible = (visible: boolean) => {
    localAxesHelpers.forEach((helper) => {
      helper.visible = visible;
    });
  };

  const normalColor = new THREE.Color(0xf1f5f9);
  const warningColor = new THREE.Color(0xfbbf24);
  const criticalColor = new THREE.Color(0xef4444);
  const zeroEmissive = new THREE.Color(0x000000);
  const warnEmissive = new THREE.Color(0xd97706);
  const critEmissive = new THREE.Color(0xdc2626);

  const setJointSafetyHighlight = (
    jointLevels: JointSafetyLevel[],
    floorCollisionRisk: boolean,
    enabled: boolean
  ) => {
    for (let i = 0; i < 6; i++) {
      const mat = jointHousingMaterials[i];
      if (!enabled) {
        mat.color.copy(normalColor);
        mat.emissive.copy(zeroEmissive);
        mat.emissiveIntensity = 0;
        continue;
      }

      const level =
        floorCollisionRisk && i >= 2 ? 'critical' : jointLevels[i] || 'normal';

      if (level === 'critical') {
        mat.color.copy(criticalColor);
        mat.emissive.copy(critEmissive);
        mat.emissiveIntensity = 0.28;
      } else if (level === 'warning') {
        mat.color.copy(warningColor);
        mat.emissive.copy(warnEmissive);
        mat.emissiveIntensity = 0.18;
      } else {
        mat.color.copy(normalColor);
        mat.emissive.copy(zeroEmissive);
        mat.emissiveIntensity = 0;
      }
    }
  };

  const dispose = () => {
    disposableGeometries.forEach((g) => g.dispose());
    disposableMaterials.forEach((m) => m.dispose());
    disposableTextures.forEach((t) => t.dispose());
  };

  return {
    rootGroup,
    pivots,
    tcpAnchor,
    leftFinger,
    rightFinger,
    localAxesHelpers,
    setJointSafetyHighlight,
    setGripperOpening,
    setLocalAxesVisible,
    dispose,
  };
}
