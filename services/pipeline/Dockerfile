# One image, two entry points: `npm run ingest` (API) and `npm run aggregator` (queue consumer).
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src src
USER node
CMD ["npm", "run", "ingest"]
