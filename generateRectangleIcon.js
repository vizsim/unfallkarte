// generateRectangleIcon.js

const pixelRatio = 2;

/**
 * Generates a rectangle icon dynamically.
 * @param {Object} options
 * @param {string} options.color - Fill color (CSS format)
 * @param {number} [options.width=32] - Width in pixels (CSS pixels)
 * @param {number} [options.height=16] - Height in pixels
 * @returns {Object} Image object with width, height, and ImageData
 */
export function generateRectangleIcon({ color = "#0074D9", width = 32, height = 16 }) {
  const canvas = document.createElement("canvas");
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;

  const ctx = canvas.getContext("2d");

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Optional stroke
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2 * pixelRatio;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  return {
    width,
    height,
    data: ctx.getImageData(0, 0, canvas.width, canvas.height),
  };
}



// setupRectangleIconGeneration.js

export function setupRectangleIconGeneration(map) {
  map.on("styleimagemissing", (e) => {
    const id = e.id;
    if (!id.startsWith("rect-")) return;

    // e.g. id = rect-blue-40x20
    const parts = id.split("-");
    const color = parts[1] || "#0074D9";
    const size = parts[2] || "32x16";
    const [w, h] = size.split("x").map(n => parseInt(n, 10));

    const image = generateRectangleIcon({ color, width: w, height: h });
    if (image) {
      map.addImage(id, image.data, { pixelRatio: 2 });
    }
  });
}
