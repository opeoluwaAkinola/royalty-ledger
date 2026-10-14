.PHONY: up down simulate e2e test load lambda tf-validate redrive

up: ## Start everything; dashboard at http://localhost:8088
	docker compose up --build -d --wait

down:
	docker compose down -v

simulate: ## Send 50k play events with 5% duplicate retries
	node tools/simulator/src/simulate.js --events 50000 --rate 4000 --duplicates 0.05

e2e: ## Prove exactly-once counting and reconciliation end to end
	./scripts/e2e.sh

load: ## k6 load test against the ingest API
	docker run --rm -i --add-host=host.docker.internal:host-gateway grafana/k6:0.54.0 run - < load/ingest.js

redrive: ## Move DLQ messages back onto the main queue
	docker compose run --rm aggregator npm run redrive

test:
	cd services/pipeline && npm test
	cd services/royalty-service && ./mvnw -B -q test
	cd tools/simulator && npm test
	cd web && npm test

lambda: ## Build the Lambda bundle Terraform deploys
	cd services/pipeline && npm ci && npm run build

tf-validate:
	cd infra/terraform && terraform fmt -check && terraform init -backend=false && terraform validate
