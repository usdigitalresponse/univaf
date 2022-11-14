FROM node:19.0.1-slim

# Upgrade to NPM 7
RUN npm install -g npm

# set our workdir out of /app
WORKDIR /app

# copy our files
COPY . .

# install the dependencies as fresh copies
RUN npm run clean
RUN npm install

# run in production
ENV NODE_ENV=production
RUN npm run build

# export the port
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
