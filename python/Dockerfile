FROM python:3.12
WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive
RUN apt update -y && apt upgrade -y
RUN apt install -y libgl1-mesa-glx libpoppler-dev poppler-utils
COPY ./requirements-mini.txt requirements.txt
ENV PIP_DEFAULT_TIMEOUT=100
RUN pip install --no-cache-dir --upgrade -r requirements.txt
COPY app.py /app
CMD ["gunicorn", "--log-level", "debug", "--bind", "0.0.0.0:8080", "app:app"]
