from flask import Flask, jsonify, request
import os
import tempfile
import numpy as np
import sys
import cv2
from pdf2image import convert_from_path
from sklearn.cluster import DBSCAN
from flask_cors import CORS
from PIL import Image

app = Flask(__name__)
CORS(app)


def filter_similar_lines(lines, delta_theta=0.05, delta_rho=5.0, min_parallel_lines=2):
    """
    Filters out lines that are close to parallel and close to each other,
    only including lines where there are at least 'min_parallel_lines' similar lines.

    Generate by ChatGPT, with small modifications

    Parameters:
    - lines: NumPy array of shape (N, 4), where each row is (x1, y1, x2, y2).
    - delta_theta: Threshold for angular difference in radians.
    - delta_rho: Threshold for distance difference.
    - min_parallel_lines: Minimum number of similar lines required to include a line.

    Returns:
    - filtered_lines: NumPy array of filtered lines.
    """
    x1 = lines[:, 0]
    y1 = lines[:, 1]
    x2 = lines[:, 2]
    y2 = lines[:, 3]
    dx = x2 - x1
    dy = y2 - y1

    # Compute normal vector (-dy, dx)
    nx = -dy
    ny = dx

    # Compute θ = atan2(ny, nx)
    theta = np.arctan2(ny, nx)
    theta = np.mod(theta, np.pi)  # Ensure θ is between 0 and π

    # Compute ρ = x1 * cos θ + y1 * sin θ
    rho = x1 * np.cos(theta) + y1 * np.sin(theta)

    # Scale θ and ρ for clustering
    theta_scaled = theta / delta_theta
    rho_scaled = rho / delta_rho
    features = np.column_stack((theta_scaled, rho_scaled))

    # Cluster lines using DBSCAN
    eps = np.sqrt(2)
    db = DBSCAN(eps=eps, min_samples=1).fit(features)
    labels = db.labels_

    # Select clusters with at least 'min_parallel_lines' lines
    unique_labels = np.unique(labels)
    filtered_lines = []
    for label in unique_labels:
        indices = np.where(labels == label)[0]
        if len(indices) >= min_parallel_lines:
            cluster_lines = lines[indices]
            # Optionally, pick the longest line
            lengths = np.sqrt((cluster_lines[:, 2] - cluster_lines[:, 0])**2 +
                              (cluster_lines[:, 3] - cluster_lines[:, 1])**2)
            max_index = indices[np.argmax(lengths)]
            filtered_lines.append(lines[max_index])

    if filtered_lines:
        return np.array(filtered_lines)
    else:
        return np.empty((0, 4))  # Return an empty array if no lines meet the criteria


def do_the_magic(file_path):
    if file_path.endswith('.pdf'):
        pages = convert_from_path(file_path)

        page = pages[0]
        image = np.array(page)
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = cv2.imread(file_path, cv2.IMREAD_GRAYSCALE)
        # im_image = Image.open(file_path)
        # image = np.array(im_image.getdata())


    img = cv2.GaussianBlur(gray, (5, 5), 0)
    # Apply edge detection
    edges = cv2.Canny(img, threshold1=50, threshold2=150, apertureSize=3)

    # Apply a morphological closing operation to emphasize thick lines (walls)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 13))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)

    walls = cv2.erode(closed, np.ones((3, 3)))
    # walls = cv2.dilate(walls, np.ones((3, 3)))
    lines = cv2.HoughLinesP(walls, rho=1, theta=np.pi/180, threshold=50, minLineLength=30, maxLineGap=10)

    lines = lines.reshape(lines.shape[0], lines.shape[2])
    # Create an empty image to draw wall lines

    filtered_lines = filter_similar_lines(lines, delta_theta=1.0, delta_rho=4.0, min_parallel_lines=5)
    # Draw the detected lines onto the empty image
    lines_json = []
    min_x = None
    min_y = None
    max_x = None
    max_y = None
    for line in filtered_lines:
        x1, y1, x2, y2 = line
        if min_x is None:
            min_x = min(float(x1), float(x2))
        else:
            min_x = min(float(x1), float(x2), min_x)
        if min_y is None:
            min_y = min(float(y1), float(y2))
        else:
            min_y = min(float(y1), float(y2), min_y)

        if max_x is None:
            max_x = max(float(x1), float(x2))
        else:
            max_x = max(float(x1), float(x2), max_x)
        if max_y is None:
            max_y = max(float(y1), float(y2))
        else:
            max_y = max(float(y1), float(y2), max_y)

        lines_json.append([float(x1), float(y1), float(x2), float(y2)])

    for line in lines_json:
        line[0] -= min_x
        line[0] /= max_x - min_x
        line[1] -= min_y
        line[1] /= max_y - min_y
        line[2] -= min_x
        line[2] /= max_x - min_x
        line[3] -= min_y
        line[3] /= max_y - min_y

    return lines_json


@app.route('/upload', methods=['POST'])
def upload():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']

    # Check if the file is a PDF
    if not file.filename.endswith('.pdf') and not file.filename.endswith('.png'):
        return jsonify({"error": "Invalid file format, please upload a PDF or PNG"}), 400

    # Save the PDF file to a temporary location
    temp_dir = tempfile.gettempdir()
    file_path = os.path.join(temp_dir, file.filename)
    file.save(file_path)

    try:
        lines = do_the_magic(file_path)
    finally:
        os.remove(file_path)

    print(f"Detected {len(lines)} lines in the uploaded PDF file", file=sys.stderr)
    return lines
