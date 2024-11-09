# Epic electronic escalator editor

This is the famous epic electronic escalator editor. It help sellers quickly set up a good rapport with their customers. 

Using openstreetmap and optionally existing floorplans, it can make quick simulation of buildings and their potential new elevators

It can all be viewed on https://healthymindtech.com/epic-electronic-escalator-editor/floorplan-tool/

# Technology

Almost all of the code is javascript in the floorplan-tool folder. The javascript contains code both for drawing a nice visual map and using openstreetmaps API to get building info, from across the world.

There is furthermore a 3d simulation of buildings available, fed with info from openstreetmap.

In addition this repo contains a simply python AI web service that attempts to parse images of floor plans to map onto the building footprints retrieved from openstreetmap. This webservice is not always completely successful, but often works for simple demonstration purposes.

# Running

Running this code is very easy, a simple way is to:

```
cd floormap-tool
python -m http.server
```
And then point your browser at http://localhost:8080

To start the webservice, do:

```
cd python
python -m venv env
. env/bin/activate
pip install -r requirements-mini.txt
flask run
```

And the webservice will be available in http://localhost:5000

The webservice can handle pdf, png and jpg files of floorplans.



