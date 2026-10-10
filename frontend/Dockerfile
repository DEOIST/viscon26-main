FROM public.ecr.aws/docker/library/node:26-alpine
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci
COPY shared/ /app/shared/
COPY frontend/ ./
EXPOSE 5173
CMD ["npm", "run", "dev"]
