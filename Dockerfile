FROM node:18.13.0-slim AS base
# Name for the version/release of the software. (Optional)
ARG RELEASE

# Upgrade to latest NPM.
RUN npm install -g npm

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
COPY ./loader/package.json ./loader/
COPY ./common/package.json ./common/
COPY ./server/package.json ./server/
RUN npm ci

# copy our files
COPY . .

ENV RELEASE="${RELEASE}"


# Loader ---------------------------------------------------------
FROM base AS loader

# Build for production.
ENV NODE_ENV=production
RUN npm run build --workspace common

# Clear dev-only dependencies.
RUN npm prune --omit=dev

WORKDIR /app/loader

# required exposed env vars
ENV API_URL=""
ENV API_KEY=""

# Run the loader
ENTRYPOINT ["node", "./bin/univaf-loader", "--send", "--compact"]


# Server ---------------------------------------------------------
FROM base AS server

# Build for production.
ENV NODE_ENV=production
RUN npm run build --workspace server

# Clear dev-only dependencies.
RUN npm prune --omit=dev

WORKDIR /app/server

EXPOSE 3000

# optional exposed env vars, the defaults are provided here.
ENV DB_HOST=postgres
ENV DB_USERNAME=postgres
ENV DB_PASSWORD=password
ENV DB_PORT=5432

# required exposed env vars, with defaults provided
ENV API_KEYS=""
ENV DB_NAME="univaf"

# run our built server
CMD npm run migrate && node ./dist/src/server.js
