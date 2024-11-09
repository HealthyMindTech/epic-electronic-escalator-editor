// Initialize Fabric.js canvas
const canvas = new fabric.Canvas('floorPlanCanvas');
let drawingMode = null;
let startX, startY;



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

// Open a new tab with the Viewer using the SVG data from the canvas
function openViewer() {
    const svgData = canvas.toSVG();
    const viewerURL = `viewer.html?svg=${encodeURIComponent(svgData)}`;
    window.open(viewerURL, '_blank');
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
// Parameters
const snapThreshold = 30; // Pixels within which snapping will occur
let snappingPoint = null; // Point where snapping happens
let isDrawing = false; // Track drawing state
let currentLine = null; // Current line being drawn

function findClosestPointOnCanvas(x, y) {
    const snapThreshold = 10; // Pixels within which snapping will occur
    let closestPoint = null;
    let minDistance = snapThreshold;

    // Check for snapping on the floorplan polygon
    const polygons = canvas.getObjects('polygon');
    if (polygons.length > 0) {
        const polygon = polygons[0];
        const polygonPoints = polygon.points;
        const offsetX = polygon.left;
        const offsetY = polygon.top;
        const scaleX = polygon.scaleX || 1;
        const scaleY = polygon.scaleY || 1;

        for (let i = 0; i < polygonPoints.length; i++) {
            const start = {
                x: polygonPoints[i].x * scaleX + offsetX,
                y: polygonPoints[i].y * scaleY + offsetY
            };
            const end = {
                x: polygonPoints[(i + 1) % polygonPoints.length].x * scaleX + offsetX,
                y: polygonPoints[(i + 1) % polygonPoints.length].y * scaleY + offsetY
            };

            const closest = getClosestPointOnLine(start, end, { x, y });
            const distance = getDistance(closest, { x, y });

            if (distance < minDistance) {
                minDistance = distance;
                closestPoint = closest;
            }
        }
    }

    // Check for snapping on user-drawn lines, excluding the line in progress
    const lines = canvas.getObjects('line');
    for (const line of lines) {
        if (line === currentLine) continue; // Skip the current line in progress

        const start = { x: line.x1, y: line.y1 };
        const end = { x: line.x2, y: line.y2 };

        const closest = getClosestPointOnLine(start, end, { x, y });
        const distance = getDistance(closest, { x, y });

        if (distance < minDistance) {
            minDistance = distance;
            closestPoint = closest;
        }
    }

    return closestPoint;
}

// Update mouse:move event to use the new snapping function
canvas.on('mouse:move', function (o) {
    const pointer = canvas.getPointer(o.e);
    const { x, y } = pointer;

    // Find the closest point on any line or polygon, excluding the current line
    snappingPoint = findClosestPointOnCanvas(x, y);

    // Provide visual feedback for snapping
    if (snappingPoint) {
        showSnapIndicator(snappingPoint.x, snappingPoint.y);
    } else {
        hideSnapIndicator();
    }

    // Update the endpoint of the line in progress
    if (isDrawing && currentLine) {
        currentLine.set({
            x2: snappingPoint ? snappingPoint.x : x,
            y2: snappingPoint ? snappingPoint.y : y,
        });
        canvas.renderAll();
    }
});


// Start drawing on mouse down
canvas.on('mouse:down', function (o) {
    if (isDrawing) return; // Avoid starting a new line if already drawing

    const pointer = canvas.getPointer(o.e);
    const { x, y } = snappingPoint || pointer;

    // Start a new line from the snapping point or cursor position
    currentLine = new fabric.Line([x, y, x, y], {
        stroke: 'black',
        strokeWidth: 2,
        selectable: false,
    });
    canvas.add(currentLine);
    isDrawing = true; // Set drawing state to true
});

// Finish drawing on mouse up
canvas.on('mouse:up', function (o) {
    if (!isDrawing || !currentLine) return;

    const pointer = canvas.getPointer(o.e);
    const { x, y } = snappingPoint || pointer;

    // Set the endpoint of the current line, snapping if a point is near
    currentLine.set({
        x2: x,
        y2: y,
    });
    canvas.renderAll();

    isDrawing = false; // Reset drawing state
    currentLine = null; // Reset current line
    hideSnapIndicator(); // Hide snapping indicator
});
//



// Helper to calculate the closest point on a line segment to a given point
function getClosestPointOnLine(start, end, point) {
    const lineLengthSquared = getDistanceSquared(start, end);
    if (lineLengthSquared === 0) return start; // Start and end are the same

    // Project point onto the line, clamping to the segment
    let t = ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / lineLengthSquared;
    t = Math.max(0, Math.min(1, t));
    return { x: start.x + t * (end.x - start.x), y: start.y + t * (end.y - start.y) };
}

// Calculate Euclidean distance
function getDistance(p1, p2) {
    return Math.sqrt(getDistanceSquared(p1, p2));
}

// Calculate squared distance (faster for comparisons)
function getDistanceSquared(p1, p2) {
    return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
}

// Visual feedback for snapping
function showSnapIndicator(x, y) {
    const radius = 5; // Radius of the snap indicator

    if (!canvas.snapIndicator) {
        canvas.snapIndicator = new fabric.Circle({
            radius: radius,
            fill: 'red',
            selectable: false,
            evented: false,
        });
        canvas.add(canvas.snapIndicator);
    }

    // Position the center of the circle at (x, y)
    canvas.snapIndicator.set({ left: x - radius, top: y - radius });
    canvas.snapIndicator.setCoords();
    canvas.renderAll();
}


// Hide snap indicator when not needed
function hideSnapIndicator() {
    if (canvas.snapIndicator) {
        canvas.remove(canvas.snapIndicator);
        canvas.snapIndicator = null;
    }
}


// [out:json];
// (
//   // Query buildings with height information
//   way["building"]["height"];
//   relation["building"]["height"];

//   // Query buildings with number of levels (approximate height)
//   way["building"]["building:levels"];
//   relation["building"]["building:levels"];
// );
// out body;
// >;
// out skel qt;

function fetchBuildingFootprint(lat, lng) {
    const query = `
        [out:json];
        way(around:20, ${lat}, ${lng})["building"];  // Increase radius here
        (._;>;);
        out body;
    `;
    fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`)
                .then(response => response.json())
                .then(data => {
                        console.log(data);
                        const coordinates = extractCoordinates(data);
                        const buildingInfo = fetchBuildingInfo(data);
                        if (coordinates) {
                                drawFootprintOnCanvas(buildingInfo, coordinates);
                        } else {
                                alert("No building found at this location.");
                        }
                });
}

function fetchBuildingInfo(data) {
    const way = data.elements.find(element => element.type === 'way');
    if (way) {
        let height = way.tags["height"] || way.tags["building:height"];
        let levels = way.tags["building:levels"];

        let addressParts = [];
        if (way.tags["addr:housename"]) {
            addressParts.push(way.tags["addr:housename"]);
        }

        if (way.tags["addr:street"]) {
            if (addressParts.length) {
                addressParts.push(", ");
            }
            addressParts.push(way.tags["addr:street"]);
            if (way.tags["addr:housenumber"]) {
                addressParts.push(" ");
                addressParts.push(way.tags["addr:housenumber"]);
            }
        }

        let address;
        if (addressParts.length) {
            address = addressParts.join("");
        }


        if (!height && levels) {
            height = levels * 3; // Assume 3 meters per level
        }
        return {
            address: address,
            height: height,
            levels: levels
        };
    }
    return {};
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

function drawFootprintOnCanvas(buildingInfo, coordinates) {
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

    let text = [];

    if (buildingInfo.address) {
        text.push(buildingInfo.address);
    }
    if (buildingInfo.height) {
        if (text.length) {
            text.push("\n")
        }
        text.push(`Height: ${buildingInfo.height}m`);
    }

    if (text.length) {
        text.push("\n")
    }
    if (buildingInfo.levels) {
        text.push(`Number of floors: ${buildingInfo.levels}`);
    } else {
        text.push("Number of floors: unknown");
    }

    let infoText;
    if (text.length) {
        infoText = new fabric.Text(text.join(''), {
            left: 10,
            top: 10,
            fontSize: 20,
            fontFamily: 'Arial',
            fill: 'black',
            selectable: true,
        });
    }

    // Clear any previous drawings and add the footprint
    canvas.clear();
    canvas.add(footprint);
    if (infoText) {
        canvas.add(infoText);
    }

}
