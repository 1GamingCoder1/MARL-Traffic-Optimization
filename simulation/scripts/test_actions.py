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
    tls_id="I4",
    use_gui=True
)

state, _ = env.reset()

print("Initial:", state)

for i in range(20):

    if i % 2 == 0:
        action = 0
    else:
        action = 1

    state, reward, terminated, truncated, info = env.step(action)

    print(
        "Step:", i,
        "Action:", action,
        "Phase:", state[4],
        "Reward:", reward
    )

    if terminated or truncated:
        break

env.close()