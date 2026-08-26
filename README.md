# LLM Models DB

Небольшой read-only каталог моделей, провайдерских endpoint-ов, цен,
reasoning efforts, benchmark-оценок и опубликованных runtime-метрик.
Снапшот обновляется GitHub Actions два раза в день, а API не делает сетевых
запросов во время чтения.

## Архитектура

```text
upstream APIs/feeds
        -> adapters with provenance and bounded fetches
        -> deterministic merge and validation
        -> models_db.json
        -> module-scope snapshot + query index
        -> Vercel /api/v1/* or static GitHub Pages projection
```

`models_db.json` остаётся единственным полным portable-снапшотом. API загружает
его на cold start, кэширует на уровне модуля максимум на один час и строит
компактный индекс для фильтров и O(1) поиска модели по id/alias. Пока кеш
свежий, на каждый запрос JSON заново не парсится; после TTL следующий запрос
перечитывает, валидирует и индексирует файл заново. Все ответы имеют CDN cache
headers с тем же часовым TTL.

Потоковые JSON-парсеры и NDJSON здесь намеренно не используются в hot path:
произвольный фильтр всё равно должен пройти весь массив, поэтому потоковое
чтение уменьшает пиковую память, но резко увеличивает CPU/latency на запрос.
SQLite остаётся разумным вариантом при существенном росте снапшота или жёстком
лимите памяти, но для текущего read-only кейса индексированный in-memory JSON
даёт более быстрый путь и меньше operational complexity.

## Источники

Каждое наблюдение хранит `source_id`, URL, время получения, покрытые поля и
`derived_from`, если значение перепубликовано или агрегировано другим
источником. Конфликты не сворачиваются в выдуманный единый рейтинг.

- [OpenRouter models](https://openrouter.ai/docs/guides/overview/models) и
  [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
  — каталог endpoint-ов, цены, cache, capabilities, quantization и rolling
  provider runtime metrics.
- [Models.dev](https://models.dev) — model/provider metadata, limits,
  modalities, tools, structured output, reasoning и pricing.
- [BenchLM data](https://www.benchlm.ai/data) — benchmarks, pricing и speed;
  AA-derived строки помечаются provenance.
- [Artificial Analysis Data API](https://artificialanalysis.ai/data-api/docs)
  — headline indices, median performance и pricing при наличии `AA_API_KEY`.
  Ключ не попадает в git или снапшот; deployment предназначен для внутреннего
  использования.
- [Epoch AI data](https://epoch.ai/benchmarks/use-this-data) — независимый
  benchmark/compute context с консервативным identity join.
- [Portkey models](https://github.com/Portkey-AI/models) — pricing supplement
  для batch/cache/audio/image/search/thinking dimensions.
- BenchGecko, ModelCap и CloudPrice — вторичные cross-check наблюдения; их
  пересечения с AA/OpenRouter не считаются независимыми benchmark sources.

В базу попадают только данные из сетевых источников. Локальный benchmark,
probe или собственные error/latency/cache-hit замеры не выполняются. Поэтому
`measurements[]` заполнится только тогда, когда соответствующие факты реально
опубликованы upstream.

## API

Все списочные маршруты возвращают envelope с `data` и `meta`:

```json
{
  "data": [],
  "meta": {
    "total": 0,
    "limit": 50,
    "offset": 0,
    "has_more": false,
    "updated_at": "...",
    "schema_version": "1.0"
  }
}
```

- `GET /api/v1/models?q=gpt&provider=openrouter&capability=tools&limit=50`
- `GET /api/v1/models/:id`
- `GET /api/v1/offers?provider=openrouter&quantization=fp8&profile=rag-long-prefix`
- `GET /api/v1/providers`
- `GET /api/v1/benchmarks`
- `GET /api/v1/profiles`
- `GET /api/v1/health`
- `GET /api/v1/schema` — JSON Schema полного `models_db.json`.
- `GET /api/v1/snapshot` — redirect на полный статический `snapshot.json`.

Поддерживаются фильтры по model id/name/alias, provider, capability,
reasoning effort, quantization, source, benchmark, open weights, minimum
context, price estimate и workload profile. `estimated_cost_usd` — только
детерминированный расчёт по объявленным ценам и профилю; это не измеренная
стоимость и не прогноз latency.

Vercel Functions имеют ограничение 4.5 MB на response body, поэтому страницы
ограничены 100 элементами. Для полного офлайн-анализа используйте статический
`/api/v1/snapshot.json` и `/api/v1/schema.json` на GitHub Pages или Vercel.
`vercel.json` запускает статическую сборку при деплое и включает
`models_db.json` в bundle динамических API-функций. Полный snapshot отдается
как статический файл, а не через Function. Если задан `SNAPSHOT_DOWNLOAD_URL`,
redirect может указывать на прямой GitHub/GitHub Pages URL.

## Локальный запуск

```bash
npm install
npm run update:db       # сетевой refresh; AA берётся из .env, если задан
npm run typecheck
npm test                # deterministic tests
npm run test:live       # opt-in public API smoke tests
npm run build:static    # public/api/v1/* for GitHub Pages
```

Скопируйте `.env.example` в `.env`. Реальные ключи не коммитьте:

```dotenv
AA_API_KEY=
OPENROUTER_API_KEY=
OPENROUTER_ENDPOINTS=1
OPENROUTER_ENDPOINT_CAP=120
OPENROUTER_ENDPOINT_CONCURRENCY=6
```

Если источник временно недоступен, его статус становится `error` или
`skipped`, а прежние данные сохраняются. Пустой каталог считается ошибкой;
если все источники не сработали, файл не заменяется. Новый снапшот сначала
валидируется, затем пишется через temporary file и atomic rename.

## GitHub Actions и публикация

`.github/workflows/refresh.yml` запускается по cron в `03:17` и `15:17` UTC,
а также вручную. В repository/environment secrets добавьте `AA_API_KEY` и,
при необходимости, `OPENROUTER_API_KEY`. Workflow выполняет refresh, тесты,
статическую сборку, коммитит изменившийся `models_db.json` и публикует Pages в
том же job.

На Vercel новый snapshot попадет в runtime после нового деплоя; часовой TTL
защищает от бессрочного кеширования внутри долгоживущего экземпляра, но не
меняет файлы immutable deployment самостоятельно.

Статическая проекция содержит:

- `api/v1/snapshot.json` — полный снапшот;
- `api/v1/schema.json` — схема;
- `api/v1/models.json` и `api/v1/models/index.json` — компактный индекс;
- `api/v1/models/<base64url-id>.json` — отдельные модели;
- `api/v1/offers.json` — первая страница flat-offer представления;
- `api/v1/providers.json`, `benchmarks.json`, `profiles.json`, `health.json`.

Для полного списка offers используется `models_db.json`: статический
`offers.json` намеренно ограничен тем же лимитом страницы, что и динамический
API, чтобы не дублировать большой snapshot.

GitHub Pages не выполняет произвольный server-side filtering; вызывающая
сторона может скачать snapshot и схему и фильтровать локально. Vercel получает
тот же query layer динамически.

## Benchmark выбора формата

Локальный smoke benchmark на исходном снапшоте до включения полной пагинации
(6 773 модели, Node 24, macOS) дал ориентиры для тёплого чтения списка
`provider=openai&capability=tools`. Текущий refresh после пагинации содержит
10 334 модели, поэтому цифры ниже следует воспринимать как сравнительный
ориентир, а не SLA:

| Вариант | Тёплый list | Особенность |
| --- | ---: | --- |
| Full JSON + линейный filter | ~1.1 ms | Прост, но повторно обходит вложенные offers |
| Full JSON + query index | ~0.08 ms | Выбранный hot path; JSON парсится один раз на cold start |
| NDJSON + streaming scan | ~77 ms | Низкая материализация, но полный проход на каждый arbitrary filter |
| SQLite + indexed facets | ~4.8 ms | Меньше памяти и быстрый id lookup, но sync query сложнее и медленнее list |

Текущий `models_db.json` занимает около 53 MB на диске; plain Node parse в отдельном
процессе показал около 303 MB peak RSS. Это одноразовая цена на экземпляр
Vercel Function, а не на запрос; текущий лимит статического файла Vercel Hobby —
100 MB. При росте файла к нескольким сотням мегабайт
следующим шагом будет SQLite или prebuilt byte-range/index storage.
