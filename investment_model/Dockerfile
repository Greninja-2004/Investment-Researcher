FROM python:3.10-slim

WORKDIR /app

# Install compilation tools for native dependency building
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python packages
COPY ./investment_model/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy package folder
COPY ./investment_model ./investment_model

# Expose FastAPI port
EXPOSE 8000

# Set python path
ENV PYTHONPATH=/app

# Command to run FastAPI server
CMD ["python", "-m", "investment_model.inference.server"]
