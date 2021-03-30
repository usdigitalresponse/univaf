FROM node:14

# set our workdir out of /app
WORKDIR /app

# copy our files
COPY . .

# build for production
ENV NODE_ENV=production

# build the server
RUN npm install
RUN npm run build

# export the port
EXPOSE 3000

# exposed env vars
ENV API_KEYS=abc
ENV DB_HOST=postgres
ENV DB_USERNAME=postgres
ENV DB_PASSWORD=password
ENV DB_PORT=5432
ENV DB_NAME="appointment-availability"

# run our built server
CMD node ./dist/server.js