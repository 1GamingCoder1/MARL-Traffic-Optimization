import sys
import os

sys.path.append(
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../..")
    )
)
from environment.traffic_env import TrafficEnv
from gymnasium.utils.env_checker import check_env

env = TrafficEnv(
    "simulation/simulation.sumocfg",
    tls_id="I1",
    use_gui=False
)

check_env(env)

env.close()

print("Environment check completed")