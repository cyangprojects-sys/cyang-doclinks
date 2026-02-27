FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends clamav clamav-daemon ca-certificates nodejs npm && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./

# freshclam can fail transiently during build; we retry at runtime too.
RUN freshclam || true

EXPOSE 8080

CMD sh -c "freshclam || true; service clamav-daemon start; node server.js"

