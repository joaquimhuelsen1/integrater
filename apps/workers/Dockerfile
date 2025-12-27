# Dockerfile para Workers (Telegram + Email)
FROM python:3.11-slim

# Logs em tempo real (sem buffering)
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Instala FFmpeg (necessario para conversao de audio no Telegram)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copia requirements de ambos workers
COPY telegram/requirements.txt telegram-requirements.txt
COPY email/requirements.txt email-requirements.txt

# Instala dependencias Python
RUN pip install --no-cache-dir \
    -r telegram-requirements.txt \
    -r email-requirements.txt

# Copia codigo dos workers
COPY . .

# Entrypoint sera definido no docker-compose (telegram ou email)
# Exemplos:
#   command: python telegram/worker.py
#   command: python email/worker.py
