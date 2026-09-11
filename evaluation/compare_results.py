import os
import pandas as pd


fixed_time = {
    "Average Queue Length": 15.48,
    "Average Waiting Time": 252.66,
    "Average Speed": 8.50
}

marl = {
    "Average Queue Length": 8.81,
    "Average Waiting Time": 37.74,
    "Average Speed": 8.94
}


comparison = []

for metric in fixed_time:

    baseline = fixed_time[metric]
    marl_value = marl[metric]

    if metric == "Average Speed":
        improvement = (
            (marl_value - baseline)
            / baseline
        ) * 100

    else:
        improvement = (
            (baseline - marl_value)
            / baseline
        ) * 100

    comparison.append({
        "Metric": metric,
        "Fixed-Time": baseline,
        "MARL": marl_value,
        "Improvement (%)": improvement
    })


df = pd.DataFrame(comparison)


os.makedirs(
    "results",
    exist_ok=True
)


df.to_csv(
    "results/final_comparison.csv",
    index=False
)


print()
print("========================================")
print("       FINAL MARL COMPARISON")
print("========================================")

for _, row in df.iterrows():

    print(
        f"{row['Metric']}:"
        f" Fixed-Time = {row['Fixed-Time']:.2f}"
        f" | MARL = {row['MARL']:.2f}"
        f" | Improvement = "
        f"{row['Improvement (%)']:.2f}%"
    )

print()
print("Results saved to:")
print("results/final_comparison.csv")
print("========================================")