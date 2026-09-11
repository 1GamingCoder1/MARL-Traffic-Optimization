import os

import pandas as pd
import matplotlib.pyplot as plt


os.makedirs("results/plots", exist_ok=True)

data = pd.read_csv(
    "results/training_metrics.csv"
)


plt.figure(figsize=(10, 5))

plt.plot(
    data["episode"],
    data["reward"]
)

plt.xlabel("Episode")
plt.ylabel("Reward")
plt.title("DQN Training Reward")

plt.grid(True)

plt.savefig(
    "results/plots/reward.png",
    dpi=300,
    bbox_inches="tight"
)

plt.show()


plt.figure(figsize=(10, 5))

plt.plot(
    data["episode"],
    data["average_queue"]
)

plt.xlabel("Episode")
plt.ylabel("Average Queue Length")
plt.title("Average Queue Length During Training")

plt.grid(True)

plt.savefig(
    "results/plots/queue_length.png",
    dpi=300,
    bbox_inches="tight"
)

plt.show()


plt.figure(figsize=(10, 5))

plt.plot(
    data["episode"],
    data["average_waiting"]
)

plt.xlabel("Episode")
plt.ylabel("Average Waiting Time")
plt.title("Average Waiting Time During Training")

plt.grid(True)

plt.savefig(
    "results/plots/waiting_time.png",
    dpi=300,
    bbox_inches="tight"
)

plt.show()


plt.figure(figsize=(10, 5))

plt.plot(
    data["episode"],
    data["epsilon"]
)

plt.xlabel("Episode")
plt.ylabel("Epsilon")
plt.title("Epsilon Decay")

plt.grid(True)

plt.savefig(
    "results/plots/epsilon.png",
    dpi=300,
    bbox_inches="tight"
)

plt.show()


print("Training plots generated successfully.")