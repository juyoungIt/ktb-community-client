### STAGE 1 - BUILD
FROM node:20-alpine AS build

# 작업 디렉토리 설정
WORKDIR /leum-client

# 의존성 변경의 빠른 감지를 위함
COPY package*.json ./

# 의존성 설치 진행
RUN npm install

# 소스코드 작업 디렉토리로 복사
COPY . .

# 주요 설정값 정보 주입
ARG VITE_API_URL
ARG VITE_LAMBDA_API_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LAMBDA_API_URL=$VITE_LAMBDA_API_URL

# 빌드 및 캐시 정리
RUN npm run build && npm cache clean --force

### STAGE 2 - PRODUCTION
FROM nginx:stable-alpine AS production

# 빌드 결과물인 정적 파일 복사
COPY --from=build /leum-client/dist /usr/share/nginx/html

# 추가 설정파일 주입
COPY ./nginx/stub_status.conf /etc/nginx/conf.d/stub_status.conf

# nginx 권한 설정
RUN chown -R nginx:nginx /usr/share/nginx/html

# 포트 노출
EXPOSE 80
EXPOSE 8080