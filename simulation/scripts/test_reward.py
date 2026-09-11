import sys
import os

sys.path.append(
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../..")
    )
)
from environment.traffic_env import TrafficEnv

env = TrafficEnv(
    "simulation/simulation.sumocfg",
    tls_id="I1",
    use_gui=True
)

state, _ = env.reset()

total_reward = 0

for step in range(100):

    action = 0

    state, reward, terminated, truncated, info = env.step(action)

    total_reward += reward

    print(
        "Step:", step,
        "| Queue:", info["queue_length"],
        "| Reward:", reward
    )

    if terminated or truncated:
        break

print("Total reward:", total_reward)

env.close()