
docker:
	docker build ./docker/postgis -t availability-db:latest

compose:
	docker-compose up -d

seed:
	cd server && ./scripts/build-database.sh

.PHONY: docker compose seed