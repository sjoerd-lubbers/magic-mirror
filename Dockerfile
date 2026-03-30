FROM node:20-bookworm-slim

WORKDIR /app

ARG PIPER_VERSION=2023.11.14-2
ARG PIPER_VOICE_REVISION=a60bfb1358818a92675b3a2d9d48fb8ea47035c1
ARG PIPER_VOICE_NAME=nl_NL-ronnie-medium

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /usr/local/bin/piper /usr/local/share/piper \
  && curl -fsSL "https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_x86_64.tar.gz" \
    | tar -xz -C /usr/local/bin/piper --strip-components=1 \
  && curl -fsSL "https://huggingface.co/rhasspy/piper-voices/resolve/${PIPER_VOICE_REVISION}/nl/nl_NL/ronnie/medium/${PIPER_VOICE_NAME}.onnx" \
    -o "/usr/local/share/piper/${PIPER_VOICE_NAME}.onnx" \
  && curl -fsSL "https://huggingface.co/rhasspy/piper-voices/resolve/${PIPER_VOICE_REVISION}/nl/nl_NL/ronnie/medium/${PIPER_VOICE_NAME}.onnx.json" \
    -o "/usr/local/share/piper/${PIPER_VOICE_NAME}.onnx.json"

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
