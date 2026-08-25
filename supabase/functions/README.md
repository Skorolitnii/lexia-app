# Edge Functions

Исполняются в **Deno** на стороне Supabase, а не в браузере и не в Node.
Поэтому у них свои правила, отличные от `src/`.

## Почему редактор подчёркивает импорт

```
TS2307: Cannot find module 'jsr:@supabase/supabase-js@2'
```

Это ошибка **настройки редактора**, а не кода: TypeScript из `node_modules`
не знает про `jsr:`-схему, а Deno знает. Функция при этом собирается и
работает - проверяется деплоем, а не `yarn typecheck`.

`yarn typecheck` эту папку не смотрит: `tsconfig.app.json` ограничен `src`
и явно исключает `supabase`.

### Как убрать подчёркивание

**WebStorm / IntelliJ:** Settings → Languages & Frameworks → Deno →
включить _Enable Deno_ для этого проекта.

**VS Code:** расширение `denoland.vscode-deno`, затем в
`.vscode/settings.json`:

```json
{
  "deno.enable": true,
  "deno.enablePaths": ["supabase/functions"]
}
```

Импорт-карту (`deno.json` с алиасом на голое имя пакета) пробовали - бандлер
Supabase её не подхватывает и отклоняет деплой с
«Relative import path not prefixed with / or ./ or ../». Поэтому в коде
остаётся явный `jsr:`-префикс.

## _shared

Общий код функций. `tts.ts` держит синтез в Azure и кэш в Storage: формулу
ключа, разбор ошибок Azure, `ensureAudio`. Его импортируют все три функции -
до этого формула ключа была скопирована в каждую, и разъехавшиеся копии
означали бы вечный промах мимо кэша при зелёных тестах.

Клиентская копия (`src/speech/cloudTts.ts`) остаётся отдельной осознанно: она
обязана быть синхронной ради жеста пользователя на iOS. **Меняя формулу ключа,
правь оба файла.**

## tts

Облачный синтез по требованию (см. §6 спеки и `handoff.md`). Зовётся при
промахе кэша - основная масса озвучки синтезируется заранее в `import-deck` и
`warm-audio`. Ключ Azure живёт в секретах проекта, во фронтенд не попадает.

## import-deck

Импорт колоды целиком одной ручкой: словарь (транскрипции), дубликаты, запись
`notes` + `cards` и прогрев озвучки. Раньше это делал фронт - колода из 50 слов
означала 50 запросов в Datamuse с телефона.

Прогрев идёт после ответа (`EdgeRuntime.waitUntil`): импорт не ждёт синтеза
полусотни фраз.

## warm-audio

Прогрев озвучки для одной заметки - ручное сохранение слова в форме. Импорт
греется внутри `import-deck`. Идемпотентна: уже лежащий в бакете файл повторно
не синтезируется, поэтому пересохранение заметки квоту не тратит.

## Деплой

```bash
# секреты (значения - из портала Azure, ресурс Speech, тариф F0)
supabase secrets set AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=westeurope

# выложить (общий модуль уезжает вместе с каждой)
supabase functions deploy tts
supabase functions deploy import-deck
supabase functions deploy warm-audio
```

Логи - в дашборде: Functions → tts → Logs. В этой версии CLI подкоманды
`functions logs` нет.

Ошибки синтеза пишутся одной JSON-строкой с полями `azure_status`, `reason`,
`retryable` - по ним видно, чинить ключ или ждать сброса квоты.
