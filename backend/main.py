import sys
import os
import asyncio
import json


# ============================================================
# PROJECT ROOT
# ============================================================

PROJECT_ROOT = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# SUMO / TRACI
# ============================================================

import traci


# ============================================================
# FASTAPI
# ============================================================

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware


# ============================================================
# ENVIRONMENT
# ============================================================

from environment.realistic_traffic_env import (
    RealisticTrafficEnv
)


# ============================================================
# DQN AGENT
# ============================================================

from agents.dqn_agent import DQNAgent


# ============================================================
# CONFIGURATION
# ============================================================

SUMO_CONFIG = os.path.join(
    PROJECT_ROOT,
    "simulation",
    "realistic_config",
    "realistic.sumocfg"
)

MODEL_DIR = os.path.join(
    PROJECT_ROOT,
    "models"
)

TLS_IDS = [
    "I1",
    "I2",
    "I3",
    "I4"
]

STATE_SIZE = 5
ACTION_SIZE = 2

SIMULATION_END = 3600

# ============================================================
# TRAFFIC LIGHT CONTROL
# ============================================================
#
# The generated SUMO network uses a 4-phase program:
#   0 -> GREEN  (42 s)
#   1 -> YELLOW (3 s)
#   2 -> GREEN  (42 s)
#   3 -> YELLOW (3 s)
#
# The MARL action is therefore a REQUEST TO SWITCH, not a
# request to jump directly to the next arbitrary phase.
#
# A switch is accepted only from a green phase after at least
# 10 seconds of green. SUMO then completes yellow naturally.
# ============================================================

MIN_GREEN_SECONDS = 10.0

# ============================================================
# SUMO -> THREE.JS COORDINATES
# ============================================================

SUMO_OFFSET_X = 600.0
SUMO_OFFSET_Y = 850.0
RENDER_SCALE = 0.08


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="MARL Traffic Optimization API"
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# GLOBAL STATE
# ============================================================

env = None

agents = {}

last_actions = {
    tls_id: 0
    for tls_id in TLS_IDS
}

last_rewards = {
    tls_id: 0.0
    for tls_id in TLS_IDS
}

previous_queues = {
    tls_id: 0.0
    for tls_id in TLS_IDS
}


# ============================================================
# CREATE DQN AGENTS
# ============================================================

def create_agents():

    global agents

    agents = {}

    print()
    print("Loading MARL models...")

    for tls_id in TLS_IDS:

        agent = DQNAgent(
            state_size=STATE_SIZE,
            action_size=ACTION_SIZE,
            epsilon=0.0
        )

        model_path = os.path.join(
            MODEL_DIR,
            f"marl_{tls_id}_final.pth"
        )

        if os.path.exists(model_path):

            try:

                agent.load(
                    model_path
                )

                print(
                    f"Loaded model: {tls_id}"
                )

            except Exception as error:

                print(
                    f"WARNING: Could not load "
                    f"{tls_id}: {error}"
                )

        else:

            print(
                f"WARNING: Model not found: "
                f"{model_path}"
            )

        agents[tls_id] = agent

    print()


# ============================================================
# SUMO -> THREE.JS
# ============================================================

def sumo_to_render(
    x,
    y
):

    render_x = (
        float(x)
        - SUMO_OFFSET_X
    ) * RENDER_SCALE

    render_z = -(
        float(y)
        - SUMO_OFFSET_Y
    ) * RENDER_SCALE

    return (
        render_x,
        render_z
    )


# ============================================================
# VEHICLE DATA
# ============================================================

def get_vehicle_data():

    vehicles = []

    try:

        vehicle_ids = (
            traci.vehicle.getIDList()
        )

    except Exception:

        return vehicles


    for vehicle_id in vehicle_ids:

        try:

            # ------------------------------------------------
            # Actual SUMO position
            # ------------------------------------------------

            x, y = (
                traci.vehicle.getPosition(
                    vehicle_id
                )
            )

            # ------------------------------------------------
            # Actual SUMO angle
            # ------------------------------------------------

            angle = (
                traci.vehicle.getAngle(
                    vehicle_id
                )
            )

            # ------------------------------------------------
            # Lane
            # ------------------------------------------------

            lane_id = (
                traci.vehicle.getLaneID(
                    vehicle_id
                )
            )

            lane_position = (
                traci.vehicle.getLanePosition(
                    vehicle_id
                )
            )

            lane_index = (
                traci.vehicle.getLaneIndex(
                    vehicle_id
                )
            )

            # ------------------------------------------------
            # Vehicle type
            # ------------------------------------------------

            vehicle_type = (
                traci.vehicle.getTypeID(
                    vehicle_id
                )
            )

            # ------------------------------------------------
            # Speed
            # ------------------------------------------------

            speed = (
                traci.vehicle.getSpeed(
                    vehicle_id
                )
            )

            # ------------------------------------------------
            # Road
            # ------------------------------------------------

            road_id = (
                traci.vehicle.getRoadID(
                    vehicle_id
                )
            )

            # ------------------------------------------------
            # Convert coordinates
            # ------------------------------------------------

            render_x, render_z = (
                sumo_to_render(
                    x,
                    y
                )
            )

            vehicles.append({

                "id": vehicle_id,

                "type": vehicle_type,

                "x": float(x),

                "y": float(y),

                "renderX": float(
                    render_x
                ),

                "renderZ": float(
                    render_z
                ),

                "angle": float(
                    angle
                ),

                "speed": float(
                    speed
                ),

                "lane": lane_id,

                "lanePosition": float(
                    lane_position
                ),

                "laneIndex": int(
                    lane_index
                ),

                "road": road_id,

            })

        except Exception:
            continue


    return vehicles


# ============================================================
# TRAFFIC LIGHT DATA
# ============================================================

def get_traffic_light_data():

    traffic_lights = []

    for tls_id in TLS_IDS:

        try:

            phase = int(
                traci.trafficlight.getPhase(
                    tls_id
                )
            )

            state = (
                traci.trafficlight.getRedYellowGreenState(
                    tls_id
                )
            )

            next_switch = float(
                traci.trafficlight.getNextSwitch(
                    tls_id
                )
            )

            # Read the actual SUMO phase duration so the
            # frontend can display accurate timing.
            logic = (
                traci.trafficlight.getAllProgramLogics(
                    tls_id
                )
            )

            phase_duration = 0.0

            if logic and logic[0].phases:
                if 0 <= phase < len(logic[0].phases):
                    phase_duration = float(
                        logic[0].phases[phase].duration
                    )

            current_time = float(
                traci.simulation.getTime()
            )

            phase_elapsed = max(
                0.0,
                phase_duration
                - max(
                    0.0,
                    next_switch - current_time
                )
            )

            traffic_lights.append({

                "id": tls_id,

                "phase": phase,

                "redYellowGreenState":
                    state,

                "nextSwitch":
                    next_switch,

                "phaseDuration":
                    phase_duration,

                "phaseElapsed":
                    phase_elapsed,

                "phaseRemaining":
                    max(
                        0.0,
                        next_switch - current_time
                    ),

            })

        except Exception:
            continue


    return traffic_lights


# ============================================================
# GET INTERSECTION STATE
# ============================================================

def get_intersection_state(
    tls_id
):

    if env is None:
        return None

    try:

        state = env.get_state(
            tls_id
        )

        queue = env.get_queue(
            tls_id
        )

        waiting = env.get_waiting_time(
            tls_id
        )

        vehicles = env.get_vehicle_count(
            tls_id
        )

        return {
            "state": [
                float(value)
                for value in state
            ],
            "queue": float(queue),
            "waiting": float(waiting),
            "vehicles": int(vehicles),
        }

    except Exception:

        return None


# ============================================================
# APPLY MARL ACTION
# ============================================================

def apply_action(
    tls_id,
    action
):

    try:

        # ----------------------------------------------------
        # HOLD
        # ----------------------------------------------------

        if action == 0:
            return


        # ----------------------------------------------------
        # READ THE ACTUAL SUMO SIGNAL PROGRAM
        # ----------------------------------------------------

        current_phase = int(
            traci.trafficlight.getPhase(
                tls_id
            )
        )

        logic = (
            traci.trafficlight.getAllProgramLogics(
                tls_id
            )
        )

        if not logic or not logic[0].phases:
            return

        phases = logic[0].phases

        if current_phase < 0 or current_phase >= len(phases):
            return


        # ----------------------------------------------------
        # THIS NETWORK HAS:
        #
        # Phase 0 = GREEN
        # Phase 1 = YELLOW
        # Phase 2 = GREEN
        # Phase 3 = YELLOW
        #
        # We NEVER jump directly from GREEN to the opposite
        # GREEN. A SWITCH request first enters YELLOW.
        # SUMO then automatically continues to the next GREEN.
        # ----------------------------------------------------

        if current_phase not in (0, 2):
            # Currently in yellow. Let SUMO finish the
            # complete 3-second yellow phase.
            return


        # ----------------------------------------------------
        # RESPECT MINIMUM GREEN TIME
        # ----------------------------------------------------

        current_time = float(
            traci.simulation.getTime()
        )

        next_switch = float(
            traci.trafficlight.getNextSwitch(
                tls_id
            )
        )

        current_duration = float(
            phases[current_phase].duration
        )

        phase_elapsed = (
            current_duration
            - max(
                0.0,
                next_switch - current_time
            )
        )

        # Never cut a green phase before the minimum green
        # interval used by the MARL environment.
        if phase_elapsed < MIN_GREEN_SECONDS:
            return


        # ----------------------------------------------------
        # SWITCH:
        #
        # Phase 0 -> Phase 1 (YELLOW)
        # Phase 2 -> Phase 3 (YELLOW)
        #
        # SUMO automatically continues:
        # Phase 1 -> Phase 2
        # Phase 3 -> Phase 0
        # ----------------------------------------------------

        yellow_phase = current_phase + 1

        if yellow_phase >= len(phases):
            yellow_phase = 1 if current_phase == 0 else 3

        traci.trafficlight.setPhase(
            tls_id,
            yellow_phase
        )

    except Exception as error:

        print(
            f"Traffic light action error "
            f"{tls_id}: {error}"
        )


# ============================================================
# MARL DATA
# ============================================================

def get_marl_data():

    marl = []

    for tls_id in TLS_IDS:

        try:

            result = (
                get_intersection_state(
                    tls_id
                )
            )

            if result is None:
                continue

            marl.append({

                "id": tls_id,

                "state":
                    result["state"],

                "action":
                    "SWITCH"
                    if last_actions[
                        tls_id
                    ] == 1
                    else "HOLD",

                "queue":
                    result["queue"],

                "waiting":
                    result["waiting"],

                "vehicles":
                    result["vehicles"],

                "reward":
                    last_rewards[
                        tls_id
                    ],

            })

        except Exception:
            continue


    return marl


# ============================================================
# LIVE DATA
# ============================================================

def create_live_data():

    try:

        simulation_time = (
            traci.simulation.getTime()
        )

    except Exception:

        simulation_time = 0.0


    return {

        "simulationTime":
            float(
                simulation_time
            ),

        "vehicles":
            get_vehicle_data(),

        "trafficLights":
            get_traffic_light_data(),

        "marl":
            get_marl_data(),

    }


# ============================================================
# ROOT ENDPOINT
# ============================================================

@app.get("/")
def root():

    return {

        "status": "running",

        "project":
            "MARL Traffic Optimization",

        "simulation":
            "SUMO",

        "controller":
            "Independent DQN MARL",

    }


# ============================================================
# WEBSOCKET
# ============================================================

@app.websocket(
    "/ws/simulation"
)
async def simulation_websocket(
    websocket: WebSocket
):

    global env

    global last_actions

    global last_rewards

    global previous_queues


    await websocket.accept()

    print()
    print(
        "Frontend connected."
    )


    try:

        # ====================================================
        # CREATE ENVIRONMENT
        # ====================================================

        env = RealisticTrafficEnv(

            sumo_cfg=SUMO_CONFIG,

            use_gui=True,

            min_green=10

        )


        # ====================================================
        # CREATE AGENTS
        # ====================================================

        create_agents()


        # ====================================================
        # START SUMO
        # ====================================================

        print(
            "Starting SUMO..."
        )

        print(
            "Mode: GUI"
        )


        env.reset()


        print(
            "SUMO connected successfully."
        )

        print(
            "SUMO simulation started."
        )


        # ====================================================
        # RESET VALUES
        # ====================================================

        last_actions = {
            tls_id: 0
            for tls_id in TLS_IDS
        }

        last_rewards = {
            tls_id: 0.0
            for tls_id in TLS_IDS
        }

        previous_queues = {
            tls_id: 0.0
            for tls_id in TLS_IDS
        }


        # ====================================================
        # SIMULATION LOOP
        # ====================================================

        while True:

            # ------------------------------------------------
            # Get current SUMO time
            # ------------------------------------------------

            try:

                current_time = (
                    traci.simulation.getTime()
                )

            except Exception as error:

                print(
                    "Could not read SUMO time:",
                    error
                )

                break


            # ------------------------------------------------
            # End condition
            # ------------------------------------------------

            if current_time >= SIMULATION_END:

                print(
                    "Simulation reached "
                    f"{SIMULATION_END} seconds."
                )

                break


            # =================================================
            # SELECT ACTION FOR EACH AGENT
            # =================================================

            selected_actions = {}


            for tls_id in TLS_IDS:

                try:

                    state = (
                        env.get_state(
                            tls_id
                        )
                    )

                    action = (
                        agents[tls_id]
                        .select_action(
                            state
                        )
                    )

                    action = int(
                        action
                    )

                    if action not in [0, 1]:

                        action = 0

                    selected_actions[
                        tls_id
                    ] = action

                    last_actions[
                        tls_id
                    ] = action

                except Exception as error:

                    print(
                        f"Agent error "
                        f"{tls_id}: {error}"
                    )

                    selected_actions[
                        tls_id
                    ] = 0

                    last_actions[
                        tls_id
                    ] = 0


            # =================================================
            # APPLY TRAFFIC LIGHT ACTIONS
            # =================================================

            for tls_id in TLS_IDS:

                apply_action(
                    tls_id,
                    selected_actions[
                        tls_id
                    ]
                )


            # =================================================
            # ADVANCE SUMO
            #
            # THIS IS THE IMPORTANT FIX.
            #
            # SUMO advances exactly one simulation step here.
            # =================================================

            try:

                traci.simulationStep()

            except Exception as error:

                print(
                    "SUMO simulation step error:",
                    error
                )

                break


            # =================================================
            # CALCULATE REWARDS
            # =================================================

            for tls_id in TLS_IDS:

                try:

                    current_queue = float(
                        env.get_queue(
                            tls_id
                        )
                    )

                    current_waiting = float(
                        env.get_waiting_time(
                            tls_id
                        )
                    )

                    queue_change = (
                        current_queue
                        -
                        previous_queues[
                            tls_id
                        ]
                    )

                    reward = -(
                        current_queue
                        +
                        0.05
                        *
                        max(
                            queue_change,
                            0
                        )
                    )

                    last_rewards[
                        tls_id
                    ] = float(
                        reward
                    )

                    previous_queues[
                        tls_id
                    ] = current_queue

                except Exception:

                    last_rewards[
                        tls_id
                    ] = 0.0


            # =================================================
            # SEND LIVE DATA
            # =================================================

            try:

                live_data = (
                    create_live_data()
                )

                await websocket.send_text(
                    json.dumps(
                        live_data
                    )
                )

            except Exception as error:

                print(
                    "WebSocket send error:",
                    error
                )

                break


            # =================================================
            # FRONTEND UPDATE RATE
            # =================================================

            await asyncio.sleep(
                0.05
            )


    except Exception as error:

        print()
        print(
            "WebSocket error:"
        )

        print(
            error
        )


    finally:

        print()
        print(
            "Closing SUMO..."
        )


        try:

            if env is not None:

                env.close()

        except Exception as error:

            print(
                "Error closing SUMO:",
                error
            )


        env = None


        print(
            "SUMO closed."
        )


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(

        app,

        host="127.0.0.1",

        port=8000

    )