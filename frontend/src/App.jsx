// STEP 20 — Ultra-Realistic 3D Graphics, Camera Presets, Interactive Controls & Vehicle Inspector
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import * as THREE from "three";

import {
  Canvas,
  useFrame,
} from "@react-three/fiber";

import {
  OrbitControls,
} from "@react-three/drei";

// ============================================================
// CONFIGURATION
// ============================================================

const WS_URL = "ws://127.0.0.1:8000/ws/simulation";
const MAX_RENDER_VEHICLES = 140;

const INTERSECTIONS = {
  I1: [0, 250],
  I2: [500, 250],
  I3: [0, -250],
  I4: [500, -250],
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
// CAMERA PRESETS
// ============================================================

const CAMERA_PRESETS = {
  ORBIT: {
    label: "Overview Orbit",
    position: [20, 42, 62],
    target: [20, 0, 0],
  },
  TOP: {
    label: "Top-Down Map",
    position: [20, 95, 0.1],
    target: [20, 0, 0],
  },
  I1: {
    label: "Junction I1 (NW)",
    position: [-10, 14, -6],
    target: [0, 0, -20],
  },
  I2: {
    label: "Junction I2 (NE)",
    position: [50, 14, -6],
    target: [40, 0, -20],
  },
  I3: {
    label: "Junction I3 (SW)",
    position: [-10, 14, 34],
    target: [0, 0, 20],
  },
  I4: {
    label: "Junction I4 (SE)",
    position: [50, 14, 34],
    target: [40, 0, 20],
  },
};

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
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[length, roadWidth]} />
        <meshStandardMaterial color="#262a2e" roughness={0.88} metalness={0.08} />
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

function Intersection({ id, position, onSelectIntersection }) {
  const point = originalToThree(position[0], position[1], 0);

  return (
    <group
      position={[point[0], 0, point[2]]}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelectIntersection) onSelectIntersection(id);
      }}
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

      {/* Real-time Signal Glow Light */}
      <pointLight
        position={[0, activeY, 0.25]}
        color={activeColor}
        intensity={0.85}
        distance={4.5}
      />
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
      <mesh castShadow>
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

function Vehicle({ vehicle, isSelected, onSelect }) {
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
  const blinkerLeft = Boolean(vehicle?.blinkerLeft);
  const blinkerRight = Boolean(vehicle?.blinkerRight);

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

  targetRef.current.set(x, 0.2, z);
  targetAngleRef.current = angle;

  useEffect(() => {
    if (!groupRef.current) return;
    const laneChanged = lastLaneRef.current !== laneId;
    const angleDelta = Math.abs(((normalizedSumoAngle - lastAngleRef.current + 180) % 360) - 180);

    if (laneChanged && angleDelta > 70) {
      groupRef.current.position.set(x, 0.2, z);
    }

    targetAngleRef.current = angle;
    lastLaneRef.current = laneId;
    lastAngleRef.current = normalizedSumoAngle;
  }, [laneId, normalizedSumoAngle, angle, x, z]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const currentPosition = groupRef.current.position;
    const targetPosition = targetRef.current;
    const distance = currentPosition.distanceTo(targetPosition);

    if (!initializedRef.current) {
      currentPosition.copy(targetPosition);
      groupRef.current.rotation.y = targetAngleRef.current;
      initializedRef.current = true;
      return;
    }

    if (distance > 0.85) {
      currentPosition.copy(targetPosition);
    } else {
      const normalizedDistance = THREE.MathUtils.clamp(distance / 0.45, 0, 1);
      const movementSpeed = THREE.MathUtils.lerp(28, 42, normalizedDistance);
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
    );
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
      <mesh position={[0, bodyY, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height * 0.52, length * 0.94]} />
        <meshStandardMaterial color={color} roughness={0.26} metalness={0.32} />
      </mesh>

      {/* Car-Specific Body */}
      {!isBus && !isTruck && (
        <>
          <mesh position={[0, height * 0.24, length * 0.3]} castShadow>
            <boxGeometry args={[width * 0.9, height * 0.24, length * 0.25]} />
            <meshStandardMaterial color={color} roughness={0.25} metalness={0.32} />
          </mesh>
          <mesh position={[0, height * 0.42, -length * 0.02]} castShadow>
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
          <mesh position={[0, height * 0.27, -length * 0.02]} castShadow>
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
          <mesh position={[0, height * 0.32, length * 0.28]} castShadow>
            <boxGeometry args={[width * 0.94, height * 0.62, length * 0.34]} />
            <meshStandardMaterial color={color} roughness={0.3} metalness={0.25} />
          </mesh>
          <mesh position={[0, height * 0.42, -length * 0.16]} castShadow>
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
          color={braking ? "#ff3b3b" : "#801317"}
          emissive="#ff0000"
          emissiveIntensity={braking ? 4.8 : 0.7}
        />
      </mesh>
      <mesh position={[width * 0.29, height * 0.04, -length * 0.505]}>
        <boxGeometry args={[width * 0.22, height * 0.16, 0.024]} />
        <meshStandardMaterial
          color={braking ? "#ff3b3b" : "#801317"}
          emissive="#ff0000"
          emissiveIntensity={braking ? 4.8 : 0.7}
        />
      </mesh>

      {/* Turn Signal Blinkers */}
      {blinkerLeft && blinkOn && (
        <mesh position={[width * 0.42, height * 0.05, length * 0.49]}>
          <sphereGeometry args={[0.028, 8, 8]} />
          <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={4} />
        </mesh>
      )}
      {blinkerRight && blinkOn && (
        <mesh position={[-width * 0.42, height * 0.05, length * 0.49]}>
          <sphereGeometry args={[0.028, 8, 8]} />
          <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={4} />
        </mesh>
      )}
    </group>
  );
}

// ============================================================
// ENVIRONMENT & STREET LIGHTS
// ============================================================

function EnvironmentTree({ position, scale = 1 }) {
  return (
    <group position={position} scale={[scale, scale, scale]}>
      <mesh position={[0, 0.48, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 0.96, 7]} />
        <meshStandardMaterial color="#514337" roughness={0.92} />
      </mesh>
      <mesh position={[0, 1.12, 0]} castShadow>
        <sphereGeometry args={[0.62, 10, 8]} />
        <meshStandardMaterial color="#31523a" roughness={0.92} />
      </mesh>
      <mesh position={[0.3, 1.35, 0.08]} castShadow>
        <sphereGeometry args={[0.43, 9, 7]} />
        <meshStandardMaterial color="#3d6445" roughness={0.92} />
      </mesh>
    </group>
  );
}

function EnvironmentBuilding({ position, width, depth, height, variant = 0, windowEmissive = 0.05 }) {
  const palettes = [
    { body: "#56616a", panel: "#3f4a52", glass: "#86a9bd", roof: "#2f353a" },
    { body: "#6b625b", panel: "#514a45", glass: "#ffd180", roof: "#35312e" },
    { body: "#4f6060", panel: "#394848", glass: "#79a6a8", roof: "#293333" },
    { body: "#665f70", panel: "#4b4653", glass: "#9aa6c0", roof: "#302d38" },
  ];
  const palette = palettes[Math.abs(Number(variant) || 0) % palettes.length];
  const windowRows = Math.min(Math.max(2, Math.round(height / 1.55)), 5);
  const windowCols = 3;

  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={palette.body} roughness={0.76} />
      </mesh>
      <mesh position={[0, height * 0.53, depth * 0.506]}>
        <boxGeometry args={[width * 0.88, height * 0.82, depth * 0.025]} />
        <meshStandardMaterial color={palette.panel} roughness={0.82} />
      </mesh>

      {Array.from({ length: windowRows }).flatMap((_, row) =>
        Array.from({ length: windowCols }).map((__, col) => {
          const x = ((col - 1) / 1) * width * 0.29;
          const y = height * (0.25 + (row / Math.max(windowRows - 1, 1)) * 0.58);
          return (
            <mesh key={`fw-${row}-${col}`} position={[x, y, depth * 0.52]}>
              <boxGeometry args={[width * 0.13, height * 0.075, 0.035]} />
              <meshStandardMaterial
                color={palette.glass}
                emissive={palette.glass}
                emissiveIntensity={windowEmissive}
              />
            </mesh>
          );
        })
      )}

      <mesh position={[0, height * 0.94, 0]}>
        <boxGeometry args={[width * 1.04, 0.1, depth * 1.04]} />
        <meshStandardMaterial color={palette.roof} roughness={0.82} />
      </mesh>
    </group>
  );
}

function StreetLamp({ position, rotation = 0, scale = 1, lampIntensity = 1.4 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={[scale, scale, scale]}>
      <mesh position={[0, 1.45, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.07, 2.9, 8]} />
        <meshStandardMaterial color="#30353a" roughness={0.72} metalness={0.55} />
      </mesh>
      <mesh position={[0.28, 2.82, 0]} rotation={[0, 0, -0.12]}>
        <boxGeometry args={[0.58, 0.07, 0.07]} />
        <meshStandardMaterial color="#30353a" roughness={0.68} metalness={0.55} />
      </mesh>
      <mesh position={[0.55, 2.78, 0]}>
        <sphereGeometry args={[0.105, 12, 8]} />
        <meshStandardMaterial
          color="#fff1c4"
          emissive="#fff1c4"
          emissiveIntensity={lampIntensity}
        />
      </mesh>
    </group>
  );
}

function SceneEnvironment({ windowEmissive }) {
  return (
    <>
      <EnvironmentTree position={[-34, 0, 17]} scale={1.05} />
      <EnvironmentTree position={[-25, 0, 17]} scale={0.82} />
      <EnvironmentTree position={[19, 0, 17]} scale={0.92} />
      <EnvironmentTree position={[30, 0, 16]} scale={1.12} />
      <EnvironmentTree position={[-34, 0, -17]} scale={0.9} />
      <EnvironmentTree position={[-23, 0, -17]} scale={1.08} />
      <EnvironmentTree position={[20, 0, -17]} scale={0.84} />
      <EnvironmentTree position={[31, 0, -17]} scale={1.0} />

      <EnvironmentBuilding position={[-35, 0, 26]} width={5.8} depth={4.8} height={6.8} variant={0} windowEmissive={windowEmissive} />
      <EnvironmentBuilding position={[-26, 0, 27]} width={4.4} depth={4.2} height={4.6} variant={1} windowEmissive={windowEmissive} />
      <EnvironmentBuilding position={[22, 0, 27]} width={5.4} depth={4.7} height={6.0} variant={2} windowEmissive={windowEmissive} />
      <EnvironmentBuilding position={[31, 0, 26]} width={4.6} depth={4.3} height={5.0} variant={3} windowEmissive={windowEmissive} />
      <EnvironmentBuilding position={[-35, 0, -26]} width={5.0} depth={4.4} height={5.8} variant={2} windowEmissive={windowEmissive} />
      <EnvironmentBuilding position={[30, 0, -26]} width={5.5} depth={4.6} height={6.3} variant={1} windowEmissive={windowEmissive} />
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
// CAMERA CONTROLLER (SMOOTH PRESETS & FOLLOW VEHICLE)
// ============================================================

function CameraController({ presetKey, selectedVehicle, followVehicle, controlsRef }) {
  const desiredPos = useRef(new THREE.Vector3(20, 42, 62));
  const desiredTarget = useRef(new THREE.Vector3(20, 0, 0));
  const isTransitioning = useRef(false);

  useEffect(() => {
    const preset = CAMERA_PRESETS[presetKey] || CAMERA_PRESETS.ORBIT;
    desiredPos.current.set(...preset.position);
    desiredTarget.current.set(...preset.target);
    isTransitioning.current = true;
  }, [presetKey]);

  useFrame((state, delta) => {
    if (!controlsRef.current) return;

    if (followVehicle && selectedVehicle) {
      const vx = Number(selectedVehicle.renderX ?? 0);
      const vz = Number(selectedVehicle.renderZ ?? 0);
      const targetVec = new THREE.Vector3(vx, 0.4, vz);
      controlsRef.current.target.lerp(targetVec, 1 - Math.exp(-8 * delta));
      controlsRef.current.update();
      return;
    }

    if (isTransitioning.current) {
      const step = 1 - Math.exp(-6 * delta);
      state.camera.position.lerp(desiredPos.current, step);
      controlsRef.current.target.lerp(desiredTarget.current, step);
      controlsRef.current.update();

      if (
        state.camera.position.distanceTo(desiredPos.current) < 0.15 &&
        controlsRef.current.target.distanceTo(desiredTarget.current) < 0.15
      ) {
        isTransitioning.current = false;
      }
    }
  });

  return null;
}

// ============================================================
// TRAFFIC SCENE
// ============================================================

function TrafficScene({
  data,
  theme,
  selectedVehicleId,
  onSelectVehicle,
  onSelectIntersection,
}) {
  const allVehicles = data?.vehicles || [];
  const vehiclePoolRef = useRef(new Map());
  const currentVehiclesById = new Map();

  allVehicles.forEach((vehicle) => {
    if (vehicle?.id != null) {
      currentVehiclesById.set(String(vehicle.id), vehicle);
    }
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
      <ambientLight intensity={theme.ambient} />

      <directionalLight
        castShadow
        position={[25, 50, 30]}
        intensity={theme.dirIntensity}
        color={theme.dirColor}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
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
      <SceneEnvironment windowEmissive={theme.windowEmissive} />

      <StreetLamp position={[-24, 0, 8]} rotation={0.15} scale={0.95} lampIntensity={theme.lampIntensity} />
      <StreetLamp position={[8, 0, 8]} rotation={Math.PI} scale={0.95} lampIntensity={theme.lampIntensity} />
      <StreetLamp position={[-24, 0, -8]} rotation={-0.15} scale={0.9} lampIntensity={theme.lampIntensity} />
      <StreetLamp position={[8, 0, -8]} rotation={Math.PI + 0.15} scale={0.9} lampIntensity={theme.lampIntensity} />

      {ROAD_SEGMENTS.map((road) => (
        <Road key={road.name} from={road.from} to={road.to} />
      ))}

      {Object.entries(INTERSECTIONS).map(([id, position]) => (
        <React.Fragment key={id}>
          <Intersection
            id={id}
            position={position}
            onSelectIntersection={onSelectIntersection}
          />
          <IntersectionLights id={id} trafficLights={trafficLights} />
          <IntersectionLoadRing id={id} position={position} marl={marl} />
        </React.Fragment>
      ))}

      <group>
        {vehicles.map((vehicle) => (
          <Vehicle
            key={vehicle.id}
            vehicle={vehicle}
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

function AgentCard({ agent, onFocus }) {
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
    <div
      className="agent-card clickable"
      onClick={() => onFocus && onFocus(agent.id)}
      title={`Click to focus camera on ${agent.id}`}
    >
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
  presetKey,
  setPresetKey,
  themeKey,
  setThemeKey,
  selectedVehicle,
  setSelectedVehicleId,
  followVehicle,
  setFollowVehicle,
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
        <KpiCard label="ACTIVE VEHICLES" value={allVehicles.length} />
        <KpiCard label="AVG SPEED" value={(averageSpeed * 3.6).toFixed(1)} suffix=" km/h" />
        <KpiCard label="THROUGHPUT" value={arrivedTotal} suffix=" arrived" />
        <KpiCard label="TOTAL QUEUE" value={Math.round(totalQueue)} />
        <KpiCard label="WAITING TIME" value={Math.round(totalWaiting)} suffix=" s" />
      </div>

      {/* CAMERA & LIGHTING PRESETS PANEL */}
      <div className="camera-controls-panel">
        <div className="camera-controls-title">CAMERA PRESETS</div>
        <div className="camera-controls-hint">Click a view or any junction</div>
        {Object.entries(CAMERA_PRESETS).map(([key, item]) => (
          <button
            key={key}
            className={`camera-btn ${presetKey === key ? "active" : ""}`}
            onClick={() => {
              setFollowVehicle(false);
              setPresetKey(key);
            }}
          >
            {item.label}
          </button>
        ))}

        <div className="camera-controls-title" style={{ marginTop: "12px" }}>
          LIGHTING THEME
        </div>
        <div className="theme-row">
          {Object.entries(THEMES).map(([k, t]) => (
            <button
              key={k}
              className={`theme-btn ${themeKey === k ? "active" : ""}`}
              onClick={() => setThemeKey(k)}
            >
              {k}
            </button>
          ))}
        </div>
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
              onClick={() => {
                setSelectedVehicleId(null);
                setFollowVehicle(false);
              }}
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
          <button
            className={`camera-btn ${followVehicle ? "active" : ""}`}
            style={{ marginTop: "10px" }}
            onClick={() => setFollowVehicle(!followVehicle)}
          >
            {followVehicle ? "● FOLLOWING VEHICLE" : "🎯 LOCK CAMERA ON VEHICLE"}
          </button>
        </div>
      )}

      {/* MARL AGENTS PANEL */}
      <div className="agents-panel">
        <div className="agents-header">
          <span>MARL INTERSECTION AGENTS</span>
          <strong>{controlMode === "MARL" ? "INDEPENDENT DQN" : "FIXED-TIME"}</strong>
        </div>

        <div className="agents-grid">
          <AgentCard agent={agents.I1} onFocus={(id) => setPresetKey(id)} />
          <AgentCard agent={agents.I2} onFocus={(id) => setPresetKey(id)} />
          <AgentCard agent={agents.I3} onFocus={(id) => setPresetKey(id)} />
          <AgentCard agent={agents.I4} onFocus={(id) => setPresetKey(id)} />
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

      .camera-controls-panel {
        position: absolute;
        top: 110px;
        right: 22px;
        width: 185px;
        padding: 12px;
        border-radius: 15px;
        background: rgba(8, 13, 17, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.09);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
        pointer-events: auto;
      }
      .camera-controls-title {
        margin: 1px 3px 6px;
        color: #7f8b97;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.12em;
      }
      .camera-controls-hint {
        margin: 2px 3px 7px;
        font-size: 8px;
        color: #687582;
      }
      .camera-btn {
        width: 100%;
        margin-top: 5px;
        padding: 7px 8px;
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.035);
        color: #aeb8c2;
        font-size: 9px;
        font-weight: 800;
        cursor: pointer;
        text-align: left;
      }
      .camera-btn:hover {
        background: rgba(255, 255, 255, 0.09);
        color: #ffffff;
      }
      .camera-btn.active {
        color: #ffffff;
        background: rgba(0, 232, 160, 0.16);
        border-color: rgba(0, 232, 160, 0.4);
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
// MAIN APP
// ============================================================

export default function App() {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [presetKey, setPresetKey] = useState("ORBIT");
  const [themeKey, setThemeKey] = useState("DAY");
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [followVehicle, setFollowVehicle] = useState(false);

  const socketRef = useRef(null);
  const reconnectTimer = useRef(null);
  const controlsRef = useRef(null);

  const sendCommand = (payload) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  };

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      try {
        const socket = new WebSocket(WS_URL);
        socketRef.current = socket;

        socket.onopen = () => {
          setConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const incoming = JSON.parse(event.data);
            setData(incoming);
          } catch (error) {
            console.error("Invalid WebSocket data:", error);
          }
        };

        socket.onclose = () => {
          setConnected(false);
          if (!cancelled) {
            reconnectTimer.current = setTimeout(connect, 2000);
          }
        };
      } catch (error) {
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 2000);
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, []);

  const theme = THEMES[themeKey] || THEMES.DAY;
  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleId || !data?.vehicles) return null;
    return data.vehicles.find((v) => v.id === selectedVehicleId) || null;
  }, [selectedVehicleId, data]);

  return (
    <>
      <GlobalStyles />

      <Canvas
        shadows
        camera={{
          position: [20, 42, 62],
          fov: 40,
          near: 0.1,
          far: 500,
        }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
        }}
        dpr={[1, 1.5]}
      >
        <color attach="background" args={[theme.bg]} />
        <fog attach="fog" args={[theme.fogColor, 75, 185]} />

        <CameraController
          presetKey={presetKey}
          selectedVehicle={selectedVehicle}
          followVehicle={followVehicle}
          controlsRef={controlsRef}
        />

        <TrafficScene
          data={data}
          theme={theme}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={(id) => setSelectedVehicleId(id)}
          onSelectIntersection={(id) => {
            setFollowVehicle(false);
            setPresetKey(id);
          }}
        />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableRotate
          enablePan
          enableZoom
          enableDamping
          dampingFactor={0.06}
          rotateSpeed={0.85}
          panSpeed={1.15}
          zoomSpeed={1.35}
          minDistance={1.5}
          maxDistance={220}
          minPolarAngle={0.05}
          maxPolarAngle={Math.PI / 2 - 0.03}
          screenSpacePanning={true}
        />
      </Canvas>

      <Dashboard
        data={data}
        connected={connected}
        sendCommand={sendCommand}
        presetKey={presetKey}
        setPresetKey={setPresetKey}
        themeKey={themeKey}
        setThemeKey={setThemeKey}
        selectedVehicle={selectedVehicle}
        setSelectedVehicleId={setSelectedVehicleId}
        followVehicle={followVehicle}
        setFollowVehicle={setFollowVehicle}
      />

      <div className="final-status-strip">
        <div className="final-status-item">
          <span className="status-dot" />
          <span>SUMO LIVE</span>
        </div>
        <div className="final-status-item">
          <span>CONTROL</span>
          <strong>{data?.controlMode || "INDEPENDENT DQN MARL"}</strong>
        </div>
        <div className="final-status-item">
          <span>THEME</span>
          <strong>{theme.label.toUpperCase()}</strong>
        </div>
        <div className="final-status-item">
          <span>CAMERA</span>
          <strong>{CAMERA_PRESETS[presetKey]?.label.toUpperCase()}</strong>
        </div>
      </div>
    </>
  );
}
