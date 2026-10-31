import sys
import os
import asyncio
import json
import random
import csv

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
try:
    import traci.constants as tc
except Exception:  # Keep the fallback path usable across SUMO Python installs.
    tc = None

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
MAX_TELEMETRY_VEHICLES = 120
VEHICLE_VAR = {
    name: getattr(tc, name, None) if tc is not None else None
    for name in (
        "VAR_POSITION", "VAR_ANGLE", "VAR_LANE_ID", "VAR_LANEPOSITION",
        "VAR_LANE_INDEX", "VAR_TYPE", "VAR_SPEED", "VAR_ROAD_ID",
        "VAR_ACCELERATION", "VAR_WAITING_TIME", "VAR_SIGNALS",
    )
}
VEHICLE_SUBSCRIPTION_VARS = [value for value in VEHICLE_VAR.values() if value is not None]

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
previous_waitings = {tls_id: 0.0 for tls_id in TLS_IDS}
vehicle_subscriptions = set()
live_total_vehicle_count = 0
agent_model_status = {tls_id: False for tls_id in TLS_IDS}
agent_metric_totals = {}
agent_metric_history = []
_last_agent_sample_time = -1.0
_last_agent_history_time = -5.0
intersection_metrics_cache = {}
metrics_cache_time = -1.0


def reset_agent_analytics():
    """Reset per-intersection statistics for the current live SUMO episode."""
    global agent_metric_totals, agent_metric_history
    global _last_agent_sample_time, _last_agent_history_time
    agent_metric_totals = {
        tls_id: {
            "queue_sum": 0.0,
            "waiting_sum": 0.0,
            "vehicles_sum": 0.0,
            "reward_sum": 0.0,
            "switches": 0,
            "samples": 0,
        }
        for tls_id in TLS_IDS
    }
    agent_metric_history = []
    _last_agent_sample_time = -1.0
    _last_agent_history_time = -5.0


def build_agent_comparison():
    comparison = []
    for tls_id in TLS_IDS:
        stats = agent_metric_totals.get(tls_id, {})
        samples = int(stats.get("samples", 0))
        divisor = max(samples, 1)
        comparison.append({
            "id": tls_id,
            "avgQueue": round(stats.get("queue_sum", 0.0) / divisor, 2),
            "avgWaiting": round(stats.get("waiting_sum", 0.0) / divisor, 2),
            "avgVehicles": round(stats.get("vehicles_sum", 0.0) / divisor, 2),
            "avgReward": round(stats.get("reward_sum", 0.0) / divisor, 2),
            "switches": int(stats.get("switches", 0)),
            "switchRate": round(100.0 * stats.get("switches", 0) / divisor, 1),
            "samples": samples,
        })
    return comparison


def record_agent_analytics(simulation_time, marl_rows):
    """Keep measured per-agent metrics and a bounded trend for the analytics page."""
    global _last_agent_sample_time, _last_agent_history_time
    # The scorecard compares the Independent DQN controllers, so fixed-time
    # intervals must not be mixed into agent averages or their trend lines.
    if sim_state["control_mode"] != "MARL":
        return
    if simulation_time <= _last_agent_sample_time:
        return
    _last_agent_sample_time = simulation_time
    by_id = {item.get("id"): item for item in marl_rows}
    for tls_id in TLS_IDS:
        item = by_id.get(tls_id)
        if not item:
            continue
        stats = agent_metric_totals[tls_id]
        stats["queue_sum"] += float(item.get("queue", 0.0))
        stats["waiting_sum"] += float(item.get("waiting", 0.0))
        stats["vehicles_sum"] += float(item.get("vehicles", 0.0))
        stats["reward_sum"] += float(item.get("reward", 0.0))
        stats["switches"] += int(str(item.get("action", "")).upper() == "SWITCH")
        stats["samples"] += 1

    if simulation_time - _last_agent_history_time >= 5.0:
        _last_agent_history_time = simulation_time
        agent_metric_history.append({
            "time": round(float(simulation_time), 1),
            "agents": [
                {
                    "id": item["id"],
                    "queue": float(item.get("queue", 0.0)),
                    "waiting": float(item.get("waiting", 0.0)),
                    "vehicles": int(item.get("vehicles", 0)),
                    "reward": float(item.get("reward", 0.0)),
                }
                for item in marl_rows
            ],
        })
        if len(agent_metric_history) > 240:
            del agent_metric_history[:-240]


reset_agent_analytics()

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
    global agents, agent_model_status
    agents = {}
    agent_model_status = {tls_id: False for tls_id in TLS_IDS}
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
                    agent_model_status[tls_id] = True
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
    """Read vehicle telemetry through SUMO subscriptions to avoid N x TraCI calls."""
    global vehicle_subscriptions, live_total_vehicle_count
    try:
        vehicle_ids = list(traci.vehicle.getIDList())
    except Exception:
        return []

    live_total_vehicle_count = len(vehicle_ids)
    if not vehicle_ids:
        vehicle_subscriptions.clear()
        return []

    # Subscribe newly observed vehicles once. SUMO updates all subscribed values
    # with each simulationStep; removed vehicles disappear from the result map.
    if VEHICLE_SUBSCRIPTION_VARS:
        active_ids = set(vehicle_ids)
        for vehicle_id in active_ids - vehicle_subscriptions:
            try:
                traci.vehicle.subscribe(vehicle_id, VEHICLE_SUBSCRIPTION_VARS)
                vehicle_subscriptions.add(vehicle_id)
            except Exception:
                continue
        vehicle_subscriptions.intersection_update(active_ids)

    try:
        subscription_results = traci.vehicle.getAllSubscriptionResults() or {}
    except Exception:
        subscription_results = {}

    vehicles = []
    # Keep a stable, bounded visual payload. TraCI still simulates every vehicle;
    # only the number sent to the 3D client is capped.
    for vehicle_id in vehicle_ids[:MAX_TELEMETRY_VEHICLES]:
        values = subscription_results.get(vehicle_id) or {}
        try:
            position_key = VEHICLE_VAR["VAR_POSITION"]
            if values and position_key is not None and position_key in values:
                x, y = values[position_key]
                angle = values.get(VEHICLE_VAR["VAR_ANGLE"], 0.0)
                lane_id = values.get(VEHICLE_VAR["VAR_LANE_ID"], "")
                lane_position = values.get(VEHICLE_VAR["VAR_LANEPOSITION"], 0.0)
                lane_index = values.get(VEHICLE_VAR["VAR_LANE_INDEX"], 0)
                vehicle_type = values.get(VEHICLE_VAR["VAR_TYPE"], "car")
                speed = values.get(VEHICLE_VAR["VAR_SPEED"], 0.0)
                road_id = values.get(VEHICLE_VAR["VAR_ROAD_ID"], "")
                accel = values.get(VEHICLE_VAR["VAR_ACCELERATION"], 0.0)
                waiting_time = values.get(VEHICLE_VAR["VAR_WAITING_TIME"], 0.0)
                signals_key = VEHICLE_VAR["VAR_SIGNALS"]
                signals_mask = int(values.get(signals_key, 0)) if signals_key is not None else 0
            else:
                # Compatibility fallback for a just-inserted vehicle or an older
                # TraCI build without subscription support.
                x, y = traci.vehicle.getPosition(vehicle_id)
                angle = traci.vehicle.getAngle(vehicle_id)
                lane_id = traci.vehicle.getLaneID(vehicle_id)
                lane_position = traci.vehicle.getLanePosition(vehicle_id)
                lane_index = traci.vehicle.getLaneIndex(vehicle_id)
                vehicle_type = traci.vehicle.getTypeID(vehicle_id)
                speed = traci.vehicle.getSpeed(vehicle_id)
                road_id = traci.vehicle.getRoadID(vehicle_id)
                try:
                    accel = traci.vehicle.getAcceleration(vehicle_id)
                except Exception:
                    accel = 0.0
                try:
                    waiting_time = traci.vehicle.getWaitingTime(vehicle_id)
                except Exception:
                    waiting_time = 0.0
                try:
                    signals_mask = int(traci.vehicle.getSignals(vehicle_id))
                except Exception:
                    signals_mask = 0

            speed = float(speed)
            accel = float(accel)
            braking = bool(signals_mask & 8) or speed < 0.4 or accel < -0.8
            render_x, render_z = sumo_to_render(x, y)
            vehicles.append({
                "id": vehicle_id,
                "type": str(vehicle_type),
                "x": float(x),
                "y": float(y),
                "renderX": float(render_x),
                "renderZ": float(render_z),
                "angle": float(angle),
                "speed": speed,
                "accel": round(accel, 2),
                "waiting": round(float(waiting_time), 1),
                "braking": braking,
                "blinkerLeft": bool(signals_mask & 2),
                "blinkerRight": bool(signals_mask & 1),
                "lane": str(lane_id),
                "lanePosition": float(lane_position),
                "laneIndex": int(lane_index),
                "road": str(road_id),
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
        current_time = float(traci.simulation.getTime())
        metrics = intersection_metrics_cache.get(tls_id) if metrics_cache_time == current_time else None
        if metrics is None:
            metrics = env.get_metrics(tls_id)
        state = env.get_state(tls_id, metrics=metrics)
        return {
            "state": [round(float(value), 3) for value in state],
            "queue": float(metrics["queue"]),
            "waiting": float(metrics["waiting"]),
            "vehicles": int(metrics["vehicles"]),
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

def get_marl_data(traffic_light_rows=None):
    marl = []
    traffic_light_rows = traffic_light_rows if traffic_light_rows is not None else get_traffic_light_data()
    tls_info = {item["id"]: item for item in traffic_light_rows}

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

    traffic_light_rows = get_traffic_light_data()
    marl_rows = get_marl_data(traffic_light_rows)
    record_agent_analytics(simulation_time, marl_rows)
    return {
        "simulationTime": simulation_time,
        "paused": sim_state["paused"],
        "speedMultiplier": sim_state["speed_multiplier"],
        "controlMode": sim_state["control_mode"],
        "arrivedTotal": sim_state["arrived_total"],
        "averageSpeed": round(avg_speed, 2),
        "vehicleCount": live_total_vehicle_count,
        "vehicles": vehicles,
        "trafficLights": traffic_light_rows,
        "marl": marl_rows,
        "agentComparison": build_agent_comparison(),
        "agentModelStatus": dict(agent_model_status),
        "allAgentModelsLoaded": all(agent_model_status.values()),
    }

# ============================================================
# HANDLE CLIENT COMMANDS
# ============================================================

def handle_client_command(message_text):
    global last_actions, last_rewards, previous_waitings, metrics_cache_time
    global intersection_metrics_cache
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
                previous_waitings = {tls_id: 0.0 for tls_id in TLS_IDS}
                vehicle_subscriptions.clear()
                intersection_metrics_cache.clear()
                metrics_cache_time = -1.0
                reset_agent_analytics()

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


@app.get("/api/analytics")
def analytics_data():
    """Return saved training history; no synthetic/default experiment values are invented."""
    metrics_path = os.path.join(PROJECT_ROOT, "results", "realistic_marl_training_metrics.csv")
    history = []
    if os.path.isfile(metrics_path):
        try:
            with open(metrics_path, "r", newline="", encoding="utf-8-sig") as handle:
                for row in csv.DictReader(handle):
                    parsed = {}
                    for key, value in row.items():
                        if value is None:
                            continue
                        try:
                            parsed[key] = float(value)
                        except (TypeError, ValueError):
                            parsed[key] = value
                    history.append(parsed)
        except (OSError, csv.Error) as error:
            return {"trainingHistory": [], "trainingHistoryError": str(error)}
    return {
        "trainingHistory": history,
        "trainingHistoryAvailable": bool(history),
        "liveAgentComparison": build_agent_comparison(),
        "liveAgentHistory": agent_metric_history,
        "liveSimulationTime": _last_agent_sample_time if _last_agent_sample_time >= 0 else None,
        "liveControlMode": sim_state["control_mode"],
        "agentModelStatus": dict(agent_model_status),
        "allAgentModelsLoaded": all(agent_model_status.values()),
    }

# ============================================================
# WEBSOCKET
# ============================================================

@app.websocket("/ws/simulation")
async def simulation_websocket(websocket: WebSocket):
    global env, last_actions, last_rewards, previous_waitings
    global intersection_metrics_cache, metrics_cache_time

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
        previous_waitings = {tls_id: 0.0 for tls_id in TLS_IDS}
        vehicle_subscriptions.clear()
        intersection_metrics_cache.clear()
        metrics_cache_time = -1.0
        reset_agent_analytics()

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

            # 6. Calculate per-intersection measurements once. The same cache feeds
            # the reward calculation, HUD and analytics payload.
            metrics_cache_time = float(traci.simulation.getTime())
            intersection_metrics_cache = {
                tls_id: env.get_metrics(tls_id) for tls_id in TLS_IDS
            }
            for tls_id in TLS_IDS:
                try:
                    current_queue = float(intersection_metrics_cache[tls_id]["queue"])
                    current_waiting = float(intersection_metrics_cache[tls_id]["waiting"])
                    waiting_change = current_waiting - previous_waitings[tls_id]
                    # Keep deployment reward identical to RealisticTrafficEnv.step()
                    # so live analytics and training history use the same objective.
                    reward = -(current_queue + 0.05 * waiting_change)
                    last_rewards[tls_id] = float(reward)
                    previous_waitings[tls_id] = current_waiting
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
        vehicle_subscriptions.clear()
        print("SUMO closed.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
