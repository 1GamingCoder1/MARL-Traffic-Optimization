import sys
import os

sys.path.append(
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..")
    )
)

import traci

from environment.traffic_env import MultiTrafficEnv
from agents.dqn_agent import DQNAgent


TLS_IDS = ["I1", "I2", "I3", "I4"]

EPISODES = 5
MAX_STEPS = 1000


env = MultiTrafficEnv(
    "simulation/simulation.sumocfg",
    tls_ids=TLS_IDS,
    use_gui=False
)


state_size = env.observation_space.shape[0]
action_size = env.action_space.n


agents = {}

for tls_id in TLS_IDS:

    agent = DQNAgent(
        state_size=state_size,
        action_size=action_size,
        epsilon=0.0
    )

    model_path = f"models/marl_{tls_id}_final.pth"

    agent.load(model_path)

    agents[tls_id] = agent

    print(f"Loaded model: {model_path}")


episode_results = []


for episode in range(1, EPISODES + 1):

    print()
    print(f"Starting MARL episode {episode}/{EPISODES}")

    states = env.reset()

    total_queue = 0
    total_waiting = 0
    total_speed = 0
    total_vehicles = 0

    for step in range(MAX_STEPS):

        actions = {}

        for tls_id in TLS_IDS:

            actions[tls_id] = agents[tls_id].select_action(
                states[tls_id]
            )

        next_states, reward, terminated, truncated, info = env.step(
            actions
        )

        vehicle_ids = traci.vehicle.getIDList()

        if vehicle_ids:

            average_speed = sum(
                traci.vehicle.getSpeed(vehicle_id)
                for vehicle_id in vehicle_ids
            ) / len(vehicle_ids)

        else:

            average_speed = 0


        total_queue += info["queue_length"]
        total_waiting += info["waiting_time"]
        total_speed += average_speed
        total_vehicles += len(vehicle_ids)

        states = next_states

        if terminated or truncated:
            break


    steps_completed = step + 1

    average_queue = total_queue / steps_completed
    average_waiting = total_waiting / steps_completed
    average_speed = total_speed / steps_completed
    average_vehicles = total_vehicles / steps_completed


    episode_results.append({
        "episode": episode,
        "average_queue": average_queue,
        "average_waiting": average_waiting,
        "average_speed": average_speed,
        "average_vehicles": average_vehicles
    })


    print(
        f"Episode {episode}"
        f" | Avg Queue: {average_queue:.2f}"
        f" | Avg Waiting: {average_waiting:.2f}"
        f" | Avg Speed: {average_speed:.2f} m/s"
    )


env.close()


import pandas as pd

os.makedirs("results", exist_ok=True)

df = pd.DataFrame(episode_results)

df.to_csv(
    "results/marl_evaluation_results.csv",
    index=False
)


print()
print("========================================")
print("MARL EVALUATION COMPLETED")
print("========================================")

print(
    f"Average Queue: "
    f"{df['average_queue'].mean():.2f}"
)

print(
    f"Average Waiting Time: "
    f"{df['average_waiting'].mean():.2f}"
)

print(
    f"Average Speed: "
    f"{df['average_speed'].mean():.2f} m/s"
)

print(
    f"Average Vehicles: "
    f"{df['average_vehicles'].mean():.2f}"
)

print()
print("Results saved to:")
print("results/marl_evaluation_results.csv")