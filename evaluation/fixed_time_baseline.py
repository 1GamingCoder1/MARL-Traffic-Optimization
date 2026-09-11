import sys
import os

sys.path.append(
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..")
    )
)

import traci
import pandas as pd


SUMO_CFG = "simulation/simulation.sumocfg"

EPISODES = 5
MAX_STEPS = 1000


def get_total_queue():
    total_queue = 0

    for vehicle_id in traci.vehicle.getIDList():
        if traci.vehicle.getSpeed(vehicle_id) < 0.1:
            total_queue += 1

    return total_queue


def get_total_waiting_time():
    total_waiting = 0

    for vehicle_id in traci.vehicle.getIDList():
        total_waiting += traci.vehicle.getWaitingTime(vehicle_id)

    return total_waiting


results = []


for episode in range(1, EPISODES + 1):

    print(f"Starting fixed-time episode {episode}/{EPISODES}")

    if traci.isLoaded():
        traci.close()

    traci.start([
        "sumo",
        "-c",
        SUMO_CFG
    ])

    total_queue = 0
    total_waiting = 0
    total_speed = 0
    total_vehicles = 0

    for step in range(MAX_STEPS):

        traci.simulationStep()

        queue = get_total_queue()
        waiting = get_total_waiting_time()

        vehicle_ids = traci.vehicle.getIDList()

        if vehicle_ids:
            speed = sum(
                traci.vehicle.getSpeed(vehicle_id)
                for vehicle_id in vehicle_ids
            ) / len(vehicle_ids)
        else:
            speed = 0

        total_queue += queue
        total_waiting += waiting
        total_speed += speed
        total_vehicles += len(vehicle_ids)

        if traci.simulation.getMinExpectedNumber() <= 0:
            break

    steps_completed = step + 1

    average_queue = total_queue / steps_completed
    average_waiting = total_waiting / steps_completed
    average_speed = total_speed / steps_completed
    average_vehicles = total_vehicles / steps_completed

    results.append({
        "episode": episode,
        "average_queue": average_queue,
        "average_waiting": average_waiting,
        "average_speed": average_speed,
        "average_vehicles": average_vehicles
    })

    print(
        f"Episode {episode}"
        f" | Avg Queue: {average_queue:.2f}"
        f" | Avg Waiting: {average_waiting:.2f}"
        f" | Avg Speed: {average_speed:.2f} m/s"
    )

    traci.close()


os.makedirs("results", exist_ok=True)

df = pd.DataFrame(results)

df.to_csv(
    "results/fixed_time_results.csv",
    index=False
)


print()
print("========================================")
print("FIXED-TIME BASELINE COMPLETED")
print("========================================")

print(
    f"Average Queue: "
    f"{df['average_queue'].mean():.2f}"
)

print(
    f"Average Waiting Time: "
    f"{df['average_waiting'].mean():.2f}"
)

print(
    f"Average Speed: "
    f"{df['average_speed'].mean():.2f} m/s"
)

print(
    f"Average Vehicles: "
    f"{df['average_vehicles'].mean():.2f}"
)

print()
print("Results saved to:")
print("results/fixed_time_results.csv")