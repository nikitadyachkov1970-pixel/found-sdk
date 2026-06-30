# Публикация found-sdk на PyPI

Чтобы заработал `pip install found-sdk`, пакет нужно один раз опубликовать на PyPI.
Имя `found-sdk` свободно (проверено). Дальше публикация автоматическая по git-тегу.

## Вариант A — Trusted Publishing (рекомендуется, без токенов)

1. Зарегистрируй аккаунт на <https://pypi.org>.
2. Запушь репозиторий на GitHub (workflow: `.github/workflows/python-release.yml`).
3. На PyPI → **Account → Publishing → Add a pending publisher**:
   - PyPI Project Name: `found-sdk`
   - Owner: твой GitHub-аккаунт/орг
   - Repository name: `found-sdk`
   - Workflow name: `python-release.yml`
   - Environment name: `pypi`
4. В настройках репозитория GitHub создай **Environment** с именем `pypi`.
5. Выпусти релиз:
   ```bash
   git tag py-v0.1.0
   git push origin py-v0.1.0
   ```
   CI соберёт пакет, прогонит `twine check` и опубликует на PyPI.
6. Готово — у всех работает `pip install found-sdk`.

## Вариант B — через API-токен

1. PyPI → **Account → API tokens → Add API token**.
2. GitHub → репозиторий → **Settings → Secrets and variables → Actions** → добавь
   `PYPI_API_TOKEN`.
3. В `python-release.yml` раскомментируй блок `with: password: ${{ secrets.PYPI_API_TOKEN }}`.
4. Тегни релиз как выше (`py-v0.1.0`).

## Ручная публикация (без CI)

```bash
cd python
python -m pip install --upgrade build twine
python -m build
python -m twine upload dist/*          # спросит логин/токен
# или сначала на тест:
python -m twine upload --repository testpypi dist/*
```

## Обновление версии

Подними `version` в `pyproject.toml`, затем новый тег `py-vX.Y.Z`.
Версии на PyPI неизменяемы — нельзя перезалить ту же версию.

## До публикации (можно ставить уже сейчас)

```bash
pip install "git+https://github.com/nikitadyachkov1970-pixel/found-sdk.git#subdirectory=python"
# или из собранного wheel:
cd python && python -m build && pip install dist/found_sdk-0.1.0-py3-none-any.whl
```
