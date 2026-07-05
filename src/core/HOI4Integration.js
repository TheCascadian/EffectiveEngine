export class HOI4GameLogReader {
  constructor() {
    this.fileHandle = null;
    this.lastPosition = 0;
    this.eventListeners = new Map();
    this.isRunning = false;
  }

  async initialize() {
    try {
      // Request access to game.log file
      // User will need to navigate to:
      // Documents/Paradox Interactive/Hearts of Iron IV/logs/game.log
      this.fileHandle = await window.showOpenFilePicker({
        types: [
          {
            description: "Game Log",
            accept: { "text/plain": [".log"] },
          },
        ],
        multiple: false,
      });

      this.startMonitoring();
      console.log("HOI4 Integration: Connected to game.log");
    } catch (err) {
      console.error("HOI4 Integration: Failed to access game.log", err);
    }
  }

  async startMonitoring() {
    this.isRunning = true;
    while (this.isRunning) {
      await this.checkForUpdates();
      await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms polling
    }
  }

  async checkForUpdates() {
    try {
      const file = await this.fileHandle.getFile();
      if (file.size > this.lastPosition) {
        const blob = file.slice(this.lastPosition);
        const text = await blob.text();
        this.parseLogEntries(text);
        this.lastPosition = file.size;
      }
    } catch (err) {
      console.error("Error reading log:", err);
    }
  }

  parseLogEntries(text) {
    const lines = text.split("\n");

    for (const line of lines) {
      // Parse terrain export
      if (line.includes("[voxel_terrain_export_start]")) {
        this.parseTerrainData(lines);
      }
      // Parse unit export
      else if (line.includes("[voxel_units_export_start]")) {
        this.parseUnitData(lines);
      }
      // Parse battle data
      else if (line.match(/\[voxel_battle_.*_data_start\]/)) {
        this.parseBattleData(line, lines);
      }
    }
  }

  parseTerrainData(lines) {
    const terrainData = [];
    for (const line of lines) {
      if (line.includes("[voxel_terrain_export_end]")) break;

      const match = line.match(/\[state_(\d+)\]_terrain:(.+)/);
      if (match) {
        terrainData.push({
          stateId: match[1],
          terrain: match[2],
        });
      }
    }

    this.emit("gameStateUpdate", {
      type: "terrain",
      data: terrainData,
    });
  }

  parseUnitData(lines) {
    const units = [];
    for (const line of lines) {
      if (line.includes("[voxel_units_export_end]")) break;

      const match = line.match(/\[unit\]_state:(\d+)_strength:(\d+)/);
      if (match) {
        units.push({
          stateId: match[1],
          strength: parseInt(match[2]),
        });
      }
    }

    this.emit("gameStateUpdate", {
      type: "units",
      units: units,
    });
  }

  parseBattleData(startLine, allLines) {
    const battleId = startLine.match(/\[voxel_battle_(.+?)_data_start\]/)[1];
    const battleData = { id: battleId };

    // Parse battle-specific data
    // ... implementation depends on your data format

    this.emit("gameStateUpdate", {
      type: "battle",
      battleData: battleData,
    });
  }

  onGameStateUpdate(callback) {
    this.eventListeners.set("gameStateUpdate", callback);
  }

  emit(event, data) {
    const callback = this.eventListeners.get(event);
    if (callback) {
      callback(data);
    }
  }

  stop() {
    this.isRunning = false;
  }
}
