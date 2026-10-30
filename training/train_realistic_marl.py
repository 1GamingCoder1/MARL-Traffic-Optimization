import sys
import os
import csv
import time
import traci

PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..")
)
sys.path.insert(0, PROJECT_ROOT)

from environment.realistic_traffic_env import RealisticTrafficEnv
from agents.dqn_agent import DQNAgent

SUMO_CFG = os.path.join(
    PROJECT_ROOT,
    "simulation",
    "realistic_config",
    "realistic.sumocfg"
)

TLS_IDS = ["I1", "I2", "I3", "I4"]

# FIXED: Matches RealisticTrafficEnv.state_size = 5
STATE_SIZE = 5
ACTION_SIZE = 2

EPISODES = 75
MAX_STEPS = 1000
BATCH_SIZE = 64

LEARNING_RATE = 0.0005
GAMMA = 0.99
EPSILON_START = 1.0
EPSILON_MIN = 0.05
EPSILON_DECAY = 0.995
MIN_GREEN = 10

TARGET_UPDATE_FREQUENCY = 5
SAVE_FREQUENCY = 25

MODELS_DIR = os.path.join(PROJECT_ROOT, "models")
REALISTIC_MODELS_DIR = os.path.join(PROJECT_ROOT, "models", "realistic")
RESULTS_DIR = os.path.join(PROJECT_ROOT, "results")

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(REALISTIC_MODELS_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

env = RealisticTrafficEnv(
    sumo_cfg=SUMO_CFG,
    tls_ids=TLS_IDS,
    use_gui=False,
    min_green=MIN_GREEN
)

agents = {
    tls_id: DQNAgent(
        state_size=STATE_SIZE,
        action_size=ACTION_SIZE,
        learning_rate=LEARNING_RATE,
        gamma=GAMMA,
        epsilon=EPSILON_START,
        epsilon_min=EPSILON_MIN,
        epsilon_decay=EPSILON_DECAY
    )
    for tls_id in TLS_IDS
}

metrics_file = os.path.join(RESULTS_DIR, "realistic_marl_training_metrics.csv")

with open(metrics_file, "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow([
        "episode",
        "reward",
        "average_queue",
        "average_waiting",
        "average_speed",
        "average_vehicles"
    ])

print("\n" + "=" * 70)
print("REALISTIC MARL TRAINING (STATE_SIZE = 5)")
print("=" * 70 + "\n")

start_time = time.time()

for episode in range(1, EPISODES + 1):
    states = env.reset()
    episode_rewards = {tls: 0.0 for tls in TLS_IDS}
    total_queue = 0.0
    total_waiting = 0.0
    total_vehicles = 0.0
    total_speed = 0.0
    steps_completed = 0

    for step in range(MAX_STEPS):
        actions = {
            tls_id: agents[tls_id].select_action(states[tls_id])
            for tls_id in TLS_IDS
        }

        next_states, rewards, done, info = env.step(actions)

        # Collect true average speed across active vehicles
        try:
            veh_ids = traci.vehicle.getIDList()
            step_speed = (
                sum(traci.vehicle.getSpeed(v) for v in veh_ids) / len(veh_ids)
                if veh_ids else 0.0
            )
        except Exception:
            step_speed = 0.0

        total_speed += step_speed

        for tls_id in TLS_IDS:
            agents[tls_id].remember(
                states[tls_id],
                actions[tls_id],
                rewards[tls_id],
                next_states[tls_id],
                done
            )
            episode_rewards[tls_id] += rewards[tls_id]
            total_queue += info[tls_id]["queue"]
            total_waiting += info[tls_id]["waiting"]
            total_vehicles += info[tls_id]["vehicles"]
            agents[tls_id].train(batch_size=BATCH_SIZE)

        states = next_states
        steps_completed += 1

        if done:
            break

    total_reward = sum(episode_rewards.values())
    denominator = max(steps_completed * len(TLS_IDS), 1)
    average_queue = total_queue / denominator
    average_waiting = total_waiting / denominator
    average_vehicles = total_vehicles / denominator
    average_speed = total_speed / max(steps_completed, 1)

    with open(metrics_file, "a", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            episode,
            round(total_reward, 3),
            round(average_queue, 3),
            round(average_waiting, 3),
            round(average_speed, 3),
            round(average_vehicles, 3)
        ])

    print(
        f"Episode {episode:03d}/{EPISODES}"
        f" | Reward: {total_reward:10.2f}"
        f" | Queue: {average_queue:7.2f}"
        f" | Waiting: {average_waiting:9.2f}"
        f" | Speed: {average_speed:5.2f} m/s"
        f" | Epsilon: {agents['I1'].epsilon:.4f}"
    )

    if episode % TARGET_UPDATE_FREQUENCY == 0:
        for tls_id in TLS_IDS:
            agents[tls_id].update_target_network()

    if episode % SAVE_FREQUENCY == 0:
        for tls_id in TLS_IDS:
            agents[tls_id].save(
                os.path.join(REALISTIC_MODELS_DIR, f"marl_{tls_id}_episode_{episode}.pth")
            )

for tls_id in TLS_IDS:
    # Save in both models/realistic/ and models/ so backend/main.py loads seamlessly
    agents[tls_id].save(os.path.join(REALISTIC_MODELS_DIR, f"marl_{tls_id}_final.pth"))
    agents[tls_id].save(os.path.join(MODELS_DIR, f"marl_{tls_id}_final.pth"))

env.close()
print("\nRealistic MARL training completed and models saved!")
