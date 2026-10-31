// STEP 21 — Optimized 3D Traffic Simulation & Performance Analytics
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import * as THREE from "three";

import {
  Canvas,
  useFrame,
  useThree,
} from "@react-three/fiber";

import {
  OrbitControls,
} from "@react-three/drei";
import AnalyticsPage from "./AnalyticsPage.jsx";

// ============================================================
// CONFIGURATION
// ============================================================

const WS_URL = "ws://127.0.0.1:8000/ws/simulation";
const MAX_RENDER_VEHICLES = 120;

const INTERSECTIONS = {
  I1: [0, 250],
  I2: [500, 250],
  I3: [0, -250],
  I4: [500, -250],
};

// Camera presets are starting viewpoints only. OrbitControls remain enabled
// after every preset so users can freely rotate, pan and zoom from that view.
const CAMERA_PRESETS = {
  OVERVIEW: {
    label: "OVERVIEW",
    position: [20, 42, 62],
    target: [20, 0, 0],
  },
  I1: {
    label: "JUNCTION 1",
    position: [12, 19, 5],
    target: [0, 0, -20],
  },
  I2: {
    label: "JUNCTION 2",
    position: [52, 19, 5],
    target: [40, 0, -20],
  },
  I3: {
    label: "JUNCTION 3",
    position: [12, 19, 45],
    target: [0, 0, 20],
  },
  I4: {
    label: "JUNCTION 4",
    position: [52, 19, 45],
    target: [40, 0, 20],
  },
};

const SCALE = 0.08;
const SUMO_OFFSET_X = 600;
const SUMO_OFFSET_Y = 850;

function sumoToThree(x, y, height = 0) {
  const originalX = Number(x) - SUMO_OFFSET_X;
  const originalY = Number(y) - SUMO_OFFSET_Y;
  return [originalX * SCALE, height, -originalY * SCALE];
}

function originalToThree(x, y, height = 0) {
  return [Number(x) * SCALE, height, -Number(y) * SCALE];
}

// ============================================================
// LIGHTING THEMES
// ============================================================

const THEMES = {
  DAY: {
    label: "Daylight",
    bg: "#182026",
    fogColor: "#182026",
    ambient: 1.15,
    dirIntensity: 2.2,
    dirColor: "#fff8eb",
    hemiIntensity: 0.45,
    skyColor: "#9bb8d3",
    groundColor: "#1a1e21",
    lampIntensity: 0.25,
    windowEmissive: 0.05,
  },
  DUSK: {
    label: "Sunset",
    bg: "#1b1521",
    fogColor: "#1b1521",
    ambient: 0.65,
    dirIntensity: 1.6,
    dirColor: "#ff9e5e",
    hemiIntensity: 0.35,
    skyColor: "#e07a5f",
    groundColor: "#141218",
    lampIntensity: 1.4,
    windowEmissive: 0.35,
  },
  NIGHT: {
    label: "Cyber Night",
    bg: "#090d12",
    fogColor: "#090d12",
    ambient: 0.35,
    dirIntensity: 0.7,
    dirColor: "#7ea8ff",
    hemiIntensity: 0.2,
    skyColor: "#1d2d44",
    groundColor: "#0a0d12",
    lampIntensity: 2.4,
    windowEmissive: 0.65,
  },
};

// ============================================================
// ROADS
// ============================================================

const ROAD_SEGMENTS = [
  { name: "W1-I1", from: [-600, 250], to: [0, 250] },
  { name: "I1-I2", from: [0, 250], to: [500, 250] },
  { name: "I2-E1", from: [500, 250], to: [1100, 250] },

  { name: "W2-I3", from: [-600, -250], to: [0, -250] },
  { name: "I3-I4", from: [0, -250], to: [500, -250] },
  { name: "I4-E2", from: [500, -250], to: [1100, -250] },

  { name: "N1-I1", from: [0, 850], to: [0, 250] },
  { name: "I1-I3", from: [0, 250], to: [0, -250] },
  { name: "I3-S1", from: [0, -250], to: [0, -850] },

  { name: "N2-I2", from: [500, 850], to: [500, 250] },
  { name: "I2-I4", from: [500, 250], to: [500, -250] },
  { name: "I4-S2", from: [500, -250], to: [500, -850] },
];

function Road({ from, to }) {
  const [x1, , z1] = originalToThree(from[0], from[1], 0);
  const [x2, , z2] = originalToThree(to[0], to[1], 0);

  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);

  const centerX = (x1 + x2) / 2;
  const centerZ = (z1 + z2) / 2;

  const laneWidth = 3.2 * SCALE;
  const roadHalfWidth = laneWidth * 3;
  const roadWidth = roadHalfWidth * 2;

  return (
    <group position={[centerX, 0, centerZ]} rotation={[0, -angle, 0]}>
      <mesh position={[0, -0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length + 0.55, roadWidth + 0.65]} />
        <meshStandardMaterial color="#42494e" roughness={0.96} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[length, roadWidth]} />
        <meshStandardMaterial color="#262a2e" roughness={0.94} metalness={0.035} />
      </mesh>

      {/* Raised-looking concrete footpaths along both sides of each road. */}
      <mesh position={[0, -0.006, roadHalfWidth + 0.215]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length + 0.25, 0.40]} />
        <meshStandardMaterial color="#666d70" roughness={0.96} />
      </mesh>
      <mesh position={[0, -0.006, -roadHalfWidth - 0.215]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length + 0.25, 0.40]} />
        <meshStandardMaterial color="#666d70" roughness={0.96} />
      </mesh>

      {/* Center Double Yellow Divider */}
      <mesh position={[0, 0.02, -0.045]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length, 0.035]} />
        <meshBasicMaterial color="#e0b932" />
      </mesh>
      <mesh position={[0, 0.02, 0.045]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length, 0.035]} />
        <meshBasicMaterial color="#e0b932" />
      </mesh>

      <LaneMarkings length={length} laneWidth={laneWidth} />

      {/* Outer Road Edge Lines */}
      <mesh position={[0, 0.021, roadHalfWidth - 0.035]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length, 0.045]} />
        <meshBasicMaterial color="#ececec" />
      </mesh>
      <mesh position={[0, 0.021, -roadHalfWidth + 0.035]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length, 0.045]} />
        <meshBasicMaterial color="#ececec" />
      </mesh>
    </group>
  );
}

function LaneMarkings({ length, laneWidth }) {
  const markings = useMemo(() => {
    const list = [];
    const separatorPositions = [
      -2 * laneWidth,
      -1 * laneWidth,
      1 * laneWidth,
      2 * laneWidth,
    ];
    const spacing = 2.1;

    separatorPositions.forEach((laneZ, separatorIndex) => {
      for (let x = -length / 2 + 1.2; x < length / 2; x += spacing) {
        list.push(
          <mesh
            key={`${separatorIndex}-${x}`}
            position={[x, 0.021, laneZ]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.9, 0.035]} />
            <meshBasicMaterial color="#e2e8f0" />
          </mesh>
        );
      }
    });
    return list;
  }, [length, laneWidth]);

  return <>{markings}</>;
}

function Crosswalk({ x = 0, z = 0, rotation = 0 }) {
  const stripes = [];
  for (let i = -3; i <= 3; i++) {
    stripes.push(
      <mesh
        key={i}
        position={[x + i * 0.35, 0.045, z]}
        rotation={[-Math.PI / 2, 0, rotation]}
      >
        <planeGeometry args={[0.18, 1.2]} />
        <meshBasicMaterial color="#f2f2f2" />
      </mesh>
    );
  }
  return <group>{stripes}</group>;
}

function SidewalkCorner({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.15, 2.15]} />
        <meshStandardMaterial color="#4b4e51" roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.115, 0]} receiveShadow>
        <boxGeometry args={[2.15, 0.08, 0.1]} />
        <meshStandardMaterial color="#777b7e" roughness={0.78} />
      </mesh>
    </group>
  );
}

function StopLine({ position, rotation = 0 }) {
  return (
    <mesh
      position={[position[0], 0.052, position[1]]}
      rotation={[-Math.PI / 2, 0, rotation]}
    >
      <planeGeometry args={[2.75, 0.1]} />
      <meshBasicMaterial color="#f4f4f4" />
    </mesh>
  );
}

function IntersectionDetails() {
  return (
    <>
      <SidewalkCorner position={[-2.55, 0, -2.55]} />
      <SidewalkCorner position={[2.55, 0, -2.55]} />
      <SidewalkCorner position={[-2.55, 0, 2.55]} />
      <SidewalkCorner position={[2.55, 0, 2.55]} />

      <StopLine position={[0, 1.55]} />
      <StopLine position={[0, -1.55]} rotation={Math.PI} />
      <StopLine position={[-1.55, 0]} rotation={Math.PI / 2} />
      <StopLine position={[1.55, 0]} rotation={-Math.PI / 2} />
    </>
  );
}

function Intersection({ id, position }) {
  const point = originalToThree(position[0], position[1], 0);

  return (
    <group
      position={[point[0], 0, point[2]]}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[5.2, 5.2]} />
        <meshStandardMaterial color="#272b2f" roughness={0.9} />
      </mesh>

      <Crosswalk x={0} z={2.25} rotation={0} />
      <Crosswalk x={0} z={-2.25} rotation={0} />
      <Crosswalk x={-2.25} z={0} rotation={Math.PI / 2} />
      <Crosswalk x={2.25} z={0} rotation={Math.PI / 2} />

      <IntersectionDetails />

      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.2, 2.2]} />
        <meshStandardMaterial color="#222528" />
      </mesh>
    </group>
  );
}

// ============================================================
// TRAFFIC LIGHT WITH DYNAMIC POINT LIGHT GLOW
// ============================================================

function TrafficLight({ position, rotation = 0, state = "r" }) {
  const red = state === "r";
  const yellow = state === "y";
  const green = state === "g";

  const activeColor = green ? "#00ff66" : yellow ? "#ffb700" : "#ff1d25";
  const activeY = green ? 1.97 : yellow ? 2.2 : 2.43;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Pole */}
      <mesh position={[0, 1.15, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.05, 2.3, 8]} />
        <meshStandardMaterial color="#555b61" metalness={0.65} roughness={0.35} />
      </mesh>

      {/* Housing */}
      <mesh position={[0, 2.2, 0]} castShadow>
        <boxGeometry args={[0.28, 0.75, 0.2]} />
        <meshStandardMaterial color="#111315" />
      </mesh>

      {/* Red */}
      <mesh position={[0, 2.43, 0.11]}>
        <sphereGeometry args={[0.075, 12, 12]} />
        <meshStandardMaterial
          color={red ? "#ff1d25" : "#321416"}
          emissive={red ? "#ff0000" : "#000000"}
          emissiveIntensity={red ? 3.2 : 0}
        />
      </mesh>

      {/* Yellow */}
      <mesh position={[0, 2.2, 0.11]}>
        <sphereGeometry args={[0.075, 12, 12]} />
        <meshStandardMaterial
          color={yellow ? "#ffd000" : "#302c12"}
          emissive={yellow ? "#ffb700" : "#000000"}
          emissiveIntensity={yellow ? 2.8 : 0}
        />
      </mesh>

      {/* Green */}
      <mesh position={[0, 1.97, 0.11]}>
        <sphereGeometry args={[0.075, 12, 12]} />
        <meshStandardMaterial
          color={green ? "#20e875" : "#102c1c"}
          emissive={green ? "#00ff66" : "#000000"}
          emissiveIntensity={green ? 3.2 : 0}
        />
      </mesh>

      {/* Emissive lenses provide the signal glow without expensive dynamic point lights. */}
    </group>
  );
}

function IntersectionLights({ id, trafficLights }) {
  const position = INTERSECTIONS[id];
  const point = originalToThree(position[0], position[1], 0);

  const live = trafficLights?.find((light) => light.id === id);
  const tlsState = String(live?.redYellowGreenState || "");
  const phase = Number.isFinite(Number(live?.phase)) ? Number(live.phase) : -1;

  let directionA = "r";
  let directionB = "r";

  if (live && tlsState) {
    if (phase === 0) {
      directionA = "g";
      directionB = "r";
    } else if (phase === 1) {
      directionA = "y";
      directionB = "r";
    } else if (phase === 2) {
      directionA = "r";
      directionB = "g";
    } else if (phase === 3) {
      directionA = "r";
      directionB = "y";
    }
  }

  const signals = [
    { key: `${id}-west`, position: [-2.75, 0, -1.55], rotation: Math.PI / 2, state: directionA },
    { key: `${id}-east`, position: [2.75, 0, 1.55], rotation: -Math.PI / 2, state: directionA },
    { key: `${id}-north`, position: [1.55, 0, -2.75], rotation: Math.PI, state: directionB },
    { key: `${id}-south`, position: [-1.55, 0, 2.75], rotation: 0, state: directionB },
  ];

  return (
    <group position={[point[0], 0, point[2]]}>
      {signals.map((signal) => (
        <TrafficLight
          key={signal.key}
          position={signal.position}
          rotation={signal.rotation}
          state={signal.state}
        />
      ))}
    </group>
  );
}

// ============================================================
// VEHICLE COLORS & WHEELS
// ============================================================

function getVehicleColor(vehicleId) {
  const colors = [
    "#e63946",
    "#457b9d",
    "#f4a261",
    "#2a9d8f",
    "#e9c46a",
    "#9b5de5",
    "#f72585",
    "#577590",
    "#43aa8b",
    "#ef476f",
    "#118ab2",
    "#ffd166",
  ];
  let hash = 0;
  const id = String(vehicleId || "");
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function Wheel({ position, radius = 0.075, width = 0.07 }) {
  return (
    <group position={position} rotation={[0, 0, Math.PI / 2]}>
      <mesh>
        <cylinderGeometry args={[radius, radius, width, 16]} />
        <meshStandardMaterial color="#101214" roughness={0.82} metalness={0.08} />
      </mesh>
      <mesh position={[0, width * 0.51, 0]}>
        <cylinderGeometry args={[radius * 0.46, radius * 0.46, 0.012, 12]} />
        <meshStandardMaterial color="#a7adb3" roughness={0.3} metalness={0.72} />
      </mesh>
    </group>
  );
}

// ============================================================
// VEHICLE WITH DYNAMIC BRAKE LIGHTS, BLINKERS & SELECTION RING
// ============================================================

const Vehicle = React.memo(function Vehicle({ vehicleId, vehicleRegistryRef, simulationSpeedRef, isSelected, onSelect }) {
  const vehicle = vehicleRegistryRef.current.get(vehicleId) || {};
  let x = Number(vehicle?.renderX);
  let z = Number(vehicle?.renderZ);

  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    const rawX = vehicle?.x ?? 0;
    const rawY = vehicle?.y ?? 0;
    const point = sumoToThree(Number(rawX), Number(rawY), 0);
    x = point[0];
    z = point[2];
  }

  const laneId = String(vehicle?.lane ?? "");
  const speed = Number(vehicle?.speed ?? 0);
  const braking = Boolean(vehicle?.braking) || speed < 0.4;

  const type = String(vehicle?.type || "car").toLowerCase();
  const color = getVehicleColor(vehicle?.id);

  const isBus = type.includes("bus");
  const isTruck = type.includes("truck");

  const vehicleIdString = String(vehicle?.id || "");
  let vehicleHash = 0;
  for (let i = 0; i < vehicleIdString.length; i++) {
    vehicleHash = vehicleIdString.charCodeAt(i) + ((vehicleHash << 5) - vehicleHash);
  }
  const variant = Math.abs(vehicleHash) % 4;

  const carWidthFactor = !isBus && !isTruck ? [0.94, 1.02, 0.98, 1.06][variant] : 1;
  const carLengthFactor = !isBus && !isTruck ? [1.08, 0.94, 1.0, 0.9][variant] : 1;

  let width = 1.85 * SCALE * carWidthFactor;
  let height = 1.42 * SCALE;
  let length = 4.5 * SCALE * carLengthFactor;

  if (isBus) {
    width = 2.5 * SCALE;
    height = 3.2 * SCALE;
    length = 12.0 * SCALE;
  } else if (isTruck) {
    width = 2.5 * SCALE;
    height = 3.2 * SCALE;
    length = 8.0 * SCALE;
  }

  const sumoAngle = Number(vehicle?.angle ?? 0);
  const normalizedSumoAngle = ((sumoAngle % 360) + 360) % 360;
  const angle = Math.PI - THREE.MathUtils.degToRad(sumoAngle);

  const groupRef = useRef(null);
  const targetRef = useRef(new THREE.Vector3(x, 0.2, z));
  const initializedRef = useRef(false);
  const lastLaneRef = useRef(laneId);
  const lastAngleRef = useRef(normalizedSumoAngle);
  const targetAngleRef = useRef(angle);
  const brakeLeftMaterialRef = useRef(null);
  const brakeRightMaterialRef = useRef(null);
  const blinkerLeftRef = useRef(null);
  const blinkerRightRef = useRef(null);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const latestVehicle = vehicleRegistryRef.current.get(vehicleId);
    if (latestVehicle) {
      const nextX = Number(latestVehicle.renderX);
      const nextZ = Number(latestVehicle.renderZ);
      if (Number.isFinite(nextX) && Number.isFinite(nextZ)) {
        targetRef.current.set(nextX, 0.2, nextZ);
      }
      const nextLane = String(latestVehicle.lane ?? "");
      const nextSumoAngle = Number(latestVehicle.angle ?? 0);
      const nextNormalizedAngle = ((nextSumoAngle % 360) + 360) % 360;
      const nextAngle = Math.PI - THREE.MathUtils.degToRad(nextSumoAngle);
      const angleDelta = Math.abs(((nextNormalizedAngle - lastAngleRef.current + 180) % 360) - 180);
      if (nextLane !== lastLaneRef.current && angleDelta > 70) {
        groupRef.current.position.copy(targetRef.current);
      }
      lastLaneRef.current = nextLane;
      lastAngleRef.current = nextNormalizedAngle;
      targetAngleRef.current = nextAngle;

      const isBraking = Boolean(latestVehicle.braking) || Number(latestVehicle.speed || 0) < 0.4;
      [brakeLeftMaterialRef.current, brakeRightMaterialRef.current].forEach((material) => {
        if (!material) return;
        material.color.set(isBraking ? "#ff3b3b" : "#801317");
        material.emissiveIntensity = isBraking ? 4.8 : 0.7;
      });
      const blinkOn = Math.floor(state.clock.elapsedTime / 0.28) % 2 === 0;
      if (blinkerLeftRef.current) blinkerLeftRef.current.visible = Boolean(latestVehicle.blinkerLeft) && blinkOn;
      if (blinkerRightRef.current) blinkerRightRef.current.visible = Boolean(latestVehicle.blinkerRight) && blinkOn;
    }

    const currentPosition = groupRef.current.position;
    const targetPosition = targetRef.current;
    const distance = currentPosition.distanceTo(targetPosition);
    const simulationRate = THREE.MathUtils.clamp(
      Number(simulationSpeedRef.current || 1),
      0.25,
      4
    );

    if (!initializedRef.current) {
      currentPosition.copy(targetPosition);
      groupRef.current.rotation.y = targetAngleRef.current;
      initializedRef.current = true;
      return;
    }

    // Normal SUMO steps can move a vehicle over one rendered world unit.
    // Snapping at that distance made every ordinary update look like a jump.
    // Only snap for genuine discontinuities (e.g. teleports/reset); otherwise
    // interpolate at a rate scaled to the selected simulation playback speed.
    if (distance > 8) {
      currentPosition.copy(targetPosition);
    } else {
      const normalizedDistance = THREE.MathUtils.clamp(distance / 1.25, 0, 1);
      const movementSpeed = THREE.MathUtils.lerp(28, 42, normalizedDistance) * simulationRate;
      const smoothing = 1 - Math.exp(-movementSpeed * Math.max(delta, 0.001));
      currentPosition.lerp(targetPosition, smoothing);
    }

    const currentAngle = groupRef.current.rotation.y;
    const targetAngle = targetAngleRef.current;
    const angleDifference = Math.atan2(
      Math.sin(targetAngle - currentAngle),
      Math.cos(targetAngle - currentAngle)
    );
    const rotationSpeed = THREE.MathUtils.lerp(
      18,
      28,
      THREE.MathUtils.clamp(Math.abs(angleDifference) / (Math.PI / 2), 0, 1)
    ) * simulationRate;
    const rotationSmoothing = 1 - Math.exp(-rotationSpeed * Math.max(delta, 0.001));
    groupRef.current.rotation.y += angleDifference * rotationSmoothing;
  });

  const bodyY = -height * 0.04;
  const wheelY = -height * 0.42;
  const wheelX = width * 0.55;

  const blinkOn = Math.floor(Date.now() / 280) % 2 === 0;

  return (
    <group
      ref={groupRef}
      position={[x, 0.2, z]}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect(vehicle.id);
      }}
    >
      {/* Selection Highlight Ring */}
      {isSelected && (
        <mesh position={[0, -0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[length * 0.62, length * 0.72, 32]} />
          <meshBasicMaterial color="#00e8a0" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Lower Body / Chassis */}
      <mesh position={[0, bodyY, 0]}>
        <boxGeometry args={[width, height * 0.52, length * 0.94]} />
        <meshStandardMaterial color={color} roughness={0.26} metalness={0.32} />
      </mesh>

      {/* Car-Specific Body */}
      {!isBus && !isTruck && (
        <>
          <mesh position={[0, height * 0.24, length * 0.3]}>
            <boxGeometry args={[width * 0.9, height * 0.24, length * 0.25]} />
            <meshStandardMaterial color={color} roughness={0.25} metalness={0.32} />
          </mesh>
          <mesh position={[0, height * 0.42, -length * 0.02]}>
            <boxGeometry args={[width * 0.78, height * 0.58, length * 0.48]} />
            <meshStandardMaterial color={color} roughness={0.25} metalness={0.28} />
          </mesh>
          <mesh position={[0, height * 0.71, -length * 0.02]}>
            <boxGeometry args={[width * 0.66, height * 0.1, length * 0.39]} />
            <meshStandardMaterial color={color} roughness={0.22} metalness={0.3} />
          </mesh>
          <mesh position={[0, height * 0.48, length * 0.225]}>
            <boxGeometry args={[width * 0.62, height * 0.31, 0.018]} />
            <meshStandardMaterial color="#173243" roughness={0.07} metalness={0.42} />
          </mesh>
          <mesh position={[0, height * 0.48, -length * 0.225]}>
            <boxGeometry args={[width * 0.62, height * 0.29, 0.018]} />
            <meshStandardMaterial color="#172f3f" roughness={0.07} metalness={0.42} />
          </mesh>
        </>
      )}

      {/* Bus Body */}
      {isBus && (
        <>
          <mesh position={[0, height * 0.27, -length * 0.02]}>
            <boxGeometry args={[width * 0.98, height * 0.52, length * 0.94]} />
            <meshStandardMaterial color={color} roughness={0.32} metalness={0.22} />
          </mesh>
          <mesh position={[0, height * 0.58, 0]}>
            <boxGeometry args={[width * 0.84, height * 0.34, length * 0.79]} />
            <meshStandardMaterial color="#142b38" roughness={0.08} metalness={0.38} />
          </mesh>
        </>
      )}

      {/* Truck Body */}
      {isTruck && (
        <>
          <mesh position={[0, height * 0.32, length * 0.28]}>
            <boxGeometry args={[width * 0.94, height * 0.62, length * 0.34]} />
            <meshStandardMaterial color={color} roughness={0.3} metalness={0.25} />
          </mesh>
          <mesh position={[0, height * 0.42, -length * 0.16]}>
            <boxGeometry args={[width * 0.96, height * 0.78, length * 0.55]} />
            <meshStandardMaterial color="#cfd3d7" roughness={0.54} metalness={0.1} />
          </mesh>
        </>
      )}

      {/* Wheels */}
      {!isBus && !isTruck && (
        <>
          <Wheel position={[-wheelX, wheelY, length * 0.3]} />
          <Wheel position={[wheelX, wheelY, length * 0.3]} />
          <Wheel position={[-wheelX, wheelY, -length * 0.3]} />
          <Wheel position={[wheelX, wheelY, -length * 0.3]} />
        </>
      )}

      {/* Headlights */}
      <mesh position={[-width * 0.29, height * 0.04, length * 0.505]}>
        <boxGeometry args={[width * 0.2, height * 0.16, 0.024]} />
        <meshStandardMaterial
          color="#fffce9"
          emissive="#fff3a8"
          emissiveIntensity={2.4}
        />
      </mesh>
      <mesh position={[width * 0.29, height * 0.04, length * 0.505]}>
        <boxGeometry args={[width * 0.2, height * 0.16, 0.024]} />
        <meshStandardMaterial
          color="#fffce9"
          emissive="#fff3a8"
          emissiveIntensity={2.4}
        />
      </mesh>

      {/* Dynamic Brake Lights */}
      <mesh position={[-width * 0.29, height * 0.04, -length * 0.505]}>
        <boxGeometry args={[width * 0.22, height * 0.16, 0.024]} />
        <meshStandardMaterial
          ref={brakeLeftMaterialRef}
          color={braking ? "#ff3b3b" : "#801317"}
          emissive="#ff0000"
          emissiveIntensity={braking ? 4.8 : 0.7}
        />
      </mesh>
      <mesh position={[width * 0.29, height * 0.04, -length * 0.505]}>
        <boxGeometry args={[width * 0.22, height * 0.16, 0.024]} />
        <meshStandardMaterial
          ref={brakeRightMaterialRef}
          color={braking ? "#ff3b3b" : "#801317"}
          emissive="#ff0000"
          emissiveIntensity={braking ? 4.8 : 0.7}
        />
      </mesh>

      {/* Turn Signal Blinkers */}
      <mesh ref={blinkerLeftRef} visible={false} position={[width * 0.42, height * 0.05, length * 0.49]}>
        <sphereGeometry args={[0.028, 8, 8]} />
        <meshBasicMaterial color="#ffaa00" />
      </mesh>
      <mesh ref={blinkerRightRef} visible={false} position={[-width * 0.42, height * 0.05, length * 0.49]}>
        <sphereGeometry args={[0.028, 8, 8]} />
        <meshBasicMaterial color="#ffaa00" />
      </mesh>
    </group>
  );
}, (previous, next) => previous.vehicleId === next.vehicleId && previous.simulationSpeedRef === next.simulationSpeedRef && previous.isSelected === next.isSelected && previous.onSelect === next.onSelect);
// ============================================================
// ENVIRONMENT & STREET LIGHTS
// ============================================================

function writeInstanceBatch(ref, transforms) {
  const mesh = ref.current;
  if (!mesh) return;
  const object = new THREE.Object3D();
  const color = new THREE.Color();
  transforms.forEach((item, index) => {
    object.position.set(...item.position);
    object.rotation.set(...(item.rotation || [0, 0, 0]));
    object.scale.set(...item.scale);
    object.updateMatrix();
    mesh.setMatrixAt(index, object.matrix);
    if (item.color) mesh.setColorAt(index, color.set(item.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function rotatedWorldPosition(base, angle, local) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    base[0] + local[0] * c + local[2] * s,
    base[1] + local[1],
    base[2] - local[0] * s + local[2] * c,
  ];
}

function EnvironmentTreeField() {
  const bedRef = useRef(null);
  const trunkRef = useRef(null);
  const crownRef = useRef(null);
  const leftCrownRef = useRef(null);
  const rightCrownRef = useRef(null);

  useEffect(() => {
    const variants = [
      { dark: "#244c35", mid: "#356b43", light: "#4b8050" },
      { dark: "#294b38", mid: "#3d704d", light: "#5a8a5b" },
      { dark: "#36523a", mid: "#52774b", light: "#70945a" },
    ];
    const trees = TREE_LAYOUT.map((position, index) => ({
      position,
      scale: 0.82 + ((index * 7) % 5) * 0.085,
      colors: variants[index % variants.length],
    }));
    writeInstanceBatch(bedRef, trees.map((tree) => ({
      position: [tree.position[0], 0.11 * tree.scale, tree.position[2]],
      rotation: [0, 0, 0], scale: [tree.scale, tree.scale, tree.scale],
    })));
    writeInstanceBatch(trunkRef, trees.map((tree) => ({
      position: [tree.position[0], 0.98 * tree.scale, tree.position[2]],
      rotation: [0, 0, 0], scale: [tree.scale, tree.scale, tree.scale],
    })));
    writeInstanceBatch(crownRef, trees.map((tree) => ({
      position: [tree.position[0], 2.12 * tree.scale, tree.position[2]],
      rotation: [0, 0, 0], scale: [0.79 * tree.scale, 0.79 * tree.scale, 0.79 * tree.scale],
      color: tree.colors.dark,
    })));
    writeInstanceBatch(leftCrownRef, trees.map((tree) => ({
      position: [tree.position[0] - 0.39 * tree.scale, 2.18 * tree.scale, tree.position[2] + 0.10 * tree.scale],
      rotation: [0, 0, 0], scale: [0.56 * tree.scale, 0.56 * tree.scale, 0.56 * tree.scale],
      color: tree.colors.mid,
    })));
    writeInstanceBatch(rightCrownRef, trees.map((tree) => ({
      position: [tree.position[0] + 0.36 * tree.scale, 2.30 * tree.scale, tree.position[2] - 0.08 * tree.scale],
      rotation: [0, 0, 0], scale: [0.53 * tree.scale, 0.53 * tree.scale, 0.53 * tree.scale],
      color: tree.colors.light,
    })));
  }, []);

  return (
    <>
      <instancedMesh ref={bedRef} args={[null, null, TREE_LAYOUT.length]}>
        <cylinderGeometry args={[0.72, 0.78, 0.20, 12]} />
        <meshStandardMaterial color="#555b55" roughness={0.94} />
      </instancedMesh>
      <instancedMesh ref={trunkRef} args={[null, null, TREE_LAYOUT.length]}>
        <cylinderGeometry args={[0.105, 0.19, 1.78, 8]} />
        <meshStandardMaterial color="#594333" roughness={0.96} />
      </instancedMesh>
      <instancedMesh ref={crownRef} args={[null, null, TREE_LAYOUT.length]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={leftCrownRef} args={[null, null, TREE_LAYOUT.length]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={rightCrownRef} args={[null, null, TREE_LAYOUT.length]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
    </>
  );
}

function EnvironmentBuildingField({ windowEmissive }) {
  const plinthRef = useRef(null);
  const bodyRef = useRef(null);
  const facadeRef = useRef(null);
  const frameRef = useRef(null);
  const glassRef = useRef(null);
  const trimRef = useRef(null);
  const entranceRef = useRef(null);
  const signRef = useRef(null);
  const roofRef = useRef(null);
  const parapetRef = useRef(null);
  const hvacRef = useRef(null);

  useEffect(() => {
    const palettes = [
      { body: "#56616a", panel: "#3f4a52", glass: "#86b5ca", roof: "#2f353a", trim: "#a7b1b5" },
      { body: "#6b625b", panel: "#514a45", glass: "#ffd18a", roof: "#35312e", trim: "#c3aa91" },
      { body: "#4f6060", panel: "#394848", glass: "#83bdb9", roof: "#293333", trim: "#8ba9a2" },
      { body: "#665f70", panel: "#4b4653", glass: "#aebcda", roof: "#302d38", trim: "#aca4bf" },
      { body: "#716c61", panel: "#4d4d47", glass: "#9fc4d0", roof: "#393b3a", trim: "#c4bda9" },
    ];
    const transforms = (building, localPosition, scale, color) => ({
      position: rotatedWorldPosition(building.position, building.rotation || 0, localPosition),
      rotation: [0, building.rotation || 0, 0],
      scale,
      color,
    });

    const plinths = [];
    const bodies = [];
    const facades = [];
    const frames = [];
    const glass = [];
    const trims = [];
    const entrances = [];
    const signs = [];
    const roofs = [];
    const parapets = [];
    const hvac = [];

    BUILDING_LAYOUT.forEach((building) => {
      const palette = palettes[Math.abs(Number(building.variant) || 0) % palettes.length];
      const [x, , z] = building.position;
      const { width, depth, height } = building;
      const facadeZ = depth * 0.505;
      const rows = Math.min(Math.max(2, Math.round(height / 1.55)), 5);

      plinths.push(transforms(building, [0, 0.18, 0], [width * 1.07, 0.36, depth * 1.07]));
      bodies.push(transforms(building, [0, 0.36 + height / 2, 0], [width, height, depth], palette.body));
      facades.push(transforms(building, [0, 0.36 + height * 0.53, facadeZ], [width * 0.92, height * 0.84, 0.045], palette.panel));

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const wx = (col - 1) * width * 0.29;
          const wy = 0.36 + height * (0.25 + (row / Math.max(rows - 1, 1)) * 0.56);
          const frameW = width * 0.19;
          const frameH = height * 0.105;
          frames.push(transforms(building, [wx, wy, facadeZ + 0.035], [frameW, frameH, 0.055]));
          glass.push(transforms(building, [wx, wy, facadeZ + 0.067], [frameW * 0.78, frameH * 0.72, 0.018], palette.glass));
        }
      }

      trims.push(
        transforms(building, [-width * 0.455, 0.36 + height * 0.53, facadeZ + 0.05], [0.10, height * 0.87, 0.10], palette.trim),
        transforms(building, [width * 0.455, 0.36 + height * 0.53, facadeZ + 0.05], [0.10, height * 0.87, 0.10], palette.trim),
      );
      entrances.push(transforms(building, [0, 0.36 + 0.90, facadeZ + 0.06], [width * 0.44, 1.12, 0.09]));
      signs.push(transforms(building, [0, 0.36 + 1.32, facadeZ + 0.115], [width * 0.50, 0.12, 0.035], palette.trim));
      roofs.push(transforms(building, [0, 0.36 + height + 0.07, 0], [width * 1.06, 0.16, depth * 1.06], palette.roof));
      parapets.push(transforms(building, [0, 0.36 + height + 0.20, depth * 0.49], [width * 1.02, 0.18, 0.12], palette.trim));
      hvac.push(
        transforms(building, [-width * 0.22, 0.36 + height + 0.34, -depth * 0.12], [width * 0.20, 0.42, depth * 0.20]),
        transforms(building, [width * 0.23, 0.36 + height + 0.29, -depth * 0.12], [width * 0.16, 0.30, depth * 0.16]),
      );
    });

    writeInstanceBatch(plinthRef, plinths);
    writeInstanceBatch(bodyRef, bodies);
    writeInstanceBatch(facadeRef, facades);
    writeInstanceBatch(frameRef, frames);
    writeInstanceBatch(glassRef, glass);
    writeInstanceBatch(trimRef, trims);
    writeInstanceBatch(entranceRef, entrances);
    writeInstanceBatch(signRef, signs);
    writeInstanceBatch(roofRef, roofs);
    writeInstanceBatch(parapetRef, parapets);
    writeInstanceBatch(hvacRef, hvac);
  }, []);

  const windowCount = BUILDING_LAYOUT.reduce((total, building) => {
    const rows = Math.min(Math.max(2, Math.round(building.height / 1.55)), 5);
    return total + rows * 3;
  }, 0);

  return (
    <>
      <instancedMesh ref={plinthRef} args={[null, null, BUILDING_LAYOUT.length]}>
        <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#777d7c" roughness={0.88} />
      </instancedMesh>
      <instancedMesh ref={bodyRef} args={[null, null, BUILDING_LAYOUT.length]}>
        <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial roughness={0.78} metalness={0.08} />
      </instancedMesh>
      <instancedMesh ref={facadeRef} args={[null, null, BUILDING_LAYOUT.length]}>
        <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial roughness={0.82} />
      </instancedMesh>
      <instancedMesh ref={frameRef} args={[null, null, windowCount]}>
        <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#202a30" roughness={0.4} metalness={0.35} />
      </instancedMesh>
      <instancedMesh ref={glassRef} args={[null, null, windowCount]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial emissive="#ffffff" emissiveIntensity={windowEmissive} roughness={0.16} metalness={0.32} />
      </instancedMesh>
      <instancedMesh ref={trimRef} args={[null, null, BUILDING_LAYOUT.length * 2]}>
        <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial roughness={0.62} metalness={0.18} />
      </instancedMesh>
      <instancedMesh ref={entranceRef} args={[null, null, BUILDING_LAYOUT.length]}>
        <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#17252b" roughness={0.24} metalness={0.28} />
      </instancedMesh>
      <instancedMesh ref={signRef} args={[null, null, BUILDING_LAYOUT.length]}>
        <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial roughness={0.65} />
      </instancedMesh>
      <instancedMesh ref={roofRef} args={[null, null, BUILDING_LAYOUT.length]}>
        <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial roughness={0.86} />
      </instancedMesh>
      <instancedMesh ref={parapetRef} args={[null, null, BUILDING_LAYOUT.length]}>
        <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial roughness={0.78} />
      </instancedMesh>
      <instancedMesh ref={hvacRef} args={[null, null, BUILDING_LAYOUT.length * 2]}>
        <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#858b8d" roughness={0.82} metalness={0.15} />
      </instancedMesh>
    </>
  );
}

function StreetLampField({ lampIntensity }) {
  const baseRef = useRef(null);
  const poleRef = useRef(null);
  const collarRef = useRef(null);
  const armRef = useRef(null);
  const housingRef = useRef(null);
  const diffuserRef = useRef(null);
  const capRef = useRef(null);

  useEffect(() => {
    const part = (lamp, localPosition, scale, localRotation = [0, 0, 0]) => ({
      position: rotatedWorldPosition(lamp.position, lamp.rotation || 0, localPosition.map((v) => v * lamp.scale)),
      rotation: [localRotation[0], (lamp.rotation || 0) + localRotation[1], localRotation[2]],
      scale: scale.map((v) => v * lamp.scale),
    });
    writeInstanceBatch(baseRef, LAMP_LAYOUT.map((lamp) => part(lamp, [0, 0.12, 0], [1, 1, 1])));
    writeInstanceBatch(poleRef, LAMP_LAYOUT.map((lamp) => part(lamp, [0, 1.48, 0], [1, 1, 1])));
    writeInstanceBatch(collarRef, LAMP_LAYOUT.map((lamp) => part(lamp, [0, 2.72, 0], [1, 1, 1])));
    writeInstanceBatch(armRef, LAMP_LAYOUT.map((lamp) => part(lamp, [0.26, 2.82, 0], [1, 1, 1], [0, 0, -Math.PI / 2 + 0.18])));
    writeInstanceBatch(housingRef, LAMP_LAYOUT.map((lamp) => part(lamp, [0.57, 2.70, 0], [1, 1, 1], [0, 0, -0.04])));
    writeInstanceBatch(diffuserRef, LAMP_LAYOUT.map((lamp) => part(lamp, [0.57, 2.615, 0], [1, 1, 1])));
    writeInstanceBatch(capRef, LAMP_LAYOUT.map((lamp) => part(lamp, [0.57, 2.79, 0], [1, 1, 1])));
  }, []);

  return (
    <>
      <instancedMesh ref={baseRef} args={[null, null, LAMP_LAYOUT.length]}>
        <cylinderGeometry args={[0.19, 0.23, 0.24, 10]} /><meshStandardMaterial color="#454d54" roughness={0.72} metalness={0.58} />
      </instancedMesh>
      <instancedMesh ref={poleRef} args={[null, null, LAMP_LAYOUT.length]}>
        <cylinderGeometry args={[0.038, 0.073, 2.75, 9]} /><meshStandardMaterial color="#30383f" roughness={0.58} metalness={0.72} />
      </instancedMesh>
      <instancedMesh ref={collarRef} args={[null, null, LAMP_LAYOUT.length]}>
        <cylinderGeometry args={[0.078, 0.052, 0.15, 9]} /><meshStandardMaterial color="#66717a" roughness={0.5} metalness={0.72} />
      </instancedMesh>
      <instancedMesh ref={armRef} args={[null, null, LAMP_LAYOUT.length]}>
        <cylinderGeometry args={[0.035, 0.045, 0.58, 8]} /><meshStandardMaterial color="#30383f" roughness={0.52} metalness={0.72} />
      </instancedMesh>
      <instancedMesh ref={housingRef} args={[null, null, LAMP_LAYOUT.length]}>
        <boxGeometry args={[0.64, 0.14, 0.28]} /><meshStandardMaterial color="#252d34" roughness={0.42} metalness={0.58} />
      </instancedMesh>
      <instancedMesh ref={diffuserRef} args={[null, null, LAMP_LAYOUT.length]}>
        <boxGeometry args={[0.48, 0.025, 0.19]} />
        <meshStandardMaterial color="#fff0c2" emissive="#ffd98a" emissiveIntensity={lampIntensity} roughness={0.32} />
      </instancedMesh>
      <instancedMesh ref={capRef} args={[null, null, LAMP_LAYOUT.length]}>
        <boxGeometry args={[0.52, 0.035, 0.22]} /><meshStandardMaterial color="#66717a" roughness={0.48} metalness={0.62} />
      </instancedMesh>
    </>
  );
}

const TREE_LAYOUT = [
  // Along the main east-west corridors
  [-34, 0, 17], [-25, 0, 17], [-14, 0, 17], [15, 0, 17], [29, 0, 17], [52, 0, 17], [67, 0, 17], [80, 0, 17],
  [-34, 0, -17], [-24, 0, -17], [-13, 0, -17], [15, 0, -17], [30, 0, -17], [53, 0, -17], [68, 0, -17], [80, 0, -17],
  // Small landscaped groups around the outer north/south approaches
  [-7, 0, -62], [-7, 0, -39], [47, 0, -62], [47, 0, -39],
  [-7, 0, 39], [-7, 0, 62], [47, 0, 39], [47, 0, 62],
];

const BUILDING_LAYOUT = [
  { position: [-35, 0, 28], width: 5.8, depth: 4.8, height: 6.8, variant: 0, rotation: Math.PI },
  { position: [-26, 0, 29], width: 4.4, depth: 4.2, height: 4.8, variant: 1, rotation: Math.PI },
  { position: [22, 0, 29], width: 5.4, depth: 4.7, height: 6.0, variant: 2, rotation: Math.PI },
  { position: [31, 0, 28], width: 4.6, depth: 4.3, height: 5.0, variant: 3, rotation: Math.PI },
  { position: [-35, 0, -28], width: 5.0, depth: 4.4, height: 5.8, variant: 2, rotation: 0 },
  { position: [30, 0, -28], width: 5.5, depth: 4.6, height: 6.3, variant: 1, rotation: 0 },
  { position: [-44, 0, 31], width: 4.8, depth: 4.2, height: 4.6, variant: 4, rotation: Math.PI },
  { position: [-15, 0, 32], width: 5.0, depth: 4.7, height: 5.8, variant: 3, rotation: Math.PI },
  { position: [11, 0, 32], width: 5.1, depth: 4.8, height: 7.4, variant: 0, rotation: Math.PI },
  { position: [53, 0, 32], width: 5.8, depth: 4.5, height: 6.4, variant: 2, rotation: Math.PI },
  { position: [69, 0, 31], width: 5.0, depth: 4.4, height: 5.2, variant: 1, rotation: Math.PI },
  { position: [-16, 0, -32], width: 5.2, depth: 4.7, height: 6.6, variant: 4, rotation: 0 },
  { position: [11, 0, -32], width: 5.0, depth: 4.4, height: 5.4, variant: 1, rotation: 0 },
  { position: [54, 0, -32], width: 5.3, depth: 4.7, height: 7.2, variant: 3, rotation: 0 },
  // Buildings beside the north/south approaches, facing the street
  { position: [-8, 0, -48], width: 5.5, depth: 5.0, height: 6.0, variant: 2, rotation: Math.PI / 2 },
  { position: [48, 0, -48], width: 5.4, depth: 5.0, height: 5.0, variant: 0, rotation: -Math.PI / 2 },
  { position: [-8, 0, 48], width: 5.5, depth: 5.0, height: 5.8, variant: 3, rotation: Math.PI / 2 },
  { position: [48, 0, 48], width: 5.6, depth: 5.0, height: 6.8, variant: 4, rotation: -Math.PI / 2 },
];

const LAMP_LAYOUT = [
  // Existing central fixtures plus additional fixtures along both road axes
  { position: [-24, 0, 8], rotation: 0.15, scale: 0.95 },
  { position: [8, 0, 8], rotation: Math.PI, scale: 0.95 },
  { position: [-24, 0, -8], rotation: -0.15, scale: 0.9 },
  { position: [8, 0, -8], rotation: Math.PI + 0.15, scale: 0.9 },
  ...[-42, -18, 22, 62, 84].flatMap((x) => [
    { position: [x, 0, 23.3], rotation: Math.PI / 2, scale: 0.92 },
    { position: [x, 0, -23.3], rotation: -Math.PI / 2, scale: 0.92 },
  ]),
  ...[-58, -38, 38, 58].flatMap((z) => [
    { position: [-3.0, 0, z], rotation: 0, scale: 0.9 },
    { position: [43.0, 0, z], rotation: Math.PI, scale: 0.9 },
  ]),
];

function SceneEnvironment({ windowEmissive, lampIntensity = 1.4 }) {
  return (
    <>
      <EnvironmentTreeField />
      <EnvironmentBuildingField windowEmissive={windowEmissive} />
      <StreetLampField lampIntensity={lampIntensity} />
    </>
  );
}

function Ground({ color }) {
  return (
    <mesh position={[10, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[240, 240]} />
      <meshStandardMaterial color={color} roughness={0.98} />
    </mesh>
  );
}

function IntersectionLoadRing({ id, position, marl }) {
  const point = originalToThree(position[0], position[1], 0);
  const agent = (marl || []).find((item) => item?.id === id) || {};
  const queue = Math.max(0, Number(agent.queue || 0));
  const intensity = Math.min(queue / 35, 1);
  const radius = 1.55 + intensity * 0.55;
  const opacity = 0.14 + intensity * 0.28;
  const color =
    intensity > 0.72 ? "#ff5b5b" : intensity > 0.38 ? "#ffc857" : "#47e6a1";

  return (
    <mesh position={[point[0], 0.064, point[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius, radius + 0.065, 48]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

// ============================================================
// TRAFFIC SCENE
// ============================================================

const StaticInfrastructure = React.memo(function StaticInfrastructure({ theme }) {
  return (
    <>
      <ambientLight intensity={theme.ambient} />

      <directionalLight
        castShadow
        position={[25, 50, 30]}
        intensity={theme.dirIntensity}
        color={theme.dirColor}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-65}
        shadow-camera-right={65}
        shadow-camera-top={65}
        shadow-camera-bottom={-65}
      />

      <hemisphereLight
        intensity={theme.hemiIntensity}
        groundColor={theme.groundColor}
        skyColor={theme.skyColor}
      />

      <Ground color={theme.groundColor} />
      <SceneEnvironment windowEmissive={theme.windowEmissive} lampIntensity={theme.lampIntensity} />


      {ROAD_SEGMENTS.map((road) => (
        <Road key={road.name} from={road.from} to={road.to} />
      ))}

    </>
  );
});

function TrafficScene({
  data,
  liveDataRef,
  theme,
  selectedVehicleId,
  onSelectVehicle,
}) {
  const allVehicles = data?.vehicles || [];
  const vehiclePoolRef = useRef(new Map());
  const vehicleRegistryRef = useRef(new Map());
  const simulationSpeedRef = useRef(1);
  const lastLivePacketRef = useRef(null);
  const currentVehiclesById = new Map();

  useFrame(() => {
    const packet = liveDataRef?.current;
    if (!packet || packet === lastLivePacketRef.current) return;
    lastLivePacketRef.current = packet;
    simulationSpeedRef.current = THREE.MathUtils.clamp(
      Number(packet.speedMultiplier || 1),
      0.25,
      4
    );
    const latestVehicles = packet.vehicles || [];
    for (const liveVehicle of latestVehicles) {
      const id = String(liveVehicle?.id ?? "");
      if (id && vehiclePoolRef.current.has(id)) {
        vehicleRegistryRef.current.set(id, liveVehicle);
      }
    }
  });

  allVehicles.forEach((vehicle) => {
    if (vehicle?.id != null) {
      currentVehiclesById.set(String(vehicle.id), vehicle);
      vehicleRegistryRef.current.set(String(vehicle.id), vehicle);
    }
  });

  vehicleRegistryRef.current.forEach((_, id) => {
    if (!currentVehiclesById.has(id)) vehicleRegistryRef.current.delete(id);
  });

  vehiclePoolRef.current.forEach((_, id) => {
    if (!currentVehiclesById.has(id)) {
      vehiclePoolRef.current.delete(id);
    }
  });

  if (vehiclePoolRef.current.size < MAX_RENDER_VEHICLES) {
    for (const vehicle of allVehicles) {
      const id = String(vehicle?.id ?? "");
      if (!id || vehiclePoolRef.current.has(id)) continue;
      vehiclePoolRef.current.set(id, vehicle);
      if (vehiclePoolRef.current.size >= MAX_RENDER_VEHICLES) break;
    }
  }

  allVehicles.forEach((vehicle) => {
    const id = String(vehicle?.id ?? "");
    if (vehiclePoolRef.current.has(id)) {
      vehiclePoolRef.current.set(id, vehicle);
    }
  });

  const vehicles = Array.from(vehiclePoolRef.current.values());
  const trafficLights = data?.trafficLights || [];
  const marl = data?.marl || [];

  return (
    <>
      <StaticInfrastructure theme={theme} />

      {Object.entries(INTERSECTIONS).map(([id, position]) => (
        <React.Fragment key={id}>
          <Intersection id={id} position={position} />
          <IntersectionLights id={id} trafficLights={trafficLights} />
          <IntersectionLoadRing id={id} position={position} marl={marl} />
        </React.Fragment>
      ))}

      <group>
        {vehicles.map((vehicle) => (
          <Vehicle
            key={vehicle.id}
            vehicleId={String(vehicle.id)}
            vehicleRegistryRef={vehicleRegistryRef}
            simulationSpeedRef={simulationSpeedRef}
            isSelected={selectedVehicleId === vehicle.id}
            onSelect={onSelectVehicle}
          />
        ))}
      </group>
    </>
  );
}

// ============================================================
// UI COMPONENTS
// ============================================================

function KpiCard({ label, value, suffix = "" }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {suffix && <span className="kpi-suffix">{suffix}</span>}
      </div>
    </div>
  );
}

function AgentCard({ agent }) {
  if (!agent) {
    return (
      <div className="agent-card">
        <div className="agent-name">--</div>
      </div>
    );
  }

  const action = String(agent.action || "HOLD").toUpperCase();
  const elapsed = Number(agent.phaseElapsed || 0);
  const duration = Math.max(1, Number(agent.phaseDuration || 42));
  const progressPct = Math.min(100, Math.round((elapsed / duration) * 100));
  const minGreenPct = Math.min(100, Math.round((10 / duration) * 100));

  return (
    <div className="agent-card">
      <div className="agent-top">
        <div className="agent-name">
          {agent.id} <span className="phase-badge">P{agent.phase ?? 0}</span>
        </div>
        <div
          className={
            action === "SWITCH"
              ? "action-switch"
              : action === "FIXED"
                ? "action-fixed"
                : "action-hold"
          }
        >
          {action}
        </div>
      </div>

      {/* Phase Green Timer Bar */}
      <div className="phase-progress-wrap">
        <div className="phase-progress-bar" style={{ width: `${progressPct}%` }} />
        <div
          className="min-green-marker"
          style={{ left: `${minGreenPct}%` }}
          title="10s Minimum Green Threshold"
        />
      </div>

      <div className="agent-stats">
        <div>
          <span>QUEUE</span>
          <strong>{Math.round(Number(agent.queue || 0))}</strong>
        </div>
        <div>
          <span>WAITING</span>
          <strong>{Math.round(Number(agent.waiting || 0))}s</strong>
        </div>
        <div>
          <span>REWARD</span>
          <strong style={{ color: Number(agent.reward) < -15 ? "#ff6b6b" : "#58d68d" }}>
            {Number(agent.reward || 0).toFixed(1)}
          </strong>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD & INTERACTIVE HUD
// ============================================================

function Dashboard({
  data,
  connected,
  sendCommand,
  themeKey,
  setThemeKey,
  selectedVehicle,
  setSelectedVehicleId,
  onOpenAnalytics,
  cameraPreset,
  setCameraPreset,
}) {
  const allVehicles = data?.vehicles || [];
  const marl = data?.marl || [];
  const paused = Boolean(data?.paused);
  const speedMultiplier = Number(data?.speedMultiplier || 1);
  const controlMode = String(data?.controlMode || "MARL");
  const arrivedTotal = Number(data?.arrivedTotal || 0);
  const averageSpeed = Number(data?.averageSpeed || 0);

  const agents = {};
  marl.forEach((item) => {
    agents[item.id] = item;
  });

  const totalQueue = marl.reduce((total, item) => total + Number(item.queue || 0), 0);
  const totalWaiting = marl.reduce((total, item) => total + Number(item.waiting || 0), 0);

  return (
    <div className="dashboard">
      {/* HEADER */}
      <div className="header">
        <div className="header-title-block">
          <div className="header-eyebrow">TRAFFIC INTELLIGENCE • INTERACTIVE 3D DIGITAL TWIN</div>
          <h1>MARL Traffic Optimization</h1>
          <p>
            Multi-Agent Reinforcement Learning <span> • </span> SUMO Microscopic Simulation
          </p>
        </div>

        {/* PLAYBACK & MODE CONTROLS */}
        <div className="control-toolbar">
          <button
            className={`toolbar-btn ${paused ? "warn" : ""}`}
            onClick={() => sendCommand({ cmd: "toggle_pause" })}
          >
            {paused ? "▶ RESUME" : "⏸ PAUSE"}
          </button>

          <div className="speed-group">
            {[0.5, 1, 2, 4].map((spd) => (
              <button
                key={spd}
                className={`speed-btn ${speedMultiplier === spd ? "active" : ""}`}
                onClick={() => sendCommand({ cmd: "set_speed", value: spd })}
              >
                {spd}x
              </button>
            ))}
          </div>

          <button
            className={`toolbar-btn mode-toggle ${controlMode === "MARL" ? "marl-active" : "fixed-active"}`}
            onClick={() =>
              sendCommand({
                cmd: "set_mode",
                value: controlMode === "MARL" ? "FIXED" : "MARL",
              })
            }
          >
            MODE: {controlMode}
          </button>

          <button
            className="toolbar-btn surge-btn"
            onClick={() => sendCommand({ cmd: "surge", target: "ALL" })}
            title="Spawn 12 extra vehicles immediately to test congestion recovery"
          >
            ⚡ RUSH HOUR SURGE
          </button>

          <button
            className="toolbar-btn"
            onClick={() => sendCommand({ cmd: "reset" })}
            title="Restart SUMO Episode"
          >
            ↺ RESET
          </button>
          <div className="camera-picker" aria-label="Camera viewpoint">
            <span>VIEW</span>
            <select
              value={cameraPreset}
              onChange={(event) => setCameraPreset(event.target.value)}
              aria-label="Choose camera viewpoint"
              title="Switch between overview and individual intersections"
            >
              {Object.entries(CAMERA_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>{preset.label}</option>
              ))}
            </select>
          </div>
          <div className="theme-picker" aria-label="Lighting theme">
            {Object.entries(THEMES).map(([key]) => (
              <button key={key} className={`theme-chip ${themeKey === key ? "active" : ""}`} onClick={() => setThemeKey(key)}>{key}</button>
            ))}
          </div>
          <button className="toolbar-btn analytics-nav-btn" onClick={onOpenAnalytics}>▥ ANALYTICS</button>
        </div>

        <div className={connected ? "live-indicator" : "offline-indicator"}>
          <span className="live-dot" />
          {connected ? (paused ? "PAUSED" : "LIVE") : "OFFLINE"}
        </div>
      </div>

      {/* KPI ROW */}
      <div className="kpi-row">
        <KpiCard
          label="SIMULATION TIME"
          value={Number(data?.simulationTime || 0).toFixed(1)}
          suffix=" s"
        />
        <KpiCard label="ACTIVE VEHICLES" value={Number(data?.vehicleCount ?? allVehicles.length)} />
        <KpiCard label="AVG SPEED" value={(averageSpeed * 3.6).toFixed(1)} suffix=" km/h" />
        <KpiCard label="THROUGHPUT" value={arrivedTotal} suffix=" arrived" />
        <KpiCard label="TOTAL QUEUE" value={Math.round(totalQueue)} />
        <KpiCard label="WAITING TIME" value={Math.round(totalWaiting)} suffix=" s" />
      </div>

      {/* VEHICLE INSPECTOR POPUP (WHEN A VEHICLE IS CLICKED) */}
      {selectedVehicle && (
        <div className="vehicle-inspector">
          <div className="inspector-header">
            <div>
              <span className="inspector-eyebrow">VEHICLE TELEMETRY</span>
              <h4>{selectedVehicle.id}</h4>
            </div>
            <button
              className="inspector-close"
              onClick={() => setSelectedVehicleId(null)}
            >
              ✕
            </button>
          </div>
          <div className="inspector-grid">
            <div>
              <span>CLASS</span>
              <strong>{String(selectedVehicle.type || "car").toUpperCase()}</strong>
            </div>
            <div>
              <span>SPEED</span>
              <strong>{(Number(selectedVehicle.speed || 0) * 3.6).toFixed(1)} km/h</strong>
            </div>
            <div>
              <span>ACCEL</span>
              <strong>{Number(selectedVehicle.accel || 0).toFixed(2)} m/s²</strong>
            </div>
            <div>
              <span>WAITING</span>
              <strong>{Number(selectedVehicle.waiting || 0).toFixed(1)} s</strong>
            </div>
            <div>
              <span>LANE</span>
              <strong>{selectedVehicle.lane || "--"}</strong>
            </div>
            <div>
              <span>STATUS</span>
              <strong style={{ color: selectedVehicle.braking ? "#ff6b6b" : "#58d68d" }}>
                {selectedVehicle.braking ? "BRAKING" : "CRUISING"}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* MARL AGENTS PANEL */}
      <div className="agents-panel">
        <div className="agents-header">
          <span>MARL INTERSECTION AGENTS</span>
          <strong>{controlMode === "MARL" ? "INDEPENDENT DQN" : "FIXED-TIME"}</strong>
        </div>

        <div className="agents-grid">
          <AgentCard agent={agents.I1} />
          <AgentCard agent={agents.I2} />
          <AgentCard agent={agents.I3} />
          <AgentCard agent={agents.I4} />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================

function GlobalStyles() {
  return (
    <style>{`
      * {
        box-sizing: border-box;
      }

      html, body, #root {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        font-family: Inter, system-ui, -apple-system, sans-serif;
        background: #111416;
        color: white;
      }

      canvas {
        display: block;
        cursor: grab;
      }
      canvas:active {
        cursor: grabbing;
      }

      .dashboard {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 10;
      }

      .header {
        position: absolute;
        top: 18px;
        left: 22px;
        right: 22px;
        min-height: 82px;
        padding: 14px 22px;
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(13,18,23,.96), rgba(18,23,29,.90));
        border: 1px solid rgba(255, 255, 255, .09);
        box-shadow: 0 12px 35px rgba(0,0,0,.35);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        backdrop-filter: blur(12px);
        pointer-events: auto;
      }

      .header-eyebrow {
        margin-bottom: 4px;
        color: #58d68d;
        font-size: 8px;
        font-weight: 900;
        letter-spacing: .16em;
      }

      .header h1 {
        margin: 0;
        font-size: 22px;
        font-weight: 800;
      }

      .header p {
        margin: 4px 0 0;
        color: #8995a3;
        font-size: 12px;
      }

      .control-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .toolbar-btn {
        padding: 8px 12px;
        border-radius: 9px;
        border: 1px solid rgba(255,255,255,.1);
        background: rgba(255,255,255,.05);
        color: #e2e8f0;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .06em;
        cursor: pointer;
        transition: all .15s ease;
      }
      .toolbar-btn:hover {
        background: rgba(255,255,255,.12);
        border-color: rgba(255,255,255,.22);
      }
      .toolbar-btn.warn {
        color: #ffd000;
        border-color: rgba(255,208,0,.35);
        background: rgba(255,208,0,.12);
      }
      .toolbar-btn.marl-active {
        color: #00e8a0;
        border-color: rgba(0,232,160,.35);
        background: rgba(0,232,160,.12);
      }
      .toolbar-btn.fixed-active {
        color: #ff9f43;
        border-color: rgba(255,159,67,.35);
        background: rgba(255,159,67,.12);
      }
      .toolbar-btn.surge-btn {
        color: #a86cff;
        border-color: rgba(168,108,255,.35);
        background: rgba(168,108,255,.12);
      }

      .speed-group {
        display: flex;
        background: rgba(0,0,0,.35);
        padding: 3px;
        border-radius: 9px;
        border: 1px solid rgba(255,255,255,.07);
      }

      .speed-btn {
        padding: 5px 8px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: #8995a3;
        font-size: 10px;
        font-weight: 800;
        cursor: pointer;
      }
      .speed-btn.active {
        background: rgba(88,214,141,.2);
        color: #58d68d;
      }

      .live-indicator, .offline-indicator {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 8px 15px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 800;
      }
      .live-indicator {
        color: #00e889;
        background: rgba(0, 225, 135, .08);
        border: 1px solid rgba(0, 225, 135, .25);
      }
      .offline-indicator {
        color: #ff6262;
        background: rgba(255, 60, 60, .08);
      }
      .live-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
        box-shadow: 0 0 10px currentColor;
      }

      .kpi-row {
        position: absolute;
        top: 110px;
        left: 22px;
        display: flex;
        gap: 9px;
        flex-wrap: wrap;
      }

      .kpi-card {
        min-width: 132px;
        padding: 11px 14px;
        border-radius: 12px;
        background: rgba(10,15,19,.92);
        border: 1px solid rgba(255,255,255,.07);
        box-shadow: 0 8px 24px rgba(0,0,0,.18);
        backdrop-filter: blur(8px);
      }
      .kpi-label {
        font-size: 8px;
        letter-spacing: 1px;
        color: #6f7b88;
        font-weight: 700;
      }
      .kpi-value {
        margin-top: 6px;
        font-size: 18px;
        font-weight: 800;
      }
      .kpi-suffix {
        margin-left: 2px;
        font-size: 11px;
        color: #84909c;
      }

      .theme-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px;
      }
      .theme-btn {
        padding: 6px 4px;
        border-radius: 7px;
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(255,255,255,.04);
        color: #9aa5b1;
        font-size: 8px;
        font-weight: 800;
        cursor: pointer;
      }
      .theme-btn.active {
        color: #fff;
        background: rgba(168,108,255,.22);
        border-color: rgba(168,108,255,.5);
      }

      .vehicle-inspector {
        position: absolute;
        left: 22px;
        bottom: 68px;
        width: 270px;
        padding: 14px;
        border-radius: 16px;
        background: rgba(8, 13, 17, 0.95);
        border: 1px solid rgba(0, 232, 160, 0.35);
        box-shadow: 0 12px 35px rgba(0,0,0,.4);
        pointer-events: auto;
      }
      .inspector-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 10px;
      }
      .inspector-eyebrow {
        font-size: 8px;
        font-weight: 800;
        color: #00e8a0;
        letter-spacing: .12em;
      }
      .inspector-header h4 {
        margin: 3px 0 0;
        font-size: 15px;
      }
      .inspector-close {
        background: transparent;
        border: none;
        color: #8995a3;
        cursor: pointer;
        font-size: 14px;
      }
      .inspector-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }
      .inspector-grid div {
        padding: 6px 8px;
        border-radius: 8px;
        background: rgba(255,255,255,.035);
      }
      .inspector-grid span {
        display: block;
        font-size: 7px;
        color: #6f7b88;
      }
      .inspector-grid strong {
        font-size: 11px;
      }

      .agents-panel {
        position: absolute;
        right: 22px;
        bottom: 20px;
        width: 360px;
        padding: 14px;
        border-radius: 18px;
        background: rgba(8, 13, 17, .94);
        border: 1px solid rgba(255, 255, 255, .08);
        box-shadow: 0 12px 35px rgba(0, 0, 0, .36);
        pointer-events: auto;
      }
      .agents-header {
        display: flex;
        justify-content: space-between;
        margin: 0 3px 11px;
        font-size: 10px;
        letter-spacing: 1px;
        color: #768391;
      }
      .agents-header strong {
        color: #a86cff;
        font-size: 9px;
      }
      .agents-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }
      .agent-card {
        padding: 11px;
        border-radius: 11px;
        background: rgba(19, 25, 31, .92);
        border: 1px solid rgba(255, 255, 255, .06);
        transition: border-color .15s ease;
      }
      .agent-card.clickable {
        cursor: pointer;
      }
      .agent-card.clickable:hover {
        border-color: rgba(0, 232, 160, .35);
      }
      .agent-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .agent-name {
        font-size: 14px;
        font-weight: 800;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .phase-badge {
        font-size: 9px;
        padding: 2px 5px;
        border-radius: 4px;
        background: rgba(255,255,255,.07);
        color: #9aa5b1;
      }
      .action-switch, .action-hold, .action-fixed {
        font-size: 8px;
        font-weight: 900;
        padding: 4px 7px;
        border-radius: 5px;
      }
      .action-switch {
        color: #ffd000;
        background: rgba(255, 208, 0, .12);
      }
      .action-hold {
        color: #00e8a0;
        background: rgba(0, 232, 160, .12);
      }
      .action-fixed {
        color: #ff9f43;
        background: rgba(255, 159, 67, .12);
      }

      .phase-progress-wrap {
        position: relative;
        height: 4px;
        background: rgba(255,255,255,.08);
        border-radius: 99px;
        margin-top: 8px;
        overflow: hidden;
      }
      .phase-progress-bar {
        height: 100%;
        background: linear-gradient(90deg, #00e8a0, #58d68d);
        transition: width .2s linear;
      }
      .min-green-marker {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2px;
        background: #ffd000;
      }

      .agent-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 5px;
        margin-top: 10px;
      }
      .agent-stats div {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .agent-stats span {
        font-size: 7px;
        color: #697581;
      }
      .agent-stats strong {
        font-size: 12px;
      }

      .camera-picker {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 4px 7px 4px 9px;
        border: 1px solid rgba(95, 178, 255, .28);
        border-radius: 9px;
        background: rgba(45, 115, 175, .10);
      }
      .camera-picker span {
        color: #80b9e8;
        font-size: 8px;
        font-weight: 900;
        letter-spacing: .10em;
      }
      .camera-picker select {
        max-width: 132px;
        padding: 5px 21px 5px 7px;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 6px;
        outline: none;
        color: #eaf5ff;
        background: #17232d;
        font-size: 9px;
        font-weight: 850;
        cursor: pointer;
      }
      .camera-picker select:focus-visible {
        border-color: rgba(95, 178, 255, .75);
        box-shadow: 0 0 0 2px rgba(95, 178, 255, .16);
      }
      .camera-picker option {
        color: #eaf5ff;
        background: #17232d;
      }

      .theme-picker {
        display: flex;
        align-items: center;
        gap: 3px;
        padding: 3px;
        border: 1px solid rgba(255,255,255,.09);
        border-radius: 9px;
        background: rgba(0,0,0,.18);
      }
      .theme-chip {
        border: 0;
        border-radius: 6px;
        padding: 6px 7px;
        color: #8290a0;
        background: transparent;
        font-size: 8px;
        font-weight: 900;
        cursor: pointer;
      }
      .theme-chip.active {
        color: #eafff5;
        background: rgba(82,214,162,.16);
      }
      .analytics-nav-btn {
        color: #72e3b5;
        border-color: rgba(82,214,162,.3);
        background: rgba(82,214,162,.08);
      }

      .final-status-strip {
        position: absolute;
        left: 22px;
        bottom: 20px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        border-radius: 13px;
        background: rgba(13, 18, 23, 0.91);
        border: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 10px;
        letter-spacing: 0.08em;
        color: rgba(235, 240, 245, 0.70);
      }
      .final-status-item {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .final-status-item strong {
        color: rgba(255, 255, 255, 0.94);
      }
      .final-status-item + .final-status-item {
        padding-left: 10px;
        border-left: 1px solid rgba(255, 255, 255, 0.10);
      }
      .status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #58d68d;
        box-shadow: 0 0 10px rgba(88, 214, 141, 0.75);
      }
    `}</style>
  );
}

// ============================================================
// CAMERA PRESET ANIMATOR
// ============================================================

function CameraPresetAnimator({ presetKey, controlsRef }) {
  const { camera } = useThree();
  const animationRef = useRef(null);

  useEffect(() => {
    const preset = CAMERA_PRESETS[presetKey];
    if (!preset) return;

    const controls = controlsRef.current;
    const currentTarget = controls?.target?.clone
      ? controls.target.clone()
      : new THREE.Vector3(20, 0, 0);

    animationRef.current = {
      elapsed: 0,
      duration: 0.9,
      fromPosition: camera.position.clone(),
      toPosition: new THREE.Vector3(...preset.position),
      fromTarget: currentTarget,
      toTarget: new THREE.Vector3(...preset.target),
    };
  }, [presetKey, camera, controlsRef]);

  useFrame((_, delta) => {
    const animation = animationRef.current;
    if (!animation) return;

    animation.elapsed = Math.min(animation.duration, animation.elapsed + Math.min(delta, 0.05));
    const progress = animation.elapsed / animation.duration;
    const eased = progress * progress * (3 - 2 * progress);

    camera.position.lerpVectors(animation.fromPosition, animation.toPosition, eased);

    const controls = controlsRef.current;
    if (controls) {
      controls.target.lerpVectors(animation.fromTarget, animation.toTarget, eased);
      controls.update();
    } else {
      camera.lookAt(animation.toTarget);
    }

    if (progress >= 1) animationRef.current = null;
  });

  return null;
}

// ============================================================
// MAIN APP
// ============================================================

export default function App() {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [themeKey, setThemeKey] = useState("DAY");
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [activePage, setActivePage] = useState("simulation");
  const [cameraPreset, setCameraPreset] = useState("OVERVIEW");

  const controlsRef = useRef(null);
  const socketRef = useRef(null);
  const reconnectTimer = useRef(null);
  const pendingDataRef = useRef(null);
  const liveDataRef = useRef(null);

  const sendCommand = useCallback((payload) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const handleSelectVehicle = useCallback((id) => setSelectedVehicleId(id), []);

  useEffect(() => {
    let cancelled = false;
    const connect = () => {
      if (cancelled) return;
      try {
        const socket = new WebSocket(WS_URL);
        socketRef.current = socket;
        socket.onopen = () => setConnected(true);
        socket.onmessage = (event) => {
          try {
            const incoming = JSON.parse(event.data);
            // The WebSocket remains live at the backend's full telemetry rate,
            // while React publishes only the newest snapshot to the HUD at 10 Hz.
            // Vehicle transforms interpolate independently between these snapshots.
            liveDataRef.current = incoming;
            pendingDataRef.current = incoming;
          } catch (error) {
            console.error("Invalid WebSocket data:", error);
          }
        };
        socket.onclose = () => {
          setConnected(false);
          if (!cancelled) reconnectTimer.current = setTimeout(connect, 2000);
        };
        socket.onerror = () => setConnected(false);
      } catch (error) {
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 2000);
      }
    };
    connect();
    const uiTimer = setInterval(() => {
      if (pendingDataRef.current) {
        setData(pendingDataRef.current);
        pendingDataRef.current = null;
      }
    }, 100);
    return () => {
      cancelled = true;
      clearInterval(uiTimer);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, []);

  const theme = THEMES[themeKey] || THEMES.DAY;
  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleId || !data?.vehicles) return null;
    return data.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || null;
  }, [selectedVehicleId, data]);

  if (activePage === "analytics") {
    return (
      <>
        <GlobalStyles />
        <AnalyticsPage liveData={data} connected={connected} onBack={() => setActivePage("simulation")} />
      </>
    );
  }

  return (
    <>
      <GlobalStyles />
      <Canvas
        shadows
        camera={{ position: [20, 42, 62], fov: 40, near: 0.1, far: 500 }}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}
        dpr={[1, 1.25]}
      >
        <color attach="background" args={[theme.bg]} />
        <fog attach="fog" args={[theme.fogColor, 75, 185]} />
        <TrafficScene
          data={data}
          liveDataRef={liveDataRef}
          theme={theme}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={handleSelectVehicle}
        />
        <CameraPresetAnimator presetKey={cameraPreset} controlsRef={controlsRef} />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableRotate
          enablePan
          enableZoom
          enableDamping
          dampingFactor={0.07}
          rotateSpeed={0.8}
          panSpeed={1.05}
          zoomSpeed={1.15}
          minDistance={1.5}
          maxDistance={220}
          minPolarAngle={0.04}
          maxPolarAngle={Math.PI / 2 - 0.025}
          target={[20, 0, 0]}
          screenSpacePanning
          mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
          touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        />
      </Canvas>
      <Dashboard
        data={data}
        connected={connected}
        sendCommand={sendCommand}
        themeKey={themeKey}
        setThemeKey={setThemeKey}
        selectedVehicle={selectedVehicle}
        setSelectedVehicleId={setSelectedVehicleId}
        onOpenAnalytics={() => setActivePage("analytics")}
        cameraPreset={cameraPreset}
        setCameraPreset={setCameraPreset}
      />
      <div className="final-status-strip">
        <div className="final-status-item"><span className="status-dot" /><span>SUMO LIVE</span></div>
        <div className="final-status-item"><span>CONTROL</span><strong>{data?.controlMode || "INDEPENDENT DQN MARL"}</strong></div>
        <div className="final-status-item"><span>THEME</span><strong>{theme.label.toUpperCase()}</strong></div>
        <div className="final-status-item"><span>CAMERA</span><strong>{CAMERA_PRESETS[cameraPreset]?.label || "OVERVIEW"} • FREE ORBIT</strong></div>
      </div>
    </>
  );
}
