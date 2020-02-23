FROM node:lts-alpine

WORKDIR /app

COPY ./ ./

WORKDIR ./device

run apk --no-cache add --virtual native-deps \
  g++ gcc libgcc libstdc++ linux-headers make python py-pip && \
  npm install --quiet node-gyp -g &&\
  npm install --quiet && \
  pip install dumb-init && \
  apk del native-deps

# make the 'app' folder the current working directory

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD [ "npm", "run", "start"] 