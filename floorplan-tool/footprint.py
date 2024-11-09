import geopandas as gpd
import matplotlib.pyplot as plt
from shapely.geometry import Polygon
import svgwrite

# Load the building data from the GeoJSON file
gdf = gpd.read_file('buildings.geojson')

# Reproject to a UTM projection (automatically chosen based on the geometry’s center)
gdf = gdf.to_crs(gdf.estimate_utm_crs())

# Assuming there's only one building in the file
building = gdf.iloc[1]
footprint = building.geometry

# Ensure the footprint is a Polygon
if footprint.type == 'MultiPolygon':
    footprint = max(footprint.geoms, key=lambda a: a.area)
elif footprint.type != 'Polygon':
    raise ValueError("Geometry is not a Polygon")

# Get the x and y coordinates of the building footprint
x, y = footprint.exterior.xy
points = list(zip(x, y))

# Normalize points so the smallest x and y become (0,0)
min_x = min(x)
min_y = min(y)
normalized_points = [(px - min_x, py - min_y) for px, py in points]
# Optional: apply a scaling factor if coordinates are too small or large
scaling_factor = 75  # Adjust this as needed
scaled_points = [(px * scaling_factor, py * scaling_factor) for px, py in normalized_points]
scaled_points = [(px + 300, py + 300) for px, py in scaled_points]

# Save footprint as SVG
dwg = svgwrite.Drawing('floor_plan.svg', profile='tiny')
dwg.add(dwg.polygon(scaled_points, fill='none', stroke='black', stroke_width=2))
dwg.save()

# Optional: visualize the scaled, normalized footprint (for verification)
fig, ax = plt.subplots()
norm_x, norm_y = zip(*scaled_points)
ax.plot(norm_x, norm_y, color='black')
plt.axis('equal')
plt.axis('off')
plt.show()

