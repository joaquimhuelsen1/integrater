# Dockerfile para API FastAPI
FROM python:3.11-slim

WORKDIR /app

# Instala dependencias de sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copia requirements e instala dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia codigo da aplicacao
COPY app/ app/

# Expoe porta
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Comando de execucao
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
