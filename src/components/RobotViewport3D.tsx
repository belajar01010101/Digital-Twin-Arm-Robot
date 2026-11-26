import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CameraPreset,
  JointSafetyLevel,
  SafetyReport,
  TcpPose,
  VisualHelpersConfig,
  Waypoint,
} from '../types/robotics';
import {
  applyJointRotationToObject,
  computeForwardKinematics,
} from '../utils/kinematics';
import { buildLaboratoryEnvironment } from '../utils/labEnvironmentBuilder';
import { RoboticArmRig, buildRoboticArmRig } from '../utils/robotBuilder';

interface RobotViewport3DProps {
  jointsDeg: [number, number, number, number, number, number];
  gripperPct: number;
  safetyReport: SafetyReport;
  visualHelpers: VisualHelpersConfig;
  cameraPreset: CameraPreset;
  cameraPresetTrigger: number;
  waypoints: Waypoint[];
  ikTargetPose: TcpPose;
  onIkGizmoTransform: (newPose: TcpPose) => void;
  onFpsUpdate: (fps: number) => void;
  clearTrailTrigger: number;
}

// Module-scope reusable math instances for zero-GC in the render loop
const _targetCameraPos = new THREE.Vector3();
const _targetControlsLook = new THREE.Vector3();
const _tcpWorldPos = new THREE.Vector3();
const _tcpWorldQuat = new THREE.Quaternion();
const _gizmoPos = new THREE.Vector3();
const _gizmoEuler = new THREE.Euler();

const MAX_TRAIL_POINTS = 260;

export const RobotViewport3D: React.FC<RobotViewport3DProps> = ({
  jointsDeg,
  gripperPct,
  safetyReport,
  visualHelpers,
  cameraPreset,
  cameraPresetTrigger,
  waypoints,
  ikTargetPose,
  onIkGizmoTransform,
  onFpsUpdate,
  clearTrailTrigger,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Store mutable latest props in refs so the Three.js loop never tears down on React state changes
  const jointsRef = useRef(jointsDeg);
  jointsRef.current = jointsDeg;

  const gripperRef = useRef(gripperPct);
  gripperRef.current = gripperPct;

  const safetyRef = useRef(safetyReport);
  safetyRef.current = safetyReport;

  const helpersRef = useRef(visualHelpers);
  helpersRef.current = visualHelpers;

  const ikTargetRef = useRef(ikTargetPose);
  ikTargetRef.current = ikTargetPose;

  const onIkGizmoTransformRef = useRef(onIkGizmoTransform);
  onIkGizmoTransformRef.current = onIkGizmoTransform;

  const onFpsUpdateRef = useRef(onFpsUpdate);
  onFpsUpdateRef.current = onFpsUpdate;

  // Scene object refs for imperative updates
  const rigRef = useRef<RoboticArmRig | null>(null);
  const workspaceDomeRef = useRef<THREE.Group | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const ikTargetDummyRef = useRef<THREE.Object3D | null>(null);
  const isDraggingGizmoRef = useRef<boolean>(false);
  const unreachableLineRef = useRef<THREE.Line | null>(null);
  const floorWarningRingRef = useRef<THREE.Mesh | null>(null);
  const waypointMarkersGroupRef = useRef<THREE.Group | null>(null);
  const trailPointsRef = useRef<THREE.Vector3[]>([]);
  const trailGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const trailLineRef = useRef<THREE.Line | null>(null);

  // Camera transition state
  const activeCameraPresetRef = useRef<{
    active: boolean;
    preset: CameraPreset;
  }>({ active: false, preset: 'isometric' });

  // Trigger smooth camera transition when user clicks a preset button
  useEffect(() => {
    activeCameraPresetRef.current = {
      active: true,
      preset: cameraPreset,
    };
  }, [cameraPreset, cameraPresetTrigger]);

  // Clear TCP trail when requested
  useEffect(() => {
    trailPointsRef.current = [];
    if (trailGeometryRef.current) {
      trailGeometryRef.current.setFromPoints([]);
    }
  }, [clearTrailTrigger]);

  // Sync TransformControls mode & visibility
  useEffect(() => {
    const tc = transformControlsRef.current;
    const dummy = ikTargetDummyRef.current;
    if (!tc || !dummy) return;

    tc.setMode(visualHelpers.gizmoMode);
    tc.enabled = visualHelpers.showIkGizmo;
    const helperObj = tc.getHelper();
    helperObj.visible = visualHelpers.showIkGizmo;
    dummy.visible = visualHelpers.showIkGizmo;
  }, [visualHelpers.showIkGizmo, visualHelpers.gizmoMode]);

  // Sync external IK target coordinates into the 3D gizmo dummy when not actively dragging
  useEffect(() => {
    const dummy = ikTargetDummyRef.current;
    if (!dummy || isDraggingGizmoRef.current) return;

    dummy.position.set(
      ikTargetPose.xMm / 1000,
      ikTargetPose.yMm / 1000,
      ikTargetPose.zMm / 1000
    );
    dummy.rotation.set(
      THREE.MathUtils.degToRad(ikTargetPose.rollDeg),
      THREE.MathUtils.degToRad(ikTargetPose.yawDeg),
      THREE.MathUtils.degToRad(ikTargetPose.pitchDeg),
      'XYZ'
    );
  }, [ikTargetPose]);

  // Rebuild 3D Waypoint Ghost Markers & Connecting Spline whenever waypoints change
  useEffect(() => {
    const group = waypointMarkersGroupRef.current;
    if (!group) return;

    // Dispose old children
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      group.remove(child);
    }

    if (waypoints.length === 0) return;

    const wpPositions: THREE.Vector3[] = [];
    const sphereGeo = new THREE.SphereGeometry(0.015, 16, 16);
    const ringGeo = new THREE.RingGeometry(0.02, 0.026, 24);

    waypoints.forEach((wp, idx) => {
      const fk = computeForwardKinematics(wp.jointsDeg);
      const pos = fk.jointPositionsM[7].clone();
      wpPositions.push(pos);

      const markerGroup = new THREE.Group();
      markerGroup.position.copy(pos);

      const isFirst = idx === 0;
      const isLast = idx === waypoints.length - 1;
      const colorHex = isFirst ? 0x16a34a : isLast ? 0xea580c : 0x0284c7;

      const sphereMesh = new THREE.Mesh(
        sphereGeo.clone(),
        new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.85,
        })
      );
      const ringMesh = new THREE.Mesh(
        ringGeo.clone(),
        new THREE.MeshBasicMaterial({
          color: colorHex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6,
        })
      );
      ringMesh.rotation.x = Math.PI / 2;
      markerGroup.add(sphereMesh, ringMesh);
      group.add(markerGroup);
    });

    sphereGeo.dispose();
    ringGeo.dispose();

    if (wpPositions.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(wpPositions, false, 'centripetal');
      const curvePoints = curve.getPoints(Math.max(24, wpPositions.length * 16));
      const pathGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
      const pathMat = new THREE.LineDashedMaterial({
        color: 0x0284c7,
        dashSize: 0.03,
        gapSize: 0.015,
        transparent: true,
        opacity: 0.65,
      });
      const pathLine = new THREE.Line(pathGeo, pathMat);
      pathLine.computeLineDistances();
      group.add(pathLine);
    }
  }, [waypoints]);

  // Main WebGL initialization effect (runs once on mount)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL Guard (SwiftShader, llvmpipe, WARP detection)
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 2. Scene, Fog & Studio Background
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.FogExp2(0xf1f5f9, 0.11);

    // 3. Perspective Camera
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.05, 40);
    camera.position.set(1.45, 1.18, 1.55);

    // 4. WebGLRenderer with ACESFilmicToneMapping & SRGBColorSpace
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 5. Studio Environment Map via RoomEnvironment + PMREMGenerator
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    // 6. Balanced 3-Point Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 0.85);
    hemiLight.position.set(0, 6, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.75);
    keyLight.position.set(2.4, 3.6, 2.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 10;
    const d = 1.45;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.75);
    fillLight.position.set(-2.5, 1.8, -1.6);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    rimLight.position.set(0, 2.2, -2.8);
    scene.add(rimLight);

    // 7. Robotics Laboratory Room & Industrial Workbench Table (Table top at Y = 0.00m)
    const labEnvironment = buildLaboratoryEnvironment(renderer);
    scene.add(labEnvironment.group);

    // Radial soft contact shadow under robot base pedestal on the tabletop
    const contactCanvas = document.createElement('canvas');
    contactCanvas.width = 256;
    contactCanvas.height = 256;
    const cCtx = contactCanvas.getContext('2d')!;
    const grad = cCtx.createRadialGradient(128, 128, 18, 128, 128, 124);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.36)');
    grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.12)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    cCtx.fillStyle = grad;
    cCtx.fillRect(0, 0, 256, 256);
    const contactTex = new THREE.CanvasTexture(contactCanvas);
    contactTex.colorSpace = THREE.SRGBColorSpace;

    const contactPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.75, 0.75),
      new THREE.MeshBasicMaterial({
        map: contactTex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    contactPlane.rotation.x = -Math.PI / 2;
    contactPlane.position.y = 0.0045;
    scene.add(contactPlane);

    // Precision metric calibration grid printed on the workbench tabletop (1.3m x 1.3m)
    const primaryGrid = new THREE.GridHelper(1.3, 13, 0x64748b, 0xcbd5e1);
    primaryGrid.position.y = 0.004;
    scene.add(primaryGrid);

    // 8. Build Hierarchical 6-DOF Robotic Arm Rig mounted on top of the Workbench
    const armRig = buildRoboticArmRig(renderer);
    scene.add(armRig.rootGroup);
    rigRef.current = armRig;

    // 9. 3D TCP Trajectory Trail Line & Waypoint Markers Group
    const trailGeometry = new THREE.BufferGeometry();
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.85,
    });
    const trailLine = new THREE.Line(trailGeometry, trailMaterial);
    trailLine.frustumCulled = false;
    scene.add(trailLine);
    trailGeometryRef.current = trailGeometry;
    trailLineRef.current = trailLine;

    const waypointGroup = new THREE.Group();
    scene.add(waypointGroup);
    waypointMarkersGroupRef.current = waypointGroup;

    // 11. Interactive 3D TransformControls Gizmo for Inverse Kinematics Target
    const ikDummy = new THREE.Group();
    const initialFk = computeForwardKinematics(jointsRef.current);
    ikDummy.position.set(
      initialFk.tcpPose.xMm / 1000,
      initialFk.tcpPose.yMm / 1000,
      initialFk.tcpPose.zMm / 1000
    );

    // Visual target reticle inside the IK gizmo dummy
    const targetReticle = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.018, 0),
      new THREE.MeshBasicMaterial({
        color: 0xea580c,
        wireframe: true,
      })
    );
    ikDummy.add(targetReticle);
    scene.add(ikDummy);
    ikTargetDummyRef.current = ikDummy;

    // Dashed red vector line from actual TCP to IK target when unreachable
    const unreachableGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const unreachableMat = new THREE.LineBasicMaterial({
      color: 0xdc2626,
    });
    const unreachableLine = new THREE.Line(unreachableGeo, unreachableMat);
    unreachableLine.visible = false;
    unreachableLine.frustumCulled = false;
    scene.add(unreachableLine);
    unreachableLineRef.current = unreachableLine;

    // 12. OrbitControls & TransformControls Coordination
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = !isSoftwareGl;
    orbitControls.dampingFactor = 0.07;
    orbitControls.target.set(0, 0.45, 0);
    orbitControls.minDistance = 0.45;
    orbitControls.maxDistance = 4.5;
    orbitControls.maxPolarAngle = Math.PI / 2 - 0.02; // Prevent camera going below floor

    // Cancel scripted camera preset transition when user interacts manually
    orbitControls.addEventListener('start', () => {
      activeCameraPresetRef.current.active = false;
    });

    const transformControls = new TransformControls(
      camera,
      renderer.domElement
    );
    transformControls.setSize(0.75);
    transformControls.attach(ikDummy);
    const tcHelper = transformControls.getHelper();
    tcHelper.visible = helpersRef.current.showIkGizmo;
    transformControls.enabled = helpersRef.current.showIkGizmo;
    ikDummy.visible = helpersRef.current.showIkGizmo;
    scene.add(tcHelper);
    transformControlsRef.current = transformControls;

    transformControls.addEventListener('dragging-changed', (event) => {
      const dragging = Boolean(event.value);
      isDraggingGizmoRef.current = dragging;
      orbitControls.enabled = !dragging;
    });

    transformControls.addEventListener('objectChange', () => {
      if (!isDraggingGizmoRef.current) return;
      _gizmoPos.copy(ikDummy.position);
      // Constrain target Y above -50mm
      if (_gizmoPos.y < -0.05) {
        _gizmoPos.y = -0.05;
        ikDummy.position.y = -0.05;
      }
      _gizmoEuler.setFromQuaternion(ikDummy.quaternion, 'XYZ');

      onIkGizmoTransformRef.current({
        xMm: Math.round(_gizmoPos.x * 1000 * 10) / 10,
        yMm: Math.round(_gizmoPos.y * 1000 * 10) / 10,
        zMm: Math.round(_gizmoPos.z * 1000 * 10) / 10,
        rollDeg: Math.round(THREE.MathUtils.radToDeg(_gizmoEuler.x) * 10) / 10,
        pitchDeg: Math.round(THREE.MathUtils.radToDeg(_gizmoEuler.z) * 10) / 10,
        yawDeg: Math.round(THREE.MathUtils.radToDeg(_gizmoEuler.y) * 10) / 10,
      });
    });

    // Pre-warm shaders on hardware GPUs
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 13. Damped Current Joint Angles for silky-smooth 60 FPS motion
    const displayedJoints = [...jointsRef.current];
    let displayedGripper = gripperRef.current;

    const clock = new THREE.Clock();
    let frameId = 0;
    let framesCount = 0;
    let fpsAccumulator = 0;

    // Software WebGL GPU-fence pacing helper
    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      const delta = Math.min(clock.getDelta(), 0.1);

      // Measure real FPS every 0.5s
      framesCount++;
      fpsAccumulator += delta;
      if (fpsAccumulator >= 0.5) {
        const currentFps = Math.min(60, Math.round(framesCount / fpsAccumulator));
        onFpsUpdateRef.current(currentFps);
        framesCount = 0;
        fpsAccumulator = 0;
      }

      // Exponentially damp displayed joint angles toward target jointsRef
      const targetJoints = jointsRef.current;
      const lambda = 22;
      for (let i = 0; i < 6; i++) {
        displayedJoints[i] = THREE.MathUtils.damp(
          displayedJoints[i],
          targetJoints[i],
          lambda,
          delta
        );
        applyJointRotationToObject(
          armRig.pivots[i],
          i,
          displayedJoints[i]
        );
      }

      displayedGripper = THREE.MathUtils.damp(
        displayedGripper,
        gripperRef.current,
        18,
        delta
      );
      armRig.setGripperOpening(displayedGripper);

      // Update visibility of helpers & safety coloration
      const helpers = helpersRef.current;
      const safety = safetyRef.current;

      armRig.setLocalAxesVisible(helpers.showLocalAxes);
      if (workspaceDomeRef.current) {
        workspaceDomeRef.current.visible = helpers.showWorkspaceEnvelope;
      }

      const jointLevels: JointSafetyLevel[] = safety.joints.map((j) => j.level);
      armRig.setJointSafetyHighlight(
        jointLevels,
        safety.floorCollisionRisk,
        helpers.showSafetyHighlights
      );

      if (floorWarningRingRef.current) {
        floorWarningRingRef.current.visible =
          helpers.showSafetyHighlights && safety.floorCollisionRisk;
      }

      // Read current TCP world position and update 3D TCP trail
      armRig.rootGroup.updateMatrixWorld(true);
      armRig.tcpAnchor.getWorldPosition(_tcpWorldPos);
      armRig.tcpAnchor.getWorldQuaternion(_tcpWorldQuat);

      if (trailLineRef.current) {
        trailLineRef.current.visible = helpers.showTcpTrail;
        if (helpers.showTcpTrail) {
          const pts = trailPointsRef.current;
          if (
            pts.length === 0 ||
            pts[pts.length - 1].distanceToSquared(_tcpWorldPos) > 0.00004
          ) {
            pts.push(_tcpWorldPos.clone());
            if (pts.length > MAX_TRAIL_POINTS) {
              pts.shift();
            }
            trailGeometry.setFromPoints(pts);
          }
        }
      }

      // Update unreachable target vector indicator
      if (unreachableLineRef.current && ikTargetDummyRef.current) {
        const showUnreachable =
          helpers.showIkGizmo && safety.ikUnreachable;
        unreachableLineRef.current.visible = showUnreachable;
        if (showUnreachable) {
          unreachableLineRef.current.geometry.setFromPoints([
            _tcpWorldPos,
            ikTargetDummyRef.current.position,
          ]);
        }
      }

      // Handle smooth camera preset transitions
      if (activeCameraPresetRef.current.active) {
        const preset = activeCameraPresetRef.current.preset;
        if (preset === 'isometric') {
          _targetCameraPos.set(1.45, 1.18, 1.55);
          _targetControlsLook.set(0, 0.45, 0);
        } else if (preset === 'front') {
          _targetCameraPos.set(1.95, 0.62, 0.0);
          _targetControlsLook.set(0, 0.52, 0);
        } else if (preset === 'top') {
          _targetCameraPos.set(0.02, 2.35, 0.02);
          _targetControlsLook.set(0, 0.35, 0);
        } else if (preset === 'side') {
          _targetCameraPos.set(0.0, 0.62, 1.95);
          _targetControlsLook.set(0, 0.52, 0);
        } else if (preset === 'tcp') {
          // Follow End-Effector TCP closely
          _targetCameraPos.set(
            _tcpWorldPos.x + 0.52,
            _tcpWorldPos.y + 0.28,
            _tcpWorldPos.z + 0.52
          );
          _targetControlsLook.copy(_tcpWorldPos);
        }

        camera.position.lerp(
          _targetCameraPos,
          1 - Math.exp(-8 * delta)
        );
        orbitControls.target.lerp(
          _targetControlsLook,
          1 - Math.exp(-10 * delta)
        );

        if (
          preset !== 'tcp' &&
          camera.position.distanceTo(_targetCameraPos) < 0.008 &&
          orbitControls.target.distanceTo(_targetControlsLook) < 0.008
        ) {
          activeCameraPresetRef.current.active = false;
        }
      }

      orbitControls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    // Responsive Resize Observer
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    // WebGL Context Lost / Restored Handlers
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
    };
    const handleContextRestored = () => {
      tick();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener(
      'webglcontextrestored',
      handleContextRestored
    );

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        handleContextLost
      );
      renderer.domElement.removeEventListener(
        'webglcontextrestored',
        handleContextRestored
      );

      orbitControls.dispose();
      transformControls.dispose();
      armRig.dispose();
      labEnvironment.dispose();

      contactTex.dispose();
      trailGeometry.dispose();
      trailMaterial.dispose();
      unreachableGeo.dispose();
      unreachableMat.dispose();
      envTexture.dispose();

      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 w-full h-full overflow-hidden select-none"
      aria-label="3D Robotic Arm Digital Twin Viewport"
    />
  );
};
