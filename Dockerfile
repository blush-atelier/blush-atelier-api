FROM node:22.23.3-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
USER node
EXPOSE 3000
CMD ["npm", "run", "start:dev"]
