// STEP 18.1 — performance + visual realism pass
import React, {

  useEffect,

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



const WS_URL =

  "ws\://127.0.0.1:8000/ws/simulation";



const MAX_RENDER_VEHICLES = 120;





// ============================================================

// INTERSECTIONS

// ============================================================



const INTERSECTIONS = {



  I1: [0, 250],



  I2: [500, 250],



  I3: [0, -250],



  I4: [500, -250],



};





// ============================================================

// SUMO COORDINATES -> THREE

//

// This is ONLY used for static road geometry.

//

// Vehicle coordinates come directly from backend

// as renderX/renderZ.

// ============================================================



const SCALE = 0.08;



const SUMO_OFFSET_X = 600;



const SUMO_OFFSET_Y = 850;





function sumoToThree(

  x,

  y,

  height = 0

) {

  // LIVE SUMO coordinates include SUMO's netOffset.
  // The generated network uses netOffset = 600, 850.
  // Convert live SUMO positions back to the original
  // network coordinate system before rendering them.

  const originalX =
    Number(x) - SUMO_OFFSET_X;

  const originalY =
    Number(y) - SUMO_OFFSET_Y;

  return [

    originalX * SCALE,

    height,

    -originalY * SCALE,

  ];

}


// Static roads/intersections are already in ORIGINAL
// network coordinates, e.g. I1 = [0, 250].
// They must not receive SUMO's netOffset subtraction.
function originalToThree(

  x,

  y,

  height = 0

) {

  return [

    Number(x) * SCALE,

    height,

    -Number(y) * SCALE,

  ];

}



// ============================================================

// ROADS

// ============================================================



const ROAD_SEGMENTS = [



  {

    name: "W1-I1",

    from: [-600, 250],

    to: [0, 250],

  },



  {

    name: "I1-I2",

    from: [0, 250],

    to: [500, 250],

  },



  {

    name: "I2-E1",

    from: [500, 250],

    to: [1100, 250],

  },





  {

    name: "W2-I3",

    from: [-600, -250],

    to: [0, -250],

  },



  {

    name: "I3-I4",

    from: [0, -250],

    to: [500, -250],

  },



  {

    name: "I4-E2",

    from: [500, -250],

    to: [1100, -250],

  },





  {

    name: "N1-I1",

    from: [0, 850],

    to: [0, 250],

  },



  {

    name: "I1-I3",

    from: [0, 250],

    to: [0, -250],

  },



  {

    name: "I3-S1",

    from: [0, -250],

    to: [0, -850],

  },





  {

    name: "N2-I2",

    from: [500, 850],

    to: [500, 250],

  },



  {

    name: "I2-I4",

    from: [500, 250],

    to: [500, -250],

  },



  {

    name: "I4-S2",

    from: [500, -250],

    to: [500, -850],

  },



];





// ============================================================

// ROAD

// ============================================================



function Road({

  from,

  to,

}) {

  const [

    x1,

    ,

    z1,

  ] = originalToThree(

    from[0],

    from[1],

    0

  );



  const [

    x2,

    ,

    z2,

  ] = originalToThree(

    to[0],

    to[1],

    0

  );



  const dx =

    x2 - x1;



  const dz =

    z2 - z1;



  const length =

    Math.sqrt(

      dx * dx +

      dz * dz

    );



  const angle =

    Math.atan2(

      dz,

      dx

    );



  const centerX =

    (x1 + x2) / 2;



  const centerZ =

    (z1 + z2) / 2;



  // Actual SUMO network:

  // 3 lanes per direction.

  // Lane width = 3.2 metres.

  const laneWidth = 3.2 * SCALE;

  const roadHalfWidth = laneWidth * 3;

  const roadWidth = roadHalfWidth * 2;



  return (



    <group



      position={[

        centerX,

        0,

        centerZ,

      ]}



      rotation={[

        0,

        -angle,

        0,

      ]}



    >



      {/* ================================================== */}

      {/* ROAD SURFACE */}

      {/* ================================================== */}



      <mesh

        rotation={[

          -Math.PI / 2,

          0,

          0,

        ]}

      >



        <planeGeometry

          args={[

            length,

            roadWidth,

          ]}

        />



        <meshStandardMaterial

          color="#292d31"

          roughness={0.92}

        />



      </mesh>



      {/* ================================================== */}

      {/* CENTER DIVIDER */}

      {/* ================================================== */}



      <mesh

        position={[

          0,

          0.020,

          -0.045,

        ]}

        rotation={[

          -Math.PI / 2,

          0,

          0,

        ]}

      >



        <planeGeometry

          args={[

            length,

            0.035,

          ]}

        />



        <meshBasicMaterial

          color="#d9b72e"

        />



      </mesh>



      <mesh

        position={[

          0,

          0.020,

          0.045,

        ]}

        rotation={[

          -Math.PI / 2,

          0,

          0,

        ]}

      >



        <planeGeometry

          args={[

            length,

            0.035,

          ]}

        />



        <meshBasicMaterial

          color="#d9b72e"

        />



      </mesh>



      {/* ================================================== */}

      {/* THREE LANES EACH DIRECTION */}

      {/* ================================================== */}



      <LaneMarkings

        length={length}

        laneWidth={laneWidth}

      />



      {/* ================================================== */}

      {/* OUTER ROAD EDGE LINES */}

      {/* ================================================== */}



      <mesh

        position={[

          0,

          0.021,

          roadHalfWidth - 0.035,

        ]}

        rotation={[

          -Math.PI / 2,

          0,

          0,

        ]}

      >



        <planeGeometry

          args={[

            length,

            0.045,

          ]}

        />



        <meshBasicMaterial

          color="#eeeeee"

        />



      </mesh>



      <mesh

        position={[

          0,

          0.021,

          -roadHalfWidth + 0.035,

        ]}

        rotation={[

          -Math.PI / 2,

          0,

          0,

        ]}

      >



        <planeGeometry

          args={[

            length,

            0.045,

          ]}

        />



        <meshBasicMaterial

          color="#eeeeee"

        />



      </mesh>



    </group>



  );

}



// LANE MARKINGS

// ============================================================



function LaneMarkings({

  length,

  laneWidth,

}) {



  const markings = [];



  // Each directed SUMO edge contains 3 lanes.

  // The centre divider is at z = 0.

  // Lane separators therefore sit at +/- one and

  // +/- two lane widths.

  const separatorPositions = [

    -2 * laneWidth,

    -1 * laneWidth,

    1 * laneWidth,

    2 * laneWidth,

  ];



  const spacing = 2.1;



  separatorPositions.forEach(

    (laneZ, separatorIndex) => {



      for (

        let x =

          -length / 2 + 1.2;



        x <

          length / 2;



        x += spacing

      ) {



        markings.push(



          <mesh

            key={`${separatorIndex}-${x}`}

            position={[

              x,

              0.021,

              laneZ,

            ]}

            rotation={[

              -Math.PI / 2,

              0,

              0,

            ]}

          >



            <planeGeometry

              args={[

                0.9,

                0.035,

              ]}

            />



            <meshBasicMaterial

              color="#e5e5e5"

            />



          </mesh>



        );

      }

    }

  );



  return (

    <>

      {markings}

    </>

  );

}



// CROSSWALK

// ============================================================



function Crosswalk({

  x = 0,

  z = 0,

  rotation = 0,

}) {



  const stripes = [];





  for (

    let i = -3;

    i <= 3;

    i++

  ) {



    stripes.push(



      <mesh



        key={i}



        position={[

          x + i * 0.35,

          0.045,

          z,

        ]}



        rotation={[

          -Math.PI / 2,

          0,

          rotation,

        ]}



      >



        <planeGeometry

          args={[

            0.18,

            1.2,

          ]}

        />



        <meshBasicMaterial

          color="#f2f2f2"

        />



      </mesh>



    );



  }





  return (

    <group>

      {stripes}

    </group>

  );

}





// ============================================================

// INTERSECTION

// ============================================================



// ============================================================
// STEP 8 — ENVIRONMENT / INTERSECTION POLISH
// ============================================================

function SidewalkCorner({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.15, 2.15]} />
        <meshStandardMaterial color="#4b4e51" roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.115, 0]} receiveShadow>
        <boxGeometry args={[2.15, 0.08, 0.10]} />
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
      <planeGeometry args={[2.75, 0.10]} />
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

      <mesh position={[0, 0.056, 0.88]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.16, 0.48, 3]} />
        <meshBasicMaterial color="#d8d8d8" />
      </mesh>
      <mesh position={[0, 0.056, -0.88]} rotation={[-Math.PI / 2, 0, Math.PI]}>
        <coneGeometry args={[0.16, 0.48, 3]} />
        <meshBasicMaterial color="#d8d8d8" />
      </mesh>
    </>
  );
}

// ============================================================
// INTERSECTION
// ============================================================

function Intersection({

  position,

}) {



  const point =

    originalToThree(

      position[0],

      position[1],

      0

    );





  return (



    <group

      position={[

        point[0],

        0,

        point[2],

      ]}

    >



      <mesh

        rotation={[

          -Math.PI / 2,

          0,

          0,

        ]}

      >



        <planeGeometry

          args={[

            5.2,

            5.2,

          ]}

        />



        <meshStandardMaterial

          color="#292d31"

          roughness={0.9}

        />



      </mesh>





      <Crosswalk

        x={0}

        z={2.25}

        rotation={0}

      />





      <Crosswalk

        x={0}

        z={-2.25}

        rotation={0}

      />





      <Crosswalk

        x={-2.25}

        z={0}

        rotation={Math.PI / 2}

      />





      <Crosswalk

        x={2.25}

        z={0}

        rotation={Math.PI / 2}

      />





      <IntersectionDetails />





      <mesh

        position={[

          0,

          0.035,

          0,

        ]}

        rotation={[

          -Math.PI / 2,

          0,

          0,

        ]}

      >



        <planeGeometry

          args={[

            2.2,

            2.2,

          ]}

        />



        <meshStandardMaterial

          color="#25282b"

        />



      </mesh>



    </group>



  );

}





// ============================================================

// TRAFFIC LIGHT

// ============================================================



function TrafficLight({

  position,

  rotation = 0,

  state = "r",

}) {



  const red =

    state === "r";



  const yellow =

    state === "y";



  const green =

    state === "g";





  return (



    <group



      position={position}



      rotation={[

        0,

        rotation,

        0,

      ]}



    >



      {/* Pole */}

      <mesh

        position={[

          0,

          1.15,

          0,

        ]}

      >



        <cylinderGeometry

          args={[

            0.035,

            0.05,

            2.3,

            8,

          ]}

        />



        <meshStandardMaterial

          color="#555b61"

          metalness={0.65}

          roughness={0.35}

        />



      </mesh>





      {/* Housing */}

      <mesh

        position={[

          0,

          2.2,

          0,

        ]}

      >



        <boxGeometry

          args={[

            0.28,

            0.75,

            0.20,

          ]}

        />



        <meshStandardMaterial

          color="#111315"

        />



      </mesh>





      {/* Red */}

      <mesh

        position={[

          0,

          2.43,

          0.11,

        ]}

      >



        <sphereGeometry

          args={[

            0.075,

            12,

            12,

          ]}

        />



        <meshStandardMaterial

          color={

            red

              ? "#ff1d25"

              : "#321416"

          }

          emissive={

            red

              ? "#ff0000"

              : "#000000"

          }

          emissiveIntensity={

            red ? 2.5 : 0

          }

        />



      </mesh>





      {/* Yellow */}

      <mesh

        position={[

          0,

          2.2,

          0.11,

        ]}

      >



        <sphereGeometry

          args={[

            0.075,

            12,

            12,

          ]}

        />



        <meshStandardMaterial

          color={

            yellow

              ? "#ffd000"

              : "#302c12"

          }

          emissive={

            yellow

              ? "#ffb700"

              : "#000000"

          }

          emissiveIntensity={

            yellow ? 2 : 0

          }

        />



      </mesh>





      {/* Green */}

      <mesh

        position={[

          0,

          1.97,

          0.11,

        ]}

      >



        <sphereGeometry

          args={[

            0.075,

            12,

            12,

          ]}

        />



        <meshStandardMaterial

          color={

            green

              ? "#20e875"

              : "#102c1c"

          }

          emissive={

            green

              ? "#00ff66"

              : "#000000"

          }

          emissiveIntensity={

            green ? 2.5 : 0

          }

        />



      </mesh>



    </group>

  );

}





// ============================================================

// INTERSECTION LIGHTS

// ============================================================



function IntersectionLights({
  id,
  trafficLights,
}) {
  const position = INTERSECTIONS[id];

  const point = originalToThree(
    position[0],
    position[1],
    0
  );

  // SUMO remains the authoritative source for signal state.
  const live =
    trafficLights?.find(
      (light) => light.id === id
    );

  const tlsState =
    String(
      live?.redYellowGreenState || ""
    );

  const phase =
    Number.isFinite(Number(live?.phase))
      ? Number(live.phase)
      : -1;

  // Actual SUMO program:
  // 0 = direction A green
  // 1 = direction A yellow
  // 2 = direction B green
  // 3 = direction B yellow
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

  // Four physical signal heads around the junction.
  // Each pair controls the same SUMO direction but faces
  // the corresponding incoming road.
  const signals = [
    {
      key: `${id}-west`,
      position: [-2.75, 0, -1.55],
      rotation: Math.PI / 2,
      state: directionA,
    },
    {
      key: `${id}-east`,
      position: [2.75, 0, 1.55],
      rotation: -Math.PI / 2,
      state: directionA,
    },
    {
      key: `${id}-north`,
      position: [1.55, 0, -2.75],
      rotation: Math.PI,
      state: directionB,
    },
    {
      key: `${id}-south`,
      position: [-1.55, 0, 2.75],
      rotation: 0,
      state: directionB,
    },
  ];

  return (
    <group
      position={[
        point[0],
        0,
        point[2],
      ]}
    >
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

// TRAFFIC LIGHT

// State is always r, y, or g from the SUMO phase.

// ============================================================

// ============================================================

// VEHICLE COLORS

// ============================================================



function getVehicleColor(

  vehicleId

) {



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



  const id =

    String(

      vehicleId || ""

    );





  for (

    let i = 0;

    i < id.length;

    i++

  ) {



    hash =

      id.charCodeAt(i) +

      ((hash << 5) - hash);



  }





  return colors[

    Math.abs(hash) %

    colors.length

  ];

}





// ============================================================

// WHEEL
// ============================================================

function Wheel({ position, radius = 0.075, width = 0.07 }) {
  return (
    <group position={position} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[radius, radius, width, 16]} />
        <meshStandardMaterial
          color="#101214"
          roughness={0.82}
          metalness={0.08}
        />
      </mesh>

      <mesh position={[0, width * 0.51, 0]}>
        <cylinderGeometry
          args={[radius * 0.46, radius * 0.46, 0.012, 12]}
        />
        <meshStandardMaterial
          color="#a7adb3"
          roughness={0.30}
          metalness={0.72}
        />
      </mesh>

      <mesh position={[0, width * 0.53, 0]}>
        <cylinderGeometry
          args={[radius * 0.18, radius * 0.18, 0.014, 12]}
        />
        <meshStandardMaterial
          color="#20252a"
          roughness={0.25}
          metalness={0.75}
        />
      </mesh>
    </group>
  );
}


// ============================================================
// VEHICLE — STEP 7.2 HIGH-GRAPHICS OPTIMIZED MODEL
// ============================================================

function Vehicle({ vehicle }) {
  // SUMO remains authoritative for position and heading.
  let x = Number(vehicle?.renderX);
  let z = Number(vehicle?.renderZ);

  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    const rawX =
      vehicle?.x ??
      vehicle?.sumoX ??
      vehicle?.positionX ??
      vehicle?.position?.x;

    const rawY =
      vehicle?.y ??
      vehicle?.sumoY ??
      vehicle?.positionY ??
      vehicle?.position?.y;

    if (
      Number.isFinite(Number(rawX)) &&
      Number.isFinite(Number(rawY))
    ) {
      const point = sumoToThree(Number(rawX), Number(rawY), 0);
      x = point[0];
      z = point[2];
    } else {
      x = 0;
      z = 0;
    }
  }

  const laneId = String(vehicle?.lane ?? "");
  const laneIndex = Number(vehicle?.laneIndex ?? -1);
  const lanePosition = Number(vehicle?.lanePosition ?? 0);

  const type = String(vehicle?.type || "car").toLowerCase();
  const color = getVehicleColor(vehicle?.id);

  const isBus = type.includes("bus");
  const isTruck = type.includes("truck");

  // Deterministic visual variation based only on the SUMO vehicle ID.
  // This does not change movement, routing, MARL control, or physics.
  const vehicleIdString = String(vehicle?.id || "");
  let vehicleHash = 0;

  for (let i = 0; i < vehicleIdString.length; i++) {
    vehicleHash =
      vehicleIdString.charCodeAt(i) +
      ((vehicleHash << 5) - vehicleHash);
  }

  const variant = Math.abs(vehicleHash) % 4;

  const carWidthFactor =
    !isBus && !isTruck
      ? [0.94, 1.02, 0.98, 1.06][variant]
      : 1;

  const carLengthFactor =
    !isBus && !isTruck
      ? [1.08, 0.94, 1.00, 0.90][variant]
      : 1;

  const roofFactor =
    !isBus && !isTruck
      ? [1.00, 0.88, 1.08, 0.94][variant]
      : 1;

  // Dimensions are real-world-ish metres converted to the
  // project's Three.js scale.
  let width = 1.85 * SCALE * carWidthFactor;
  let height = 1.42 * SCALE;
  let length = 4.50 * SCALE * carLengthFactor;

  if (isBus) {
    width = 2.50 * SCALE;
    height = 3.20 * SCALE;
    length = 12.00 * SCALE;
  } else if (isTruck) {
    width = 2.50 * SCALE;
    height = 3.20 * SCALE;
    length = 8.00 * SCALE;
  }

  const sumoAngle = Number(vehicle?.angle ?? 0);
  const normalizedSumoAngle =
    ((sumoAngle % 360) + 360) % 360;

  // SUMO: 0 north, 90 east, 180 south, 270 west.
  const angle =
    Math.PI -
    THREE.MathUtils.degToRad(sumoAngle);

  const groupRef = useRef(null);
  const targetRef = useRef(new THREE.Vector3(x, 0.20, z));
  const initializedRef = useRef(false);
  const lastLaneRef = useRef(laneId);
  const lastAngleRef = useRef(normalizedSumoAngle);
  const targetAngleRef = useRef(angle);

  targetRef.current.set(x, 0.20, z);
  targetAngleRef.current = angle;

  useEffect(() => {
    if (!groupRef.current) return;

    const laneChanged = lastLaneRef.current !== laneId;

    const angleDelta = Math.abs(
      ((normalizedSumoAngle - lastAngleRef.current + 180) % 360) - 180
    );

    if (laneChanged && angleDelta > 70) {
      groupRef.current.position.set(x, 0.20, z);
    }

    targetAngleRef.current = angle;
    lastLaneRef.current = laneId;
    lastAngleRef.current = normalizedSumoAngle;
  }, [laneId, normalizedSumoAngle, angle, x, z]);

  useFrame((_, delta) => {
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

    // Keep SUMO authoritative. Smooth only the visual interpolation.
    if (distance > 0.85) {
      currentPosition.copy(targetPosition);
    } else {
      const normalizedDistance =
        THREE.MathUtils.clamp(distance / 0.45, 0, 1);

      // Higher visual tracking speed keeps the frontend close to
      // SUMO instead of making cars appear to move in slow motion.
      const movementSpeed =
        THREE.MathUtils.lerp(28, 42, normalizedDistance);

      const smoothing =
        1 - Math.exp(-movementSpeed * Math.max(delta, 0.001));

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
      THREE.MathUtils.clamp(
        Math.abs(angleDifference) / (Math.PI / 2),
        0,
        1
      )
    );

    const rotationSmoothing =
      1 - Math.exp(-rotationSpeed * Math.max(delta, 0.001));

    groupRef.current.rotation.y +=
      angleDifference * rotationSmoothing;

    if (Math.abs(angleDifference) < 0.001) {
      groupRef.current.rotation.y = targetAngle;
    }
  });

  const bodyY = -height * 0.04;
  const wheelY = -height * 0.42;
  const wheelX = width * 0.55;

  return (
    <group
      ref={groupRef}
      position={[x, 0.20, z]}
      userData={{
        lane: laneId,
        laneIndex,
        lanePosition,
      }}
    >
      {/* ================================================== */}
      {/* LOWER BODY / CHASSIS */}
      {/* ================================================== */}

      <mesh
        position={[0, bodyY, 0]}
        scale={[1, 1, 1]}
      >
        <boxGeometry args={[width, height * 0.52, length * 0.94]} />
        <meshStandardMaterial
          color={color}
          roughness={0.28}
          metalness={0.30}
        />
      </mesh>

      {/* Lower side skirt */}
      {!isBus && (
        <mesh
          position={[0, -height * 0.17, 0]}
        >
          <boxGeometry
            args={[width * 1.015, height * 0.18, length * 0.82]}
          />
          <meshStandardMaterial
            color={color}
            roughness={0.32}
            metalness={0.26}
          />
        </mesh>
      )}

      {/* ================================================== */}
      {/* CAR-SPECIFIC BODY */}
      {/* ================================================== */}

      {!isBus && !isTruck && (
        <>
          {/* Hood */}
          <mesh
            position={[0, height * 0.24, length * 0.30]}
          >
            <boxGeometry
              args={[width * 0.90, height * 0.24, length * 0.25]}
            />
            <meshStandardMaterial
              color={color}
              roughness={0.25}
              metalness={0.32}
            />
          </mesh>

          {/* Cabin */}
          <mesh
            position={[0, height * 0.42, -length * 0.02]}
          >
            <boxGeometry
              args={[width * 0.78, height * 0.58, length * 0.48]}
            />
            <meshStandardMaterial
              color={color}
              roughness={0.25}
              metalness={0.28}
            />
          </mesh>

          {/* Roof */}
          <mesh
            position={[0, height * 0.71, -length * 0.02]}
          >
            <boxGeometry
              args={[width * 0.66, height * 0.10, length * 0.39]}
            />
            <meshStandardMaterial
              color={color}
              roughness={0.22}
              metalness={0.30}
            />
          </mesh>

          {/* Front windshield */}
          <mesh position={[0, height * 0.48, length * 0.225]}>
            <boxGeometry
              args={[width * 0.62, height * 0.31, 0.018]}
            />
            <meshStandardMaterial
              color="#173243"
              roughness={0.07}
              metalness={0.42}
            />
          </mesh>

          {/* Rear windshield */}
          <mesh position={[0, height * 0.48, -length * 0.225]}>
            <boxGeometry
              args={[width * 0.62, height * 0.29, 0.018]}
            />
            <meshStandardMaterial
              color="#172f3f"
              roughness={0.07}
              metalness={0.42}
            />
          </mesh>

          {/* Side windows */}
          <mesh position={[-width * 0.397, height * 0.48, -length * 0.02]}>
            <boxGeometry
              args={[0.018, height * 0.27, length * 0.36]}
            />
            <meshStandardMaterial
              color="#142b39"
              roughness={0.08}
              metalness={0.35}
            />
          </mesh>

          <mesh position={[width * 0.397, height * 0.48, -length * 0.02]}>
            <boxGeometry
              args={[0.018, height * 0.27, length * 0.36]}
            />
            <meshStandardMaterial
              color="#142b39"
              roughness={0.08}
              metalness={0.35}
            />
          </mesh>

          {/* Small deterministic model variation */}
          {variant === 3 && (
            <mesh
              position={[0, height * 0.80, -length * 0.06]}
            >
              <cylinderGeometry
                args={[0.008, 0.008, height * 0.12, 6]}
              />
              <meshStandardMaterial
                color="#15181b"
                roughness={0.42}
                metalness={0.45}
              />
            </mesh>
          )}

          {/* Side mirrors */}
          <mesh position={[-width * 0.53, height * 0.38, length * 0.18]}>
            <boxGeometry args={[width * 0.13, height * 0.10, length * 0.08]} />
            <meshStandardMaterial
              color="#171a1d"
              roughness={0.25}
              metalness={0.55}
            />
          </mesh>

          <mesh position={[width * 0.53, height * 0.38, length * 0.18]}>
            <boxGeometry args={[width * 0.13, height * 0.10, length * 0.08]} />
            <meshStandardMaterial
              color="#171a1d"
              roughness={0.25}
              metalness={0.55}
            />
          </mesh>

          {/* Door handles */}
          {[-1, 1].map((side) => (
            <mesh
              key={`handle-${side}`}
              position={[side * width * 0.407, height * 0.27, -length * 0.02]}
            >
              <boxGeometry args={[0.012, 0.018, length * 0.07]} />
              <meshStandardMaterial
                color="#c2c7cb"
                roughness={0.18}
                metalness={0.75}
              />
            </mesh>
          ))}
        </>
      )}

      {/* ================================================== */}
      {/* BUS BODY */}
      {/* ================================================== */}

      {isBus && (
        <>
          <mesh
            position={[0, height * 0.27, -length * 0.02]}
          >
            <boxGeometry
              args={[width * 0.98, height * 0.52, length * 0.94]}
            />
            <meshStandardMaterial
              color={color}
              roughness={0.32}
              metalness={0.22}
            />
          </mesh>

          {/* Long passenger window band */}
          <mesh position={[0, height * 0.58, 0]}>
            <boxGeometry
              args={[width * 0.84, height * 0.34, length * 0.79]}
            />
            <meshStandardMaterial
              color="#142b38"
              roughness={0.08}
              metalness={0.38}
            />
          </mesh>

          {/* Window dividers */}
          {[-0.28, -0.09, 0.10, 0.29].map((p) => (
            <mesh
              key={`bus-divider-${p}`}
              position={[0, height * 0.58, length * p]}
            >
              <boxGeometry args={[width * 0.86, height * 0.38, 0.025]} />
              <meshStandardMaterial
                color={color}
                roughness={0.30}
                metalness={0.22}
              />
            </mesh>
          ))}

          {/* Roof cap */}
          <mesh position={[0, height * 0.60, 0]}>
            <boxGeometry
              args={[width * 0.92, height * 0.10, length * 0.90]}
            />
            <meshStandardMaterial
              color={color}
              roughness={0.28}
              metalness={0.24}
            />
          </mesh>
        </>
      )}

      {/* ================================================== */}
      {/* TRUCK CAB + CARGO */}
      {/* ================================================== */}

      {isTruck && (
        <>
          {/* Driver cab */}
          <mesh
            position={[0, height * 0.32, length * 0.28]}
          >
            <boxGeometry
              args={[width * 0.94, height * 0.62, length * 0.34]}
            />
            <meshStandardMaterial
              color={color}
              roughness={0.30}
              metalness={0.25}
            />
          </mesh>

          {/* Cab windshield */}
          <mesh position={[0, height * 0.48, length * 0.455]}>
            <boxGeometry
              args={[width * 0.72, height * 0.28, 0.020]}
            />
            <meshStandardMaterial
              color="#172e3d"
              roughness={0.08}
              metalness={0.38}
            />
          </mesh>

          {/* Cargo box */}
          <mesh
            position={[0, height * 0.42, -length * 0.16]}
          >
            <boxGeometry
              args={[width * 0.96, height * 0.78, length * 0.55]}
            />
            <meshStandardMaterial
              color="#cfd3d7"
              roughness={0.54}
              metalness={0.10}
            />
          </mesh>

          {/* Cargo top */}
          <mesh position={[0, height * 0.82, -length * 0.16]}>
            <boxGeometry
              args={[width * 0.92, height * 0.07, length * 0.51]}
            />
            <meshStandardMaterial
              color="#aeb4b9"
              roughness={0.55}
              metalness={0.12}
            />
          </mesh>
        </>
      )}

      {/* ================================================== */}
      {/* WHEELS */}
      {/* ================================================== */}

      {!isBus && !isTruck && (
        <>
          <Wheel position={[-wheelX, wheelY, length * 0.30]} />
          <Wheel position={[wheelX, wheelY, length * 0.30]} />
          <Wheel position={[-wheelX, wheelY, -length * 0.30]} />
          <Wheel position={[wheelX, wheelY, -length * 0.30]} />
        </>
      )}

      {isTruck && (
        <>
          <Wheel position={[-wheelX, wheelY, length * 0.31]} radius={0.085} />
          <Wheel position={[wheelX, wheelY, length * 0.31]} radius={0.085} />
          <Wheel position={[-wheelX, wheelY, -length * 0.25]} radius={0.085} />
          <Wheel position={[wheelX, wheelY, -length * 0.25]} radius={0.085} />
          <Wheel position={[-wheelX, wheelY, -length * 0.38]} radius={0.085} />
          <Wheel position={[wheelX, wheelY, -length * 0.38]} radius={0.085} />
        </>
      )}

      {isBus && (
        <>
          <Wheel position={[-wheelX, wheelY, length * 0.31]} radius={0.095} />
          <Wheel position={[wheelX, wheelY, length * 0.31]} radius={0.095} />
          <Wheel position={[-wheelX, wheelY, -length * 0.02]} radius={0.095} />
          <Wheel position={[wheelX, wheelY, -length * 0.02]} radius={0.095} />
          <Wheel position={[-wheelX, wheelY, -length * 0.31]} radius={0.095} />
          <Wheel position={[wheelX, wheelY, -length * 0.31]} radius={0.095} />
        </>
      )}

      {/* ================================================== */}
      {/* FRONT BUMPER */}
      {/* ================================================== */}

      <mesh position={[0, -height * 0.01, length * 0.485]}>
        <boxGeometry
          args={[
            width * 0.88,
            height * 0.16,
            0.055,
          ]}
        />
        <meshStandardMaterial
          color="#1b1d20"
          roughness={0.34}
          metalness={0.38}
        />
      </mesh>

      {/* REAR BUMPER */}
      <mesh position={[0, -height * 0.01, -length * 0.485]}>
        <boxGeometry
          args={[
            width * 0.88,
            height * 0.16,
            0.055,
          ]}
        />
        <meshStandardMaterial
          color="#1b1d20"
          roughness={0.34}
          metalness={0.38}
        />
      </mesh>

      {/* ================================================== */}
      {/* HEADLIGHTS */}
      {/* ================================================== */}

      <mesh position={[-width * 0.29, height * 0.04, length * 0.505]}>
        <boxGeometry args={[width * 0.20, height * 0.16, 0.024]} />
        <meshStandardMaterial
          color="#fffce9"
          emissive="#fff3a8"
          emissiveIntensity={2.0}
          roughness={0.12}
          metalness={0.15}
        />
      </mesh>

      <mesh position={[width * 0.29, height * 0.04, length * 0.505]}>
        <boxGeometry args={[width * 0.20, height * 0.16, 0.024]} />
        <meshStandardMaterial
          color="#fffce9"
          emissive="#fff3a8"
          emissiveIntensity={2.0}
          roughness={0.12}
          metalness={0.15}
        />
      </mesh>

      {/* ================================================== */}
      {/* TAIL LIGHTS */}
      {/* ================================================== */}

      <mesh position={[-width * 0.29, height * 0.04, -length * 0.505]}>
        <boxGeometry args={[width * 0.20, height * 0.16, 0.024]} />
        <meshStandardMaterial
          color="#ff2028"
          emissive="#ff0000"
          emissiveIntensity={1.8}
          roughness={0.18}
        />
      </mesh>

      <mesh position={[width * 0.29, height * 0.04, -length * 0.505]}>
        <boxGeometry args={[width * 0.20, height * 0.16, 0.024]} />
        <meshStandardMaterial
          color="#ff2028"
          emissive="#ff0000"
          emissiveIntensity={1.8}
          roughness={0.18}
        />
      </mesh>

      {/* Small license plate */}
      <mesh position={[0, -height * 0.01, -length * 0.514]}>
        <boxGeometry args={[width * 0.24, height * 0.10, 0.012]} />
        <meshStandardMaterial
          color="#e7e1c6"
          roughness={0.45}
          metalness={0.05}
        />
      </mesh>
    </group>
  );
}



// GROUND

// ============================================================



function RoadsideMarker({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.32, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.045, 0.64, 8]} />
        <meshStandardMaterial color="#555a5e" roughness={0.70} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.68, 0]} castShadow>
        <sphereGeometry args={[0.095, 10, 8]} />
        <meshStandardMaterial
          color="#e1e4e7"
          emissive="#d9e4ee"
          emissiveIntensity={0.35}
          roughness={0.25}
          metalness={0.15}
        />
      </mesh>
    </group>
  );
}




// ============================================================
// STEP 9 — SCENE ENVIRONMENT POLISH
// ============================================================

function EnvironmentTree({ position, scale = 1 }) {
  return (
    <group position={position} scale={[scale, scale, scale]}>
      <mesh position={[0, 0.48, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 0.96, 7]} />
        <meshStandardMaterial
          color="#514337"
          roughness={0.92}
        />
      </mesh>

      <mesh position={[0, 1.12, 0]} castShadow>
        <sphereGeometry args={[0.62, 10, 8]} />
        <meshStandardMaterial
          color="#31523a"
          roughness={0.92}
        />
      </mesh>

      <mesh position={[0.30, 1.35, 0.08]} castShadow>
        <sphereGeometry args={[0.43, 9, 7]} />
        <meshStandardMaterial
          color="#3d6445"
          roughness={0.92}
        />
      </mesh>

      <mesh position={[-0.30, 1.28, -0.06]} castShadow>
        <sphereGeometry args={[0.40, 9, 7]} />
        <meshStandardMaterial
          color="#284b34"
          roughness={0.92}
        />
      </mesh>
    </group>
  );
}

function EnvironmentBuilding({ position, width, depth, height, variant = 0 }) {
  const palettes = [
    { body: "#56616a", panel: "#3f4a52", glass: "#86a9bd", roof: "#2f353a", accent: "#c7a56a" },
    { body: "#6b625b", panel: "#514a45", glass: "#91a9b5", roof: "#35312e", accent: "#b97c5d" },
    { body: "#4f6060", panel: "#394848", glass: "#79a6a8", roof: "#293333", accent: "#d0b36a" },
    { body: "#665f70", panel: "#4b4653", glass: "#9aa6c0", roof: "#302d38", accent: "#a986c4" },
  ];
  const palette = palettes[Math.abs(Number(variant) || 0) % palettes.length];

  const floors = Math.max(2, Math.round(height / 1.55));
  const windowRows = Math.min(floors, 5);
  const windowCols = 3;

  return (
    <group position={position}>
      {/* Main facade */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={palette.body} roughness={0.76} />
      </mesh>

      {/* Recessed facade panel */}
      <mesh position={[0, height * 0.53, depth * 0.506]}>
        <boxGeometry args={[width * 0.88, height * 0.82, depth * 0.025]} />
        <meshStandardMaterial color={palette.panel} roughness={0.82} />
      </mesh>

      {/* Front windows */}
      {Array.from({ length: windowRows }).flatMap((_, row) =>
        Array.from({ length: windowCols }).map((__, col) => {
          const x =
            ((col - (windowCols - 1) / 2) /
              ((windowCols - 1) / 2 || 1)) *
            width *
            0.29;
          const y = height * (0.25 + (row / Math.max(windowRows - 1, 1)) * 0.58);

          return (
            <mesh
              key={`front-window-${row}-${col}`}
              position={[x, y, depth * 0.52]}
            >
              <boxGeometry args={[width * 0.13, height * 0.075, 0.035]} />
              <meshStandardMaterial
                color={palette.glass}
                roughness={0.22}
                metalness={0.18}
                emissive={palette.glass}
                emissiveIntensity={0.05}
              />
            </mesh>
          );
        })
      )}

      {/* Side windows */}
      {Array.from({ length: Math.min(windowRows, 4) }).flatMap((_, row) =>
        Array.from({ length: 2 }).map((__, col) => {
          const z = (col === 0 ? -0.22 : 0.22) * depth;
          const y = height * (0.29 + (row / Math.max(windowRows - 1, 1)) * 0.54);

          return (
            <mesh
              key={`side-window-${row}-${col}`}
              position={[width * 0.51, y, z]}
            >
              <boxGeometry args={[0.035, height * 0.075, depth * 0.13]} />
              <meshStandardMaterial
                color={palette.glass}
                roughness={0.22}
                metalness={0.18}
                emissive={palette.glass}
                emissiveIntensity={0.05}
              />
            </mesh>
          );
        })
      )}

      {/* Entrance / ground-floor storefront */}
      <mesh position={[0, height * 0.115, depth * 0.522]}>
        <boxGeometry args={[width * 0.25, height * 0.19, 0.045]} />
        <meshStandardMaterial color="#20262b" roughness={0.34} metalness={0.35} />
      </mesh>

      {/* Thin architectural bands */}
      <mesh position={[0, height * 0.22, depth * 0.53]}>
        <boxGeometry args={[width * 0.92, 0.045, 0.055]} />
        <meshStandardMaterial color={palette.accent} roughness={0.55} metalness={0.25} />
      </mesh>

      <mesh position={[0, height * 0.94, 0]}>
        <boxGeometry args={[width * 1.04, 0.10, depth * 1.04]} />
        <meshStandardMaterial color={palette.roof} roughness={0.82} />
      </mesh>

      {/* Rooftop utility block */}
      <mesh position={[width * 0.20, height + 0.20, depth * 0.05]}>
        <boxGeometry args={[width * 0.26, 0.38, depth * 0.24]} />
        <meshStandardMaterial color={palette.panel} roughness={0.88} />
      </mesh>
    </group>
  );
}

function StreetLamp({ position, rotation = 0, scale = 1 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={[scale, scale, scale]}>
      <mesh position={[0, 1.45, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.07, 2.9, 8]} />
        <meshStandardMaterial color="#30353a" roughness={0.72} metalness={0.55} />
      </mesh>
      <mesh position={[0.28, 2.82, 0]} rotation={[0, 0, -0.12]} castShadow>
        <boxGeometry args={[0.58, 0.07, 0.07]} />
        <meshStandardMaterial color="#30353a" roughness={0.68} metalness={0.55} />
      </mesh>
      <mesh position={[0.55, 2.78, 0]}>
        <sphereGeometry args={[0.105, 12, 8]} />
        <meshStandardMaterial color="#fff1c4" emissive="#fff1c4" emissiveIntensity={1.4} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.035, 0]} receiveShadow>
        <cylinderGeometry args={[0.15, 0.18, 0.07, 10]} />
        <meshStandardMaterial color="#24282c" roughness={0.9} metalness={0.25} />
      </mesh>
    </group>
  );
}

function SceneEnvironment() {
  return (
    <>
      {/* Low-density greenery around the traffic area */}
      <EnvironmentTree position={[-34, 0, 17]} scale={1.05} />
      <EnvironmentTree position={[-25, 0, 17]} scale={0.82} />
      <EnvironmentTree position={[19, 0, 17]} scale={0.92} />
      <EnvironmentTree position={[30, 0, 16]} scale={1.12} />

      <EnvironmentTree position={[-34, 0, -17]} scale={0.90} />
      <EnvironmentTree position={[-23, 0, -17]} scale={1.08} />
      <EnvironmentTree position={[20, 0, -17]} scale={0.84} />
      <EnvironmentTree position={[31, 0, -17]} scale={1.00} />

      {/* Simple background buildings */}
      <EnvironmentBuilding
        position={[-35, 0, 26]}
        width={5.8}
        depth={4.8}
        height={6.8}
        variant={0}
      />
      <EnvironmentBuilding
        position={[-26, 0, 27]}
        width={4.4}
        depth={4.2}
        height={4.6}
        variant={1}
      />
      <EnvironmentBuilding
        position={[22, 0, 27]}
        width={5.4}
        depth={4.7}
        height={6.0}
        variant={2}
      />
      <EnvironmentBuilding
        position={[31, 0, 26]}
        width={4.6}
        depth={4.3}
        height={5.0}
        variant={3}
      />

      <EnvironmentBuilding
        position={[-35, 0, -26]}
        width={5.0}
        depth={4.4}
        height={5.8}
        variant={2}
      />
      <EnvironmentBuilding
        position={[30, 0, -26]}
        width={5.5}
        depth={4.6}
        height={6.3}
        variant={1}
      />
    </>
  );
}

function Ground() {



  return (



    <mesh



      position={[

        -28,

        -0.08,

        28,

      ]}



      rotation={[

        -Math.PI / 2,

        0,

        0,

      ]}



    >



      <planeGeometry

        args={[

          150,

          150,

        ]}

      />



      <meshStandardMaterial

        color="#171a1c"

        roughness={1}

      />



    </mesh>



  );

}





// ============================================================

// TRAFFIC SCENE

// ============================================================



function IntersectionLoadRing({

  id,

  position,

  marl,

}) {

  const point = originalToThree(
    position[0],
    position[1],
    0
  );

  const agent =
    (marl || []).find(
      (item) => item?.id === id
    ) || {};

  const queue = Math.max(
    0,
    Number(agent.queue || 0)
  );

  const intensity = Math.min(
    queue / 35,
    1
  );

  const radius =
    1.55 + intensity * 0.55;

  const opacity =
    0.10 + intensity * 0.22;

  const color =
    intensity > 0.72
      ? "#ff5b5b"
      : intensity > 0.38
        ? "#ffc857"
        : "#47e6a1";

  return (
    <mesh
      position={[
        point[0],
        0.064,
        point[2],
      ]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry
        args={[
          radius,
          radius + 0.055,
          48,
        ]}
      />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  );
}



function TrafficScene({

  data,

}) {



  const allVehicles =

    data?.vehicles || [];



  // Keep a stable set of rendered vehicle IDs.

  // This prevents the visible fleet from changing every

  // WebSocket packet simply because SUMO reordered IDs.

  const vehiclePoolRef = useRef(

    new Map()

  );



  const currentVehiclesById =

    new Map();



  allVehicles.forEach(

    (vehicle) => {

      if (vehicle?.id != null) {

        currentVehiclesById.set(

          String(vehicle.id),

          vehicle

        );

      }

    }

  );



  // Remove vehicles that have actually left SUMO.

  vehiclePoolRef.current.forEach(

    (_, id) => {

      if (

        !currentVehiclesById.has(id)

      ) {

        vehiclePoolRef.current.delete(

          id

        );

      }

    }

  );



  // Fill empty render slots with newly arrived vehicles.

  if (

    vehiclePoolRef.current.size <

    MAX_RENDER_VEHICLES

  ) {

    for (

      const vehicle of allVehicles

    ) {

      const id = String(

        vehicle?.id ?? ""

      );



      if (

        !id ||

        vehiclePoolRef.current.has(id)

      ) {

        continue;

      }



      vehiclePoolRef.current.set(

        id,

        vehicle

      );



      if (

        vehiclePoolRef.current.size >=

        MAX_RENDER_VEHICLES

      ) {

        break;

      }

    }

  }



  // Update the stored objects for vehicles already

  // in the stable render pool.

  allVehicles.forEach(

    (vehicle) => {

      const id = String(

        vehicle?.id ?? ""

      );



      if (

        vehiclePoolRef.current.has(id)

      ) {

        vehiclePoolRef.current.set(

          id,

          vehicle

        );

      }

    }

  );



  const vehicles = Array.from(

    vehiclePoolRef.current.values()

  );



  const trafficLights =

    data?.trafficLights || [];

  const marl =

    data?.marl || [];





  return (



    <>



      <ambientLight

        intensity={1}

      />





      <directionalLight

        position={[

          20,

          45,

          25,

        ]}

        intensity={2}

        shadow-mapSize-width={2048}

        shadow-mapSize-height={2048}

      />





      <hemisphereLight

        intensity={0.35}

        groundColor="#151719"

        skyColor="#8fa0b5"

      />





      <Ground />

      <SceneEnvironment />

      {/* STEP 11 — lightweight street furniture for added realism */}
      <StreetLamp position={[-24, 0, 8]} rotation={0.15} scale={0.95} />
      <StreetLamp position={[8, 0, 8]} rotation={Math.PI} scale={0.95} />
      <StreetLamp position={[-24, 0, -8]} rotation={-0.15} scale={0.90} />
      <StreetLamp position={[8, 0, -8]} rotation={Math.PI + 0.15} scale={0.90} />

      <RoadsideMarker position={[-29, 0, 10]} />
      <RoadsideMarker position={[-29, 0, 0]} />
      <RoadsideMarker position={[-29, 0, -10]} />
      <RoadsideMarker position={[13, 0, 10]} />
      <RoadsideMarker position={[13, 0, 0]} />
      <RoadsideMarker position={[13, 0, -10]} />



      {ROAD_SEGMENTS.map(

        (road) => (



          <Road

            key={road.name}

            from={road.from}

            to={road.to}

          />



        )

      )}





      {Object.entries(

        INTERSECTIONS

      ).map(

        ([id, position]) => (



          <React.Fragment

            key={id}

          >



            <Intersection

              position={position}

            />



            <IntersectionLights

              id={id}

              trafficLights={

                trafficLights

              }

            />


            <IntersectionLoadRing

              id={id}

              position={position}

              marl={marl}

            />



          </React.Fragment>



        )

      )}





      <group>



        {vehicles.map(

          (vehicle) => (



            <Vehicle

              key={vehicle.id}

              vehicle={vehicle}

            />



          )

        )}



      </group>



    </>



  );

}





// ============================================================

// KPI

// ============================================================



function KpiCard({

  label,

  value,

  suffix = "",

}) {



  return (



    <div className="kpi-card">



      <div className="kpi-label">

        {label}

      </div>



      <div className="kpi-value">



        {value}



        {suffix && (

          <span className="kpi-suffix">

            {suffix}

          </span>

        )}



      </div>



    </div>



  );

}





// ============================================================

// AGENT CARD

// ============================================================



function AgentCard({

  agent,

}) {



  if (!agent) {



    return (



      <div className="agent-card">



        <div className="agent-name">

          --

        </div>



      </div>



    );



  }





  const action =

    String(

      agent.action ||

      "HOLD"

    ).toUpperCase();





  return (



    <div className="agent-card">



      <div className="agent-top">



        <div className="agent-name">

          {agent.id}

        </div>





        <div

          className={

            action === "SWITCH"

              ? "action-switch"

              : "action-hold"

          }

        >



          {action}



        </div>



      </div>





      <div className="agent-stats">



        <div>



          <span>

            QUEUE

          </span>



          <strong>

            {Math.round(

              Number(

                agent.queue || 0

              )

            )}

          </strong>



        </div>





        <div>



          <span>

            WAITING

          </span>



          <strong>

            {Math.round(

              Number(

                agent.waiting || 0

              )

            )}

            s

          </strong>



        </div>





        <div>



          <span>

            VEHICLES

          </span>



          <strong>

            {Math.round(

              Number(

                agent.vehicles || 0

              )

            )}

          </strong>



        </div>



      </div>



    </div>



  );

}





// ============================================================

// DASHBOARD

// ============================================================



function Dashboard({

  data,

  connected,

}) {



  const allVehicles =

    data?.vehicles || [];





  const renderedVehicles =

    allVehicles.slice(

      0,

      MAX_RENDER_VEHICLES

    );





  const marl =

    data?.marl || [];





  const agents = {};





  marl.forEach(

    (item) => {



      agents[item.id] =

        item;



    }

  );





  const totalQueue =

    marl.reduce(

      (

        total,

        item

      ) => (



        total +

        Number(

          item.queue || 0

        )



      ),

      0

    );





  const totalWaiting =

    marl.reduce(

      (

        total,

        item

      ) => (



        total +

        Number(

          item.waiting || 0

        )



      ),

      0

    );





  return (



    <div className="dashboard">



      {/* HEADER */}



      <div className="header">



        <div className="header-title-block">
          <div className="header-eyebrow">TRAFFIC INTELLIGENCE • FINAL DEMO</div>
          <h1>MARL Traffic Optimization</h1>
          <p>Multi-Agent Reinforcement Learning <span> • </span> SUMO Traffic Simulation</p>
        </div>





        <div

          className={

            connected

              ? "live-indicator"

              : "offline-indicator"

          }

        >



          <span className="live-dot" />



          {connected

            ? "LIVE"

            : "OFFLINE"}



        </div>



      </div>





      {/* KPI */}



      <div className="kpi-row">



        <KpiCard

          label="SIMULATION TIME"

          value={Number(

            data?.simulationTime || 0

          ).toFixed(1)}

          suffix=" s"

        />





        <KpiCard

          label="RENDERED VEHICLES"

          value={

            renderedVehicles.length

          }

        />





        <KpiCard

          label="TOTAL QUEUE"

          value={

            Math.round(

              totalQueue

            )

          }

        />





        <KpiCard

          label="WAITING TIME"

          value={

            Math.round(

              totalWaiting

            )

          }

          suffix=" s"

        />



      </div>





      {/* MARL */}



      <div className="agents-panel">



        <div className="agents-header">



          <span>

            MARL AGENTS

          </span>



          <strong>

            INDEPENDENT DQN

          </strong>



        </div>





        <div className="agents-grid">



          <AgentCard

            agent={agents.I1}

          />



          <AgentCard

            agent={agents.I2}

          />



          <AgentCard

            agent={agents.I3}

          />



          <AgentCard

            agent={agents.I4}

          />



        </div>



      </div>



    </div>



  );

}





// ============================================================


function LivePerformancePanel({ data, connected }) {
  const vehicles = Array.isArray(data?.vehicles) ? data.vehicles : [];
  const marl = Array.isArray(data?.marl) ? data.marl : [];
  const totalQueue = marl.reduce((sum, item) => sum + Number(item?.queue || 0), 0);
  const totalWaiting = marl.reduce((sum, item) => sum + Number(item?.waiting || 0), 0);
  const totalVehicles = Number(data?.vehicleCount ?? data?.totalVehicles ?? vehicles.length);
  return (
    <div className="live-performance-panel">
      <div className="performance-title">LIVE PERFORMANCE</div>
      <div className="performance-connection">
        <span className={connected ? "performance-dot online" : "performance-dot offline"} />
        <span>{connected ? "WEBSOCKET CONNECTED" : "WAITING FOR BACKEND"}</span>
      </div>
      <div className="performance-grid">
        <div className="performance-metric"><span>VEHICLES</span><strong>{Math.round(totalVehicles)}</strong></div>
        <div className="performance-metric"><span>VISIBLE</span><strong>{vehicles.length}</strong></div>
        <div className="performance-metric"><span>QUEUE</span><strong>{Math.round(totalQueue)}</strong></div>
        <div className="performance-metric"><span>WAITING</span><strong>{Math.round(totalWaiting)}s</strong></div>
      </div>
    </div>
  );
}

// STYLES

// ============================================================



function GlobalStyles() {



  return (



    <style>{`



      * {

        box-sizing: border-box;

      }



      html,

      body,

      #root {



        margin: 0;



        width: 100%;

        height: 100%;



        overflow: hidden;



        font-family:

          Inter,

          system-ui,

          -apple-system,

          BlinkMacSystemFont,

          "Segoe UI",

          sans-serif;



        background: #111416;



        color: white;



      }





      body {

        overflow: hidden;

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



        min-height: 86px;



        padding:

          18px 22px;



        border-radius: 18px;



        background:

          linear-gradient(

            135deg,

            rgba(13,18,23,.97),

            rgba(18,23,29,.92)

          );



        border:

          1px solid

          rgba(

            255,

            255,

            255,

            .08

          );



        box-shadow:

          0 12px 35px

          rgba(0,0,0,.32),

          inset 0 1px 0 rgba(255,255,255,.035);



        display: flex;



        align-items: center;



        justify-content:

          space-between;



        backdrop-filter:

          blur(12px);



      }





      .header-title-block { min-width: 0; }

      .header-eyebrow {
        margin-bottom: 5px;
        color: #58d68d;
        font-size: 8px;
        font-weight: 900;
        letter-spacing: .16em;
      }

      .header h1 {



        margin: 0;



        font-size: 25px;



        font-weight: 800;



      }





      .header p {



        margin:

          5px 0 0;



        color: #8995a3;



        font-size: 13px;



      }





      .header p span {

        color: #596572;

      }





      .live-indicator,

      .offline-indicator {



        display: flex;



        align-items: center;



        gap: 9px;



        padding:

          8px 15px;



        border-radius: 999px;



        font-size: 12px;



        font-weight: 800;



      }





      .live-indicator {



        color: #00e889;



        background:

          rgba(

            0,

            225,

            135,

            .08

          );



        border:

          1px solid

          rgba(

            0,

            225,

            135,

            .25

          );



      }





      .offline-indicator {



        color: #ff6262;



        background:

          rgba(

            255,

            60,

            60,

            .08

          );



      }





      .live-dot {



        width: 7px;

        height: 7px;



        border-radius: 50%;



        background:

          currentColor;



        box-shadow:

          0 0 10px

          currentColor;



      }





      .kpi-row {



        position: absolute;



        top: 110px;

        left: 22px;



        display: flex;



        gap: 10px;



      }





      .kpi-card {
        min-width: 145px;
        padding: 13px 15px;
        border-radius: 12px;
        background: rgba(10,15,19,.94);
        border: 1px solid rgba(255,255,255,.07);
        box-shadow: 0 8px 24px rgba(0,0,0,.18);
        backdrop-filter: blur(8px);
        transition: transform .18s ease, border-color .18s ease;
      }

      .kpi-card:hover {
        transform: translateY(-2px);
        border-color: rgba(88,214,141,.22);
      }





      .kpi-label {



        font-size: 9px;



        letter-spacing: 1px;



        color: #6f7b88;



        font-weight: 700;



      }





      .kpi-value {



        margin-top: 7px;



        font-size: 20px;



        font-weight: 800;



      }





      .kpi-suffix {



        margin-left: 2px;



        font-size: 12px;



        color: #84909c;



      }





      .agents-panel {



        position: absolute;



        right: 22px;

        bottom: 20px;



        width: 340px;



        padding: 14px;



        border-radius: 18px;



        background:

          rgba(

            8,

            13,

            17,

            .94

          );



        border:

          1px solid

          rgba(

            255,

            255,

            255,

            .08

          );



        box-shadow:

          0 12px 35px

          rgba(

            0,

            0,

            0,

            .36

          );



      }





      .agents-header {



        display: flex;



        justify-content:

          space-between;



        margin:

          0 3px 11px;



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



        grid-template-columns:

          repeat(2,1fr);



        gap: 8px;



      }





      .agent-card {



        padding: 11px;



        border-radius: 11px;



        background:

          rgba(

            19,

            25,

            31,

            .92

          );



        border:

          1px solid

          rgba(

            255,

            255,

            255,

            .06

          );



      }





      .agent-top {



        display: flex;



        align-items: center;



        justify-content:

          space-between;



      }





      .agent-name {



        font-size: 14px;



        font-weight: 800;



      }





      .action-switch,

      .action-hold {



        font-size: 8px;



        font-weight: 900;



        padding:

          4px 7px;



        border-radius: 5px;



      }





      .action-switch {



        color: #ffd000;



        background:

          rgba(

            255,

            208,

            0,

            .10

          );



      }





      .action-hold {



        color: #00e8a0;



        background:

          rgba(

            0,

            232,

            160,

            .10

          );



      }





      .agent-stats {



        display: grid;



        grid-template-columns:

          repeat(3,1fr);



        gap: 5px;



        margin-top: 12px;



      }





      .agent-stats div {



        display: flex;



        flex-direction: column;



        gap: 3px;



      }





      .agent-stats span {



        font-size: 7px;



        color: #697581;



      }





      .agent-stats strong {



        font-size: 12px;



      }





      /* STEP 10 — FINAL LIVE STATUS STRIP */
      .camera-controls-panel {
        position: absolute;
        top: 118px;
        right: 382px;
        width: 175px;
        padding: 10px;
        border-radius: 14px;
        background: rgba(8, 13, 17, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.09);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255,255,255,.035);
        backdrop-filter: blur(10px);
        pointer-events: auto;
        z-index: 80;
      }

      .camera-controls-title {
        margin: 1px 3px 8px;
        color: #7f8b97;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.12em;
      }

      .camera-controls-hint {
        margin: 2px 3px 7px;
        font-size: 8px;
        color: #687582;
        letter-spacing: .04em;
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
        letter-spacing: 0.05em;
        cursor: pointer;
      }

      .camera-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
      }

      .camera-btn.active {
        color: #ffffff;
        background: rgba(0, 232, 160, 0.13);
        border-color: rgba(0, 232, 160, 0.35);
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
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(10px);
        pointer-events: none;
        font-size: 10px;
        letter-spacing: 0.08em;
        color: rgba(235, 240, 245, 0.70);
      }

      .final-status-item {
        display: flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      }

      .final-status-item strong {
        color: rgba(255, 255, 255, 0.94);
        font-weight: 700;
      }

      .final-status-item + .final-status-item {
        padding-left: 10px;
        border-left: 1px solid rgba(255, 255, 255, 0.10);
      }

      .live-performance-panel { position: fixed; z-index: 50; right: 22px; top: 118px; width: 245px; padding: 13px 14px; border-radius: 14px; background: rgba(13,18,23,.93); border: 1px solid rgba(255,255,255,.08); box-shadow: 0 10px 28px rgba(0,0,0,.28); backdrop-filter: blur(10px); pointer-events: none; }
      .performance-title { font-size: 10px; font-weight: 800; letter-spacing: .12em; color: rgba(255,255,255,.92); }
      .performance-connection { display: flex; align-items: center; gap: 6px; margin-top: 5px; font-size: 8px; letter-spacing: .06em; color: #7f8a96; }
      .performance-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
      .performance-dot.online { background: #58d68d; box-shadow: 0 0 8px rgba(88,214,141,.7); }
      .performance-dot.offline { background: #e05b5b; }
      .performance-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 7px; margin-top: 11px; }
      .performance-metric { padding: 8px; border-radius: 9px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.045); }
      .performance-metric span { display: block; font-size: 7px; letter-spacing: .08em; color: #697581; }
      .performance-metric strong { display: block; margin-top: 3px; font-size: 15px; color: rgba(255,255,255,.94); }
      @media (max-width: 900px) { .live-performance-panel { right: 12px; top: 112px; width: 220px; } }

      .dashboard::after {
        content: "REAL-TIME TRAFFIC CONTROL";
        position: absolute;
        left: 50%;
        top: 18px;
        transform: translateX(-50%);
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.06);
        background: rgba(10,15,19,.52);
        color: rgba(255,255,255,.34);
        font-size: 7px;
        font-weight: 800;
        letter-spacing: .16em;
        backdrop-filter: blur(8px);
      }

      @media (max-width: 900px) {
        .dashboard::after { display: none; }
      }

      .status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #58d68d;
        box-shadow: 0 0 10px rgba(88, 214, 141, 0.75);
      }

      @media (max-width: 900px) {
        .final-status-strip {
          left: 12px;
          right: 12px;
          bottom: 12px;
          flex-wrap: wrap;
        }
      }

    `}</style>



  );

}





// ============================================================

// APP

// ============================================================





export default function App() {



  const [

    data,

    setData,

  ] = useState(null);





  const [

    connected,

    setConnected,

  ] = useState(false);



  const socketRef =

    useRef(null);





  const reconnectTimer =

    useRef(null);





  useEffect(() => {



    let cancelled =

      false;





    const connect = () => {



      if (cancelled) {

        return;

      }





      try {



        const socket =

          new WebSocket(

            WS_URL

          );





        socketRef.current =

          socket;





        socket.onopen = () => {



          console.log(

            "Connected to SUMO backend"

          );



          setConnected(

            true

          );



        };





        socket.onmessage = (

          event

        ) => {



          try {



            const incoming =

              JSON.parse(

                event.data

              );



            setData(

              incoming

            );



          } catch (error) {



            console.error(

              "Invalid WebSocket data:",

              error

            );



          }



        };





        socket.onerror = (

          error

        ) => {



          console.error(

            "WebSocket error:",

            error

          );



        };





        socket.onclose = () => {



          setConnected(

            false

          );





          if (!cancelled) {



            reconnectTimer.current =

              setTimeout(

                connect,

                2000

              );



          }



        };



      } catch (error) {



        console.error(

          "WebSocket connection failed:",

          error

        );





        setConnected(

          false

        );





        reconnectTimer.current =

          setTimeout(

            connect,

            2000

          );



      }



    };





    connect();





  return () => {



      cancelled =

        true;





      if (

        reconnectTimer.current

      ) {



        clearTimeout(

          reconnectTimer.current

        );



      }





      if (

        socketRef.current

      ) {



        socketRef.current.close();



      }



    };



  }, []);





  // ==========================================================

  // CAMERA

  // ==========================================================


  return (



    <>



      <GlobalStyles />





      <Canvas



        camera={{ position: [4, 38, 58], fov: 40,
          near: 0.1,
          far: 500,
        }}



        gl={{

          antialias: true,



          powerPreference:

            "high-performance",

        }}



        dpr={[

          1,

          1.5,

        ]}



      >



        <color

          attach="background"

          args={[

            "#15191c",

          ]}

        />





        <fog

          attach="fog"

          args={[

            "#15191c",

            70,

            170,

          ]}

        />





        <TrafficScene

          data={data}

        />
        <OrbitControls
          makeDefault
          enableRotate
          enablePan
          enableZoom
          enableDamping
          dampingFactor={0.06}
          rotateSpeed={0.85}
          panSpeed={1.15}
          zoomSpeed={1.35}
          minDistance={0.5}
          maxDistance={220}
          minPolarAngle={0.05}
          maxPolarAngle={Math.PI - 0.05}
          screenSpacePanning={true}
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
          touches={{
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN,
          }}
        />





      </Canvas>





      <Dashboard

        data={data}

        connected={connected}

      />
<LivePerformancePanel
        data={data}
        connected={connected}
      />


      <div className="final-status-strip">
        <div className="final-status-item">
          <span className="status-dot" />
          <span>SUMO LIVE</span>
        </div>
        <div className="final-status-item">
          <span>CONTROL</span>
          <strong>INDEPENDENT DQN MARL</strong>
        </div>
        <div className="final-status-item">
          <span>INTERSECTIONS</span>
          <strong>4</strong>
        </div>
        <div className="final-status-item">
          <span>TRANSPORT</span>
          <strong>TRACI / WEBSOCKET</strong>
        </div>
      </div>


    </>



  );

}