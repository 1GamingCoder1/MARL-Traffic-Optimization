import os
import subprocess
import time

import gymnasium as gym
import numpy as np
import traci


class MultiTrafficEnv(gym.Env):

    def __init__(
        self,
        sumo_cfg,
        tls_ids,
        min_green=10,
        use_gui=False,
    ):

        super().__init__()

        self.sumo_cfg = os.path.abspath(
            sumo_cfg
        )

        self.tls_ids = list(tls_ids)

        self.min_green = min_green

        self.use_gui = use_gui

        self.sumo_process = None

        self.simulation_time = 0

        self.phase_start_time = {
            tls_id: 0
            for tls_id in self.tls_ids
        }

        self.previous_waiting = {
            tls_id: 0.0
            for tls_id in self.tls_ids
        }

        self.previous_phase = {
            tls_id: 0
            for tls_id in self.tls_ids
        }

        self.incoming_lanes = {}

    # ========================================================
    # START SUMO
    # ========================================================

    def start_sumo(self):

        self.close()

        if not os.path.exists(self.sumo_cfg):

            raise FileNotFoundError(
                f"SUMO configuration not found:\n"
                f"{self.sumo_cfg}"
            )

        if self.use_gui:

            sumo_binary = "sumo-gui"

        else:

            sumo_binary = "sumo"

        command = [
            sumo_binary,
            "-c",
            self.sumo_cfg,
            "--start",
            "--quit-on-end",
            "--step-length",
            "1",
            "--no-step-log",
            "true",
        ]

        print("\nStarting SUMO...")
        print("Command:", " ".join(command))

        traci.start(
            command,
            label="marl_dashboard",
        )

        print("SUMO started successfully.")

        self.simulation_time = 0

        # ----------------------------------------------------
        # Get incoming lanes for each traffic light
        # ----------------------------------------------------

        self.incoming_lanes = {}

        for tls_id in self.tls_ids:

            try:

                lanes = (
                    traci.trafficlight
                    .getControlledLanes(
                        tls_id
                    )
                )

                # Remove duplicates while preserving order
                unique_lanes = list(
                    dict.fromkeys(lanes)
                )

                self.incoming_lanes[tls_id] = (
                    unique_lanes
                )

                print(
                    f"{tls_id}: "
                    f"{len(unique_lanes)} controlled lanes"
                )

            except Exception as e:

                print(
                    f"Could not get lanes for "
                    f"{tls_id}: {e}"
                )

                self.incoming_lanes[tls_id] = []

    # ========================================================
    # RESET
    # ========================================================

    def reset(
        self,
        seed=None,
        options=None,
    ):

        super().reset(seed=seed)

        self.start_sumo()

        # Give SUMO one initial step so vehicles can begin
        # entering the network.
        traci.simulationStep()

        self.simulation_time = 1

        self.phase_start_time = {
            tls_id: self.simulation_time
            for tls_id in self.tls_ids
        }

        self.previous_phase = {}

        self.previous_waiting = {}

        for tls_id in self.tls_ids:

            try:

                phase = (
                    traci.trafficlight
                    .getPhase(
                        tls_id
                    )
                )

            except Exception:

                phase = 0

            self.previous_phase[tls_id] = phase

            self.previous_waiting[tls_id] = (
                self.get_intersection_waiting(
                    tls_id
                )
            )

        states = self.get_all_states()

        return states

    # ========================================================
    # GET QUEUE FOR LANE
    # ========================================================

    def get_lane_queue(
        self,
        lane_id,
    ):

        try:

            return float(
                traci.lane.getLastStepHaltingNumber(
                    lane_id
                )
            )

        except Exception:

            return 0.0

    # ========================================================
    # GET WAITING TIME FOR INTERSECTION
    # ========================================================

    def get_intersection_waiting(
        self,
        tls_id,
    ):

        waiting = 0.0

        lanes = self.incoming_lanes.get(
            tls_id,
            []
        )

        vehicles_seen = set()

        for lane_id in lanes:

            try:

                vehicle_ids = (
                    traci.lane.getLastStepVehicleIDs(
                        lane_id
                    )
                )

                for vehicle_id in vehicle_ids:

                    if vehicle_id in vehicles_seen:
                        continue

                    vehicles_seen.add(
                        vehicle_id
                    )

                    try:

                        waiting += (
                            traci.vehicle
                            .getWaitingTime(
                                vehicle_id
                            )
                        )

                    except Exception:
                        pass

            except Exception:
                pass

        return float(waiting)

    # ========================================================
    # GET INTERSECTION STATE
    # ========================================================

    def get_state(
        self,
        tls_id,
    ):

        lanes = self.incoming_lanes.get(
            tls_id,
            []
        )

        queues = []

        for lane_id in lanes:

            queue = self.get_lane_queue(
                lane_id
            )

            queues.append(queue)

        # ----------------------------------------------------
        # Exactly four queue values
        # ----------------------------------------------------

        if len(queues) >= 4:

            queues = queues[:4]

        else:

            queues += [
                0.0
            ] * (
                4 - len(queues)
            )

        try:

            phase = float(
                traci.trafficlight.getPhase(
                    tls_id
                )
            )

        except Exception:

            phase = 0.0

        state = np.array(
            [
                queues[0],
                queues[1],
                queues[2],
                queues[3],
                phase,
            ],
            dtype=np.float32,
        )

        return state

    # ========================================================
    # GET ALL STATES
    # ========================================================

    def get_all_states(self):

        states = {}

        for tls_id in self.tls_ids:

            states[tls_id] = self.get_state(
                tls_id
            )

        return states

    # ========================================================
    # GET TOTAL QUEUE
    # ========================================================

    def get_total_queue(self):

        total_queue = 0.0

        for tls_id in self.tls_ids:

            lanes = self.incoming_lanes.get(
                tls_id,
                []
            )

            for lane_id in lanes:

                total_queue += (
                    self.get_lane_queue(
                        lane_id
                    )
                )

        return float(total_queue)

    # ========================================================
    # GET TOTAL WAITING
    # ========================================================

    def get_total_waiting(self):

        total_waiting = 0.0

        for tls_id in self.tls_ids:

            total_waiting += (
                self.get_intersection_waiting(
                    tls_id
                )
            )

        return float(total_waiting)

    # ========================================================
    # APPLY ACTION
    # ========================================================

    def apply_action(
        self,
        tls_id,
        action,
    ):

        if action != 1:
            return

        try:

            current_phase = (
                traci.trafficlight.getPhase(
                    tls_id
                )
            )

            current_time = (
                self.simulation_time
            )

            phase_duration = (
                current_time
                - self.phase_start_time.get(
                    tls_id,
                    0
                )
            )

            # ------------------------------------------------
            # Minimum green time
            # ------------------------------------------------

            if phase_duration < self.min_green:

                return

            logic = (
                traci.trafficlight.getAllProgramLogics(
                    tls_id
                )
            )

            if not logic:

                return

            program = logic[0]

            phase_count = len(
                program.phases
            )

            if phase_count <= 1:

                return

            next_phase = (
                current_phase + 1
            ) % phase_count

            traci.trafficlight.setPhase(
                tls_id,
                next_phase
            )

            self.phase_start_time[
                tls_id
            ] = current_time

        except Exception as e:

            print(
                f"Action error for {tls_id}: {e}"
            )

    # ========================================================
    # STEP
    # ========================================================

    def step(
        self,
        actions,
    ):

        if not traci.isLoaded():

            raise RuntimeError(
                "TraCI is not connected."
            )

        # ----------------------------------------------------
        # Apply all four agent actions
        # ----------------------------------------------------

        for tls_id in self.tls_ids:

            action = actions.get(
                tls_id,
                0
            )

            self.apply_action(
                tls_id,
                action
            )

        # ----------------------------------------------------
        # Advance SUMO
        # ----------------------------------------------------

        traci.simulationStep()

        self.simulation_time += 1

        # ----------------------------------------------------
        # New states
        # ----------------------------------------------------

        next_states = (
            self.get_all_states()
        )

        # ----------------------------------------------------
        # Calculate global metrics
        # ----------------------------------------------------

        current_queue = (
            self.get_total_queue()
        )

        current_waiting = (
            self.get_total_waiting()
        )

        # ----------------------------------------------------
        # Global reward
        #
        # Lower queue and waiting time is better.
        # ----------------------------------------------------

        waiting_change = (
            current_waiting
            - sum(
                self.previous_waiting.values()
            )
        )

        global_reward = -(
            current_queue
            + 0.1 * waiting_change
        )

        # ----------------------------------------------------
        # Give every independent agent the same global reward
        # ----------------------------------------------------

        rewards = {
            tls_id: float(global_reward)
            for tls_id in self.tls_ids
        }

        # ----------------------------------------------------
        # Update previous waiting
        # ----------------------------------------------------

        for tls_id in self.tls_ids:

            self.previous_waiting[
                tls_id
            ] = self.get_intersection_waiting(
                tls_id
            )

        # ----------------------------------------------------
        # Check simulation end
        # ----------------------------------------------------

        try:

            min_expected = (
                traci.simulation
                .getMinExpectedNumber()
            )

        except Exception:

            min_expected = 0

        try:

            current_time = (
                traci.simulation
                .getTime()
            )

            end_time = (
                traci.simulation
                .getEndTime()
            )

        except Exception:

            current_time = (
                self.simulation_time
            )

            end_time = 3600

        done = (
            min_expected <= 0
            or current_time >= end_time
        )

        info = {
            "queue": current_queue,
            "waiting": current_waiting,
            "vehicle_count": len(
                traci.vehicle.getIDList()
            ),
            "simulation_time": current_time,
            "reward": global_reward,
        }

        return (
            next_states,
            rewards,
            done,
            info,
        )

    # ========================================================
    # CLOSE
    # ========================================================

    def close(self):

        try:

            if traci.isLoaded():

                traci.close()

        except Exception:
            pass

        self.sumo_process = None