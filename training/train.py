import sys
import os

sys.path.append(
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..")
    )
)

import pandas as pd

from environment.traffic_env import TrafficEnv
from agents.dqn_agent import DQNAgent

from training.config import (
    EPISODES,
    MAX_STEPS,
    BATCH_SIZE,
    TARGET_UPDATE_FREQUENCY,
    SAVE_FREQUENCY,
    LEARNING_RATE,
    GAMMA,
    EPSILON_START,
    EPSILON_MIN,
    EPSILON_DECAY
)


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
    learning_rate=LEARNING_RATE,
    gamma=GAMMA,
    epsilon=EPSILON_START,
    epsilon_min=EPSILON_MIN,
    epsilon_decay=EPSILON_DECAY
)


os.makedirs("models", exist_ok=True)
os.makedirs("results", exist_ok=True)


training_metrics = []


print("Starting DQN training...")
print("Device:", agent.device)
print("State size:", state_size)
print("Action size:", action_size)


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

        done = terminated or truncated

        agent.remember(
            state,
            action,
            reward,
            next_state,
            done
        )

        loss = agent.train(
            batch_size=BATCH_SIZE
        )

        state = next_state

        total_reward += reward
        total_queue += info["queue_length"]
        total_waiting += info["waiting_time"]

        if done:
            break

    average_queue = total_queue / (step + 1)
    average_waiting = total_waiting / (step + 1)

    training_metrics.append({
        "episode": episode,
        "reward": total_reward,
        "average_queue": average_queue,
        "average_waiting": average_waiting,
        "epsilon": agent.epsilon
    })

    if episode % TARGET_UPDATE_FREQUENCY == 0:

        agent.update_target_network()

    if episode % SAVE_FREQUENCY == 0:

        agent.save(
            f"models/dqn_I1_episode_{episode}.pth"
        )

    print(
        f"Episode: {episode}/{EPISODES}"
        f" | Reward: {total_reward:.2f}"
        f" | Avg Queue: {average_queue:.2f}"
        f" | Avg Waiting: {average_waiting:.2f}"
        f" | Epsilon: {agent.epsilon:.3f}"
    )


agent.save(
    "models/dqn_I1_final.pth"
)


metrics_df = pd.DataFrame(training_metrics)

metrics_df.to_csv(
    "results/training_metrics.csv",
    index=False
)


env.close()


print("Training completed.")
print("Final model saved.")
print("Training metrics saved to results/training_metrics.csv")