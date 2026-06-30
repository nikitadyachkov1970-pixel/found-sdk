# Публикация found-sdk на npm

Чтобы заработал `npm install found-sdk`, пакет нужно один раз опубликовать на npm.
Имя `found-sdk` свободно (проверено). Публикация автоматическая по git-тегу.

## Настройка (один раз)

1. Зарегистрируй аккаунт на <https://www.npmjs.com>.
2. Создай **Automation**-токен: npm → **Access Tokens → Generate New Token → Automation**.
3. GitHub → репозиторий → **Settings → Secrets and variables → Actions** → добавь секрет
   `NPM_TOKEN` со значением токена.
4. Запушь репозиторий (workflow: `.github/workflows/node-release.yml`).

## Релиз

```bash
git tag js-v0.1.0
git push origin js-v0.1.0
```

CI соберёт (`tsup`), прогонит тесты и выполнит `npm publish --access public --provenance`.
После этого у всех работает `npm install found-sdk`.

## Ручная публикация (без CI)

```bash
cd node
npm ci
npm run build
npm test
npm login
npm publish --access public
```

## Обновление версии

Подними `version` в `package.json`, затем новый тег `js-vX.Y.Z`.
Опубликованную версию нельзя перезалить — только новую.

## До публикации (можно ставить уже сейчас)

```bash
# из git (npm соберёт через prepublishOnly):
npm install "github:nikitadyachkov1970-pixel/found-sdk#path:node"
# или собери tarball и поставь локально:
cd node && npm run build && npm pack
npm install /путь/к/found-sdk-0.1.0.tgz
```

> Имя пакета совпадает с Python-версией (`found-sdk`), но реестры разные:
> npm для Node, PyPI для Python — конфликта нет.
