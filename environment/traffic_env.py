import os
import sys
import traci
import numpy as np
import gymnasium as gym
from gymnasium import spaces

if "SUMO_HOME" in os.environ:
    tools = os.path.join(os.environ["SUMO_HOME"], "tools")
    sys.path.append(tools)
else:
    raise EnvironmentError("SUMO_HOME environment variable is not set")


class TrafficEnv(gym.Env):

    def __init__(self, sumo_cfg, tls_id="I1", use_gui=True):
        super().__init__()

        self.sumo_cfg = sumo_cfg
        self.tls_id = tls_id
        self.use_gui = use_gui

        self.action_space = spaces.Discrete(2)

        self.observation_space = spaces.Box(
            low=np.array([0, 0, 0, 0, 0], dtype=np.float32),
            high=np.array([1000, 1000, 1000, 1000, 100], dtype=np.float32),
            dtype=np.float32
        )

        self.sumo_cmd = [
            "sumo-gui" if self.use_gui else "sumo",
            "-c",
            self.sumo_cfg
        ]

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)

        if traci.isLoaded():
            traci.close()

        traci.start(self.sumo_cmd)

        observation = self._get_state()

        return observation, {}

    def step(self, action):

        if action == 1:
            current_phase = traci.trafficlight.getPhase(self.tls_id)
            next_phase = current_phase + 1

            phase_count = len(
                traci.trafficlight.getAllProgramLogics(
                    self.tls_id
                )[0].phases
            )

            next_phase = next_phase % phase_count

            traci.trafficlight.setPhase(
                self.tls_id,
                next_phase
            )

        traci.simulationStep()

        observation = self._get_state()

        reward = self._get_reward()

        terminated = traci.simulation.getMinExpectedNumber() <= 0

        truncated = False

        info = {
            "queue_length": self._get_total_queue(),
            "waiting_time": self._get_total_waiting_time(),
            "vehicle_count": traci.vehicle.getIDCount()
        }

        return observation, reward, terminated, truncated, info

    def _get_state(self):

        phase = traci.trafficlight.getPhase(self.tls_id)

        controlled_lanes = traci.trafficlight.getControlledLanes(
            self.tls_id
        )

        queues = []

        unique_lanes = []

        for lane in controlled_lanes:
            if lane not in unique_lanes:
                unique_lanes.append(lane)

        for lane in unique_lanes[:4]:

            vehicle_ids = traci.lane.getLastStepVehicleIDs(lane)

            queue = 0

            for vehicle_id in vehicle_ids:
                speed = traci.vehicle.getSpeed(vehicle_id)

                if speed < 0.1:
                    queue += 1

            queues.append(queue)

        while len(queues) < 4:
            queues.append(0)

        state = np.array(
            queues[:4] + [phase],
            dtype=np.float32
        )

        return state

    def _get_total_queue(self):

        total_queue = 0

        vehicle_ids = traci.vehicle.getIDList()

        for vehicle_id in vehicle_ids:

            speed = traci.vehicle.getSpeed(vehicle_id)

            if speed < 0.1:
                total_queue += 1

        return total_queue

    def _get_total_waiting_time(self):

        total_waiting = 0

        vehicle_ids = traci.vehicle.getIDList()

        for vehicle_id in vehicle_ids:

            total_waiting += traci.vehicle.getWaitingTime(
                vehicle_id
            )

        return total_waiting

    def _get_reward(self):

        queue = self._get_total_queue()

        return -float(queue)

    def close(self):

        if traci.isLoaded():
            traci.close()