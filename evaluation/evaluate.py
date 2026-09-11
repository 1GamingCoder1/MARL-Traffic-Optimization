import sys
import os

sys.path.append(
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..")
    )
)

from environment.traffic_env import TrafficEnv
from agents.dqn_agent import DQNAgent


MODEL_PATH = "models/dqn_I1_final.pth"

EPISODES = 5

MAX_STEPS = 1000


env = TrafficEnv(
    "simulation/simulation.sumocfg",
    tls_id="I1",
    use_gui=False
)


state_size = env.observation_space.shape[0]
action_size = env.action_space.n


agent = DQNAgent(
    state_size=state_size,
    action_size=action_size,
    epsilon=0.0
)


agent.load(MODEL_PATH)


print("Evaluation started.")
print("Model:", MODEL_PATH)
print("Device:", agent.device)


episode_rewards = []
episode_queues = []
episode_waiting = []


for episode in range(1, EPISODES + 1):

    state, info = env.reset()

    total_reward = 0
    total_queue = 0
    total_waiting = 0

    for step in range(MAX_STEPS):

        action = agent.select_action(state)

        next_state, reward, terminated, truncated, info = env.step(
            action
        )

        total_reward += reward
        total_queue += info["queue_length"]
        total_waiting += info["waiting_time"]

        state = next_state

        if terminated or truncated:
            break

    average_queue = total_queue / (step + 1)
    average_waiting = total_waiting / (step + 1)

    episode_rewards.append(total_reward)
    episode_queues.append(average_queue)
    episode_waiting.append(average_waiting)

    print(
        f"Episode: {episode}/{EPISODES}"
        f" | Reward: {total_reward:.2f}"
        f" | Avg Queue: {average_queue:.2f}"
        f" | Avg Waiting: {average_waiting:.2f}"
    )


average_reward = sum(episode_rewards) / len(episode_rewards)
average_queue = sum(episode_queues) / len(episode_queues)
average_waiting = sum(episode_waiting) / len(episode_waiting)


print()
print("========== Evaluation Results ==========")
print(f"Average Reward: {average_reward:.2f}")
print(f"Average Queue Length: {average_queue:.2f}")
print(f"Average Waiting Time: {average_waiting:.2f}")
print("========================================")


env.close()