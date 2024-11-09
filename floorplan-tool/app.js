// Initialize Fabric.js canvas
const canvas = new fabric.Canvas('floorPlanCanvas');
let drawingMode = null;
let isDrawing = false;
let currentLine, startX, startY;



// Functions to enable drawing modes
function enableDrawLine() {
    drawingMode = 'line';
}

function enableDrawRect() {
    drawingMode = 'rect';
}

// Clear the canvas (removes all user-added elements)
function clearCanvas() {
    canvas.getObjects().forEach(obj => {
        if (obj !== canvas.backgroundImage) {
            canvas.remove(obj);
        }
    });
}

// Save the canvas as an SVG file
function saveSVG() {
    const svgData = canvas.toSVG();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'floor_plan_with_features.svg';
    link.click();
}

// Draw footprint on the canvas
function drawFootprintOnCanvas(coordinates) {
    const canvasWidth = 800; // Set based on your actual canvas dimensions
    const canvasHeight = 600;

    // Convert lat/lng coordinates to a local coordinate system
    const [minLat, minLng] = [Math.min(...coordinates.map(c => c[0])), Math.min(...coordinates.map(c => c[1]))];
    const scalingFactor = 10000; // Adjust this scaling factor as needed

    const scaledCoords = coordinates.map(([lat, lng]) => [
        (lng - minLng) * scalingFactor, 
        (minLat - lat) * scalingFactor
    ]);

    // Create the footprint polygon on the canvas
    const footprint = new fabric.Polygon(scaledCoords, {
        left: canvasWidth / 2,
        top: canvasHeight / 2,
        fill: 'rgba(0,0,0,0)',
        stroke: 'black',
        strokeWidth: 2,
        selectable: false,
    });

    // Clear any previous drawings and add the footprint
    canvas.clear();
    canvas.add(footprint);
}


// Handle mouse events for drawing
canvas.on('mouse:down', function(o) {
    if (!drawingMode) return;

    const pointer = canvas.getPointer(o.e);
    startX = pointer.x;
    startY = pointer.y;

    if (drawingMode === 'line') {
        // Start drawing a line
        currentLine = new fabric.Line([startX, startY, startX, startY], {
            stroke: 'black',
            strokeWidth: 2,
            selectable: false,
        });
        canvas.add(currentLine);
    } else if (drawingMode === 'rect') {
        // Start drawing a rectangle
        currentLine = new fabric.Rect({
            left: startX,
            top: startY,
            width: 0,
            height: 0,
            fill: 'rgba(0, 0, 255, 0.3)',
            stroke: 'blue',
            strokeWidth: 2,
            selectable: false,
        });
        canvas.add(currentLine);
    }
    isDrawing = true;
});

canvas.on('mouse:move', function(o) {
    if (!isDrawing) return;

    const pointer = canvas.getPointer(o.e);
    if (drawingMode === 'line') {
        // Update line endpoint as the mouse moves
        currentLine.set({ x2: pointer.x, y2: pointer.y });
    } else if (drawingMode === 'rect') {
        // Update rectangle dimensions as the mouse moves
        currentLine.set({
            width: Math.abs(pointer.x - startX),
            height: Math.abs(pointer.y - startY),
            left: pointer.x > startX ? startX : pointer.x,
            top: pointer.y > startY ? startY : pointer.y,
        });
    }
    canvas.renderAll();
});

canvas.on('mouse:up', function() {
    isDrawing = false;
});


function fetchBuildingFootprint(lat, lng) {
    const query = `
        [out:json];
        way(around:50, ${lat}, ${lng})["building"];  // Increase radius here
        (._;>;);
        out body;
    `;
    fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`)
        .then(response => response.json())
        .then(data => {
            const coordinates = extractCoordinates(data);
            if (coordinates) {
                console.log(coordinates);
                drawFootprintOnCanvas(coordinates);
            } else {
                alert("No building found at this location.");
            }
        });
}


function extractCoordinates(data) {
    const nodes = {};
    data.elements.forEach(element => {
        if (element.type === 'node') {
            nodes[element.id] = [element.lat, element.lon];
        }
    });
    const way = data.elements.find(element => element.type === 'way');
    return way ? way.nodes.map(nodeId => nodes[nodeId]) : null;
}
function drawFootprintOnCanvas(coordinates) {
    const canvasWidth = 800;
    const canvasHeight = 600;

    // Estimate UTM zone based on the first coordinate
    const [lat, lng] = coordinates[0];
    const utmZone = Math.floor((lng + 180) / 6) + 1;
    const projString = `+proj=utm +zone=${utmZone} +datum=WGS84 +units=m +no_defs`;

    // Transform coordinates from lat/lng to UTM
    const utmCoords = coordinates.map(([lat, lng]) => {
        const [x, y] = proj4('EPSG:4326', projString, [lng, lat]);
        return [x, y];
    });

    // Determine the reference point (minX, minY) to make all coordinates relative
    const minX = Math.min(...utmCoords.map(c => c[0]));
    const minY = Math.min(...utmCoords.map(c => c[1]));

    // Convert UTM coordinates to local coordinates relative to (minX, minY)
    const relativeCoords = utmCoords.map(([x, y]) => [
        x - minX,   // X-coordinate
        y - minY    // Y-coordinate
    ]);

    // Calculate the bounding box of the rotated coordinates
    const maxX = Math.max(...relativeCoords.map(c => c[0]));
    const maxY = Math.max(...relativeCoords.map(c => c[1]));
    const minRotatedX = Math.min(...relativeCoords.map(c => c[0]));
    const minRotatedY = Math.min(...relativeCoords.map(c => c[1]));
    const footprintWidth = maxX - minRotatedX;
    const footprintHeight = maxY - minRotatedY;

    // Calculate the scaling factor to fit the footprint within the canvas, with padding
    const scaleX = (canvasWidth * 0.9) / footprintWidth;   // 90% of canvas width for padding
    const scaleY = (canvasHeight * 0.9) / footprintHeight; // 90% of canvas height for padding
    const scalingFactor = Math.min(scaleX, scaleY);        // Use the smaller factor to maintain aspect ratio

    // Scale, flip Y-axis, and re-center the coordinates
    const scaledCoords = relativeCoords.map(([x, y]) => [
        (x - minRotatedX) * scalingFactor,
        (maxY - y) * scalingFactor   // Flip Y-axis by subtracting from maxY
    ]);

    // Convert scaled coordinates to Fabric.js format
    const fabricCoords = scaledCoords.map(c => ({ x: c[0], y: c[1] }));

    // Center the footprint on the canvas
    const footprint = new fabric.Polygon(fabricCoords, {
        left: (canvasWidth - footprintWidth * scalingFactor) / 2,  // Center horizontally
        top: (canvasHeight - footprintHeight * scalingFactor) / 2, // Center vertically
        fill: 'rgba(0,0,255,0.3)',
        stroke: 'black',
        strokeWidth: 2,
        selectable: false,
    });

    // Clear any previous drawings and add the footprint
    canvas.clear();
    canvas.add(footprint);
}

