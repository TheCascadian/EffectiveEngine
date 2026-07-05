export class HOI4CommandWriter {
  constructor() {
    this.commandFile = null;
    this.commandQueue = [];
  }

  async initialize() {
    try {
      // Create a command file that HOI4 will monitor
      this.commandFile = await window.showSaveFilePicker({
        suggestedName: "voxel_commands.txt",
        types: [
          {
            description: "Text File",
            accept: { "text/plain": [".txt"] },
          },
        ],
      });

      console.log("HOI4 Writer: Ready to send commands");
    } catch (err) {
      console.error("HOI4 Writer: Failed to create command file", err);
    }
  }

  async sendCommand(commandType, data) {
    const command = {
      timestamp: Date.now(),
      type: commandType,
      data: data,
    };

    const commandString = `[voxel_command]_type:${command.type}_data:${JSON.stringify(command.data)}\n`;

    try {
      const writable = await this.commandFile.createWritable();
      await writable.write(commandString);
      await writable.close();

      console.log(`Sent command: ${commandType}`);
    } catch (err) {
      console.error("Failed to write command:", err);
    }
  }

  // Example: Send battle results back to HOI4
  async sendBattleResult(battleId, attackerWins, casualties) {
    await this.sendCommand("battle_result", {
      battle_id: battleId,
      winner: attackerWins ? "attacker" : "defender",
      casualties: casualties,
    });
  }

  // Example: Send unit movement
  async sendUnitMovement(unitId, fromState, toState) {
    await this.sendCommand("unit_movement", {
      unit_id: unitId,
      from: fromState,
      to: toState,
    });
  }
}
