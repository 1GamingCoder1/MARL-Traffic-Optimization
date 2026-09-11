import sys
import os

sys.path.append(
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../..")
    )
)

from environment.traffic_env import TrafficEnv
from agents.dqn_agent import DQNAgent


env = TrafficEnv(
    "simulation/simulation.sumocfg",
    tls_id="I1",
    use_gui=True
)

state, info = env.reset()

state_size = env.observation_space.shape[0]
action_size = env.action_space.n

agent = DQNAgent(
    state_size,
    action_size
)

print("State size:", state_size)
print("Action size:", action_size)
print("Device:", agent.device)

for step in range(100):

    action = agent.select_action(state)

    next_state, reward, terminated, truncated, info = env.step(
        action
    )

    done = terminated or truncated

    agent.remember(
        state,
        action,
        reward,
        next_state,
        done
    )

    loss = agent.train(batch_size=16)

    print(
        "Step:", step,
        "| Action:", action,
        "| Reward:", round(reward, 2),
        "| Queue:", info["queue_length"],
        "| Epsilon:", round(agent.epsilon, 3),
        "| Loss:", loss
    )

    state = next_state

    if done:
        break
os.makedirs("models", exist_ok=True)

agent.save("models/dqn_I1_test.pth")

print("Model saved successfully.")

env.close()