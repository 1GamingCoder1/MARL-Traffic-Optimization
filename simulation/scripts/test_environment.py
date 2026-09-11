import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from environment.traffic_env import TrafficEnv

env = TrafficEnv(
    "simulation/simulation.sumocfg",
    tls_id="I1",
    use_gui=True
)

state, info = env.reset()

print("Initial state:", state)

for step in range(100):

    action = env.action_space.sample()

    state, reward, terminated, truncated, info = env.step(action)

    print(
        "Step:", step,
        "| State:", state,
        "| Action:", action,
        "| Reward:", reward,
        "| Queue:", info["queue_length"],
        "| Waiting:", round(info["waiting_time"], 2),
        "| Vehicles:", info["vehicle_count"]
    )

    if terminated or truncated:
        break

env.close()