.PHONY: help build run stop clean logs shell db-migrate test-build compose-up compose-down compose-logs

# Default target
help:
	@echo "Pinacle Docker Management"
	@echo ""
	@echo "Usage:"
	@echo "  make build           Build the Docker image"
	@echo "  make run             Run the container (requires .env file)"
	@echo "  make stop            Stop the running container"
	@echo "  make logs            Show container logs"
	@echo "  make shell           Open a shell in the container"
	@echo "  make clean           Remove container and image"
	@echo "  make db-migrate      Run database migrations"
	@echo "  make test-build      Build and test the image"
	@echo ""
	@echo "Docker Compose:"
	@echo "  make compose-up      Start services with docker-compose"
	@echo "  make compose-down    Stop services with docker-compose"
	@echo "  make compose-logs    Show docker-compose logs"
	@echo ""

# Docker commands
build:
	@echo "Building Docker image..."
	docker build -t pinacle:latest .

run:
	@echo "Starting Pinacle container..."
	@if [ ! -f .env ]; then echo "Error: .env file not found. Please create one first."; exit 1; fi
	docker run -d \
		--name pinacle-app \
		-p 3000:3000 \
		--env-file .env \
		pinacle:latest
	@echo "Pinacle is running at http://localhost:3000"

stop:
	@echo "Stopping Pinacle container..."
	docker stop pinacle-app || true
	docker rm pinacle-app || true

logs:
	docker logs -f pinacle-app

shell:
	docker exec -it pinacle-app sh

clean:
	@echo "Cleaning up..."
	docker stop pinacle-app 2>/dev/null || true
	docker rm pinacle-app 2>/dev/null || true
	docker rmi pinacle:latest 2>/dev/null || true

db-migrate:
	@echo "Running database migrations..."
	docker exec pinacle-app pnpm db:migrate

test-build:
	@echo "Building and testing Docker image..."
	docker build -t pinacle:test .

# Docker Compose commands
compose-up:
	@echo "Starting services with docker-compose..."
	docker-compose up -d
	@echo "Services started. Run 'make compose-logs' to view logs"
	@echo "App: http://localhost:3000"

compose-down:
	@echo "Stopping services..."
	docker-compose down

compose-logs:
	docker-compose logs -f

compose-build:
	@echo "Building with docker-compose..."
	docker-compose build

compose-restart:
	@echo "Restarting services..."
	docker-compose restart

compose-migrate:
	@echo "Running migrations via docker-compose..."
	docker-compose exec app pnpm db:migrate

