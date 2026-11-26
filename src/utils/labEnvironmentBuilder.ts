import * as THREE from 'three';

export interface LabEnvironmentRig {
  group: THREE.Group;
  dispose: () => void;
}

/**
 * Generates a procedural laboratory monitor screen texture showing telemetry graphs & blueprints.
 */
function createLabMonitorTexture(
  renderer: THREE.WebGLRenderer,
  title: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;

  // Dark diagnostic screen background
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, 512, 320);

  // Header bar
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, 0, 512, 42);
  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.fillText(title, 18, 27);

  ctx.fillStyle = '#22C55E';
  ctx.font = 'bold 15px "JetBrains Mono", monospace';
  ctx.fillText('ONLINE // 6-DOF ACTIVE', 310, 27);

  // Subtle oscillograph grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
  ctx.lineWidth = 1;
  for (let x = 20; x < 492; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 56);
    ctx.lineTo(x, 230);
    ctx.stroke();
  }
  for (let y = 56; y <= 230; y += 28) {
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(492, y);
    ctx.stroke();
  }

  // Sine wave telemetry curve 1 (Cyan)
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 20; x <= 490; x += 6) {
    const y = 120 + Math.sin((x - 20) * 0.035) * 38;
    if (x === 20) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Sine wave telemetry curve 2 (Orange)
  ctx.strokeStyle = '#FB923C';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let x = 20; x <= 490; x += 6) {
    const y = 165 + Math.cos((x - 20) * 0.045) * 26;
    if (x === 20) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Bottom readout cells
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(20, 246, 148, 56);
  ctx.fillRect(182, 246, 148, 56);
  ctx.fillRect(344, 246, 148, 56);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.fillText('BUS VOLTAGE', 32, 268);
  ctx.fillText('SERVO TEMP', 194, 268);
  ctx.fillText('CYCLE ACCURACY', 356, 268);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 19px "JetBrains Mono", monospace';
  ctx.fillText('48.0 VDC', 32, 292);
  ctx.fillText('41.2 °C', 194, 292);
  ctx.fillText('±0.02 mm', 356, 292);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

/**
 * Generates a procedural laboratory wall safety signage texture.
 */
function createLabWallSignTexture(
  renderer: THREE.WebGLRenderer
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 1024, 256);

  // Border frame
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, 1000, 232);

  // Safety orange left accent block
  ctx.fillStyle = '#EA580C';
  ctx.fillRect(24, 24, 28, 208);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 54px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('ROBOTICS & KINEMATICS LABORATORY', 82, 112);

  ctx.fillStyle = '#475569';
  ctx.font = '600 30px "JetBrains Mono", monospace';
  ctx.fillText('WORKCELL 01 // 6-DOF DIGITAL TWIN TESTBENCH // ISO-10218', 82, 178);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

/**
 * Generates a subtle epoxy laboratory tile floor texture for the room floor at Y = -0.78m.
 */
function createEpoxyTileTexture(
  renderer: THREE.WebGLRenderer
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#DCE3EC';
  ctx.fillRect(0, 0, 512, 512);

  // Tile seams
  ctx.strokeStyle = '#C4CDD9';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 256, 256);
  ctx.strokeRect(256, 0, 256, 256);
  ctx.strokeRect(0, 256, 256, 256);
  ctx.strokeRect(256, 256, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

/**
 * Builds the 3D Robotics Laboratory Room and the Industrial Aluminum Workbench Table.
 * The top surface of the workbench sits strictly at Y = 0.000m so the Robotic Arm
 * is mounted directly on top of the table and all FK/IK coordinates remain accurate.
 */
export function buildLaboratoryEnvironment(
  renderer: THREE.WebGLRenderer
): LabEnvironmentRig {
  const group = new THREE.Group();
  group.name = 'RoboticsLaboratoryEnvironment';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };

  const TABLE_HEIGHT = 0.78; // Top surface at Y = 0.00m, Lab floor at Y = -0.78m
  const TABLE_WIDTH = 2.0;   // X dimension (-1.0m to +1.0m)
  const TABLE_DEPTH = 1.45;  // Z dimension (-0.725m to +0.725m)
  const TOP_THICKNESS = 0.055;

  // Shared PBR Materials
  const tableTopMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.42,
      metalness: 0.08,
    })
  );

  const anodizedAluminumMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.32,
      metalness: 0.82,
    })
  );

  const darkFrameSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.48,
      metalness: 0.65,
    })
  );

  const cabinetBodyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.45,
      metalness: 0.25,
    })
  );

  const cabinetDrawerBlueMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.35,
      metalness: 0.3,
    })
  );

  const safetyYellowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.35,
      metalness: 0.2,
    })
  );

  const emergencyRedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.25,
      metalness: 0.2,
    })
  );

  // ============================================================================
  // 1. INDUSTRIAL ROBOTICS WORKBENCH TABLE (Top surface at Y = 0.000m)
  // ============================================================================
  const workbenchGroup = new THREE.Group();
  group.add(workbenchGroup);

  // Heavy phenolic/ESD tabletop slab (Y: -0.055m to 0.000m)
  const tableTopMesh = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(TABLE_WIDTH, TOP_THICKNESS, TABLE_DEPTH)),
    tableTopMat
  );
  tableTopMesh.position.set(0, -TOP_THICKNESS / 2, 0);
  tableTopMesh.receiveShadow = true;
  tableTopMesh.castShadow = true;
  workbenchGroup.add(tableTopMesh);

  // Dark steel edge bumper trim around the tabletop perimeter
  const trimThickness = 0.016;
  const frontBackTrimGeo = trackGeo(
    new THREE.BoxGeometry(TABLE_WIDTH + trimThickness * 2, TOP_THICKNESS + 0.004, trimThickness)
  );
  const frontTrim = new THREE.Mesh(frontBackTrimGeo, darkFrameSteelMat);
  frontTrim.position.set(0, -TOP_THICKNESS / 2, TABLE_DEPTH / 2 + trimThickness / 2);
  const backTrim = new THREE.Mesh(frontBackTrimGeo, darkFrameSteelMat);
  backTrim.position.set(0, -TOP_THICKNESS / 2, -TABLE_DEPTH / 2 - trimThickness / 2);

  const sideTrimGeo = trackGeo(
    new THREE.BoxGeometry(trimThickness, TOP_THICKNESS + 0.004, TABLE_DEPTH)
  );
  const leftTrim = new THREE.Mesh(sideTrimGeo, darkFrameSteelMat);
  leftTrim.position.set(-TABLE_WIDTH / 2 - trimThickness / 2, -TOP_THICKNESS / 2, 0);
  const rightTrim = new THREE.Mesh(sideTrimGeo, darkFrameSteelMat);
  rightTrim.position.set(TABLE_WIDTH / 2 + trimThickness / 2, -TOP_THICKNESS / 2, 0);
  workbenchGroup.add(frontTrim, backTrim, leftTrim, rightTrim);

  // Recessed machined steel T-slot mounting plate under robot base
  const mountingPlate = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.56, 0.006, 0.56)),
    anodizedAluminumMat
  );
  mountingPlate.position.set(0, 0.001, 0);
  mountingPlate.receiveShadow = true;
  workbenchGroup.add(mountingPlate);

  // 4 Heavy Aluminum Extrusion Legs (Y: -0.78m to -0.055m)
  const legHeight = TABLE_HEIGHT - TOP_THICKNESS;
  const legGeo = trackGeo(new THREE.BoxGeometry(0.075, legHeight, 0.075));
  const footPadGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.06, 0.025, 16));
  const legX = TABLE_WIDTH / 2 - 0.08;
  const legZ = TABLE_DEPTH / 2 - 0.08;

  const legCoords: [number, number][] = [
    [-legX, -legZ],
    [legX, -legZ],
    [-legX, legZ],
    [legX, legZ],
  ];

  legCoords.forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(legGeo, anodizedAluminumMat);
    leg.position.set(lx, -TOP_THICKNESS - legHeight / 2, lz);
    leg.castShadow = true;
    leg.receiveShadow = true;
    workbenchGroup.add(leg);

    const footPad = new THREE.Mesh(footPadGeo, darkFrameSteelMat);
    footPad.position.set(lx, -TABLE_HEIGHT + 0.0125, lz);
    workbenchGroup.add(footPad);
  });

  // Lower structural crossbars connecting the legs
  const longCrossbarGeo = trackGeo(new THREE.BoxGeometry(TABLE_WIDTH - 0.16, 0.045, 0.045));
  const backCrossbar = new THREE.Mesh(longCrossbarGeo, anodizedAluminumMat);
  backCrossbar.position.set(0, -TABLE_HEIGHT + 0.14, -legZ);
  workbenchGroup.add(backCrossbar);

  const sideCrossbarGeo = trackGeo(new THREE.BoxGeometry(0.045, 0.045, TABLE_DEPTH - 0.16));
  const leftCrossbar = new THREE.Mesh(sideCrossbarGeo, anodizedAluminumMat);
  leftCrossbar.position.set(-legX, -TABLE_HEIGHT + 0.14, 0);
  const rightCrossbar = new THREE.Mesh(sideCrossbarGeo, anodizedAluminumMat);
  rightCrossbar.position.set(legX, -TABLE_HEIGHT + 0.14, 0);
  workbenchGroup.add(leftCrossbar, rightCrossbar);

  // Under-table PLC & Servo Controller Drawer Unit (mounted on right side under tabletop)
  const underCabinet = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.54, 0.46, 0.92)),
    cabinetBodyMat
  );
  underCabinet.position.set(legX - 0.28, -TOP_THICKNESS - 0.25, 0);
  underCabinet.castShadow = true;
  workbenchGroup.add(underCabinet);

  // 3 Blue industrial drawers on the under-table unit facing +X / +Z
  const drawerGeo = trackGeo(new THREE.BoxGeometry(0.48, 0.11, 0.02));
  [-0.12, -0.25, -0.38].forEach((dy) => {
    const drawer = new THREE.Mesh(drawerGeo, cabinetDrawerBlueMat);
    drawer.position.set(legX - 0.28, dy, 0.465);
    workbenchGroup.add(drawer);
  });

  // ============================================================================
  // 2. WORKBENCH LABORATORY PROPS (Outside Robot Swing Path)
  // ============================================================================
  // Emergency Stop Button Box on Front-Right Corner of Table (X: 0.84, Z: 0.56)
  const eStopGroup = new THREE.Group();
  eStopGroup.position.set(0.84, 0, 0.56);
  const eStopBox = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.11, 0.065, 0.11)),
    safetyYellowMat
  );
  eStopBox.position.y = 0.0325;
  eStopBox.castShadow = true;
  const eStopCollar = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.015, 20)),
    darkFrameSteelMat
  );
  eStopCollar.position.y = 0.07;
  const eStopMushroom = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.034, 0.028, 0.024, 24)),
    emergencyRedMat
  );
  eStopMushroom.position.y = 0.088;
  eStopGroup.add(eStopBox, eStopCollar, eStopMushroom);
  workbenchGroup.add(eStopGroup);

  // Precision Parts Inspection Tray on Table surface (X: 0.42, Z: -0.36)
  const trayGroup = new THREE.Group();
  trayGroup.position.set(0.42, 0, -0.36);
  const trayBase = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.24, 0.014, 0.18)),
    darkFrameSteelMat
  );
  trayBase.position.y = 0.007;
  trayBase.receiveShadow = true;
  trayGroup.add(trayBase);

  // Calibration anodized test cylinders inside tray
  const samplePart1 = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.055, 20)),
    cabinetDrawerBlueMat
  );
  samplePart1.position.set(-0.05, 0.035, 0);
  samplePart1.castShadow = true;

  const samplePart2 = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.055, 20)),
    safetyYellowMat
  );
  samplePart2.position.set(0.05, 0.035, 0);
  samplePart2.castShadow = true;
  trayGroup.add(samplePart1, samplePart2);
  workbenchGroup.add(trayGroup);

  // Laboratory Dual-Monitor Operator Console Stand at Back-Left Corner of Workbench
  const monitorGroup = new THREE.Group();
  monitorGroup.position.set(-0.76, 0, -0.48);
  monitorGroup.rotation.y = Math.PI / 5;

  const standBase = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.18, 0.014, 0.14)),
    darkFrameSteelMat
  );
  standBase.position.y = 0.007;
  const standNeck = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.016, 0.016, 0.24, 16)),
    anodizedAluminumMat
  );
  standNeck.position.set(0, 0.12, -0.03);

  const monitorBezel = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.42, 0.27, 0.022)),
    darkFrameSteelMat
  );
  monitorBezel.position.set(0, 0.26, 0);
  monitorBezel.castShadow = true;

  const screenTex = trackTex(
    createLabMonitorTexture(renderer, 'RT-600 // KINEMATICS LAB')
  );
  const monitorScreen = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(0.39, 0.24)),
    trackMat(new THREE.MeshBasicMaterial({ map: screenTex }))
  );
  monitorScreen.position.set(0, 0.26, 0.012);

  monitorGroup.add(standBase, standNeck, monitorBezel, monitorScreen);
  workbenchGroup.add(monitorGroup);

  // ============================================================================
  // 3. ROBOTICS LABORATORY ROOM ARCHITECTURE (Floor at Y = -0.78m)
  // ============================================================================
  const labRoomGroup = new THREE.Group();
  group.add(labRoomGroup);

  // Tiled Epoxy Laboratory Room Floor at Y = -0.78m
  const floorTileTex = trackTex(createEpoxyTileTexture(renderer));
  const labFloorMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: floorTileTex,
      roughness: 0.65,
      metalness: 0.06,
    })
  );
  const labFloorMesh = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(10, 10)),
    labFloorMat
  );
  labFloorMesh.rotation.x = -Math.PI / 2;
  labFloorMesh.position.y = -TABLE_HEIGHT;
  labFloorMesh.receiveShadow = true;
  labRoomGroup.add(labFloorMesh);

  // Yellow & Black Safety Zone Perimeter Frame on Lab Floor around Workbench
  const safetyZoneRing = new THREE.Mesh(
    trackGeo(new THREE.RingGeometry(1.42, 1.48, 4)),
    safetyYellowMat
  );
  safetyZoneRing.rotation.x = -Math.PI / 2;
  safetyZoneRing.rotation.z = Math.PI / 4;
  safetyZoneRing.position.y = -TABLE_HEIGHT + 0.002;
  labRoomGroup.add(safetyZoneRing);

  // Laboratory Cleanroom Walls (Back wall at Z = -2.4m, Left wall at X = -2.8m)
  const wallMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.75,
      metalness: 0.04,
    })
  );
  const wallHeight = 3.2;

  const backWall = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(8.5, wallHeight, 0.12)),
    wallMat
  );
  backWall.position.set(0, -TABLE_HEIGHT + wallHeight / 2, -2.45);
  backWall.receiveShadow = true;
  labRoomGroup.add(backWall);

  const leftWall = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.12, wallHeight, 8.5)),
    wallMat
  );
  leftWall.position.set(-2.85, -TABLE_HEIGHT + wallHeight / 2, 0);
  leftWall.receiveShadow = true;
  labRoomGroup.add(leftWall);

  // Architectural Acoustic Lower Wainscoting Dado Rail on Walls
  const dadoMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.6,
      metalness: 0.1,
    })
  );
  const backDado = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(8.48, 1.05, 0.14)),
    dadoMat
  );
  backDado.position.set(0, -TABLE_HEIGHT + 0.525, -2.44);
  const leftDado = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.14, 1.05, 8.48)),
    dadoMat
  );
  leftDado.position.set(-2.84, -TABLE_HEIGHT + 0.525, 0);
  labRoomGroup.add(backDado, leftDado);

  // Back Wall Robotics Laboratory Identification Signboard
  const signTex = trackTex(createLabWallSignTexture(renderer));
  const wallSignBoard = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(2.1, 0.52)),
    trackMat(
      new THREE.MeshStandardMaterial({
        map: signTex,
        roughness: 0.35,
      })
    )
  );
  wallSignBoard.position.set(0, 1.25, -2.38);
  labRoomGroup.add(wallSignBoard);

  // Glass Observation Window Frame on Left Laboratory Wall
  const windowFrame = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.06, 1.25, 2.2)),
    darkFrameSteelMat
  );
  windowFrame.position.set(-2.78, 1.05, -0.2);
  const windowGlass = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(2.08, 1.12)),
    trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xbae6fd,
        metalness: 0.1,
        roughness: 0.1,
        transparent: true,
        opacity: 0.35,
      })
    )
  );
  windowGlass.rotation.y = Math.PI / 2;
  windowGlass.position.set(-2.74, 1.05, -0.2);
  labRoomGroup.add(windowFrame, windowGlass);

  // Laboratory Equipment Server & Power Rack against Back Wall (X: -1.65, Z: -2.0)
  const serverRack = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.68, 1.75, 0.58)),
    darkFrameSteelMat
  );
  serverRack.position.set(-1.65, -TABLE_HEIGHT + 0.875, -2.05);
  serverRack.castShadow = true;
  serverRack.receiveShadow = true;
  labRoomGroup.add(serverRack);

  // Glowing LED server rack blades
  const rackBladeMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0x0284c7 })
  );
  const bladeGeo = trackGeo(new THREE.PlaneGeometry(0.52, 0.025));
  [0.2, 0.45, 0.7, 0.95].forEach((by) => {
    const blade = new THREE.Mesh(bladeGeo, rackBladeMat);
    blade.position.set(-1.65, -TABLE_HEIGHT + 0.4 + by, -1.755);
    labRoomGroup.add(blade);
  });

  // Overhead Suspended LED Cleanroom Light Fixtures
  const ceilingLightFrameGeo = trackGeo(new THREE.BoxGeometry(1.6, 0.04, 0.32));
  const ceilingLightDiffuserGeo = trackGeo(new THREE.PlaneGeometry(1.54, 0.26));
  const diffuserMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );

  [-0.55, 0.55].forEach((lz) => {
    const lightFixture = new THREE.Mesh(ceilingLightFrameGeo, anodizedAluminumMat);
    lightFixture.position.set(0, 2.25, lz);
    const diffuser = new THREE.Mesh(ceilingLightDiffuserGeo, diffuserMat);
    diffuser.rotation.x = Math.PI / 2;
    diffuser.position.set(0, 2.228, lz);
    labRoomGroup.add(lightFixture, diffuser);
  });

  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };

  return {
    group,
    dispose,
  };
}
