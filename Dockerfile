FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY dist/ /usr/share/nginx/html/
RUN find /usr/share/nginx/html -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' -o -name '*.svg' \) -exec gzip -9 -k '{}' \; && nginx -t
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
