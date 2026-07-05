const http = require("http");
const fs = require("fs");
const path = require("path");

// --- CONFIGURATION ---
const HOI4_HEIGHTMAP_PATH =
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Hearts of Iron IV\\map\\heightmap.bmp";
const HOI4_TERRAIN_PATH =
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Hearts of Iron IV\\map\\terrain.bmp";

function parseHOI4Maps() {
  console.log("Parsing HOI4 Heightmap...");
  const hBuffer = fs.readFileSync(HOI4_HEIGHTMAP_PATH);
  const hPixelOffset = hBuffer.readUInt32LE(10);
  const width = hBuffer.readUInt32LE(18);
  const height = hBuffer.readUInt32LE(22);
  const hBits = hBuffer.readUInt16LE(28);
  const hBytesPerPixel = hBits / 8;
  const hRowSize = Math.floor((width * hBytesPerPixel + 3) / 4) * 4;
  const heightData = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const bmpRow = height - 1 - y;
    const rowStart = hPixelOffset + bmpRow * hRowSize;
    for (let x = 0; x < width; x++) {
      heightData[y * width + x] = hBuffer[rowStart + x * hBytesPerPixel + 2]; // Red channel
    }
  }

  console.log("Parsing HOI4 Terrain...");
  const tBuffer = fs.readFileSync(HOI4_TERRAIN_PATH);
  const tPixelOffset = tBuffer.readUInt32LE(10);
  const tWidth = tBuffer.readUInt32LE(18);
  const tHeight = tBuffer.readUInt32LE(22);
  const tBits = tBuffer.readUInt16LE(28);

  if (tBits !== 8) throw new Error("terrain.bmp is not 8-bit indexed!");

  // Read the 8-bit color palette
  const paletteStart = 54;
  const paletteSize = (tPixelOffset - paletteStart) / 4;
  const palette = [];
  for (let i = 0; i < paletteSize; i++) {
    const offset = paletteStart + i * 4;
    palette.push({
      b: tBuffer[offset],
      g: tBuffer[offset + 1],
      r: tBuffer[offset + 2],
    });
  }

  const tRowSize = Math.floor((tWidth + 3) / 4) * 4;
  const mapW = Math.min(width, tWidth);
  const mapH = Math.min(height, tHeight);
  const biomeData = new Uint8Array(mapW * mapH);

  for (let y = 0; y < mapH; y++) {
    const tBmpRow = tHeight - 1 - y;
    const tRowStart = tPixelOffset + tBmpRow * tRowSize;
    for (let x = 0; x < mapW; x++) {
      const idx = tBuffer[tRowStart + x];
      const color = palette[idx];
      biomeData[y * mapW + x] = mapColorToEngineBiome(color);
    }
  }

  // Combine into a single interleaved buffer (Height, Biome, Height, Biome...)
  const combined = Buffer.alloc(mapW * mapH * 2);
  for (let i = 0; i < mapW * mapH; i++) {
    combined[i * 2] = heightData[i];
    combined[i * 2 + 1] = biomeData[i];
  }

  console.log(`✅ Parsed Map: ${mapW}x${mapH}`);
  return { width: mapW, height: mapH, data: combined };
}

function mapColorToEngineBiome(color) {
  const { r, g, b } = color;
  if (b > 150 && b > r && b > g) return 0; // Ocean/Water
  if (r > 200 && g > 200 && b > 200) return 6; // Snow/Alpine
  if (r > 150 && g > 150 && b < 100) return 1; // Desert
  if (g > 100 && g > r && g > b && r < 100) return 3; // Forest
  if (g > 80 && g > b) return 3; // Plains
  if (r > 100 && g > 80 && b < 80) return 2; // Hills/Savannah
  if (r < 100 && g < 100 && b < 100) return 6; // Mountain/Stone
  return 3; // Default Plains
}

let cachedMap = null;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/hoi4_map.bin") {
    if (!cachedMap) {
      try {
        cachedMap = parseHOI4Maps();
      } catch (err) {
        console.error(err);
        res.writeHead(500);
        res.end("Failed to parse HOI4 maps. Check paths and file formats.");
        return;
      }
    }
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "X-Width": cachedMap.width,
      "X-Height": cachedMap.height,
    });
    res.end(cachedMap.data);
    return;
  }

  // Serve static files
  let filePath = req.url === "/" ? "/index.html" : req.url;
  filePath = path.join(__dirname, filePath.split("?")[0]);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
    } else {
      const ext = path.extname(filePath);
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
      };
      res.writeHead(200, { "Content-Type": types[ext] || "text/plain" });
      res.end(data);
    }
  });
});

server.listen(5500, "127.0.0.1", () => {
  console.log("Server running at http://127.0.0.1:5500");
});
