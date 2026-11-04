FROM nginx:stable-alpine
RUN apk add --no-cache nodejs npm
COPY index.html styles-cinema.css styles-reframe.css styles-personalization.css /usr/share/nginx/html/
COPY js /usr/share/nginx/html/js
COPY assets /usr/share/nginx/html/assets
COPY examples /usr/share/nginx/html/examples
COPY README.md /usr/share/nginx/html/README.md
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY server/catalog-api.mjs /opt/emoteca/catalog-api.mjs
COPY server/user-api.mjs /opt/emoteca/user-api.mjs
COPY server/package.json /opt/emoteca/package.json
RUN cd /opt/emoteca && npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server/start.sh /opt/emoteca/start.sh
RUN chmod 755 /opt/emoteca/start.sh
ENV CATALOG_PORT=8787
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=4s CMD wget -q -O /dev/null http://127.0.0.1:80/ >/dev/null || exit 1
CMD ["/bin/sh", "/opt/emoteca/start.sh"]
