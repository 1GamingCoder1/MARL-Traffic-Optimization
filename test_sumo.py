import os
import traci

sumo_binary = "sumo"

sumo_config = os.path.join(
    os.environ["SUMO_HOME"],
    "data",
    "hello",
    "hello.sumocfg"
)

traci.start([sumo_binary, "-c", sumo_config])

for step in range(100):
    traci.simulationStep()
    print("Simulation step:", step)

traci.close()

print("SUMO + TraCI working successfully!")