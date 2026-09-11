import sys
import os

sys.path.append(
    os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            ".."
        )
    )
)

import pandas as pd

from environment.traffic_env import MultiTrafficEnv
from agents.dqn_agent import DQNAgent


TLS_IDS = [
    "I1",
    "I2",
    "I3",
    "I4"
]

EPISODES = 75
MAX_STEPS = 1000

BATCH_SIZE = 64

TARGET_UPDATE_FREQUENCY = 5
SAVE_FREQUENCY = 25

LEARNING_RATE = 0.0005
GAMMA = 0.99

EPSILON_START = 1.0
EPSILON_MIN = 0.05
EPSILON_DECAY = 0.99995


env = MultiTrafficEnv(
    "simulation/simulation.sumocfg",
    tls_ids=TLS_IDS,
    use_gui=False,
    min_green=10
)


state_size = env.observation_space.shape[0]
action_size = env.action_space.n


agents = {}


for tls_id in TLS_IDS:

    agents[tls_id] = DQNAgent(
        state_size=state_size,
        action_size=action_size,
        learning_rate=LEARNING_RATE,
        gamma=GAMMA,
        epsilon=EPSILON_START,
        epsilon_min=EPSILON_MIN,
        epsilon_decay=EPSILON_DECAY
    )

    print(
        f"Agent created for {tls_id}"
    )

    print(
        f"Device: {agents[tls_id].device}"
    )


os.makedirs(
    "models",
    exist_ok=True
)

os.makedirs(
    "results",
    exist_ok=True
)


training_metrics = []


print()
print("========================================")
print("   IMPROVED INDEPENDENT DQN MARL")
print("========================================")
print(
    "Intersections:",
    TLS_IDS
)
print(
    "Episodes:",
    EPISODES
)
print(
    "Maximum steps:",
    MAX_STEPS
)
print(
    "Minimum green:",
    "10 seconds"
)
print(
    "State size:",
    state_size
)
print(
    "Action size:",
    action_size
)
print("========================================")
print()


for episode in range(
    1,
    EPISODES + 1
):

    states = env.reset()

    total_reward = 0.0
    total_queue = 0.0
    total_waiting = 0.0

    losses = {
        tls_id: []
        for tls_id in TLS_IDS
    }


    for step in range(
        MAX_STEPS
    ):

        actions = {}


        for tls_id in TLS_IDS:

            actions[tls_id] = (
                agents[tls_id].select_action(
                    states[tls_id]
                )
            )


        (
            next_states,
            reward,
            terminated,
            truncated,
            info
        ) = env.step(actions)


        done = (
            terminated
            or truncated
        )


        for tls_id in TLS_IDS:

            agents[tls_id].remember(
                states[tls_id],
                actions[tls_id],
                reward,
                next_states[tls_id],
                done
            )


            loss = agents[tls_id].train(
                batch_size=BATCH_SIZE
            )


            if loss is not None:

                losses[tls_id].append(
                    loss
                )


        states = next_states


        total_reward += reward

        total_queue += (
            info["queue_length"]
        )

        total_waiting += (
            info["waiting_time"]
        )


        if done:
            break


    steps_completed = step + 1


    average_queue = (
        total_queue
        / steps_completed
    )


    average_waiting = (
        total_waiting
        / steps_completed
    )


    average_losses = {}


    for tls_id in TLS_IDS:

        if losses[tls_id]:

            average_losses[tls_id] = (
                sum(losses[tls_id])
                / len(losses[tls_id])
            )

        else:

            average_losses[tls_id] = 0.0


    training_metrics.append({

        "episode": episode,

        "reward": total_reward,

        "average_queue":
            average_queue,

        "average_waiting":
            average_waiting,

        "loss_I1":
            average_losses["I1"],

        "loss_I2":
            average_losses["I2"],

        "loss_I3":
            average_losses["I3"],

        "loss_I4":
            average_losses["I4"],

        "epsilon_I1":
            agents["I1"].epsilon,

        "epsilon_I2":
            agents["I2"].epsilon,

        "epsilon_I3":
            agents["I3"].epsilon,

        "epsilon_I4":
            agents["I4"].epsilon
    })


    if (
        episode
        % TARGET_UPDATE_FREQUENCY
        == 0
    ):

        for tls_id in TLS_IDS:

            agents[tls_id].update_target_network()


    if (
        episode
        % SAVE_FREQUENCY
        == 0
    ):

        for tls_id in TLS_IDS:

            agents[tls_id].save(
                f"models/"
                f"marl_{tls_id}_episode_"
                f"{episode}.pth"
            )


    print(
        f"Episode: "
        f"{episode}/{EPISODES}"
        f" | Reward: "
        f"{total_reward:.2f}"
        f" | Avg Queue: "
        f"{average_queue:.2f}"
        f" | Avg Waiting: "
        f"{average_waiting:.2f}"
    )

    print(
        f"  I1 ε="
        f"{agents['I1'].epsilon:.3f}"
        f" | I2 ε="
        f"{agents['I2'].epsilon:.3f}"
        f" | I3 ε="
        f"{agents['I3'].epsilon:.3f}"
        f" | I4 ε="
        f"{agents['I4'].epsilon:.3f}"
    )


for tls_id in TLS_IDS:

    agents[tls_id].save(
        f"models/marl_{tls_id}_final.pth"
    )


metrics_df = pd.DataFrame(
    training_metrics
)


metrics_df.to_csv(
    "results/marl_training_metrics.csv",
    index=False
)


env.close()


print()
print("========================================")
print(" IMPROVED MARL TRAINING COMPLETED")
print("========================================")

print(
    "Models saved in: models/"
)

print(
    "Metrics saved in:"
)

print(
    "results/marl_training_metrics.csv"
)

print("========================================")