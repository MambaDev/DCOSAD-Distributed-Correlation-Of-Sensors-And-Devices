FROM node:lts-alpine

WORKDIR /app

COPY ./ ./

WORKDIR ./aggregator

run apk --no-cache add --virtual native-deps \
  g++ gcc libgcc libstdc++ linux-headers make python && \
  npm install --quiet node-gyp -g &&\
  npm install --quiet && \
  apk del native-deps

# make the 'app' folder the current working directory

# install project dependencies
RUN npm install

CMD [ "npm", "run", "start"] 