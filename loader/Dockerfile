FROM node:19.0.1-slim
# Name for the version/release of the software. (Optional)
ARG RELEASE

# Upgrade to NPM 7
RUN npm install -g npm

# set our workdir out of /app
WORKDIR /app

# copy our files
COPY . .

# install the dependencies as fresh copies
RUN rm -rf node_modules
RUN npm install

ENV RELEASE="${RELEASE}"

# required exposed env vars
ENV API_URL=""
ENV API_KEY=""

# Run the loader
ENTRYPOINT ["node", "./bin/univaf-loader", "--send", "--compact"]
