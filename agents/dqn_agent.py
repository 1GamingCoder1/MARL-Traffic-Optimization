import random
import torch
import torch.nn as nn
import torch.optim as optim

from agents.dqn_network import DQNNetwork
from agents.replay_buffer import ReplayBuffer


class DQNAgent:

    def __init__(
        self,
        state_size,
        action_size,
        learning_rate=0.001,
        gamma=0.99,
        epsilon=1.0,
        epsilon_min=0.05,
        epsilon_decay=0.995
    ):

        self.state_size = state_size
        self.action_size = action_size

        self.gamma = gamma

        self.epsilon = epsilon
        self.epsilon_min = epsilon_min
        self.epsilon_decay = epsilon_decay

        self.device = torch.device(
            "cuda" if torch.cuda.is_available() else "cpu"
        )

        self.policy_network = DQNNetwork(
            state_size,
            action_size
        ).to(self.device)

        self.target_network = DQNNetwork(
            state_size,
            action_size
        ).to(self.device)

        self.target_network.load_state_dict(
            self.policy_network.state_dict()
        )

        self.target_network.eval()

        self.optimizer = optim.Adam(
            self.policy_network.parameters(),
            lr=learning_rate
        )

        self.loss_function = nn.MSELoss()

        self.memory = ReplayBuffer()

    def select_action(self, state):

        if random.random() < self.epsilon:
            return random.randrange(self.action_size)

        state_tensor = torch.FloatTensor(
            state
        ).unsqueeze(0).to(self.device)

        with torch.no_grad():

            q_values = self.policy_network(
                state_tensor
            )

        return q_values.argmax(dim=1).item()

    def remember(
        self,
        state,
        action,
        reward,
        next_state,
        done
    ):

        self.memory.add(
            state,
            action,
            reward,
            next_state,
            done
        )

    def train(self, batch_size=64):

        if len(self.memory) < batch_size:
            return None

        (
            states,
            actions,
            rewards,
            next_states,
            dones
        ) = self.memory.sample(batch_size)

        states = torch.FloatTensor(
            states
        ).to(self.device)

        actions = torch.LongTensor(
            actions
        ).unsqueeze(1).to(self.device)

        rewards = torch.FloatTensor(
            rewards
        ).to(self.device)

        next_states = torch.FloatTensor(
            next_states
        ).to(self.device)

        dones = torch.FloatTensor(
            dones
        ).to(self.device)

        current_q_values = self.policy_network(
            states
        ).gather(
            1,
            actions
        ).squeeze(1)

        with torch.no_grad():

            next_q_values = self.target_network(
                next_states
            ).max(1)[0]

        target_q_values = rewards + (
            self.gamma *
            next_q_values *
            (1 - dones)
        )

        loss = self.loss_function(
            current_q_values,
            target_q_values
        )

        self.optimizer.zero_grad()

        loss.backward()

        self.optimizer.step()

        if self.epsilon > self.epsilon_min:

            self.epsilon *= self.epsilon_decay

            self.epsilon = max(
                self.epsilon,
                self.epsilon_min
            )

        return loss.item()

    def update_target_network(self):

        self.target_network.load_state_dict(
            self.policy_network.state_dict()
        )

    def save(self, path):

        torch.save(
            self.policy_network.state_dict(),
            path
        )

    def load(self, path):

        self.policy_network.load_state_dict(
            torch.load(
                path,
                map_location=self.device
            )
        )

        self.update_target_network()