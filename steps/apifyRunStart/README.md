# Apify — start run only (`apifyRunStart`)

Starts an Apify Actor or Task with **`POST .../runs`** and returns immediately with **run id** and metadata (no polling). Pair with **`apifyRunWait`** and/or **`apifyDatasetItems`**.

See **steps/apifyActorRun/README.md** (token, limits, **Stop** / **`APIFY_RUN_CANCEL`**, split pipeline) and **`docs/PROGRAMMATIC_API.md`** (`APIFY_RUN_START`).
