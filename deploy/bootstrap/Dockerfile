# Build context is the repo root (so the image takes hyperdht's version from package-lock.json):
#   docker build -f deploy/bootstrap/Dockerfile -t linda-dht .
# glibc image on purpose: the native modules hyperdht pulls in ship glibc prebuilds.
FROM node:22-slim
WORKDIR /app
COPY package-lock.json ./
RUN npm init -y >/dev/null \
 && npm i --omit=dev --no-audit --no-fund "hyperdht@$(node -p "require('./package-lock.json').packages['node_modules/hyperdht'].version")"
COPY deploy/bootstrap/node.mjs ./
ENV DHT_PORT=49737
EXPOSE 49737/udp
USER node
CMD ["node", "node.mjs"]
