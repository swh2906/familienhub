# FamilienHub als ein Container: PocketBase liefert API und die gebaute App (pb_public) aus.
# Daten liegen in /pb/pb_data (als Volume einbinden). Version von PocketBase: pocketbase/VERSION.

# ---- 1. App bauen (läuft nur einmal auf der Build-Plattform, auch beim ARM-Image) ----
FROM --platform=$BUILDPLATFORM node:24-alpine AS app
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec vite build

# ---- 2. PocketBase herunterladen und Prüfsumme kontrollieren ----
FROM alpine:3.22 AS pocketbase
ARG TARGETARCH
COPY pocketbase/VERSION /tmp/VERSION
RUN set -eu; \
	version="$(tr -d '[:space:]' < /tmp/VERSION)"; \
	file="pocketbase_${version}_linux_${TARGETARCH}.zip"; \
	base="https://github.com/pocketbase/pocketbase/releases/download/v${version}"; \
	cd /tmp; \
	wget -q "${base}/${file}" "${base}/checksums.txt"; \
	grep " ${file}\$" checksums.txt | sha256sum -c -; \
	unzip -q "${file}" pocketbase -d /out

# ---- 3. Schlankes Laufzeit-Image ----
FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /pb
COPY --from=pocketbase /out/pocketbase /pb/pocketbase
COPY pocketbase/pb_migrations /pb/pb_migrations
COPY pocketbase/pb_hooks /pb/pb_hooks
COPY --from=app /src/build /pb/pb_public

LABEL org.opencontainers.image.title="FamilienHub" \
	org.opencontainers.image.description="Essensplan, Einkaufsliste, Kalender und Aufgaben für die Familie" \
	org.opencontainers.image.source="https://github.com/swh2906/familienhub"

ENV TZ=Europe/Berlin
EXPOSE 8090
VOLUME /pb/pb_data
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
	CMD wget -qO- http://127.0.0.1:8090/api/health >/dev/null || exit 1

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", \
	"--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks", "--publicDir=/pb/pb_public"]
