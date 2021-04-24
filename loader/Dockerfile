FROM node:14

# Upgrade to NPM 7
RUN npm install -g npm

# set our workdir out of /app
WORKDIR /app

# copy our files
COPY . .

# install the dependencies as fresh copies
RUN rm -rf node_modules
RUN npm install

# required exposed env vars
ENV SOURCES=""
ENV API_URL=""
ENV API_KEY=""

# run our built server
ENTRYPOINT ["node", "./bin/appointment-availability-loader", "--send", "--compact"]

