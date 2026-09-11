import sys
import os

sys.path.append(
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../..")
    )
)

from environment.traffic_env import MultiTrafficEnv
from agents.dqn_agent import DQNAgent

TLS_IDS = ["I1", "I2", "I3", "I4"]

env = MultiTrafficEnv(
    "simulation/simulation.sumocfg",
    tls_ids=TLS_IDS,
    use_gui=False
)

state_size = env.observation_space.shape[0]
action_size = env.action_space.n

agents = {
    tls_id: DQNAgent(
        state_size=state_size,
        action_size=action_size,
        epsilon=0.0
    )
    for tls_id in TLS_IDS
}

states = env.reset()

print("MARL test started")
print("Initial states:")

for tls_id in TLS_IDS:
    print(tls_id, states[tls_id])

for step in range(100):

    actions = {}

    for tls_id in TLS_IDS:
        actions[tls_id] = agents[tls_id].select_action(
            states[tls_id]
        )

    next_states, reward, terminated, truncated, info = env.step(actions)

    if step % 10 == 0:
        print(
            f"Step: {step}"
            f" | Actions: {actions}"
            f" | Reward: {reward:.2f}"
            f" | Queue: {info['queue_length']}"
            f" | Vehicles: {info['vehicle_count']}"
        )

    states = next_states

    if terminated or truncated:
        break

env.close()

print()
print("MARL test completed successfully.")