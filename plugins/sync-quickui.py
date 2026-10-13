"""Переносит общий код окна «Разбор» (plugins/vencord/majesticLogImport/quickui.ts) в плагин BetterDiscord.
Запуск: python3 plugins/sync-quickui.py. Тест tests/plugins/plugin.test.js проверяет, что копии совпадают."""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent
src = (root / 'vencord' / 'majesticLogImport' / 'quickui.ts').read_text(encoding='utf-8').replace('\r\n', '\n')
a, b = src.index('/* MLA-QUICKUI-START'), src.index('/* MLA-QUICKUI-END */') + len('/* MLA-QUICKUI-END */')
body = re.sub(r'^export ', '', src[a:b], flags=re.M)
bd = root / 'betterdiscord' / 'MajesticLogImport.plugin.js'
t = bd.read_text(encoding='utf-8').replace('\r\n', '\n')
x, y = t.index('/* MLA-QUICKUI-START'), t.index('/* MLA-QUICKUI-END */') + len('/* MLA-QUICKUI-END */')
bd.write_text(t[:x] + body + t[y:], encoding='utf-8')
print('quickui → BetterDiscord: ok')
