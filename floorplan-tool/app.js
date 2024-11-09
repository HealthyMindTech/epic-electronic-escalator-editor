// Initialize Fabric.js canvas
const canvas = new fabric.Canvas('floorPlanCanvas');
let numberOfFloors = null;
let drawingMode = null;
let startX, startY;
// Initialize the current mode
let currentMode = 'Wall Drawing Mode';

// Create a text object to display the current mode
const modeDisplay = new fabric.Text(currentMode, {
    left: canvas.getWidth() - 200, // Adjust position as needed
    top: 10,
    fontSize: 18,
    fontFamily: 'Arial',
    fill: 'black',
    selectable: false,
    evented: false,
});

// Add the mode display to the canvas
canvas.add(modeDisplay);


// Functions to enable Wall Drawing Modes
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

// Reference to the input element
const imageLoader = document.getElementById('imageLoader');
let floorplanImage = null;

// Add event listener to handle image loading
imageLoader.addEventListener('change', handleImage, false);

function handleImage(e) {
    const reader = new FileReader();
    reader.onload = function (event) {
        const imgObj = new Image();
        imgObj.src = event.target.result;
        imgObj.onload = function () {
            const image = new fabric.Image(imgObj);
            image.set({
                left: canvas.getWidth() / 2,
                top: canvas.getHeight() / 2,
                originX: 'center',
                originY: 'center',
                selectable: true,
                hasRotatingPoint: true,
                excludeFromExport: true, // Exclude image from SVG export
            });
            // Optionally, customize control visibility
            image.setControlsVisibility({
                mt: true, // Middle top
                mb: true, // Middle bottom
                ml: true, // Middle left
                mr: true, // Middle right
                bl: true, // Bottom left
                br: true, // Bottom right
                tl: true, // Top left
                tr: true, // Top right
                mtr: true,  // Rotation control
            });
            canvas.add(image);
            canvas.setActiveObject(image);
            floorplanImage = image;
            toggleLockImage('Floorplan Image Editing Mode');
            canvas.renderAll();
            
            // Keep a reference to the floorplan image

            // Send the image to the back
            canvas.sendToBack(floorplanImage);
        };
    };
    reader.readAsDataURL(e.target.files[0]);
}
// Add event listener to the lock/unlock button
const lockImageButton = document.getElementById('lockImageButton');
lockImageButton.addEventListener('click', () => toggleLockImage());


// Open a new tab with the Viewer using the SVG data from the canvas
function openViewer() {
    const svgData = canvas.toSVG();
    const args = [];
    if (numberOfFloors) {
        args.push(`numberOfFloors=${numberOfFloors}`);
    }
    args.push(`svg=${encodeURIComponent(svgData)}`);

    const viewerURL = `viewer.html?${args.join('&')}`;
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
    canvas.add(modeDisplay);
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
    if (currentMode !== 'Wall Drawing Mode') return; // Disable drawing if not in Wall Drawing Mode

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
    if (currentMode !== 'Wall Drawing Mode') return; // Disable drawing if not in Wall Drawing Mode
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
    if (currentMode !== 'Wall Drawing Mode') return; // Disable drawing if not in Wall Drawing Mode
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
// Function to lock/unlock the floorplan image
function toggleLockImage(forceSet = null) {
    if (!floorplanImage) {
        alert("No image loaded.");
        currentMode = 'Wall Drawing Mode';
        return;
    }

    if (forceSet === 'Wall Drawing Mode' || (forceSet === null && currentMode === 'Floorplan Image Editing Mode')) {
        // Lock the image
        floorplanImage.set({
            selectable: false,
            evented: false,
        });
        // Send it to back
        canvas.sendToBack(floorplanImage);
        // Update button text
        lockImageButton.textContent = 'Unlock Image';

        // Change mode to Wall Drawing Mode
        currentMode = 'Wall Drawing Mode';
    } else if (forceSet === 'Floorplan Image Editing Mode' || (forceSet === null && currentMode === 'Wall Drawing Mode')) {
        // Unlock the image
        floorplanImage.set({
            selectable: true,
            evented: true,
        });
        // Bring image to front (optional)
        // canvas.bringToFront(floorplanImage);
        // Update button text
        lockImageButton.textContent = 'Lock Image';

        // Change mode to Floorplan Image Editing Mode
        currentMode = 'Floorplan Image Editing Mode';
    }

    // Update the mode display
    modeDisplay.text = currentMode;
    canvas.renderAll();
}



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


function fetchBuildingFootprint(lat, lng) {
    const query = `
        [out:json];
        way(around:30, ${lat}, ${lng})["building"];  // Increase radius here
        (._;>;);
        out body;
    `;
    fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`)
                .then(response => response.json())
                .then(data => {
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
        numberOfFloors = buildingInfo.levels;
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
            selectable: false,
        });
    }

    // Clear any previous drawings and add the footprint
    canvas.clear();
    canvas.add(footprint);

    if (infoText) {
        canvas.add(infoText);
    }
    
    // Add the mode display to the canvas
    canvas.add(modeDisplay);

}


// Lines with x1, x2, y1, y2
floorLines = [
    [
    0.16863323500491642,
    0.00881316098707403,
    1.0,
    0.00881316098707403
    ],
    [
    0.32890855457227136,
    1.0,
    0.32890855457227136,
    0.21269095182138661
    ],
    [
    0.08259587020648967,
    1.0,
    0.8539823008849557,
    1.0
    ],
    [
    0.0,
    1.0,
    0.0,
    0.18037602820211515
    ],
    [
    0.9911504424778761,
    0.6069330199764983,
    0.9980334316617503,
    0.15746180963572268
    ],
    [
    0.7699115044247787,
    0.31609870740305523,
    1.0,
    0.3207990599294947
    ],
    [
    0.41002949852507375,
    0.4688601645123384,
    0.5771878072763028,
    0.4688601645123384
    ],
    [
    0.5398230088495575,
    0.39247943595769685,
    0.5398230088495575,
    0.10223266745005875
    ],
    [
    0.9980334316617503,
    0.8407755581668626,
    1.0,
    0.9976498237367802
    ],
    [
    0.20993117010816126,
    0.9059929494712103,
    0.3416912487708948,
    0.9059929494712103
    ],
    [
    0.30383480825958703,
    0.3871915393654524,
    0.6529006882989183,
    0.3871915393654524
    ],
    [
    0.17551622418879056,
    0.14218566392479437,
    0.35644051130776794,
    0.1498237367802585
    ],
    [
    0.49262536873156343,
    0.6415981198589894,
    0.6524090462143559,
    0.6351351351351351
    ],
    [
    0.872173058013766,
    0.23207990599294948,
    0.8770894788593904,
    0.5552291421856639
    ],
    [
    0.5353982300884956,
    0.2779083431257344,
    0.6091445427728613,
    0.28554641598119856
    ],
    [
    0.8411996066863323,
    0.5593419506462984,
    1.0,
    0.5399529964747356
    ],
    [
    0.13126843657817108,
    0.47238542890716806,
    0.13962635201573254,
    0.6562867215041128
    ],
    [
    0.8682399213372665,
    0.3695652173913043,
    0.8682399213372665,
    0.23207990599294948
    ],
    [
    0.5245821042281219,
    0.30141010575793187,
    0.6047197640117994,
    0.2984723854289072
    ],
    [
    0.31268436578171094,
    0.2209165687426557,
    0.3525073746312684,
    0.26850763807285544
    ],
    [
    0.6406096361848574,
    0.009400705052878966,
    0.6425762045231072,
    0.16216216216216217
    ],
    [
    0.0,
    0.0,
    0.0014749262536873156,
    0.12220916568742655
    ],
    [
    0.255653883972468,
    0.19741480611045828,
    0.2664700098328417,
    0.3484136310223267
    ],
    [
    0.6597836774827925,
    0.18801410105757932,
    0.6607669616519174,
    0.2491186839012926
    ],
    [
    0.8790560471976401,
    0.4189189189189189,
    0.8815142576204523,
    0.23207990599294948
    ],
    [
    0.1111111111111111,
    0.3372502937720329,
    0.11946902654867257,
    0.47473560517038776
    ],
    [
    0.7364798426745329,
    0.681551116333725,
    0.8151425762045231,
    0.7044653349001175
    ],
    [
    0.8215339233038348,
    0.9012925969447708,
    0.8711897738446411,
    0.9606345475910694
    ],
    [
    0.32890855457227136,
    0.0099882491186839,
    0.3308751229105211,
    0.15158636897767333
    ],
    [
    0.8505408062930186,
    0.7961222091656874,
    1.0,
    0.7961222091656874
    ],
    [
    0.6691248770894789,
    0.3484136310223267,
    0.727630285152409,
    0.3484136310223267
    ],
    [
    0.283677482792527,
    0.5423031727379554,
    0.2895771878072763,
    0.6504112808460635
    ],
    [
    0.4119960668633235,
    0.6251468860164512,
    0.45968534906588004,
    0.68213866039953
    ],
    [
    0.8298918387413963,
    0.6921269095182139,
    0.8672566371681416,
    0.72737955346651
    ],
    [
    0.08849557522123894,
    0.2191539365452409,
    0.12389380530973451,
    0.2408930669800235
    ],
    [
    0.7148475909537857,
    0.5511163337250293,
    0.7227138643067846,
    0.6844888366627497
    ],
    [
    0.511307767944936,
    0.5235017626321974,
    0.511307767944936,
    0.463572267920094
    ],
    [
    0.4060963618485742,
    0.08578143360752057,
    0.5378564405113078,
    0.0881316098707403
    ],
    [
    0.551622418879056,
    0.24383078730904817,
    0.6091445427728613,
    0.26321974148061106
    ],
    [
    0.7482792527040315,
    0.663924794359577,
    0.8151425762045231,
    0.7097532314923619
    ],
    [
    0.08259587020648967,
    0.01410105757931845,
    0.1288102261553589,
    0.01645123384253819
    ],
    [
    0.10619469026548672,
    0.0,
    0.16175024582104228,
    0.04465334900117509
    ]
    ];

    // Function to draw the lines on the canvas
    function loadLines() {
        // Assuming footprint is already defined and added to the canvas
        const footprint = canvas.getObjects('polygon')[0]; // Get the first polygon object (footprint)

        if (!footprint) {
            console.error("Footprint not found on the canvas.");
            return;
        }

        const footprintWidth = footprint.width * footprint.scaleX;
        const footprintHeight = footprint.height * footprint.scaleY;
        const footprintLeft = footprint.left;
        const footprintTop = footprint.top;

        floorLines.forEach(line => {
            const [x1, y1, x2, y2] = line;

            // Scale and position the lines relative to the footprint
            const scaledX1 = footprintLeft + x1 * footprintWidth;
            const scaledY1 = footprintTop + y1 * footprintHeight;
            const scaledX2 = footprintLeft + x2 * footprintWidth;
            const scaledY2 = footprintTop + y2 * footprintHeight;

            const lineObj = new fabric.Line([scaledX1, scaledY1, scaledX2, scaledY2], {
                stroke: 'black',
                strokeWidth: 2,
                selectable: false,
            });
            canvas.add(lineObj);
        });
    }