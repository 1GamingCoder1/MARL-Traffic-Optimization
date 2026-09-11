import traci
import time

sumo_cmd = [
    "sumo-gui",
    "-c",
    "simulation/simulation.sumocfg"
]

traci.start(sumo_cmd)

for step in range(1000):
    traci.simulationStep()

    vehicle_ids = traci.vehicle.getIDList()
    vehicle_count = len(vehicle_ids)

    total_speed = 0
    total_waiting = 0
    queue_length = 0

    for vehicle_id in vehicle_ids:
        speed = traci.vehicle.getSpeed(vehicle_id)
        total_speed += speed
        total_waiting += traci.vehicle.getWaitingTime(vehicle_id)

        if speed < 0.1:
            queue_length += 1

    if vehicle_count > 0:
        average_speed = total_speed / vehicle_count
    else:
        average_speed = 0

    print(
        "Step:", step,
        "| Vehicles:", vehicle_count,
        "| Avg Speed:", round(average_speed, 2),
        "| Waiting:", round(total_waiting, 2),
        "| Queue:", queue_length
    )

    traffic_lights = traci.trafficlight.getIDList()

    for tls_id in traffic_lights:
        state = traci.trafficlight.getRedYellowGreenState(tls_id)
        phase = traci.trafficlight.getPhase(tls_id)

        print(
            "  Traffic Light:", tls_id,
            "| Phase:", phase,
            "| State:", state
        )

    time.sleep(0.05)

traci.close()