import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { ExerciseStageSpec, ObstacleSpec } from "../types/domain";
import {
  buildWorldEnvironment,
  createBuildingFacadeTexture,
  createHazardPillarTexture,
  MapPreset,
} from "./proceduralEnvironment";
import {
  buildObstacleMeshGroup,
  createHelipadMarkings,
} from "./fieldObstacleBuilder";
import {
  createGoogle3DTilesScene,
  Google3DLocationConfig,
  Google3DSceneController,
  loadSavedGoogle3DConfig,
} from "./google3DTilesLoader";
import { createLeadUavModel, createTacticalUavModel } from "./uavAircraftBuilder";

export type CameraMode = "chase" | "fpv" | "orbit" | "vlos";
export type { MapPreset };

interface FlightScene3DProps {
  pos: [number, number, number];
  rpy: [number, number, number];
  wind: [number, number, number];
  armed: boolean;
  onGround: boolean;
  collided: boolean;
  startPos: [number, number, number];
  stages: ExerciseStageSpec[];
  activeStageIndex: number;
  obstacles: ObstacleSpec[];
  trailPoints: [number, number, number][];
  referenceTrailPoints?: [number, number, number][];
  cameraMode: CameraMode;
  mapPreset?: MapPreset;
  google3dConfig?: Google3DLocationConfig;
  leadUav?: { pos: [number, number, number]; rpy: [number, number, number] } | null;
  onFpsUpdate?: (fps: number) => void;
}

// Convert PyBullet Z-up (x, y, z) -> Three.js Y-up (x, z, -y)
function pybToThree(p: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[2], -p[1]);
}

function rpyToThreeQuat(rpy: [number, number, number]): THREE.Quaternion {
  const [roll, pitch, yaw] = rpy;
  const eul = new THREE.Euler(roll, yaw, -pitch, "YXZ");
  return new THREE.Quaternion().setFromEuler(eul);
}

export const FlightScene3D: React.FC<FlightScene3DProps> = ({
  pos,
  rpy,
  wind,
  armed,
  onGround,
  collided,
  startPos,
  stages,
  activeStageIndex,
  obstacles,
  trailPoints,
  referenceTrailPoints,
  cameraMode,
  mapPreset = "landmark81",
  google3dConfig,
  leadUav,
  onFpsUpdate,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const latestPropsRef = useRef({
    pos,
    rpy,
    wind,
    armed,
    onGround,
    collided,
    startPos,
    activeStageIndex,
    cameraMode,
    leadUav,
  });
  latestPropsRef.current = {
    pos,
    rpy,
    wind,
    armed,
    onGround,
    collided,
    startPos,
    activeStageIndex,
    cameraMode,
    leadUav,
  };

  const sceneObjectsRef = useRef<{
    scene: THREE.Scene;
    stageMeshes: THREE.Mesh[];
    trailLine: THREE.Line;
    refTrailLine: THREE.Line;
    courseGroup: THREE.Group;
    worldHolder: THREE.Group;
    radarDish: THREE.Object3D | null;
    windsockPivot: THREE.Group | null;
    windsockCone: THREE.Mesh | null;
    beaconMeshes: THREE.Mesh[];
    ambientLight: THREE.HemisphereLight;
    sunLight: THREE.DirectionalLight;
    sky: Sky;
    pmremGenerator: THREE.PMREMGenerator;
    google3dController: Google3DSceneController | null;
  } | null>(null);

  // Initialize Three.js WebGL scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x9bc2dc, 0.008);

    const camera = new THREE.PerspectiveCamera(
      58,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.05,
      450
    );
    camera.position.set(-2.6, 1.85, 2.6);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 1. Physically-Based Atmospheric Sky Dome (Rayleigh & Mie Scattering)
    const sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);

    // 2. High-Performance PMREM Generator for Sky Environment Reflections (IBL)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    // Atmospheric Hemisphere + Directional Sunlight with Soft Real-Time Shadows
    const ambientLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.1);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.1);
    sunLight.position.set(16, 26, 18);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 75;
    const d = 16;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);

    // World Environment Holder (rebuilt when mapPreset changes)
    const worldHolder = new THREE.Group();
    scene.add(worldHolder);

    // Center ICAO Helipad Markings
    const padGroup = new THREE.Group();
    const padOuter = new THREE.Mesh(
      new THREE.RingGeometry(0.52, 0.58, 40),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide })
    );
    padOuter.rotation.x = -Math.PI / 2;
    padOuter.position.y = 0.004;
    padGroup.add(padOuter);

    const hMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide });
    const hLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.42), hMat);
    hLeft.rotation.x = -Math.PI / 2;
    hLeft.position.set(-0.15, 0.005, 0);
    padGroup.add(hLeft);

    const hRight = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.42), hMat);
    hRight.rotation.x = -Math.PI / 2;
    hRight.position.set(0.15, 0.005, 0);
    padGroup.add(hRight);

    const hCross = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.07), hMat);
    hCross.rotation.x = -Math.PI / 2;
    hCross.position.set(0, 0.005, 0);
    padGroup.add(hCross);
    scene.add(padGroup);

    // Build Tactical Quadcopter UAV
    const uavVisuals = createTacticalUavModel();
    const droneGroup = uavVisuals.group;
    scene.add(droneGroup);

    // Laser Altimeter Ground Reticle & Downwash Ring directly under UAV
    const groundReticle = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.11, 24),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      })
    );
    groundReticle.rotation.x = -Math.PI / 2;
    groundReticle.position.y = 0.006;
    scene.add(groundReticle);

    const downwashRing = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.38, 36),
      new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
      })
    );
    downwashRing.rotation.x = -Math.PI / 2;
    downwashRing.position.y = 0.007;
    scene.add(downwashRing);

    // Build Holographic Lead UAV Guide
    const leadGroup = createLeadUavModel();
    scene.add(leadGroup);

    // Flight Trail & Reference Corridor Lines
    const trailLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 })
    );
    scene.add(trailLine);

    const refTrailLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.55,
      })
    );
    scene.add(refTrailLine);

    const courseGroup = new THREE.Group();
    scene.add(courseGroup);

    sceneObjectsRef.current = {
      scene,
      stageMeshes: [],
      trailLine,
      refTrailLine,
      courseGroup,
      worldHolder,
      radarDish: null,
      windsockPivot: null,
      windsockCone: null,
      beaconMeshes: [],
      ambientLight,
      sunLight,
      sky,
      pmremGenerator,
      google3dController: null,
    };

    // Orbit camera state
    let orbitAngle = 0.65;
    let orbitPitch = 0.48;
    let orbitDist = 3.8;
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      prevMouse = { x: e.clientX, y: e.clientY };
      orbitAngle -= dx * 0.007;
      orbitPitch = Math.max(0.12, Math.min(1.38, orbitPitch + dy * 0.007));
    };
    const onMouseUp = () => {
      isDragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      orbitDist = Math.max(1.2, Math.min(18.0, orbitDist + e.deltaY * 0.0025));
    };

    const dom = renderer.domElement;
    dom.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    dom.addEventListener("wheel", onWheel, { passive: true });

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // 60 FPS Render Loop
    let animId = 0;
    let frameCount = 0;
    let lastFpsTime = performance.now();
    const smoothCamPos = new THREE.Vector3(-2.6, 1.85, 2.6);
    const smoothLookAt = new THREE.Vector3(0, 0.8, 0);
    let smoothFpvYaw = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const now = performance.now();
      frameCount++;
      if (now - lastFpsTime >= 500) {
        const currentFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
        onFpsUpdate?.(currentFps);
        frameCount = 0;
        lastFpsTime = now;
      }

      const cur = latestPropsRef.current;
      const droneThreePos = pybToThree(cur.pos);
      const droneQuat = rpyToThreeQuat(cur.rpy);

      if (droneGroup.position.distanceTo(droneThreePos) > 1.5) {
        droneGroup.position.copy(droneThreePos);
        droneGroup.quaternion.copy(droneQuat);
      } else {
        droneGroup.position.lerp(droneThreePos, 0.38);
        droneGroup.quaternion.slerp(droneQuat, 0.28);
      }
      droneGroup.visible = cur.cameraMode !== "fpv";

      // Update Ground Laser Reticle
      groundReticle.position.set(droneThreePos.x, 0.006, droneThreePos.z);

      // Hull collision color feedback
      uavVisuals.bodyMaterial.color.setHex(cur.collided ? 0xef4444 : 0x1e242b);

      // Spin propellers & toggle motion blur discs
      const propSpeed = cur.armed ? (cur.onGround ? 0.35 : 0.92) : 0.0;
      uavVisuals.propellers.forEach((p) => {
        const dir = p.userData.spinDir || 1;
        p.rotation.y += propSpeed * dir;
      });
      uavVisuals.blurDiscs.forEach((disc) => {
        const mat = disc.material as THREE.MeshBasicMaterial;
        mat.opacity = cur.armed ? (cur.onGround ? 0.12 : 0.28) : 0.0;
      });

      // Strobe aviation lights (1.5 Hz double flash)
      const strobePhase = (now % 800) / 800;
      const strobeOn = strobePhase < 0.15 || (strobePhase > 0.28 && strobePhase < 0.42);
      uavVisuals.strobeLights.forEach((s) => {
        s.scale.setScalar(strobeOn ? 1.45 : 0.75);
      });

      // Ground Downwash Ring when altitude < 0.75m
      const altMeters = cur.pos[2];
      if (cur.armed && !cur.onGround && altMeters < 0.75) {
        downwashRing.visible = true;
        downwashRing.position.set(droneThreePos.x, 0.007, droneThreePos.z);
        const intensity = Math.max(0, Math.min(1, (0.75 - altMeters) / 0.75));
        const pulse = 0.88 + 0.24 * Math.sin(now * 0.016);
        downwashRing.scale.setScalar(pulse * (1 + (1 - intensity) * 0.45));
        (downwashRing.material as THREE.MeshBasicMaterial).opacity = intensity * 0.48;
      } else {
        downwashRing.visible = false;
      }

      // Holographic Lead UAV update
      if (cur.leadUav) {
        leadGroup.visible = true;
        leadGroup.position.copy(pybToThree(cur.leadUav.pos));
        leadGroup.quaternion.copy(rpyToThreeQuat(cur.leadUav.rpy));
        const leadScale = 1.0 + 0.05 * Math.sin(now * 0.008);
        leadGroup.scale.setScalar(leadScale);
      } else {
        leadGroup.visible = false;
      }

      // Rotate Control Tower Radar Dish & flash obstruction beacons
      const objs = sceneObjectsRef.current;
      if (objs) {
        if (objs.radarDish) {
          objs.radarDish.rotation.y = now * 0.0012;
        }
        objs.beaconMeshes.forEach((b) => {
          b.visible = strobeOn;
        });

        // Animate 3D Windsock according to live wind vector
        if (objs.windsockPivot && objs.windsockCone) {
          const [wx, wy, wz] = cur.wind;
          const windMag = Math.hypot(wx, wy, wz);
          if (windMag > 0.04) {
            const windDirThree = new THREE.Vector3(wx, wz, -wy).normalize();
            const targetYaw = Math.atan2(-windDirThree.z, windDirThree.x);
            objs.windsockPivot.rotation.y = targetYaw;
          }
          // Droop cone when calm, extend horizontal when windy
          const droop = Math.max(0.05, 0.55 - Math.min(0.5, windMag * 0.25));
          objs.windsockCone.rotation.z = Math.PI / 2 - droop;
        }

        // Highlight active gate & completed gates
        objs.stageMeshes.forEach((mesh, idx) => {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (idx < cur.activeStageIndex) {
            mat.color.setHex(0x10b981);
            mat.emissive.setHex(0x059669);
            mat.opacity = 0.4;
          } else if (idx === cur.activeStageIndex) {
            mat.color.setHex(0xf59e0b);
            mat.emissive.setHex(0xd97706);
            mat.opacity = 0.88 + 0.12 * Math.sin(now * 0.009);
          } else {
            mat.color.setHex(0x06b6d4);
            mat.emissive.setHex(0x0284c7);
            mat.opacity = 0.52;
          }
        });
      }

      // Camera Mode Tracking
      if (cur.cameraMode === "vlos") {
        // Pilot standing on ground (VLOS) at eye level 1.65m with dynamic distance auto-zoom
        const padThree = pybToThree(cur.startPos);
        const pilotEyePos = new THREE.Vector3(padThree.x - 4.2, 1.65, padThree.z + 3.8);
        smoothCamPos.lerp(pilotEyePos, 0.2);
        camera.position.copy(smoothCamPos);

        const targetLook = new THREE.Vector3(
          droneThreePos.x,
          Math.max(0.25, droneThreePos.y),
          droneThreePos.z
        );
        smoothLookAt.lerp(targetLook, 0.22);
        camera.lookAt(smoothLookAt);

        const distToPilot = camera.position.distanceTo(droneThreePos);
        const targetFov = Math.max(26, Math.min(58, 62 - distToPilot * 2.1));
        if (Math.abs(camera.fov - targetFov) > 0.08) {
          camera.fov += (targetFov - camera.fov) * 0.14;
          camera.updateProjectionMatrix();
        }
      } else {
        if (Math.abs(camera.fov - 58) > 0.1) {
          camera.fov += (58 - camera.fov) * 0.2;
          camera.updateProjectionMatrix();
        }

        if (cur.cameraMode === "chase") {
          const yaw = cur.rpy[2];
          const backOffset = new THREE.Vector3(
            -Math.cos(yaw) * 1.95,
            0.78,
            Math.sin(yaw) * 1.95
          );
          const desiredCam = droneThreePos.clone().add(backOffset);
          desiredCam.y = Math.max(0.28, desiredCam.y);
          smoothCamPos.lerp(desiredCam, 0.14);
          camera.position.copy(smoothCamPos);

          const lookTarget = droneThreePos.clone().add(
            new THREE.Vector3(Math.cos(yaw) * 0.85, 0.12, -Math.sin(yaw) * 0.85)
          );
          smoothLookAt.lerp(lookTarget, 0.18);
          camera.lookAt(smoothLookAt);
        } else if (cur.cameraMode === "fpv") {
          // 100% Horizon-Locked 3-Axis Mechanical Gimbal (Roll = 0°, Pitch = -5.5° steady, smooth Yaw)
          let dyaw = ((cur.rpy[2] - smoothFpvYaw + Math.PI) % (2 * Math.PI)) - Math.PI;
          if (dyaw < -Math.PI) dyaw += 2 * Math.PI;
          smoothFpvYaw += dyaw * 0.22;

          const cosY = Math.cos(smoothFpvYaw);
          const sinY = Math.sin(smoothFpvYaw);
          const desiredFpvCam = new THREE.Vector3(
            droneGroup.position.x + cosY * 0.24,
            Math.max(0.18, droneGroup.position.y + 0.04),
            droneGroup.position.z - sinY * 0.24
          );
          if (smoothCamPos.distanceTo(desiredFpvCam) > 1.2) {
            smoothCamPos.copy(desiredFpvCam);
          } else {
            smoothCamPos.lerp(desiredFpvCam, 0.42);
          }
          camera.position.copy(smoothCamPos);
          camera.up.set(0, 1, 0);

          const desiredFpvLook = new THREE.Vector3(
            smoothCamPos.x + cosY * 6.0,
            smoothCamPos.y - 0.52,
            smoothCamPos.z - sinY * 6.0
          );
          if (smoothLookAt.distanceTo(desiredFpvLook) > 2.5) {
            smoothLookAt.copy(desiredFpvLook);
          } else {
            smoothLookAt.lerp(desiredFpvLook, 0.38);
          }
          camera.lookAt(smoothLookAt);
        } else {
          const cx = droneThreePos.x + orbitDist * Math.cos(orbitPitch) * Math.cos(orbitAngle);
          const cy = Math.max(0.25, droneThreePos.y + orbitDist * Math.sin(orbitPitch));
          const cz = droneThreePos.z + orbitDist * Math.cos(orbitPitch) * Math.sin(orbitAngle);
          camera.position.set(cx, cy, cz);
          camera.lookAt(droneThreePos.x, Math.max(0.35, droneThreePos.y), droneThreePos.z);
        }
      }

      if (sceneObjectsRef.current?.google3dController) {
        sceneObjectsRef.current.google3dController.update(camera, renderer);
      }

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      dom.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      dom.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      sceneObjectsRef.current?.google3dController?.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
    };
  }, [onFpsUpdate]);

  // Rebuild World Environment & Update Atmospheric Sky when mapPreset or google3dConfig changes
  useEffect(() => {
    const objs = sceneObjectsRef.current;
    if (!objs) return;

    if (objs.google3dController) {
      objs.google3dController.dispose();
      objs.google3dController = null;
    }

    while (objs.worldHolder.children.length > 0) {
      objs.worldHolder.remove(objs.worldHolder.children[0]);
    }

    const built = buildWorldEnvironment(mapPreset);
    objs.worldHolder.add(built.envGroup);
    objs.radarDish = built.radarDish;
    objs.windsockPivot = built.windsockPivot;
    objs.windsockCone = built.windsockCone;
    objs.beaconMeshes = built.beaconMeshes;

    if (mapPreset === "google3d") {
      const cfg = google3dConfig || loadSavedGoogle3DConfig();
      const g3d = createGoogle3DTilesScene(cfg, built.beaconMeshes);
      objs.worldHolder.add(g3d.rootGroup);
      objs.google3dController = g3d;
    }

    // 1. Physically-Based Atmospheric Sky & Sun Angles
    const uniforms = objs.sky.material.uniforms;
    uniforms["mieCoefficient"].value = 0.005;
    uniforms["mieDirectionalG"].value = 0.8;

    let elevation = 42;
    let azimuth = 175;
    let turbidity = 2.8;
    let rayleigh = 1.1;
    let sunColor = 0xfffaed;
    let sunIntensity = 2.1;
    let fogColor = 0xcfe6f8;
    let fogDensity = 0.006;

    if (mapPreset === "landmark81" || mapPreset === "google3d") {
      elevation = 48;
      azimuth = 190;
      turbidity = 2.3;
      rayleigh = 1.15;
      sunColor = 0xfffaf0;
      sunIntensity = 1.95;
      fogColor = 0xcfe8fc;
      fogDensity = 0.0022;
    } else if (mapPreset === "photogrammetry") {
      elevation = 42;
      azimuth = 195;
      turbidity = 2.2; // Crisp coastal sea breeze
      rayleigh = 1.05;
      sunColor = 0xfffaea; // Natural warm sunlight
      sunIntensity = 1.05; // Balanced for pre-illuminated real drone orthophotos
      fogColor = 0xbae6fd; // Vast open coastal sky horizon
      fogDensity = 0.0032;
    } else if (mapPreset === "bellus") {
      elevation = 46;
      azimuth = 185;
      turbidity = 2.4; // Sunny Mediterranean afternoon
      rayleigh = 1.1;
      sunColor = 0xfff7e6; // Rich warm European sunlight
      sunIntensity = 1.18;
      fogColor = 0xcfe2fe; // Open European country sky
      fogDensity = 0.0035;
    } else if (mapPreset === "forest") {
      elevation = 30;
      azimuth = 140;
      turbidity = 5.2; // mountain valley haze
      rayleigh = 2.2;
      sunColor = 0xffebd4;
      sunIntensity = 2.0;
      fogColor = 0x86a789;
      fogDensity = 0.008;
    } else if (mapPreset === "urban") {
      elevation = 54;
      azimuth = 200;
      turbidity = 3.8;
      rayleigh = 1.35;
      sunColor = 0xffffff;
      sunIntensity = 2.3;
      fogColor = 0x94a3b8;
      fogDensity = 0.0065;
    } else if (mapPreset === "tactical") {
      elevation = 6.5; // dramatic dusk / twilight
      azimuth = 225;
      turbidity = 10.5;
      rayleigh = 0.55;
      sunColor = 0x38bdf8;
      sunIntensity = 0.95;
      fogColor = 0x091424;
      fogDensity = 0.012;
    }

    uniforms["turbidity"].value = turbidity;
    uniforms["rayleigh"].value = rayleigh;

    const sunVector = new THREE.Vector3();
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    sunVector.setFromSphericalCoords(1, phi, theta);
    uniforms["sunPosition"].value.copy(sunVector);

    objs.sunLight.position.copy(sunVector.clone().multiplyScalar(50));
    objs.sunLight.color.setHex(sunColor);
    objs.sunLight.intensity = sunIntensity;

    objs.ambientLight.color.setHex(
      mapPreset === "tactical" ? 0x1e3a5f : mapPreset === "forest" ? 0xdcfce7 : 0xe0f2fe
    );
    objs.ambientLight.groundColor.setHex(
      mapPreset === "tactical" ? 0x070c16 : mapPreset === "forest" ? 0x14532d : 0x334155
    );
    objs.ambientLight.intensity =
      mapPreset === "photogrammetry"
        ? 0.70
        : mapPreset === "bellus"
        ? 0.75
        : mapPreset === "tactical"
        ? 0.65
        : 1.15;

    objs.scene.fog = new THREE.FogExp2(fogColor, fogDensity);

    // 2. Generate Real-time Sky Environment Reflections (IBL)
    try {
      const skyScene = new THREE.Scene();
      const skyMesh = new Sky();
      skyMesh.scale.setScalar(450000);
      skyMesh.material.uniforms["turbidity"].value = turbidity;
      skyMesh.material.uniforms["rayleigh"].value = rayleigh;
      skyMesh.material.uniforms["mieCoefficient"].value = 0.005;
      skyMesh.material.uniforms["mieDirectionalG"].value = 0.8;
      skyMesh.material.uniforms["sunPosition"].value.copy(sunVector);
      skyScene.add(skyMesh);

      const renderTarget = objs.pmremGenerator.fromScene(skyScene, 0.04);
      objs.scene.environment = renderTarget.texture;
    } catch {
      // Safe fallback if WebGL context is initializing
    }
  }, [mapPreset, google3dConfig]);

  // Rebuild Course Gates, Corridor & Hazard Obstacle Towers when exercise changes
  useEffect(() => {
    const objs = sceneObjectsRef.current;
    if (!objs) return;

    while (objs.courseGroup.children.length > 0) {
      objs.courseGroup.remove(objs.courseGroup.children[0]);
    }
    objs.stageMeshes = [];

    const trussMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.75,
      roughness: 0.25,
    });

    // 0. Start Helipad H at startPos & Destination Helipad H at any "land" stage
    objs.courseGroup.add(createHelipadMarkings(pybToThree(startPos), 0x10b981));
    stages.forEach((st) => {
      if (st.kind === "land") {
        objs.courseGroup.add(createHelipadMarkings(pybToThree(st.target), 0xf59e0b));
      }
    });

    // 1. Build 3D Truss Gates for Stages
    stages.forEach((st) => {
      const tPos = pybToThree(st.target);
      const gateHolder = new THREE.Group();
      gateHolder.position.copy(tPos);

      // Outer Carbon Truss Frame
      const outerFrame = new THREE.Mesh(
        new THREE.TorusGeometry(st.radius + 0.035, 0.024, 10, 28),
        trussMat
      );
      outerFrame.rotation.x = Math.PI / 2;
      outerFrame.castShadow = true;
      gateHolder.add(outerFrame);

      // Inner Glowing Neon Ring (tracked in stageMeshes)
      const neonRing = new THREE.Mesh(
        new THREE.TorusGeometry(st.radius, 0.018, 12, 32),
        new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          emissive: 0x0284c7,
          emissiveIntensity: 0.65,
          transparent: true,
          opacity: 0.8,
        })
      );
      neonRing.rotation.x = Math.PI / 2;
      neonRing.position.copy(tPos);
      objs.courseGroup.add(neonRing);
      objs.stageMeshes.push(neonRing);

      // Vertical Drop Line & Ground Projection Pad
      const stemGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(tPos.x, 0.01, tPos.z),
        tPos,
      ]);
      const stemLine = new THREE.Line(
        stemGeo,
        new THREE.LineBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.4,
        })
      );
      objs.courseGroup.add(stemLine);

      const groundMarker = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.16, 20),
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide,
        })
      );
      groundMarker.rotation.x = -Math.PI / 2;
      groundMarker.position.set(tPos.x, 0.005, tPos.z);
      objs.courseGroup.add(groundMarker);

      objs.courseGroup.add(gateHolder);
    });

    // Ideal Corridor Centerline
    const corridorPts = [startPos, ...stages.map((s) => s.target)].map(pybToThree);
    objs.refTrailLine.geometry.dispose();
    objs.refTrailLine.geometry = new THREE.BufferGeometry().setFromPoints(corridorPts);

    // 2. Build Physical 3D Obstacles (Forest Trees, High-Rise Buildings, Hazard Pillars)
    const hazardTex = createHazardPillarTexture();
    const obsMat = new THREE.MeshStandardMaterial({
      map: hazardTex,
      roughness: 0.35,
      metalness: 0.3,
    });
    const buildingMat = new THREE.MeshStandardMaterial({
      map: createBuildingFacadeTexture(),
      roughness: 0.12,
      metalness: 0.35,
    });

    obstacles.forEach((ob) => {
      objs.courseGroup.add(buildObstacleMeshGroup(ob, obsMat, buildingMat));
    });
  }, [startPos, stages, obstacles]);

  // Update Flight Trail
  useEffect(() => {
    const objs = sceneObjectsRef.current;
    if (!objs) return;

    const pts = trailPoints.slice(-600).map(pybToThree);
    objs.trailLine.geometry.dispose();
    objs.trailLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);

    if (referenceTrailPoints && referenceTrailPoints.length > 0) {
      const rPts = referenceTrailPoints.map(pybToThree);
      objs.refTrailLine.geometry.dispose();
      objs.refTrailLine.geometry = new THREE.BufferGeometry().setFromPoints(rPts);
    }
  }, [trailPoints, referenceTrailPoints]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden bg-slate-950 select-none"
    />
  );
};
