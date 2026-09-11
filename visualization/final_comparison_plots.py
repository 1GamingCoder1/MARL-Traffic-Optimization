import os
import pandas as pd
import matplotlib.pyplot as plt


df = pd.read_csv(
    "results/final_comparison.csv"
)


os.makedirs(
    "results/plots",
    exist_ok=True
)


metrics = [
    (
        "Average Queue Length",
        "Queue Length",
        "queue_comparison.png"
    ),
    (
        "Average Waiting Time",
        "Waiting Time (seconds)",
        "waiting_comparison.png"
    ),
    (
        "Average Speed",
        "Speed (m/s)",
        "speed_comparison.png"
    )
]


for metric, ylabel, filename in metrics:

    row = df[
        df["Metric"] == metric
    ].iloc[0]

    labels = [
        "Fixed-Time",
        "MARL"
    ]

    values = [
        row["Fixed-Time"],
        row["MARL"]
    ]

    plt.figure(
        figsize=(8, 5)
    )

    plt.bar(
        labels,
        values
    )

    plt.title(
        f"{metric}: Fixed-Time vs MARL"
    )

    plt.ylabel(ylabel)

    plt.tight_layout()

    plt.savefig(
        f"results/plots/{filename}",
        dpi=300
    )

    plt.close()


print()
print("Final comparison plots generated.")

print(
    "Saved in:"
)

print(
    "results/plots/"
)