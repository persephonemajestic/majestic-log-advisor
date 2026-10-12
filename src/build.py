"""Собирает самодостаточный index.html из шаблона интерфейса, модулей интерфейса (src/app/*.js),
системного промпта ИИ (src/ai-prompt.txt) и ядра анализатора.
Запуск из любой папки: python3 src/build.py"""
import base64
import hashlib
import pathlib
here = pathlib.Path(__file__).resolve().parent
rd = lambda p: p.read_bytes().decode('utf8').replace('\r\n', '\n')
t = rd(here / 'app.template.html')
c = rd(here / 'core.js')
cl = rd(here / 'utils' / 'logCleaner.js')
sd = rd(here / 'utils' / 'sysdiag.js')
pr = rd(here / 'ai-prompt.txt').rstrip('\n')
assert '`' not in pr and '${' not in pr, 'в ai-prompt.txt нельзя обратные кавычки и ${'
app = '\n'.join(rd(f).rstrip('\n') for f in sorted((here / 'app').glob('*.js')))
assert '/*#APP*/' in t and '</script>' not in app
t = t.replace('/*#APP*/', app)
# Шрифты вшиты в файл (латиница и кириллица): не нужен интернет, нет «прыжка» шрифта при запуске. Лицензия OFL, см. src/fonts.
ff = lambda fam, f, w: "@font-face{font-family:'%s';src:url(data:font/woff;base64,%s) format('woff');font-weight:%s;font-style:normal;font-display:block}" % (fam, base64.b64encode((here / 'fonts' / f).read_bytes()).decode(), w)
assert '/*#FONTS*/' in t
t = t.replace('/*#FONTS*/', ff('Golos Text', 'golos.woff', '400 700') + ff('IBM Plex Mono', 'plex400.woff', '400') + ff('IBM Plex Mono', 'plex500.woff', '500 700'))
pv = hashlib.sha1(pr.encode('utf8')).hexdigest()[:8]
t = t.replace('/*#AI_PROMPT_VERSION*/', "'" + pv + "'").replace('/*#AI_PROMPT*/', pr)
assert '/*CORE*/' in t and '</script>' not in c and '</script>' not in cl and '</script>' not in sd
(here.parent / 'index.html').write_bytes(t.replace('/*CORE*/', cl + '\n' + sd + '\n' + c).encode('utf8'))
print('index.html built')
