import sys
import os
import asyncio
import json
import random

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
# ENVIRONMENT & AGENT
# ============================================================

from environment.realistic_traffic_env import RealisticTrafficEnv
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

REALISTIC_MODEL_DIR = os.path.join(
    PROJECT_ROOT,
    "models",
    "realistic"
)

TLS_IDS = ["I1", "I2", "I3", "I4"]

STATE_SIZE = 5
ACTION_SIZE = 2
SIMULATION_END = 3600
MIN_GREEN_SECONDS = 10.0

# SUMO -> THREE.JS COORDINATES
SUMO_OFFSET_X = 600.0
SUMO_OFFSET_Y = 850.0
RENDER_SCALE = 0.08

# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(title="MARL Traffic Optimization API")

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

last_actions = {tls_id: 0 for tls_id in TLS_IDS}
last_rewards = {tls_id: 0.0 for tls_id in TLS_IDS}
previous_queues = {tls_id: 0.0 for tls_id in TLS_IDS}

# Interactive Simulation Controls
sim_state = {
    "paused": False,
    "speed_multiplier": 1.0,
    "control_mode": "MARL",  # "MARL" or "FIXED"
    "arrived_total": 0,
    "departed_total": 0,
    "surge_counter": 0,
}

# ============================================================
# CREATE DQN AGENTS
# ============================================================

def create_agents():
    global agents
    agents = {}
    print("\nLoading MARL models...")

    for tls_id in TLS_IDS:
        agent = DQNAgent(
            state_size=STATE_SIZE,
            action_size=ACTION_SIZE,
            epsilon=0.0
        )

        # Check both models/realistic/ and models/
        candidate_paths = [
            os.path.join(REALISTIC_MODEL_DIR, f"marl_{tls_id}_final.pth"),
            os.path.join(MODEL_DIR, f"marl_{tls_id}_final.pth"),
        ]

        loaded = False
        for model_path in candidate_paths:
            if os.path.exists(model_path):
                try:
                    agent.load(model_path)
                    agent.epsilon = 0.0
                    print(f"Loaded model for {tls_id}: {model_path}")
                    loaded = True
                    break
                except Exception as error:
                    print(f"WARNING: Could not load {model_path}: {error}")

        if not loaded:
            print(f"WARNING: No trained model found for {tls_id}, using initialized network.")

        agents[tls_id] = agent
    print()

# ============================================================
# SUMO -> THREE.JS
# ============================================================

def sumo_to_render(x, y):
    render_x = (float(x) - SUMO_OFFSET_X) * RENDER_SCALE
    render_z = -(float(y) - SUMO_OFFSET_Y) * RENDER_SCALE
    return render_x, render_z

# ============================================================
# VEHICLE DATA (WITH BRAKE, SIGNALS, ACCEL & WAITING)
# ============================================================

def get_vehicle_data():
    vehicles = []
    try:
        vehicle_ids = traci.vehicle.getIDList()
    except Exception:
        return vehicles

    for vehicle_id in vehicle_ids:
        try:
            x, y = traci.vehicle.getPosition(vehicle_id)
            angle = traci.vehicle.getAngle(vehicle_id)
            lane_id = traci.vehicle.getLaneID(vehicle_id)
            lane_position = traci.vehicle.getLanePosition(vehicle_id)
            lane_index = traci.vehicle.getLaneIndex(vehicle_id)
            vehicle_type = traci.vehicle.getTypeID(vehicle_id)
            speed = traci.vehicle.getSpeed(vehicle_id)
            road_id = traci.vehicle.getRoadID(vehicle_id)

            # Extended telemetry for visual quality & inspector
            try:
                accel = float(traci.vehicle.getAcceleration(vehicle_id))
            except Exception:
                accel = 0.0

            try:
                waiting_time = float(traci.vehicle.getWaitingTime(vehicle_id))
            except Exception:
                waiting_time = 0.0

            try:
                signals_mask = int(traci.vehicle.getSignals(vehicle_id))
            except Exception:
                signals_mask = 0

            # SUMO vehicle signal bitmask:
            # Bit 0 (1) = blinker right
            # Bit 1 (2) = blinker left
            # Bit 3 (8) = brake light
            blinker_right = bool(signals_mask & 1)
            blinker_left = bool(signals_mask & 2)
            braking = bool(signals_mask & 8) or (speed < 0.4) or (accel < -0.8)

            render_x, render_z = sumo_to_render(x, y)

            vehicles.append({
                "id": vehicle_id,
                "type": vehicle_type,
                "x": float(x),
                "y": float(y),
                "renderX": float(render_x),
                "renderZ": float(render_z),
                "angle": float(angle),
                "speed": float(speed),
                "accel": round(accel, 2),
                "waiting": round(waiting_time, 1),
                "braking": braking,
                "blinkerLeft": blinker_left,
                "blinkerRight": blinker_right,
                "lane": lane_id,
                "lanePosition": float(lane_position),
                "laneIndex": int(lane_index),
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
            phase = int(traci.trafficlight.getPhase(tls_id))
            state = traci.trafficlight.getRedYellowGreenState(tls_id)
            next_switch = float(traci.trafficlight.getNextSwitch(tls_id))
            logic = traci.trafficlight.getAllProgramLogics(tls_id)

            phase_duration = 0.0
            if logic and logic[0].phases:
                if 0 <= phase < len(logic[0].phases):
                    phase_duration = float(logic[0].phases[phase].duration)

            current_time = float(traci.simulation.getTime())
            phase_elapsed = max(
                0.0,
                phase_duration - max(0.0, next_switch - current_time)
            )

            traffic_lights.append({
                "id": tls_id,
                "phase": phase,
                "redYellowGreenState": state,
                "nextSwitch": next_switch,
                "phaseDuration": phase_duration,
                "phaseElapsed": round(phase_elapsed, 1),
                "phaseRemaining": round(max(0.0, next_switch - current_time), 1),
            })
        except Exception:
            continue

    return traffic_lights

# ============================================================
# GET INTERSECTION STATE
# ============================================================

def get_intersection_state(tls_id):
    if env is None:
        return None
    try:
        state = env.get_state(tls_id)
        queue = env.get_queue(tls_id)
        waiting = env.get_waiting_time(tls_id)
        vehicles = env.get_vehicle_count(tls_id)

        return {
            "state": [round(float(value), 3) for value in state],
            "queue": float(queue),
            "waiting": float(waiting),
            "vehicles": int(vehicles),
        }
    except Exception:
        return None

# ============================================================
# APPLY MARL ACTION
# ============================================================

def apply_action(tls_id, action):
    try:
        if action == 0:
            return

        current_phase = int(traci.trafficlight.getPhase(tls_id))
        logic = traci.trafficlight.getAllProgramLogics(tls_id)

        if not logic or not logic[0].phases:
            return

        phases = logic[0].phases
        if current_phase < 0 or current_phase >= len(phases):
            return

        # Only switch from a green phase (0 or 2) into yellow (1 or 3)
        if current_phase not in (0, 2):
            return

        current_time = float(traci.simulation.getTime())
        next_switch = float(traci.trafficlight.getNextSwitch(tls_id))
        current_duration = float(phases[current_phase].duration)

        phase_elapsed = current_duration - max(0.0, next_switch - current_time)

        if phase_elapsed < MIN_GREEN_SECONDS:
            return

        yellow_phase = current_phase + 1
        if yellow_phase >= len(phases):
            yellow_phase = 1 if current_phase == 0 else 3

        traci.trafficlight.setPhase(tls_id, yellow_phase)

    except Exception as error:
        print(f"Traffic light action error {tls_id}: {error}")

# ============================================================
# SPAWN TRAFFIC SURGE (INTERACTIVE FEATURE)
# ============================================================

def spawn_traffic_surge(target="ALL"):
    try:
        routes = traci.route.getIDList()
        if not routes:
            return

        vtypes = ["car", "car", "car", "bus", "truck"]
        chosen_routes = list(routes)
        if target in TLS_IDS:
            filtered = [r for r in routes if target in r]
            if filtered:
                chosen_routes = filtered

        for _ in range(12):
            sim_state["surge_counter"] += 1
            vid = f"surge_{sim_state['surge_counter']}"
            route_id = random.choice(chosen_routes)
            vtype = random.choice(vtypes)
            try:
                traci.vehicle.add(
                    vehID=vid,
                    routeID=route_id,
                    typeID=vtype,
                    depart="now",
                    departLane="best",
                    departSpeed="max"
                )
            except Exception:
                pass
    except Exception as e:
        print("Surge spawn error:", e)

# ============================================================
# MARL DATA
# ============================================================

def get_marl_data():
    marl = []
    tls_info = {item["id"]: item for item in get_traffic_light_data()}

    for tls_id in TLS_IDS:
        try:
            result = get_intersection_state(tls_id)
            if result is None:
                continue

            tl = tls_info.get(tls_id, {})

            marl.append({
                "id": tls_id,
                "state": result["state"],
                "action": (
                    "FIXED"
                    if sim_state["control_mode"] == "FIXED"
                    else ("SWITCH" if last_actions[tls_id] == 1 else "HOLD")
                ),
                "queue": result["queue"],
                "waiting": result["waiting"],
                "vehicles": result["vehicles"],
                "reward": round(last_rewards[tls_id], 2),
                "phase": tl.get("phase", 0),
                "phaseElapsed": tl.get("phaseElapsed", 0.0),
                "phaseDuration": tl.get("phaseDuration", 42.0),
            })
        except Exception:
            continue

    return marl

# ============================================================
# LIVE DATA
# ============================================================

def create_live_data():
    try:
        simulation_time = float(traci.simulation.getTime())
    except Exception:
        simulation_time = 0.0

    vehicles = get_vehicle_data()
    avg_speed = (
        sum(v["speed"] for v in vehicles) / len(vehicles)
        if vehicles else 0.0
    )

    return {
        "simulationTime": simulation_time,
        "paused": sim_state["paused"],
        "speedMultiplier": sim_state["speed_multiplier"],
        "controlMode": sim_state["control_mode"],
        "arrivedTotal": sim_state["arrived_total"],
        "averageSpeed": round(avg_speed, 2),
        "vehicleCount": len(vehicles),
        "vehicles": vehicles,
        "trafficLights": get_traffic_light_data(),
        "marl": get_marl_data(),
    }

# ============================================================
# HANDLE CLIENT COMMANDS
# ============================================================

def handle_client_command(message_text):
    global last_actions, last_rewards, previous_queues
    try:
        payload = json.loads(message_text)
        cmd = payload.get("cmd", "")

        if cmd == "toggle_pause":
            sim_state["paused"] = not sim_state["paused"]

        elif cmd == "set_speed":
            val = float(payload.get("value", 1.0))
            sim_state["speed_multiplier"] = max(0.25, min(val, 8.0))

        elif cmd == "set_mode":
            mode = str(payload.get("value", "MARL")).upper()
            if mode in ("MARL", "FIXED"):
                sim_state["control_mode"] = mode

        elif cmd == "surge":
            target = payload.get("target", "ALL")
            spawn_traffic_surge(target)

        elif cmd == "reset":
            if env is not None:
                env.reset()
                sim_state["arrived_total"] = 0
                sim_state["departed_total"] = 0
                last_actions = {tls_id: 0 for tls_id in TLS_IDS}
                last_rewards = {tls_id: 0.0 for tls_id in TLS_IDS}
                previous_queues = {tls_id: 0.0 for tls_id in TLS_IDS}

    except Exception as e:
        print("Command parse error:", e)

# ============================================================
# ROOT ENDPOINT
# ============================================================

@app.get("/")
def root():
    return {
        "status": "running",
        "project": "MARL Traffic Optimization",
        "simulation": "SUMO",
        "controller": sim_state["control_mode"],
    }

# ============================================================
# WEBSOCKET
# ============================================================

@app.websocket("/ws/simulation")
async def simulation_websocket(websocket: WebSocket):
    global env, last_actions, last_rewards, previous_queues

    await websocket.accept()
    print("\nFrontend connected.")

    try:
        env = RealisticTrafficEnv(
            sumo_cfg=SUMO_CONFIG,
            use_gui=True,
            min_green=10
        )

        create_agents()

        print("Starting SUMO...")
        env.reset()
        print("SUMO simulation started.")

        sim_state["paused"] = False
        sim_state["arrived_total"] = 0
        sim_state["departed_total"] = 0

        last_actions = {tls_id: 0 for tls_id in TLS_IDS}
        last_rewards = {tls_id: 0.0 for tls_id in TLS_IDS}
        previous_queues = {tls_id: 0.0 for tls_id in TLS_IDS}

        while True:
            # 1. Process any incoming frontend UI commands (non-blocking)
            try:
                while True:
                    msg = await asyncio.wait_for(
                        websocket.receive_text(),
                        timeout=0.001
                    )
                    handle_client_command(msg)
            except asyncio.TimeoutError:
                pass
            except Exception:
                break

            # 2. If paused, still stream current state so UI stays responsive
            if sim_state["paused"]:
                live_data = create_live_data()
                await websocket.send_text(json.dumps(live_data))
                await asyncio.sleep(0.1)
                continue

            # 3. Check current SUMO time
            try:
                current_time = traci.simulation.getTime()
            except Exception as error:
                print("Could not read SUMO time:", error)
                break

            if current_time >= SIMULATION_END:
                print(f"Simulation reached {SIMULATION_END} seconds.")
                break

            # 4. Select and apply actions (MARL vs FIXED-TIME)
            selected_actions = {}

            if sim_state["control_mode"] == "MARL":
                for tls_id in TLS_IDS:
                    try:
                        state = env.get_state(tls_id)
                        action = int(agents[tls_id].select_action(state))
                        if action not in (0, 1):
                            action = 0
                        selected_actions[tls_id] = action
                        last_actions[tls_id] = action
                    except Exception as error:
                        print(f"Agent error {tls_id}: {error}")
                        selected_actions[tls_id] = 0
                        last_actions[tls_id] = 0

                for tls_id in TLS_IDS:
                    apply_action(tls_id, selected_actions[tls_id])
            else:
                for tls_id in TLS_IDS:
                    last_actions[tls_id] = 0

            # 5. Advance SUMO one step
            try:
                traci.simulationStep()
                sim_state["arrived_total"] += int(traci.simulation.getArrivedNumber())
                sim_state["departed_total"] += int(traci.simulation.getDepartedNumber())
            except Exception as error:
                print("SUMO simulation step error:", error)
                break

            # 6. Calculate rewards
            for tls_id in TLS_IDS:
                try:
                    current_queue = float(env.get_queue(tls_id))
                    queue_change = current_queue - previous_queues[tls_id]
                    reward = -(current_queue + 0.05 * max(queue_change, 0))
                    last_rewards[tls_id] = float(reward)
                    previous_queues[tls_id] = current_queue
                except Exception:
                    last_rewards[tls_id] = 0.0

            # 7. Send live telemetry packet
            try:
                live_data = create_live_data()
                await websocket.send_text(json.dumps(live_data))
            except Exception as error:
                print("WebSocket send error:", error)
                break

            # 8. Dynamic sleep based on speed multiplier
            base_sleep = 0.05
            sleep_time = max(0.008, base_sleep / max(0.25, sim_state["speed_multiplier"]))
            await asyncio.sleep(sleep_time)

    except Exception as error:
        print("\nWebSocket error:", error)

    finally:
        print("\nClosing SUMO...")
        try:
            if env is not None:
                env.close()
        except Exception as error:
            print("Error closing SUMO:", error)
        env = None
        print("SUMO closed.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
